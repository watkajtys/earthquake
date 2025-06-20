/**
 * @file Proxies requests to the USGS Earthquake API, with caching and optional D1 database interaction.
 */

import { upsertEarthquakeFeaturesToD1 } from '../../../src/utils/d1Utils.js';

// In-memory cache for recent quake IDs to reduce D1 load
const MAX_RECENT_QUAKE_IDS = 1000;
let recentQuakeIds = new Set();

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

      const responseDataForLogic = await upstreamResponse.clone().json(); // Get data for logic

      // Create the response to be returned to the client AND to be cached.
      // Start with the original response's body and status.
      let finalResponseHeaders = new Headers(upstreamResponse.headers);

      let cacheDuration = 600; // default
      const configDuration = parseInt(env.WORKER_CACHE_DURATION_SECONDS, 10);
      if (env.WORKER_CACHE_DURATION_SECONDS && (!isNaN(configDuration) && configDuration > 0)) {
          cacheDuration = configDuration;
      } else if (env.WORKER_CACHE_DURATION_SECONDS) {
          console.warn(`Invalid WORKER_CACHE_DURATION_SECONDS value: "${env.WORKER_CACHE_DURATION_SECONDS}". Using default ${cacheDuration}s.`);
      }
      finalResponseHeaders.set("Cache-Control", `s-maxage=${cacheDuration}`);
      finalResponseHeaders.set("Content-Type", "application/json"); // Ensure correct content type

      // Use the already read responseDataForLogic to avoid re-parsing
      response = new Response(JSON.stringify(responseDataForLogic), {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: finalResponseHeaders
      });

      const cachePromise = cache.put(request.url, response.clone())
        .catch(cachePutError => {
          console.error(`Failed to cache response for ${apiUrl}: ${cachePutError.name} - ${cachePutError.message}`, cachePutError);
        });
      waitUntil(cachePromise);

      // D1 logic, now with in-memory cache filtering
      if (env.DB && responseDataForLogic.features && responseDataForLogic.features.length > 0) {
        let featuresToUpsert = [];
        if (responseDataForLogic.features && responseDataForLogic.features.length > 0) {
          for (const feature of responseDataForLogic.features) {
            if (feature && feature.id && !recentQuakeIds.has(feature.id)) {
              featuresToUpsert.push(feature);
            }
          }
          const filteredCount = responseDataForLogic.features.length - featuresToUpsert.length;
          if (filteredCount > 0) {
            console.log(`[usgs-proxy-handler] In-memory cache filtered out ${filteredCount} features before D1 upsert.`);
          }
        }

        if (featuresToUpsert.length > 0) {
          try {
            console.log(`[usgs-proxy-handler] Attempting to upsert ${featuresToUpsert.length} new features to D1.`);
            // Assuming upsertEarthquakeFeaturesToD1 returns an object like { successCount, errorCount }
            // and doesn't throw for "DO NOTHING" cases, but logs them.
            const upsertResult = await upsertEarthquakeFeaturesToD1(env.DB, featuresToUpsert);

            // Add successfully processed (attempted) feature IDs to the in-memory cache
            // even if D1 did "DO NOTHING" because they've been processed from this worker's perspective.
            // The successCount from D1 indicates actual DB changes, not items processed by the function.
            if (upsertResult) { // Check if upsertResult is not null/undefined
                featuresToUpsert.forEach(feature => {
                    if (feature && feature.id) {
                        recentQuakeIds.add(feature.id);
                    }
                });
                console.log(`[usgs-proxy-handler] Added ${featuresToUpsert.length} feature IDs to in-memory cache. Current cache size: ${recentQuakeIds.size}`);

                // Cache eviction logic
                if (recentQuakeIds.size > MAX_RECENT_QUAKE_IDS) {
                    const idsArray = Array.from(recentQuakeIds);
                    const toRemoveCount = idsArray.length - MAX_RECENT_QUAKE_IDS;
                    idsArray.splice(0, toRemoveCount); // Remove oldest items
                    recentQuakeIds = new Set(idsArray);
                    console.log(`[usgs-proxy-handler] In-memory cache evicted ${toRemoveCount} oldest quake IDs. New size: ${recentQuakeIds.size}`);
                }
            } else {
                console.warn("[usgs-proxy-handler] D1 upsert function did not return a result. Skipping in-memory cache update for this batch.");
            }

          } catch (e) {
            console.error("[usgs-proxy-handler] Error during D1 upsert:", e.message, e);
          }
        } else {
          console.log("[usgs-proxy-handler] No new features to upsert to D1 after in-memory cache filtering.");
        }
      }
      // Return the 'response' which has the correct body and headers
      return response;

    } else { // Cache hit
      console.log("Cache hit for (from handleUsgsProxy):", request.url);
      // Ensure the cached response is returned
      return response;
    }

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
