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
 *   or a JSON error object with appropriate HTTP status codes (400 for bad request, 500 for internal server error).
 */
export async function onRequestPost(context) {
  try {
    const { env } = context;
    const { earthquakes, maxDistanceKm, minQuakes, lastFetchTime, timeWindowHours } = await context.request.json();

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

    if (!env.DB) {
      console.warn("D1 Database (env.DB) not available. Proceeding without cache.");
      const clustersNoDB = findActiveClusters(earthquakes, maxDistanceKm, minQuakes);
      responseHeaders['X-Cache-Hit'] = 'false';
      responseHeaders['X-Cache-Info'] = 'DB not configured';
      return new Response(JSON.stringify(clustersNoDB), { status: 200, headers: responseHeaders });
    }

    // Prepare statements outside specific D1 operation try-catch blocks
    const cacheQuery = "SELECT clusterData FROM ClusterCache WHERE cacheKey = ? AND createdAt > datetime('now', '-1 hour')";
    const selectStmt = env.DB.prepare(cacheQuery); // If this throws, main catch handles (500)

    const insertQuery = "INSERT OR REPLACE INTO ClusterCache (cacheKey, clusterData, requestParams) VALUES (?, ?, ?)";
    const insertStmt = env.DB.prepare(insertQuery); // If this throws, main catch handles (500)

    try { // Inner try-catch for D1 GET (selectStmt.first())
      const boundSelectStmt = selectStmt.bind(cacheKey);
      const cachedResult = await boundSelectStmt.first();
      if (cachedResult && cachedResult.clusterData) {
        try {
          const parsedData = JSON.parse(cachedResult.clusterData);
          responseHeaders['X-Cache-Hit'] = 'true';
          return new Response(JSON.stringify(parsedData), { status: 200, headers: responseHeaders });
        } catch (parseError) {
          console.error(`D1 Cache: Error parsing cached JSON for key ${cacheKey}:`, parseError.message);
        }
      }
    } catch (dbGetError) {
      console.error(`D1 GET error for cacheKey ${cacheKey}:`, dbGetError.message, dbGetError.cause);
      // DO NOT RE-THROW; allow function to proceed and calculate clusters
    }

    const clusters = findActiveClusters(earthquakes, maxDistanceKm, minQuakes);
    const clusterDataString = JSON.stringify(clusters);

    try { // Inner try-catch for D1 PUT (insertStmt.run())
      const boundInsertStmt = insertStmt.bind(cacheKey, clusterDataString, JSON.stringify(requestParams));
      await boundInsertStmt.run();
    } catch (dbPutError) {
      console.error(`D1 PUT error for cacheKey ${cacheKey}:`, dbPutError.message, dbPutError.cause);
      // DO NOT RE-THROW; allow function to proceed
    }

    responseHeaders['X-Cache-Hit'] = 'false';
    return new Response(clusterDataString, { status: 200, headers: responseHeaders });

  } catch (error) {
    if (error instanceof SyntaxError && error.message.includes("JSON")) {
        return new Response(JSON.stringify({ error: 'Invalid JSON payload', details: error.message }), {
            status: 400, headers: { 'Content-Type': 'application/json' },
        });
    }
    console.error('Unhandled error processing request:', error.message, error.stack);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
