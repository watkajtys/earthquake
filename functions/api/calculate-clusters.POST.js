// functions/api/calculate-clusters.js

/**
 * @file functions/api/calculate-clusters.js
 * @description Cloudflare Worker module for calculating earthquake clusters.
 * This function receives a list of earthquakes and clustering parameters,
 * calculates clusters, and utilizes a D1 database for caching results.
 * It includes duplicated utility functions for distance calculation and cluster finding,
 * which should be kept in sync with their counterparts in `src/utils/`.
 */
import { calculateDistance } from '../utils/mathUtils.js';
import { storeClusterDefinition } from '../utils/d1ClusterUtils.js';
import { randomUUID } from 'node:crypto';
import { CLUSTER_MIN_QUAKES, DEFINED_CLUSTER_MIN_MAGNITUDE } from '../../src/constants/appConstants.js';

// Constants for defining significant clusters -- REMOVED
// const MIN_QUAKES_FOR_DEFINITION = 5; // No longer needed, using CLUSTER_MIN_QUAKES from appConstants
// const MIN_MAG_FOR_DEFINITION = 3.0; // No longer needed, using DEFINED_CLUSTER_MIN_MAGNITUDE from appConstants

// Helper Functions for Cluster Definition
function getStrongestQuake(cluster) {
  if (!cluster || cluster.length === 0) return null;
  return cluster.reduce((maxQuake, currentQuake) =>
    (currentQuake.properties.mag > maxQuake.properties.mag) ? currentQuake : maxQuake, cluster[0]);
}

function getMinMagnitude(cluster) {
  if (!cluster || cluster.length === 0) return null;
  return cluster.reduce((min, q) => Math.min(min, q.properties.mag), cluster[0].properties.mag);
}

function getMeanMagnitude(cluster) {
  if (!cluster || cluster.length === 0) return null;
  const sum = cluster.reduce((acc, q) => acc + q.properties.mag, 0);
  return sum / cluster.length;
}

function getStartTime(cluster) {
  if (!cluster || cluster.length === 0) return null;
  return cluster.reduce((min, q) => Math.min(min, q.properties.time), cluster[0].properties.time);
}

function getEndTime(cluster) {
  if (!cluster || cluster.length === 0) return null;
  return cluster.reduce((max, q) => Math.max(max, q.properties.time), cluster[0].properties.time);
}

function getDepthRangeString(cluster) {
  if (!cluster || cluster.length === 0) return "Unknown";
  const depths = cluster
    .map(q => q.geometry?.coordinates?.[2])
    .filter(d => d !== undefined && d !== null && typeof d === 'number');
  if (depths.length === 0) return "Unknown";
  const minDepth = Math.min(...depths);
  const maxDepth = Math.max(...depths);
  return `${minDepth.toFixed(1)}-${maxDepth.toFixed(1)}km`;
}

function generateSlug(quakeCount, locationName, maxMagnitude, id) {
  const safeLocation = (locationName || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const magStr = maxMagnitude.toFixed(1);
  const idStr = id.substring(0, 6);
  return `${quakeCount}-quakes-near-${safeLocation.slice(0, 50)}-m${magStr}-${idStr}`;
}

function generateTitle(quakeCount, locationName, maxMagnitude) {
  const safeLocation = locationName || "Unknown Location";
  return `Cluster: ${quakeCount} events near ${safeLocation}, max M${maxMagnitude.toFixed(1)}`;
}

function generateDescription(quakeCount, locationName, maxMagnitude, durationHours) {
  const safeLocation = locationName || "Unknown Location";
  const durationStr = durationHours > 0 ? `approx ${durationHours.toFixed(1)} hours` : "a short period";
  return `A cluster of ${quakeCount} earthquakes occurred near ${locationName}. Strongest: M${maxMagnitude.toFixed(1)}. Duration: ${durationStr}.`;
}


// NOTE: This version of findActiveClusters is adapted for backend use.
// It differs from the frontend version in src/utils/clusterUtils.js primarily in:
//    - Includes a check to prevent adding duplicate clusters based on quake IDs.
//    - Logging is adjusted for a backend environment.
// It uses calculateDistance imported from '../utils/mathUtils.js' (synced from /common/mathUtils.js).
// Algorithmic changes to core clustering logic should be synchronized with the frontend version where applicable.
/**
 * Finds clusters of earthquakes based on proximity.
 * (Duplicated from `src/utils/clusterUtils.js` - keep synchronized)
 * @param {Array<Object>} earthquakes - Array of earthquake objects. Each object is expected to have an `id`,
 *   `properties.mag` (magnitude), and `geometry.coordinates`.
 * @param {number} maxDistanceKm - Maximum geographic distance (in kilometers) for clustering.
 * @param {number} minQuakes - Minimum number of earthquakes required to form a valid cluster.
 * @returns {Array<Array<Object>>} An array of clusters, where each cluster is an array of earthquake objects.
 */
export function findActiveClusters(earthquakes, maxDistanceKm, minQuakes) {
    const clusters = [];
    const processedQuakeIds = new Set();

    // Filter out null or undefined earthquake objects first.
    const validEarthquakes = earthquakes.filter(q => {
        if (!q) {
            // Not logging here for null/undefined as this is an API context,
            // and the primary input validation in onRequestPost should catch this.
            // If direct calls to findActiveClusters need this, it can be added.
            return false;
        }
        return true;
    });

    const sortedEarthquakes = [...validEarthquakes].sort((a, b) => (b.properties?.mag || 0) - (a.properties?.mag || 0));

    for (const quake of sortedEarthquakes) {
        if (!quake.id || processedQuakeIds.has(quake.id)) {
            if (!quake.id && !processedQuakeIds.has(quake.id)) {
                console.warn(`Skipping quake with missing ID or invalid object in findActiveClusters.`);
            }
            continue;
        }

        const baseCoords = quake.geometry?.coordinates;
        if (!Array.isArray(baseCoords) || baseCoords.length < 2) {
            console.warn(`Skipping quake ${quake.id} due to invalid coordinates in findActiveClusters.`);
            continue;
        }
        const baseLat = baseCoords[1];
        const baseLon = baseCoords[0];

        const newCluster = [quake]; // Initialize cluster with the current quake
        processedQuakeIds.add(quake.id);


        for (const otherQuake of sortedEarthquakes) {
            if (otherQuake.id === quake.id || processedQuakeIds.has(otherQuake.id)) { // Check if same quake or already processed
                continue;
            }
             if (!otherQuake.id ) { // Check for missing ID on otherQuake
                console.warn(`Skipping potential cluster member with missing ID or invalid object.`);
                continue;
            }


            const otherCoords = otherQuake.geometry?.coordinates;
            if (!Array.isArray(otherCoords) || otherCoords.length < 2) {
                console.warn(`Skipping potential cluster member ${otherQuake.id} due to invalid coordinates.`);
                continue;
            }
            const dist = calculateDistance(baseLat, baseLon, otherCoords[1], otherCoords[0]);
            if (dist <= maxDistanceKm) {
                newCluster.push(otherQuake);
                processedQuakeIds.add(otherQuake.id);
            }
        }
        if (newCluster.length >= minQuakes) {
             // Check if this new cluster is essentially a duplicate of an existing one (e.g. same set of quake IDs)
            const newClusterQuakeIds = new Set(newCluster.map(q => q.id));
            let isDuplicate = false;
            for (const existingCluster of clusters) {
                const existingClusterQuakeIds = new Set(existingCluster.map(q => q.id));
                if (newClusterQuakeIds.size === existingClusterQuakeIds.size) {
                    let allSame = true;
                    for (const id of newClusterQuakeIds) {
                        if (!existingClusterQuakeIds.has(id)) {
                            allSame = false;
                            break;
                        }
                    }
                    if (allSame) {
                        isDuplicate = true;
                        break;
                    }
                }
            }
            if (!isDuplicate) {
                clusters.push(newCluster);
            }
        }
    }
    return clusters;
}

/**
 * Handles POST requests to calculate earthquake clusters.
 * Expects a JSON payload with `earthquakes`, `maxDistanceKm`, and `minQuakes`.
 * Optional `lastFetchTime` and `timeWindowHours` can be included for caching key generation.
 *
 * The function performs input validation on the payload.
 * It then attempts to retrieve cached cluster data from a D1 database (`env.DB`, table `ClusterCache`)
 * based on the request parameters. Cache duration is 1 hour.
 * If no valid cache entry is found, it calculates clusters using `findActiveClusters`,
 * stores the new result in the D1 cache, and returns the clusters.
 *
 * Responses include an `X-Cache-Hit` header ('true' or 'false').
 *
 * @async
 * @param {object} context - The Cloudflare Worker request context object (commonly includes 'request', 'env', 'ctx').
 * @param {Request} context.request - The incoming HTTP request object, expected to have a JSON body.
 * @param {object} context.env - Environment variables, expected to contain `DB` (D1 Database binding).
 * @returns {Promise<Response>} A `Response` object containing either the calculated cluster data (Array of arrays of earthquake objects)
 *   or an error response (405 for wrong method, 400 for bad request, 500 for internal server error).
 */
export async function onRequest(context) {
  // Method check removed as this file will be specifically routed for POST requests.

  try {
    const { env, request } = context; // Destructure request from context
    const { earthquakes, maxDistanceKm, minQuakes, lastFetchTime, timeWindowHours } = await request.json();

    // Input Validation
    if (!Array.isArray(earthquakes)) {
      return new Response(JSON.stringify({ error: 'Invalid earthquakes payload: not an array.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (earthquakes.length === 0) { // Moved up
      return new Response(JSON.stringify({ error: 'Earthquakes array is empty, no clusters to calculate.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    // Restored detailed validation loop
    for (let i = 0; i < earthquakes.length; i++) {
        const quake = earthquakes[i];
        if (!quake || typeof quake !== 'object') {
            return new Response(JSON.stringify({ error: `Invalid earthquake object at index ${i}: not an object.` }), {
                status: 400, headers: { 'Content-Type': 'application/json' },
            });
        }
        if (!quake.geometry || typeof quake.geometry !== 'object') {
            return new Response(JSON.stringify({ error: `Invalid earthquake at index ${i} (id: ${quake.id || 'N/A'}): missing or invalid 'geometry' object.` }), {
                status: 400, headers: { 'Content-Type': 'application/json' },
            });
        }
        if (!Array.isArray(quake.geometry.coordinates) || quake.geometry.coordinates.length < 2 ||
            typeof quake.geometry.coordinates[0] !== 'number' || typeof quake.geometry.coordinates[1] !== 'number') {
            return new Response(JSON.stringify({ error: `Invalid earthquake at index ${i} (id: ${quake.id || 'N/A'}): 'geometry.coordinates' must be an array of at least 2 numbers.` }), {
                status: 400, headers: { 'Content-Type': 'application/json' },
            });
        }
        if (!quake.properties || typeof quake.properties !== 'object') {
            return new Response(JSON.stringify({ error: `Invalid earthquake at index ${i} (id: ${quake.id || 'N/A'}): missing or invalid 'properties' object.` }), {
                status: 400, headers: { 'Content-Type': 'application/json' },
            });
        }
        if (typeof quake.properties.time !== 'number') {
            return new Response(JSON.stringify({ error: `Invalid earthquake at index ${i} (id: ${quake.id || 'N/A'}): 'properties.time' must be a number.` }), {
                status: 400, headers: { 'Content-Type': 'application/json' },
            });
        }
        if (!quake.id) {
            return new Response(JSON.stringify({ error: `Invalid earthquake at index ${i}: missing 'id' property.` }), {
                status: 400, headers: { 'Content-Type': 'application/json' },
            });
        }
    }
    if (typeof maxDistanceKm !== 'number' || maxDistanceKm <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid maxDistanceKm' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (typeof minQuakes !== 'number' || minQuakes <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid minQuakes' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const requestParams = { numQuakes: earthquakes.length, maxDistanceKm, minQuakes, lastFetchTime, timeWindowHours };
    const cacheKey = `clusters-${JSON.stringify(requestParams)}`;
    const responseHeaders = { 'Content-Type': 'application/json' };
    let clusters; // Declare clusters here to be accessible for definition storage

    if (!env.DB) {
      console.warn("D1 Database (env.DB) not available. Proceeding without cache or definition storage.");
      clusters = findActiveClusters(earthquakes, maxDistanceKm, minQuakes);
      responseHeaders['X-Cache-Hit'] = 'false';
      responseHeaders['X-Cache-Info'] = 'DB not configured';
      return new Response(JSON.stringify(clusters), { status: 200, headers: responseHeaders });
    }

    // DB is available, proceed with caching logic
    const cacheQuery = "SELECT clusterData FROM ClusterCache WHERE cacheKey = ? AND createdAt > datetime('now', '-1 hour')";
    const selectStmt = env.DB.prepare(cacheQuery);
    const insertQuery = "INSERT OR REPLACE INTO ClusterCache (cacheKey, clusterData, requestParams) VALUES (?, ?, ?)";
    const insertStmt = env.DB.prepare(insertQuery);

    try {
      const cachedResult = await selectStmt.bind(cacheKey).first();
      if (cachedResult && cachedResult.clusterData) {
        try {
          clusters = JSON.parse(cachedResult.clusterData);
          responseHeaders['X-Cache-Hit'] = 'true';
          // Note: We return cached clusters directly. Definitions for these would have been stored when first calculated.
          // If re-storage or update of definitions on cache hit is desired, logic would be added here.
          return new Response(JSON.stringify(clusters), { status: 200, headers: responseHeaders });
        } catch (parseError) {
          console.error(`D1 Cache: Error parsing cached JSON for key ${cacheKey}:`, parseError.message);
          // Proceed to recalculate if parsing fails
        }
      }
    } catch (dbGetError) {
      console.error(`D1 GET error for cacheKey ${cacheKey}:`, dbGetError.message, dbGetError.cause);
      // Proceed to recalculate
    }

    clusters = findActiveClusters(earthquakes, maxDistanceKm, minQuakes);
    const clusterDataString = JSON.stringify(clusters);

    try {
      await insertStmt.bind(cacheKey, clusterDataString, JSON.stringify(requestParams)).run();
      responseHeaders['X-Cache-Hit'] = 'false'; // Stored now, so it's a "miss" for this request
    } catch (dbPutError) {
      console.error(`D1 PUT error for cacheKey ${cacheKey}:`, dbPutError.message, dbPutError.cause);
      // Do not re-throw, proceed with returning calculated clusters
      responseHeaders['X-Cache-Info'] = 'Cache write failed';
    }

    // Asynchronously store significant cluster definitions (fire and forget style from client's perspective)
    // This section runs after cache logic and before returning the response for the current request.
    if (env.DB && clusters && clusters.length > 0) {
      console.log(`Starting processing of ${clusters.length} calculated clusters for definition storage.`);
      for (const calculatedCluster of clusters) {
        if (!calculatedCluster || calculatedCluster.length === 0) continue;

        const strongestQuakeInCalcCluster = getStrongestQuake(calculatedCluster);
        if (!strongestQuakeInCalcCluster || !strongestQuakeInCalcCluster.properties) {
            console.warn("Skipping cluster definition due to missing strongest quake or properties.");
            continue;
        }

        const clusterMaxMag = strongestQuakeInCalcCluster.properties.mag;

        // Use imported constants for significance check
        if (calculatedCluster.length >= CLUSTER_MIN_QUAKES && clusterMaxMag >= DEFINED_CLUSTER_MIN_MAGNITUDE) {
          const clusterId = randomUUID();
          const quakeCount = calculatedCluster.length;
          const startTime = getStartTime(calculatedCluster);
          const endTime = getEndTime(calculatedCluster);
          const durationHours = (endTime > startTime) ? (endTime - startTime) / (1000 * 60 * 60) : 0;
          const locationName = strongestQuakeInCalcCluster.properties.place || "Unknown Location";
          const maxMagnitude = clusterMaxMag; // Already have this from strongestQuakeInCalcCluster

          const clusterDataToStore = {
            id: clusterId,
            earthquakeIds: calculatedCluster.map(q => q.id),
            quakeCount: quakeCount,
            strongestQuakeId: strongestQuakeInCalcCluster.id,
            maxMagnitude: maxMagnitude,
            minMagnitude: getMinMagnitude(calculatedCluster),
            meanMagnitude: getMeanMagnitude(calculatedCluster),
            startTime: startTime,
            endTime: endTime,
            durationHours: durationHours,
            locationName: locationName,
            centroidLat: strongestQuakeInCalcCluster.geometry.coordinates[1] || 0,
            centroidLon: strongestQuakeInCalcCluster.geometry.coordinates[0] || 0,
            radiusKm: 0, // Placeholder
            depthRange: getDepthRangeString(calculatedCluster),
            slug: generateSlug(quakeCount, locationName, maxMagnitude, clusterId),
            title: generateTitle(quakeCount, locationName, maxMagnitude),
            description: generateDescription(quakeCount, locationName, maxMagnitude, durationHours),
            significanceScore: quakeCount > 0 ? maxMagnitude * Math.log10(quakeCount) : 0,
            version: 1,
          };

          // Asynchronous storage attempt
          // Wrapping in a self-invoking async function or Promise.resolve().then()
          // to ensure it doesn't block the main response path if storeClusterDefinition is slow.
          // For Cloudflare Workers, simple await might be fine if total execution time is within limits.
          // Using await here for simplicity, assuming storeClusterDefinition is efficient.
          console.log(`Attempting to store definition for significant cluster ${clusterId} with ${quakeCount} quakes, maxMag ${maxMagnitude.toFixed(1)}.`);
          try {
            const storeResult = await storeClusterDefinition(env.DB, clusterDataToStore);
            if (storeResult.success) {
              console.log(`Successfully stored definition for cluster ${clusterDataToStore.id}`);
            } else {
              console.error(`Failed to store definition for cluster ${clusterDataToStore.id}: ${storeResult.error}`);
            }
          } catch (e) {
            console.error(`Error during async storage of cluster ${clusterDataToStore.id}: ${e.message}`, e.stack);
          }
        } else {
           // console.log(`Cluster with ${calculatedCluster.length} quakes, maxMag ${clusterMaxMag.toFixed(1)} did not meet significance criteria.`);
        }
      }
      console.log("Finished processing calculated clusters for definition storage.");
    }


    return new Response(clusterDataString, { status: 200, headers: responseHeaders });

  } catch (error) {
    // Handle JSON parsing errors specifically for the main request body
    if (error instanceof SyntaxError && error.message.includes("JSON") && error.message.includes("await context.request.json()")) {
        return new Response(JSON.stringify({ error: 'Invalid JSON payload for the request.', details: error.message }), {
            status: 400, headers: { 'Content-Type': 'application/json' },
        });
    }
    // General error handler for other issues
    console.error('Unhandled error in onRequest:', error.message, error.stack); // Changed onRequestPost to onRequest
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
