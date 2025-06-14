/**
 * @file Proxies requests to the USGS Earthquake API, with caching and optional D1 database interaction.
 */

/**
 * Handles requests to the `/api/usgs-proxy` endpoint.
 * It fetches data from a specified USGS API URL, caches the response,
 * and can optionally interact with a D1 database (e.g., for upserting data).
 *
 * @param {object} context - The Cloudflare Pages function context.
 * @param {Request} context.request - The incoming HTTP request. Must include an `apiUrl` query parameter.
 * @param {object} context.env - Environment variables.
 * @param {string} [context.env.WORKER_CACHE_DURATION_SECONDS] - Optional cache duration in seconds.
 * @param {object} [context.env.DB] - Optional D1 database binding.
 * @param {function} context.waitUntil - Function to extend the lifetime of the request for background tasks like caching.
 * @returns {Promise<Response>} A promise that resolves to a Response object, either from the cache or fetched from the USGS API.
 * Error responses are returned as JSON with appropriate status codes.
 */
export async function handleUsgsProxy(context) {
  const { request, env, waitUntil } = context;
  const url = new URL(request.url);
  const { searchParams } = url;

  const apiUrl = searchParams.get("apiUrl");
  if (!apiUrl) {
    const errorResponse = { message: "Missing apiUrl query parameter for proxy request", source: "usgs-proxy-handler" };
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const cache = caches.default;
  let response;

  try {
    response = await cache.match(request.url);

    if (!response) {
      console.log("Cache miss for (from handleUsgsProxy):", request.url);
      const upstreamResponse = await fetch(apiUrl, {
        headers: { "User-Agent": "EarthquakesLive/1.0 (+https://earthquakeslive.com)" },
      });

      if (!upstreamResponse.ok) {
        const upstreamResponseText = await upstreamResponse.text();
        const errorData = {
            message: `Error fetching data from USGS API: ${upstreamResponse.status}${upstreamResponseText ? ` - ${upstreamResponseText.substring(0,100)}` : ''}`,
            source: "usgs-proxy-handler",
            upstream_status: upstreamResponse.status,
        };
        return new Response(JSON.stringify(errorData), {
            status: upstreamResponse.status,
            headers: { "Content-Type": "application/json" }
        });
      }

      const responseToCache = upstreamResponse.clone();
      const responseDataForLogic = await upstreamResponse.json();

      response = new Response(JSON.stringify(responseDataForLogic), responseToCache);

      let cacheDuration = 600;
      const configDuration = parseInt(env.WORKER_CACHE_DURATION_SECONDS, 10);
      if (env.WORKER_CACHE_DURATION_SECONDS && (!isNaN(configDuration) && configDuration > 0)) {
          cacheDuration = configDuration;
      } else if (env.WORKER_CACHE_DURATION_SECONDS) {
          console.warn(`Invalid WORKER_CACHE_DURATION_SECONDS value: "${env.WORKER_CACHE_DURATION_SECONDS}". Using default ${cacheDuration}s.`);
      }
      response.headers.set("Cache-Control", `s-maxage=${cacheDuration}`);

      const cachePromise = cache.put(request.url, response.clone())
        .catch(cachePutError => {
          console.error(`Failed to cache response for ${apiUrl}: ${cachePutError.name} - ${cachePutError.message}`, cachePutError);
        });
      waitUntil(cachePromise);

      // Placeholder for potential D1 upsert logic based on fetched data
      if (env.DB && responseDataForLogic.features && responseDataForLogic.features.length > 0) {
        try {
           console.log("Simulating upsertEarthquakeFeaturesToD1 call from handleUsgsProxy");
           // Example: await upsertEarthquakeFeaturesToD1(env.DB, responseDataForLogic.features);
        } catch (e) {
          console.error("Error during simulated DB upsert (from handleUsgsProxy):", e);
        }
      }

    } else {
      console.log("Cache hit for (from handleUsgsProxy):", request.url);
    }
    return response;

  } catch (error) {
    console.error(`[usgs-proxy-handler] Fetch or JSON parse error for ${apiUrl}:`, error.message, error.name);
    const errorResponseData = {
        message: `USGS API fetch failed: ${error.message}`,
        source: "usgs-proxy-handler"
    };
    return new Response(JSON.stringify(errorResponseData), {
        status: 500,
        headers: { "Content-Type": "application/json" }
    });
  }
}
