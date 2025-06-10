// functions/api/calculate-clusters.js

// NOTE: This function is duplicated in src/utils/utils.js
// Any algorithmic changes should be synchronized.
/**
 * Calculates the distance between two geographical coordinates using the Haversine formula.
 * @param {number} lat1 Latitude of the first point.
 * @param {number} lon1 Longitude of the first point.
 * @param {number} lat2 Latitude of the second point.
 * @param {number} lon2 Longitude of the second point.
 * @returns {number} Distance in kilometers.
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
}

// NOTE: This function is duplicated in src/utils/clusterUtils.js
// Any algorithmic changes should be synchronized.
/**
 * Finds clusters of earthquakes based on proximity and time.
 * The algorithm sorts earthquakes by magnitude in descending order.
 * It then iterates through sorted earthquakes, greedily assigning them to the first cluster
 * they are close enough to (within maxDistanceKm). If an earthquake doesn't fit an existing
 * cluster being built, it can start a new one.
 * Temporal proximity (time difference between quakes) is not a direct factor in this clustering logic,
 * which could be a potential area for future enhancement.
 * @param {Array<object>} earthquakes - Array of earthquake objects.
 * @param {number} maxDistanceKm - Maximum distance between quakes to be considered in the same cluster.
 * @param {number} minQuakes - Minimum number of quakes to form a valid cluster.
 * @returns {Array<Array<object>>} An array of clusters, where each cluster is an array of earthquake objects.
 */
function findActiveClusters(earthquakes, maxDistanceKm, minQuakes) {
    const clusters = [];
    const processedQuakeIds = new Set();

    // Sort earthquakes by magnitude (descending) to potentially form clusters around stronger events first.
    // This is a greedy approach.
    const sortedEarthquakes = [...earthquakes].sort((a, b) => (b.properties?.mag || 0) - (a.properties?.mag || 0));

    for (const quake of sortedEarthquakes) {
        if (!quake || !quake.id || processedQuakeIds.has(quake.id)) {
            continue;
        }

        const newCluster = [quake];
        processedQuakeIds.add(quake.id);

        const baseCoords = quake.geometry?.coordinates;
        if (!Array.isArray(baseCoords) || baseCoords.length < 2) {
            console.warn(`Skipping quake with invalid coordinates in findActiveClusters: ${quake.id}`);
            continue;
        }
        const baseLat = baseCoords[1];
        const baseLon = baseCoords[0];

        // Iterate through remaining quakes to see if they belong to this newCluster
        for (const otherQuake of sortedEarthquakes) {
            if (!otherQuake || !otherQuake.id || processedQuakeIds.has(otherQuake.id) || otherQuake.id === quake.id) {
                continue;
            }

            const otherCoords = otherQuake.geometry?.coordinates;
            if (!Array.isArray(otherCoords) || otherCoords.length < 2) {
                console.warn(`Skipping otherQuake with invalid coordinates in findActiveClusters: ${otherQuake.id}`);
                continue;
            }

            const dist = calculateDistance(
                baseLat,
                baseLon,
                otherCoords[1],
                otherCoords[0]
            );

            if (dist <= maxDistanceKm) {
                newCluster.push(otherQuake);
                processedQuakeIds.add(otherQuake.id);
            }
        }

        if (newCluster.length >= minQuakes) {
            clusters.push(newCluster);
        }
    }
    return clusters;
}

export async function onRequestPost(context) {
  try {
    const { env } = context;
    const { earthquakes, maxDistanceKm, minQuakes, lastFetchTime, timeWindowHours } = await context.request.json();

    // Input Validation for earthquakes array
    if (!Array.isArray(earthquakes)) {
      return new Response(JSON.stringify({ error: 'Invalid earthquakes payload: not an array.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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
        if (typeof quake.properties.time !== 'number') { // Assuming time is a Unix timestamp (number)
            return new Response(JSON.stringify({ error: `Invalid earthquake at index ${i} (id: ${quake.id || 'N/A'}): 'properties.time' must be a number.` }), {
                status: 400, headers: { 'Content-Type': 'application/json' },
            });
        }
        if (!quake.id) { // Checking for presence of id, could also check type if needed
            return new Response(JSON.stringify({ error: `Invalid earthquake at index ${i}: missing 'id' property.` }), {
                status: 400, headers: { 'Content-Type': 'application/json' },
            });
        }
    }

    // If earthquakes array is empty from the start, it's a bad request.
    // Moved this check up to happen before other parameter validations.
    if (earthquakes.length === 0) {
      return new Response(JSON.stringify({ error: 'Earthquakes array is empty, no clusters to calculate.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Basic validation for other parameters (already present, retained)
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
      return new Response(JSON.stringify(clustersNoDB), {
        status: 200,
        headers: responseHeaders,
      });
    }

    try {
      const cacheQuery = "SELECT clusterData FROM ClusterCache WHERE cacheKey = ? AND createdAt > datetime('now', '-1 hour')";
      const stmt = env.DB.prepare(cacheQuery).bind(cacheKey);
      // console.log(`Attempting D1 GET for cacheKey: ${cacheKey}`); // Keep console logs for debugging if necessary
      const cachedResult = await stmt.first();

      if (cachedResult && cachedResult.clusterData) {
        try {
          const parsedData = JSON.parse(cachedResult.clusterData);
          // console.log(`Cache HIT for cacheKey: ${cacheKey}`);
          responseHeaders['X-Cache-Hit'] = 'true';
          return new Response(JSON.stringify(parsedData), {
            status: 200,
            headers: responseHeaders,
          });
        } catch (parseError) {
          console.error(`D1 Cache: Error parsing cached JSON for key ${cacheKey}:`, parseError.message);
        }
      } else {
        // console.log(`Cache MISS for cacheKey: ${cacheKey}`);
      }
    } catch (dbGetError) {
      console.error(`D1 GET error for cacheKey ${cacheKey}:`, dbGetError.message, dbGetError.cause);
      // Do not re-throw; allow function to proceed and calculate clusters
    }

    // console.log(`Calculating clusters for cacheKey: ${cacheKey}`);
    const clusters = findActiveClusters(earthquakes, maxDistanceKm, minQuakes);
    const clusterDataString = JSON.stringify(clusters);

    try {
      const insertQuery = "INSERT OR REPLACE INTO ClusterCache (cacheKey, clusterData, requestParams) VALUES (?, ?, ?)";
      const stmt = env.DB.prepare(insertQuery).bind(cacheKey, clusterDataString, JSON.stringify(requestParams));
      // console.log(`Attempting D1 PUT for cacheKey: ${cacheKey}`);
      await stmt.run();
      // console.log(`D1 PUT successful for cacheKey: ${cacheKey}`);
    } catch (dbPutError) {
      console.error(`D1 PUT error for cacheKey ${cacheKey}:`, dbPutError.message, dbPutError.cause);
      // Do not re-throw; allow function to proceed
    }

    responseHeaders['X-Cache-Hit'] = 'false';
    return new Response(clusterDataString, {
      status: 200,
      headers: responseHeaders,
    });

  } catch (error) {
    if (error instanceof SyntaxError && error.message.includes("JSON")) {
        console.error('Error parsing request JSON payload:', error.message);
        return new Response(JSON.stringify({ error: 'Invalid JSON payload', details: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    console.error('Unhandled error processing request:', error.message, error.stack);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
