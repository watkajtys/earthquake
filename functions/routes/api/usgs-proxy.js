/**
 * @file Proxies requests to the USGS Earthquake API, with caching and optional D1 database interaction.
 */

import { upsertEarthquakeFeaturesToD1 } from '../../../src/utils/d1Utils.js';
import { getFeaturesFromKV, setFeaturesToKV } from '../../../src/utils/kvUtils.js'; // Import KV utils

const USGS_LAST_RESPONSE_KEY = "usgs_last_response_features"; // Define a constant for the KV key

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

      // New KV and D1 logic
      const usgsKvNamespace = env.USGS_LAST_RESPONSE_KV;
      let oldFeaturesFromKV = null;

      if (usgsKvNamespace) {
        try {
          oldFeaturesFromKV = await getFeaturesFromKV(usgsKvNamespace, USGS_LAST_RESPONSE_KEY);
        } catch (kvError) {
          console.error("[usgs-proxy] Error reading from KV store:", kvError.message, kvError.name);
          // Non-fatal, will proceed as if no old data
        }
      } else {
        console.warn("[usgs-proxy] USGS_LAST_RESPONSE_KV namespace not configured. Proceeding without KV comparison.");
      }

      let featuresToUpsert = responseDataForLogic.features || [];

      if (oldFeaturesFromKV && Array.isArray(oldFeaturesFromKV)) {
        const newFeaturesMap = new Map(responseDataForLogic.features.map(f => [f.id, f]));
        const oldFeaturesMap = new Map(oldFeaturesFromKV.map(f => [f.id, f]));

        featuresToUpsert = responseDataForLogic.features.filter(newFeature => {
          const oldFeature = oldFeaturesMap.get(newFeature.id);
          if (!oldFeature) {
            return true; // New earthquake
          }
          // Compare based on feature.properties.updated timestamp
          if (newFeature.properties && oldFeature.properties && newFeature.properties.updated > oldFeature.properties.updated) {
            return true; // Updated earthquake
          }
          return false; // No change or older
        });

        console.log(`[usgs-proxy] Comparison complete. New/updated features to process: ${featuresToUpsert.length}`);
        if (featuresToUpsert.length === 0 && responseDataForLogic.features.length === oldFeaturesFromKV.length) {
             // This check ensures that if counts are same and no new/updated, it means no change.
            console.log("[usgs-proxy] No new or updated earthquake features detected after comparison with KV data.");
        }

      } else if (!usgsKvNamespace) {
        // Fallback: KV not configured, upsert all fetched features
        console.log("[usgs-proxy] KV not configured, preparing to upsert all fetched features to D1.");
        // featuresToUpsert is already all features
      } else {
        // Fallback: KV is configured but no data found (e.g., first run)
        console.log("[usgs-proxy] No previous data in KV, preparing to upsert all fetched features to D1.");
        // featuresToUpsert is already all features
      }

      if (env.DB && featuresToUpsert && featuresToUpsert.length > 0) {
        console.log(`[usgs-proxy] Attempting to upsert ${featuresToUpsert.length} features to D1.`);
        try {
          const d1Result = await upsertEarthquakeFeaturesToD1(env.DB, featuresToUpsert);
          console.log(`[usgs-proxy] D1 upsert result: Success: ${d1Result.successCount}, Errors: ${d1Result.errorCount}`);

          // If D1 upsert was successful (or partially successful) and KV is configured,
          // update KV with the full current feature set from the API.
          if (d1Result.successCount > 0 && usgsKvNamespace) {
            console.log("[usgs-proxy] D1 upsert successful, updating KV with the latest full feature set.");
            setFeaturesToKV(usgsKvNamespace, USGS_LAST_RESPONSE_KEY, responseDataForLogic.features, waitUntil);
          } else if (d1Result.successCount === 0 && featuresToUpsert.length > 0) {
            console.warn("[usgs-proxy] D1 upsert reported no successes for changed features. KV will not be updated with this dataset.");
          } else if (!usgsKvNamespace) {
            console.log("[usgs-proxy] D1 upsert processed. KV not configured, so not updating KV.");
          }
        } catch (e) {
          console.error("[usgs-proxy] Error during D1 upsert:", e.message, e.name);
          // If D1 fails, we probably don't want to update KV with a state that D1 doesn't reflect.
        }
      } else if (featuresToUpsert && featuresToUpsert.length === 0) {
        console.log("[usgs-proxy] No features to upsert to D1. KV will not be updated.");
      }

      // Return the 'response' which has the correct body and headers (full API response)
      return response;

    } else { // Cache hit
      console.log("Cache hit for (from handleUsgsProxy):", request.url);
      // Ensure the cached response is returned
      return response;
    }

  } catch (error) {
    console.error(`[usgs-proxy] Outer catch block: Fetch, JSON parse, or other error for ${apiUrl}:`, error.message, error.name, error.stack);
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
