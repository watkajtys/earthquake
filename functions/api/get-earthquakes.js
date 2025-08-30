/**
 * @summary Cloudflare Pages Function for fetching earthquake data.
 * @description This function serves earthquake data directly from the `EarthquakeEvents` D1 table.
 * It supports filtering by a time window and returns an array of GeoJSON features.
 * All responses include an `X-Data-Source: D1` header.
 *
 * Query Parameters:
 *  - `timeWindow` (string): Specifies the time window for earthquake events.
 *    Expected values: "day" (last 24 hours), "week" (last 7 days), "month" (last 30 days).
 *    Defaults to "day" if not specified or if an invalid value is provided (though invalid values return a 400 error).
 *
 * Successful Response (200 OK):
 *  - Body: A JSON array of GeoJSON feature objects, where each feature represents an earthquake.
 *          The `geojson_feature` column from the D1 table is parsed for each event.
 *  - Headers: `Content-Type: application/json`, `X-Data-Source: D1`.
 *
 * Error Responses:
 *  - 400 Bad Request: If the `timeWindow` parameter is invalid. Body includes an error message.
 *  - 500 Internal Server Error: If the database is unavailable, or if there's an error during query
 *    preparation, execution, or data processing. Body includes an error message.
 *
 * @summary Handles GET requests to /api/get-earthquakes.
 * @param {object} context - The Cloudflare Pages Function context object.
 * @param {Request} context.request - The incoming request object from the client.
 * @param {object} context.env - The environment object containing bindings.
 * @param {D1Database} context.env.DB - The D1 database binding for `EarthquakeEvents`.
 * @returns {Promise<Response>} A Response object containing the JSON data or an error message.
 * @example
 * // Example usage:
 * // fetch('/api/get-earthquakes?timeWindow=week')
 * // .then(response => response.json())
 * // .then(data => console.log(data));
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
    const minMag = url.searchParams.get("minMag");
    const maxMag = url.searchParams.get("maxMag");
    const minDepth = url.searchParams.get("minDepth");
    const maxDepth = url.searchParams.get("maxDepth");
    const lat = url.searchParams.get("lat");
    const lon = url.searchParams.get("lon");
    const radius = url.searchParams.get("radius");

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

    const startTimeMilliseconds = startTime.getTime();

    let query = `
      SELECT geojson_feature
      FROM EarthquakeEvents
      WHERE event_time >= ?
    `;
    const params = [startTimeMilliseconds];

    if (minMag) {
      query += " AND magnitude >= ?";
      params.push(parseFloat(minMag));
    }
    if (maxMag) {
      query += " AND magnitude <= ?";
      params.push(parseFloat(maxMag));
    }
    if (minDepth) {
      query += " AND depth >= ?";
      params.push(parseFloat(minDepth));
    }
    if (maxDepth) {
      query += " AND depth <= ?";
      params.push(parseFloat(maxDepth));
    }
    if (lat && lon && radius) {
      const latFloat = parseFloat(lat);
      const lonFloat = parseFloat(lon);
      const radiusFloat = parseFloat(radius);
      const R = 6371; // Earth's radius in km
      const maxLat = latFloat + (radiusFloat / R) * (180 / Math.PI);
      const minLat = latFloat - (radiusFloat / R) * (180 / Math.PI);
      const maxLon = lonFloat + (radiusFloat / R) * (180 / Math.PI) / Math.cos(latFloat * Math.PI / 180);
      const minLon = lonFloat - (radiusFloat / R) * (180 / Math.PI) / Math.cos(latFloat * Math.PI / 180);

      query += " AND latitude >= ? AND latitude <= ? AND longitude >= ? AND longitude <= ?";
      params.push(minLat, maxLat, minLon, maxLon);
    }


    query += " ORDER BY event_time DESC;";

    let stmt;
    try {
      stmt = db.prepare(query).bind(...params);
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
        return JSON.parse(row.geojson_feature);
      } catch (parseError) {
        console.error("Failed to parse geojson_feature:", parseError, "Row:", row.geojson_feature);
        return { error: "Failed to parse feature data" };
      }
    }).filter(feature => feature && !feature.error);

    return new Response(JSON.stringify(features), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Data-Source": "D1",
        "Cache-Control": "public, s-maxage=60",
      },
    });

  } catch (e) {
    console.error("Unhandled error in onRequestGet:", e);
    return new Response(`Server error: ${e.message}`, {
      status: 500,
      headers: {
        "X-Data-Source": "D1",
      },
    });
  }
}
