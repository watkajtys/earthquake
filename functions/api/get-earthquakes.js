/**
 * @function onRequestGet
 * @description Handles GET requests for the /api/get-earthquakes endpoint. This Cloudflare
 *   Pages Function retrieves earthquake data from the `EarthquakeEvents` D1 database.
 *   It allows clients to specify a time window for the data ("day", "week", "month")
 *   and returns a curated list of earthquake events as an array of GeoJSON features.
 *
 * @summary Fetches earthquake data from a D1 database based on a specified time window.
 *
 * @param {object} context - The context object provided by Cloudflare Pages Functions.
 * @param {Request} context.request - The incoming HTTP request object.
 * @param {object} context.env - The environment object containing bindings, including the D1 database.
 * @param {D1Database} context.env.DB - The D1 database instance (`EarthquakeEvents`).
 *
 * @returns {Promise<Response>} A `Response` object containing the query results or an error.
 *
 * @query {string} [timeWindow="day"] - The time window for fetching earthquake data.
 *   Acceptable values:
 *   - `"day"`: Fetches data from the last 24 hours.
 *   - `"week"`: Fetches data from the last 7 days.
 *   - `"month"`: Fetches data from the last 30 days.
 *   If the parameter is missing or invalid, it defaults to `"day"`, with invalid values
 *   triggering a 400 Bad Request error.
 *
 * @response {200} OK - Successfully retrieved the earthquake data.
 *   The response body is a JSON array of GeoJSON `Feature` objects, sorted by event time
 *   in descending order.
 *   @header {string} Content-Type - `application/json`
 *   @header {string} X-Data-Source - `D1`
 *   @header {string} Cache-Control - `public, s-maxage=60` (caches the response for 60 seconds)
 *
 * @response {400} Bad Request - The `timeWindow` query parameter is invalid.
 *   The response body contains a plain text error message.
 *
 * @response {500} Internal Server Error - An error occurred on the server.
 *   This can be due to the database being unavailable, a failure in preparing or executing
 *   the database query, or an issue with processing the query results. The response body
 *   contains a plain text error message.
 *
 * @example
 * // Request:
 * GET /api/get-earthquakes?timeWindow=week
 *
 * // Response (200 OK):
 * HTTP/1.1 200 OK
 * Content-Type: application/json
 * X-Data-Source: D1
 * Cache-Control: public, s-maxage=60
 *
 * [
 *   {
 *     "type": "Feature",
 *     "properties": {
 *       "mag": 5.2,
 *       "place": "15km N of Pisco, Peru",
 *       "time": 1678886400000,
 *       // ... other properties
 *     },
 *     "geometry": {
 *       "type": "Point",
 *       "coordinates": [-75.20, -13.57, 10.0]
 *     },
 *     "id": "us7000j3y"
 *   },
 *   // ... more features
 * ]
 */
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const db = env.DB;

    if (!db) {
      return new Response("Database not available", {
        status: 500,
        headers: { "X-Data-Source": "D1" },
      });
    }

    const url = new URL(request.url);
    const timeWindowParam = url.searchParams.get("timeWindow") || "day";

    let startTime;
    const now = new Date();

    if (timeWindowParam === "week") {
      startTime = new Date(now.setDate(now.getDate() - 7));
    } else if (timeWindowParam === "month") {
      startTime = new Date(now.setMonth(now.getMonth() - 1));
    } else if (timeWindowParam === "day") {
      startTime = new Date(now.setDate(now.getDate() - 1));
    } else {
      return new Response(
        "Invalid timeWindow parameter. Valid values are 'day', 'week', 'month'.",
        { status: 400, headers: { "X-Data-Source": "D1" } }
      );
    }

    // event_time is stored in milliseconds since epoch
    const startTimeMilliseconds = startTime.getTime();

    const query = `
      SELECT geojson_feature
      FROM EarthquakeEvents
      WHERE event_time >= ?
      ORDER BY event_time DESC;
    `;

    let stmt;
    try {
      stmt = db.prepare(query).bind(startTimeMilliseconds);
    } catch (e) {
      console.error("Error preparing statement:", e);
      return new Response(`Failed to prepare database statement: ${e.message}`, {
        status: 500,
        headers: { "X-Data-Source": "D1" },
      });
    }

    let queryResult;
    try {
      queryResult = await stmt.all();
    } catch (e) {
      console.error("Error executing query:", e);
      return new Response(`Failed to execute database query: ${e.message}`, {
        status: 500,
        headers: { "X-Data-Source": "D1" },
      });
    }

    if (!queryResult || !queryResult.results) {
        console.error("Query returned no results or malformed result:", queryResult);
        return new Response("Failed to retrieve data from database.", {
          status: 500,
          headers: { "X-Data-Source": "D1" },
        });
    }

    const features = queryResult.results.map(row => {
      try {
        // Assuming geojson_feature is a string that needs to be parsed
        return JSON.parse(row.geojson_feature);
      } catch (parseError) {
        console.error("Failed to parse geojson_feature:", parseError, "Row:", row.geojson_feature);
        // Return null or a placeholder for features that can't be parsed
        // Or filter them out: return null; and then filter(f => f !== null)
        return { error: "Failed to parse feature data" };
      }
    }).filter(feature => feature && !feature.error); // Filter out any parsing errors if chosen

    return new Response(JSON.stringify(features), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Data-Source": "D1",
        "Cache-Control": "public, s-maxage=60", // Added Cache-Control header
      },
    });

  } catch (e) {
    console.error("Unhandled error in onRequestGet:", e);
    return new Response(`Server error: ${e.message}`, {
      status: 500,
      headers: {
        "X-Data-Source": "D1",
        // No Cache-Control for error responses, or a short one like "public, s-maxage=5" if preferred
      },
    });
  }
}
