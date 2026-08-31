async function onRequestGet2(context) {
  try {
    const { env, request } = context;
    const { DB, GEOJSON_BUCKET } = env;
    const url = new URL(request.url);
    const timeWindowParam = url.searchParams.get("timeWindow") || "day";
    const validTimeWindows = ["day", "week", "month"];
    if (!validTimeWindows.includes(timeWindowParam)) {
      return new Response(
        "Invalid timeWindow parameter. Valid values are 'day', 'week', 'month'.",
        { status: 400, headers: { "X-Data-Source": "None" } },
      );
    }
    if (GEOJSON_BUCKET) {
      const fileName = `list-${timeWindowParam}.json`;
      const r2Object = await GEOJSON_BUCKET.get(fileName);
      if (r2Object !== null) {
        console.log(
          `[get-earthquakes] Serving list from R2 for time window: ${timeWindowParam}`,
        );
        const headers = new Headers();
        r2Object.writeHttpMetadata(headers);
        headers.set("etag", r2Object.httpEtag);
        headers.set("X-Data-Source", "R2");
        headers.set(
          "Cache-Control",
          "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
        );
        return new Response(r2Object.body, { headers });
      }
      console.log(
        `[get-earthquakes] R2 object not found for ${timeWindowParam}. Falling back to D1.`,
      );
    }
    return new Response(
      `R2 object not found for time window: ${timeWindowParam}`,
      {
        status: 404,
        headers: { "X-Data-Source": "None" },
      },
    );
  } catch (e) {
    console.error("Unhandled error in onRequestGet:", e);
    return new Response(`Server error: ${e.message}`, {
      status: 500,
      headers: { "X-Data-Source": "None" },
    });
  }
}

export { onRequestGet2 as onRequestGet };
