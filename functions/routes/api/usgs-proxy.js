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
export async function handleUsgsProxy(context) { // context contains { request, env, executionContext, logger? }
  const { request, env, executionContext, logger } = context; // executionContext is the original ctx from worker

  const url = new URL(request.url);
  const { searchParams } = url;
  const isCronRequest = searchParams.get("isCron") === "true";

  // Enhanced logging for scheduled tasks
  if (logger && isCronRequest) {
    logger.logMilestone('USGS proxy handler started', { 
      isCronRequest, 
      requestUrl: request.url,
      executionId: request.headers.get('X-Execution-ID') 
    });
  }

  const apiUrl = searchParams.get("apiUrl");
  if (!apiUrl) {
    const errorResponse = { message: "Missing apiUrl query parameter for proxy request", source: "usgs-proxy-handler" };
    
    if (logger && isCronRequest) {
      logger.logError('MISSING_API_URL', 'Missing apiUrl query parameter', { requestUrl: request.url }, true);
    }
    
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const cache = caches.default;
  let response;

  try {
    if (!isCronRequest) { // Only use cache if not a cron request
      response = await cache.match(request.url);
    } else {
      console.log("[usgs-proxy] Cron request detected. Bypassing cache read.");
    }

    if (!response) { // This block will now also be entered if isCronRequest is true and response is null
      if (isCronRequest) {
        console.log("Cache bypassed for cron request (from handleUsgsProxy):", request.url);
        if (logger) {
          logger.logMilestone('Cache bypassed for cron request', { requestUrl: request.url });
        }
      } else {
        console.log("Cache miss for (from handleUsgsProxy):", request.url);
      }
      
      // Track API call timing for enhanced logging
      const apiCallStartTime = Date.now();
      
      const upstreamResponse = await fetch(apiUrl, {
        headers: { "User-Agent": "EarthquakesLive/1.0 (+https://earthquakeslive.com)" },
      });

      const apiCallEndTime = Date.now();
      
      // Log the API call metrics
      if (logger && isCronRequest) {
        const responseSize = upstreamResponse.headers.get('content-length');
        logger.logApiCall(
          apiUrl, 
          apiCallStartTime, 
          apiCallEndTime, 
          upstreamResponse.status, 
          responseSize ? parseInt(responseSize) : null, 
          'GET'
        );
      }

      if (!upstreamResponse.ok) {
        const upstreamResponseText = await upstreamResponse.text();
        const errorData = {
            message: `Error fetching data from USGS API: ${upstreamResponse.status}${upstreamResponseText ? ` - ${upstreamResponseText.substring(0,100)}` : ''}`,
            source: "usgs-proxy-handler",
            upstream_status: upstreamResponse.status,
        };
        
        if (logger && isCronRequest) {
          logger.logError('USGS_API_ERROR', `HTTP ${upstreamResponse.status}`, {
            status: upstreamResponse.status,
            statusText: upstreamResponse.statusText,
            responseText: upstreamResponseText,
            apiUrl,
            duration: apiCallEndTime - apiCallStartTime
          }, true);
        }
        
        return new Response(JSON.stringify(errorData), {
            status: upstreamResponse.status,
            headers: { "Content-Type": "application/json" }
        });
      }

      const responseDataForLogic = await upstreamResponse.clone().json(); // Get data for logic

      // Create the response to be returned to the client AND to be cached (if not cron).
      // Start with the original response's body and status.
      let finalResponseHeaders = new Headers(upstreamResponse.headers);
      finalResponseHeaders.set("Content-Type", "application/json"); // Ensure correct content type

      if (!isCronRequest) { // Only set Cache-Control for non-cron requests
        let cacheDuration = 600; // default
        const configDuration = parseInt(env.WORKER_CACHE_DURATION_SECONDS, 10);
        if (env.WORKER_CACHE_DURATION_SECONDS && (!isNaN(configDuration) && configDuration > 0)) {
            cacheDuration = configDuration;
        } else if (env.WORKER_CACHE_DURATION_SECONDS) {
            console.warn(`Invalid WORKER_CACHE_DURATION_SECONDS value: "${env.WORKER_CACHE_DURATION_SECONDS}". Using default ${cacheDuration}s.`);
        }
        finalResponseHeaders.set("Cache-Control", `s-maxage=${cacheDuration}`);
      } else {
        // For cron requests, we might not want any client-side caching if this response was directly viewable,
        // but since it's a proxy call from another worker function, this is less critical.
        // We mainly want to avoid server-side Cloudflare caching for the cron's specific URL.
        finalResponseHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        console.log("[usgs-proxy] Cron request: Setting Cache-Control to no-store for the response.");
      }

      // Use the already read responseDataForLogic to avoid re-parsing
      response = new Response(JSON.stringify(responseDataForLogic), {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: finalResponseHeaders
      });

      if (!isCronRequest) { // Only cache if not a cron request
        const cachePromise = cache.put(request.url, response.clone())
          .catch(cachePutError => {
            console.error(`Failed to cache response for ${apiUrl}: ${cachePutError.name} - ${cachePutError.message}`, cachePutError);
          });
        executionContext.waitUntil(cachePromise); // Use executionContext.waitUntil
      } else {
        console.log("[usgs-proxy] Cron request: Bypassing cache.put().");
      }

      // New KV and D1 logic
      const usgsKvNamespace = env.USGS_LAST_RESPONSE_KV;
      let oldFeaturesFromKV = null;

      if (logger && isCronRequest) {
        logger.logMilestone('Starting KV and D1 processing', { 
          hasKvNamespace: !!usgsKvNamespace,
          featuresCount: responseDataForLogic.features?.length || 0
        });
      }

      if (usgsKvNamespace) {
        const kvReadStartTime = Date.now();
        try {
          console.log(`[usgs-proxy-kv] Attempting to read from KV with key: ${USGS_LAST_RESPONSE_KEY}`);
          oldFeaturesFromKV = await getFeaturesFromKV(usgsKvNamespace, USGS_LAST_RESPONSE_KEY);
          
          const kvReadEndTime = Date.now();
          const kvDataSize = oldFeaturesFromKV ? JSON.stringify(oldFeaturesFromKV).length : 0;
          
          if (logger && isCronRequest) {
            logger.logKvOperation(
              'GET',
              USGS_LAST_RESPONSE_KEY,
              kvDataSize,
              kvReadEndTime - kvReadStartTime,
              true
            );
          }
          
          if (oldFeaturesFromKV) {
            console.log(`[usgs-proxy-kv] Successfully read ${oldFeaturesFromKV.length} features from KV for key: ${USGS_LAST_RESPONSE_KEY}`);
          } else {
            console.log(`[usgs-proxy-kv] No data found in KV for key: ${USGS_LAST_RESPONSE_KEY} (or error in retrieval).`);
          }
        } catch (kvError) {
          const kvReadEndTime = Date.now();
          console.error("[usgs-proxy-kv] Error reading from KV store:", kvError.message, kvError.name, kvError.stack);
          
          if (logger && isCronRequest) {
            logger.logKvOperation(
              'GET',
              USGS_LAST_RESPONSE_KEY,
              null,
              kvReadEndTime - kvReadStartTime,
              false,
              kvError.message
            );
          }
          // Non-fatal, will proceed as if no old data
        }
      } else {
        console.warn("[usgs-proxy-kv] USGS_LAST_RESPONSE_KV namespace not configured. Proceeding without KV comparison.");
        
        if (logger && isCronRequest) {
          logger.logError('KV_NOT_CONFIGURED', 'USGS_LAST_RESPONSE_KV namespace not configured', {}, false);
        }
      }

      let featuresToUpsert = responseDataForLogic.features || [];
      const totalNewFeaturesFetched = featuresToUpsert.length;
      console.log(`[usgs-proxy-kv] Total features fetched from USGS API: ${totalNewFeaturesFetched}`);

      if (oldFeaturesFromKV && Array.isArray(oldFeaturesFromKV)) {
        const comparisonStartTime = Date.now();
        console.log(`[usgs-proxy-kv] Comparing ${totalNewFeaturesFetched} new features against ${oldFeaturesFromKV.length} old features from KV.`);
        const newFeaturesMap = new Map(responseDataForLogic.features.map(f => [f.id, f]));
        const oldFeaturesMap = new Map(oldFeaturesFromKV.map(f => [f.id, f]));

        featuresToUpsert = responseDataForLogic.features.filter(newFeature => {
          const oldFeature = oldFeaturesMap.get(newFeature.id);
          if (!oldFeature) {
            return true; // New earthquake
          }
          // Compare based on feature.properties.updated timestamp
          if (newFeature.properties && oldFeature.properties && newFeature.properties.updated > oldFeature.properties.updated) {
            console.log(`[usgs-proxy-kv-diff] Feature ${newFeature.id} marked for upsert (updated). New time: ${newFeature.properties.updated}, Old time: ${oldFeature.properties.updated}`);
            return true; // Updated earthquake
          }
          // console.log(`[usgs-proxy-kv-diff] Feature ${newFeature.id} not marked for upsert (no change or older).`);
          return false; // No change or older
        });

        const comparisonEndTime = Date.now();
        
        if (logger && isCronRequest) {
          logger.logDataProcessing(
            'feature-comparison',
            totalNewFeaturesFetched,
            featuresToUpsert.length,
            comparisonEndTime - comparisonStartTime,
            {
              oldFeaturesCount: oldFeaturesFromKV.length,
              newFeatures: featuresToUpsert.filter(f => !oldFeaturesMap.has(f.id)).length,
              updatedFeatures: featuresToUpsert.filter(f => oldFeaturesMap.has(f.id)).length
            }
          );
        }

        console.log(`[usgs-proxy-kv] Comparison complete. Identified ${featuresToUpsert.length} new or updated features out of ${totalNewFeaturesFetched} fetched.`);
        if (featuresToUpsert.length === 0 && totalNewFeaturesFetched === oldFeaturesFromKV.length) {
             // This check ensures that if counts are same and no new/updated, it means no change.
            console.log("[usgs-proxy-kv] No new or updated earthquake features detected after comparison with KV data (counts match, no updates found).");
        }

      } else if (!usgsKvNamespace) {
        // Fallback: KV not configured, upsert all fetched features
        console.log("[usgs-proxy-kv] KV not configured. All " + totalNewFeaturesFetched + " fetched features will be considered for D1 upsert.");
        // featuresToUpsert is already all features
      } else {
        // Fallback: KV is configured but no data found (e.g., first run or error)
        console.log("[usgs-proxy-kv] No previous data in KV (or error reading). All " + totalNewFeaturesFetched + " fetched features will be considered for D1 upsert.");
        // featuresToUpsert is already all features
      }

      if (env.DB && featuresToUpsert && featuresToUpsert.length > 0) {
        console.log(`[usgs-proxy-d1] Attempting to upsert ${featuresToUpsert.length} features to D1.`);
        
        const d1StartTime = Date.now();
        try {
          const d1Result = await upsertEarthquakeFeaturesToD1(env.DB, featuresToUpsert);
          const d1EndTime = Date.now();
          
          console.log(`[usgs-proxy-d1] D1 upsert result: Success: ${d1Result.successCount}, Errors: ${d1Result.errorCount}`);
          
          if (logger && isCronRequest) {
            logger.logDbOperation(
              'UPSERT',
              'EarthquakeEvents',
              d1Result.successCount,
              d1EndTime - d1StartTime,
              d1Result.errorCount === 0,
              d1Result.errorCount > 0 ? `${d1Result.errorCount} errors occurred` : null
            );
          }

          // If D1 upsert was successful (or partially successful) and KV is configured,
          // update KV with the full current feature set from the API.
          if (d1Result.successCount > 0 && usgsKvNamespace) {
            console.log(`[usgs-proxy-kv] D1 upsert reported ${d1Result.successCount} successes. Updating KV key "${USGS_LAST_RESPONSE_KEY}" with the latest full feature set of ${totalNewFeaturesFetched} items.`);
            
            // Enhanced logging for KV write operation
            if (logger && isCronRequest) {
              const kvWriteStartTime = Date.now();
              const dataSize = JSON.stringify(responseDataForLogic.features).length;
              
              // Create enhanced execution context with logging
              const enhancedExecutionContext = {
                ...executionContext,
                waitUntil: (promise) => {
                  const kvWriteEndTime = Date.now();
                  logger.logKvOperation(
                    'PUT',
                    USGS_LAST_RESPONSE_KEY,
                    dataSize,
                    kvWriteEndTime - kvWriteStartTime,
                    true
                  );
                  return executionContext.waitUntil(promise);
                }
              };
              
              setFeaturesToKV(usgsKvNamespace, USGS_LAST_RESPONSE_KEY, responseDataForLogic.features, enhancedExecutionContext);
            } else {
              // Pass the full 'executionContext' object to setFeaturesToKV.
              setFeaturesToKV(usgsKvNamespace, USGS_LAST_RESPONSE_KEY, responseDataForLogic.features, executionContext);
            }

          } else if (d1Result.successCount === 0 && featuresToUpsert.length > 0) {
            console.warn(`[usgs-proxy-kv] D1 upsert reported no successes for ${featuresToUpsert.length} candidate features. KV will NOT be updated with this dataset to prevent stale reference data.`);
          } else if (!usgsKvNamespace) {
            console.log("[usgs-proxy-kv] D1 upsert processed. KV not configured, so not updating KV.");
          } else if (d1Result.successCount > 0 && !usgsKvNamespace) { // Should not happen based on outer if, but for completeness
            console.log("[usgs-proxy-kv] D1 upsert successful, but KV namespace not configured. Cannot update KV.");
          }
        } catch (e) {
          const d1EndTime = Date.now();
          console.error("[usgs-proxy-d1] Error during D1 upsert operation:", e.message, e.name, e.stack);
          console.warn(`[usgs-proxy-kv] KV will NOT be updated due to D1 upsert error, to prevent stale reference data for key ${USGS_LAST_RESPONSE_KEY}.`);
          
          if (logger && isCronRequest) {
            logger.logDbOperation(
              'UPSERT',
              'EarthquakeEvents',
              0,
              d1EndTime - d1StartTime,
              false,
              e.message
            );
            logger.logError('D1_UPSERT_ERROR', e, {
              featureCount: featuresToUpsert.length,
              duration: d1EndTime - d1StartTime
            }, false);
          }
          // If D1 fails, we probably don't want to update KV with a state that D1 doesn't reflect.
        }
      } else if (featuresToUpsert && featuresToUpsert.length === 0) {
        console.log("[usgs-proxy-d1] No features identified to upsert to D1. KV will not be updated as no D1 changes were made based on diff.");
        
        if (logger && isCronRequest) {
          logger.logMilestone('No features to upsert', { 
            totalFetched: totalNewFeaturesFetched,
            reason: 'no-changes-detected'
          });
        }
      } else if (!env.DB) {
        console.warn("[usgs-proxy-d1] D1 Database (env.DB) not configured. Skipping D1 upsert and subsequent KV update.");
        
        if (logger && isCronRequest) {
          logger.logError('DB_NOT_CONFIGURED', 'D1 Database not configured', { featureCount: featuresToUpsert.length }, false);
        }
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
    
    if (logger && isCronRequest) {
      logger.logError('PROXY_HANDLER_ERROR', error, {
        apiUrl,
        stage: 'outer-catch',
        isCronRequest
      }, true);
    }
    
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
