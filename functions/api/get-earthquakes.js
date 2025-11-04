/**
 * @summary Cloudflare Pages Function for fetching earthquake data.
 * @description This function serves earthquake data primarily from pre-generated lists in R2.
 * It falls back to querying the D1 database if the R2 object is not found.
 *
 * Query Parameters:
 *  - `timeWindow` (string): Specifies the time window. Valid values: "day", "week", "month".
 *    Defaults to "day".
 *
 * Successful Response (200 OK):
 *  - Body: A JSON array of earthquake objects.
 *  - Headers: `Content-Type: application/json`, `X-Data-Source: R2` or `X-Data-Source: D1`.
 */
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const { DB, GEOJSON_BUCKET } = env;

    const url = new URL(request.url);
    const timeWindowParam = url.searchParams.get("timeWindow") || "day";

    const validTimeWindows = ["day", "week", "month"];
    if (!validTimeWindows.includes(timeWindowParam)) {
      return new Response(
        "Invalid timeWindow parameter. Valid values are 'day', 'week', 'month'.",
        { status: 400, headers: { "X-Data-Source": "None" } }
      );
    }

    // First, try to fetch the pre-generated list from R2
    if (GEOJSON_BUCKET) {
      const fileName = `list-${timeWindowParam}.json`;
      const r2Object = await GEOJSON_BUCKET.get(fileName);

      if (r2Object !== null) {
        console.log(`[get-earthquakes] Serving list from R2 for time window: ${timeWindowParam}`);
        const headers = new Headers();
        r2Object.writeHttpMetadata(headers);
        headers.set('etag', r2Object.httpEtag);
        headers.set('X-Data-Source', 'R2');
        return new Response(r2Object.body, { headers });
      }
      console.log(`[get-earthquakes] R2 object not found for ${timeWindowParam}. Falling back to D1.`);
    }

    // If the R2 object is not found, return a 404 response.
    // The D1 fallback is removed to protect the database from high read operations.
    // It is now the sole responsibility of the background worker to ensure the lists exist.
    return new Response(`R2 object not found for time window: ${timeWindowParam}`, {
      status: 404,
      headers: { "X-Data-Source": "None" },
    });

  } catch (e) {
    console.error("Unhandled error in onRequestGet:", e);
    return new Response(`Server error: ${e.message}`, {
      status: 500,
      headers: { "X-Data-Source": "None" },
    });
  }
}
