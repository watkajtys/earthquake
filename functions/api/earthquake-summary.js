// functions/api/earthquake-summary.js
export async function onRequest(context) {
  const sourceName = "earthquake-summary-worker";

  // Helper to create JSON error responses
  const jsonErrorResponse = (message, status, upstreamStatus = undefined) => {
    const errorBody = {
      status: "error",
      message: message,
      source: sourceName,
    };
    if (upstreamStatus !== undefined) {
      errorBody.upstream_status = upstreamStatus;
    }
    return new Response(JSON.stringify(errorBody), {
      status: status,
      headers: { "Content-Type": "application/json" },
    });
  };

  // Define USGS API endpoints
  const SIGNIFICANT_QUAKES_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_day.geojson";
  const HOURLY_QUAKES_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";

  const cacheKey = new Request(context.request.url, context.request);
  const cache = caches.default;

  try {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      console.log(`Cache hit for: ${sourceName}`);
      return cachedResponse;
    }

    console.log(`Cache miss for: ${sourceName}. Fetching from origin.`);

    // Fetch data from both endpoints concurrently
    const [significantQuakesResponse, hourlyQuakesResponse] = await Promise.all([
      fetch(SIGNIFICANT_QUAKES_URL),
      fetch(HOURLY_QUAKES_URL),
    ]);

    // Check responses
    if (!significantQuakesResponse.ok) {
      const message = `Error fetching significant quakes: ${significantQuakesResponse.status} ${significantQuakesResponse.statusText}`;
      console.error(`${sourceName}: ${message} (Upstream status: ${significantQuakesResponse.status})`);
      return jsonErrorResponse(
        message,
        500,
        significantQuakesResponse.status
      );
    }
    if (!hourlyQuakesResponse.ok) {
      const message = `Error fetching hourly quakes: ${hourlyQuakesResponse.status} ${hourlyQuakesResponse.statusText}`;
      console.error(`${sourceName}: ${message} (Upstream status: ${hourlyQuakesResponse.status})`);
      return jsonErrorResponse(
        message,
        500,
        hourlyQuakesResponse.status
      );
    }

    const significantQuakesData = await significantQuakesResponse.json();
    const hourlyQuakesData = await hourlyQuakesResponse.json();

    // Create summary
    const summary = {
      significant_quakes_past_day: {
        count: significantQuakesData.metadata.count,
        title: significantQuakesData.metadata.title,
        url: significantQuakesData.metadata.url,
      },
      all_quakes_past_hour: {
        count: hourlyQuakesData.metadata.count,
        title: hourlyQuakesData.metadata.title,
        url: hourlyQuakesData.metadata.url,
      },
      generated_at: new Date().toISOString(),
      source: sourceName,
    };

    // Determine cache duration
    const DEFAULT_CACHE_DURATION_SECONDS = 300; // 5 minutes
    let durationInSeconds = DEFAULT_CACHE_DURATION_SECONDS;

    const envCacheDuration = context.env && context.env.EARTHQUAKE_SUMMARY_CACHE_SECONDS;
    if (envCacheDuration) {
      const parsedDuration = parseInt(envCacheDuration, 10);
      if (!isNaN(parsedDuration) && parsedDuration > 0) {
        durationInSeconds = parsedDuration;
      } else {
        console.warn(`Invalid EARTHQUAKE_SUMMARY_CACHE_SECONDS value: "${envCacheDuration}". Using default: ${DEFAULT_CACHE_DURATION_SECONDS}s.`);
      }
    }

    const newResponseHeaders = {
      "Content-Type": "application/json",
      "Cache-Control": `s-maxage=${durationInSeconds}`,
    };

    let newResponse = new Response(JSON.stringify(summary), {
      status: 200,
      headers: newResponseHeaders,
    });

    context.waitUntil(
      cache.put(cacheKey, newResponse.clone()).then(() => {
        console.log(`Successfully cached response for: ${sourceName} (duration: ${durationInSeconds}s)`);
      }).catch(err => {
        console.error(`Failed to cache response for ${sourceName}: ${err.message}`, err);
      })
    );

    return newResponse;

  } catch (error) {
    console.error(`Error in ${sourceName}: ${error.message}`, error);
    return jsonErrorResponse(`Error processing request: ${error.message}`, 500);
  }
}
