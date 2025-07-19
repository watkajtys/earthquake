/**
 * @file Cloudflare Function for batch fetching historical earthquake data from USGS.
 * @module functions/api/batch-usgs-fetch
 *
 * @description
 * This administrative endpoint is designed for backfilling historical earthquake data. It fetches
 * data from the USGS FDSNWS Event Web Service for a specified date range and "upserts" it into
 * the `EarthquakeEvents` D1 database table. An upsert operation means that if an earthquake
 * event with the same unique ID already exists in the database, its record is updated; otherwise,
 * a new record is inserted.
 *
 * This function is intended for manual or scheduled administrative tasks, not for public-facing
 * applications. It plays a crucial role in populating and maintaining the historical accuracy
 * and completeness of the earthquake dataset.
 *
 * The function is not directly exposed via a route but is called by other administrative
 * functions or scripts.
 *
 * @see {@link ../../src/utils/d1Utils.js} for the `upsertEarthquakeFeaturesToD1` implementation.
 */
import { upsertEarthquakeFeaturesToD1 } from '../../src/utils/d1Utils.js';

/**
 * Creates a standard JSON response object.
 * @param {object} data - The JSON payload.
 * @param {number} [status=200] - The HTTP status code.
 * @returns {Response} A Cloudflare `Response` object with a JSON body.
 */
const jsonResponse = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: { "Content-Type": "application/json" },
  });
};

/**
 * Handles an administrative request to fetch and store a batch of historical earthquake data.
 *
 * This function orchestrates the process of fetching data from the USGS API based on a date
 * range provided in the query parameters (`startDate`, `endDate`) and then passing the
 * retrieved GeoJSON features to a utility function (`upsertEarthquakeFeaturesToD1`) to be
 * stored in the D1 database.
 *
 * It performs the following steps:
 * 1.  Extracts and validates the `startDate` and `endDate` query parameters.
 * 2.  Constructs the appropriate USGS API URL.
 * 3.  Makes a `fetch` request to the USGS API with a custom User-Agent.
 * 4.  Handles non-OK responses from the API, logging the error.
 * 5.  Parses the GeoJSON response and extracts the earthquake features.
 * 6.  Calls `upsertEarthquakeFeaturesToD1` to perform the database operations.
 * 7.  Returns a JSON response summarizing the outcome, including the number of features
 *     fetched, successfully upserted, and any errors encountered during the DB operation.
 *
 * @async
 * @function handleBatchUsgsFetch
 * @param {object} context - The Cloudflare Pages function context.
 * @param {Request} context.request - The incoming HTTP request object.
 * @param {object} context.env - The environment object containing bindings, including the D1 database (`DB`).
 * @returns {Promise<Response>} A `Response` object containing a JSON payload that summarizes the
 *   results of the batch operation (e.g., counts of fetched, upserted, and failed items).
 */
export async function handleBatchUsgsFetch(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");

  if (!startDate || !endDate) {
    return jsonResponse({ message: "Missing startDate or endDate query parameter. Use YYYY-MM-DD format." }, 400);
  }

  // Basic validation for date format (more robust validation could be added)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    return jsonResponse({ message: "Invalid date format. Use YYYY-MM-DD." }, 400);
  }

  if (!env.DB) {
    console.error("[batch-usgs-fetch] D1 Database (DB) binding not provided.");
    return jsonResponse({ message: "Service configuration error: D1 database not available." }, 500);
  }

  const usgsApiUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${startDate}&endtime=${endDate}&minmagnitude=0`; // Fetch all magnitudes for completeness

  console.log(`[batch-usgs-fetch] Fetching data from USGS for range: ${startDate} to ${endDate}. URL: ${usgsApiUrl}`);

  try {
    const response = await fetch(usgsApiUrl, {
      headers: { "User-Agent": "EarthquakesLive-BatchFetch/1.0 (+https://earthquakeslive.com)" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[batch-usgs-fetch] Error fetching data from USGS API: ${response.status} - ${errorText}`);
      return jsonResponse({ message: `Error from USGS API: ${response.status} - ${errorText.substring(0, 200)}` }, response.status);
    }

    const data = await response.json();

    if (!data || !data.features) {
      console.warn(`[batch-usgs-fetch] No features found in USGS response for ${startDate}-${endDate}. Response metadata:`, data.metadata);
      return jsonResponse({ message: "No features found in USGS response for the given date range.", startDate, endDate, metadata: data.metadata, count: 0 });
    }

    console.log(`[batch-usgs-fetch] Fetched ${data.features.length} features from USGS for ${startDate}-${endDate}. Starting D1 upsert.`);

    const { successCount, errorCount } = await upsertEarthquakeFeaturesToD1(env.DB, data.features);

    console.log(`[batch-usgs-fetch] D1 upsert complete for ${startDate}-${endDate}. Success: ${successCount}, Errors: ${errorCount}`);
    return jsonResponse({
      message: "Batch fetch and upsert process complete.",
      startDate,
      endDate,
      fetched: data.features.length,
      upserted: successCount,
      errors: errorCount,
    });

  } catch (error) {
    console.error(`[batch-usgs-fetch] Unexpected error during batch fetch for ${startDate}-${endDate}: ${error.message}`, error);
    return jsonResponse({ message: `Unexpected error: ${error.message}` }, 500);
  }
}
