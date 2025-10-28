// functions/api/get-earthquakes.js
import { processEarthquakeData } from '../utils/earthquake-processor.js';

/**
 * @summary Cloudflare Pages Function for fetching AND processing earthquake data.
 * @description This function serves processed earthquake data derived from the `EarthquakeEvents` D1 table.
 * It fetches raw data, processes it into the structure the frontend expects, and returns a comprehensive JSON object.
 * All responses include an `X-Data-Source: D1-Processed` header.
 *
 * Query Parameters:
 *  - `timeWindow` (string): Specifies the time window for earthquake events.
 *    Expected values: "week" (for initial load, processes last 7 days), "month" (for extended load, processes last 30 days).
 *    Defaults to "week".
 *
 * Successful Response (200 OK):
 *  - Body: A JSON object containing the processed earthquake data slices (e.g., earthquakesLast24Hours, dailyCounts7Days).
 *  - Headers: `Content-Type: application/json`, `X-Data-Source: D1-Processed`.
 *
 * Error Responses:
 *  - 400 Bad Request: If the `timeWindow` parameter is invalid.
 *  - 500 Internal Server Error: If the database is unavailable or if any error occurs during processing.
 */
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const db = env.DB;

    if (!db) {
      return new Response("Database not available", { status: 500 });
    }

    const url = new URL(request.url);
    const timeWindowParam = url.searchParams.get("timeWindow") || "week";

    let startTime;
    const now = new Date();
    let daysToFetch;

    if (timeWindowParam === "week") {
      daysToFetch = 7;
    } else if (timeWindowParam === "month") {
      daysToFetch = 30;
    } else {
      return new Response(
        "Invalid timeWindow parameter. Valid values are 'week', 'month'.",
        { status: 400 }
      );
    }

    startTime = new Date(now.getTime() - (daysToFetch * 24 * 3600 * 1000));
    const startTimeMilliseconds = startTime.getTime();

    const query = `
      SELECT geojson_feature
      FROM EarthquakeEvents
      WHERE event_time >= ?
      ORDER BY event_time DESC;
    `;

    const stmt = db.prepare(query).bind(startTimeMilliseconds);
    const queryResult = await stmt.all();

    if (!queryResult || !queryResult.results) {
      return new Response("Failed to retrieve data from database.", { status: 500 });
    }

    const allFeatures = queryResult.results.map(row => JSON.parse(row.geojson_feature));

    const fetchTime = Date.now();
    let processedData;

    if (timeWindowParam === 'month') {
        const weeklyFeatures = allFeatures.filter(f => f.properties.time >= (fetchTime - 7 * 24 * 36e5));
        const dailyFeatures = weeklyFeatures.filter(f => f.properties.time >= (fetchTime - 24 * 36e5));
        processedData = processEarthquakeData(dailyFeatures, weeklyFeatures, allFeatures, fetchTime);
    } else { // 'week'
        const dailyFeatures = allFeatures.filter(f => f.properties.time >= (fetchTime - 24 * 36e5));
        processedData = processEarthquakeData(dailyFeatures, allFeatures, [], fetchTime);
    }

    // Add metadata for the client
    processedData.fetchTime = fetchTime;
    processedData.dataSource = 'D1';


    return new Response(JSON.stringify(processedData), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Data-Source": "D1-Processed",
        "Cache-Control": "public, s-maxage=60",
      },
    });

  } catch (e) {
    console.error("Unhandled error in get-earthquakes:", e);
    return new Response(`Server error: ${e.message}`, { status: 500 });
  }
}
