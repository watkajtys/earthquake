/**
 * @file Cloudflare Function to fetch historical earthquake data from USGS for a given date range
 * and upsert it into the EarthquakeEvents D1 database.
 */

import { upsertEarthquakeFeaturesToD1 } from '../../src/utils/d1Utils.js';

// Helper to return JSON response
const jsonResponse = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: { "Content-Type": "application/json" },
  });
};

/**
 * Handles requests to fetch and store a batch of historical earthquake data.
 * Expects 'startDate' and 'endDate' query parameters in 'YYYY-MM-DD' format.
 *
 * @param {object} context - The Cloudflare Pages function context.
 * @param {Request} context.request - The incoming HTTP request.
 * @param {object} context.env - Environment variables, including D1 binding 'DB'.
 * @returns {Promise<Response>} A JSON response indicating success or failure and counts.
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
