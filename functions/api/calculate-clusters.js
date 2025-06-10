// functions/api/calculate-clusters.js

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

/**
 * Finds clusters of earthquakes based on proximity and time.
 * @param {Array<object>} earthquakes - Array of earthquake objects. Expected to have `properties.time` and `geometry.coordinates`.
 * @param {number} maxDistanceKm - Maximum distance between quakes to be considered in the same cluster.
 * @param {number} minQuakes - Minimum number of quakes to form a valid cluster.
 * @returns {Array<Array<object>>} An array of clusters, where each cluster is an array of earthquake objects.
 */
function findActiveClusters(earthquakes, maxDistanceKm, minQuakes) {
    const clusters = [];
    const processedQuakeIds = new Set();

    // Sort earthquakes by magnitude (descending) to potentially form clusters around stronger events first.
    const sortedEarthquakes = [...earthquakes].sort((a, b) => (b.properties.mag || 0) - (a.properties.mag || 0));

    for (const quake of sortedEarthquakes) {
        if (processedQuakeIds.has(quake.id)) {
            continue;
        }

        const newCluster = [quake];
        processedQuakeIds.add(quake.id);
        const baseLat = quake.geometry.coordinates[1];
        const baseLon = quake.geometry.coordinates[0];

        for (const otherQuake of sortedEarthquakes) {
            if (processedQuakeIds.has(otherQuake.id) || otherQuake.id === quake.id) {
                continue;
            }

            const dist = calculateDistance(
                baseLat,
                baseLon,
                otherQuake.geometry.coordinates[1],
                otherQuake.geometry.coordinates[0]
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
    // Assuming lastFetchTime and timeWindowHours are passed in the request for a more robust cache key.
    // If not, the cache key generation needs to be adapted based on available unique parameters.
    const { earthquakes, maxDistanceKm, minQuakes, lastFetchTime, timeWindowHours } = await context.request.json();

    // Basic input validation
    if (!Array.isArray(earthquakes) || !earthquakes.length) {
      return new Response(JSON.stringify({ error: 'Invalid or empty earthquakes array' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (typeof maxDistanceKm !== 'number' || maxDistanceKm <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid maxDistanceKm' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (typeof minQuakes !== 'number' || minQuakes <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid minQuakes' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Generate a cache key - incorporating assumed lastFetchTime and timeWindowHours
    // Ensure these parameters are consistently available and stringified for the key.
    const requestParams = { numQuakes: earthquakes.length, maxDistanceKm, minQuakes, lastFetchTime, timeWindowHours };
    const cacheKey = `clusters-${JSON.stringify(requestParams)}`;

    if (!env.DB) {
      console.error("D1 Database (env.DB) not available.");
      // Fallback to calculation without caching if DB is not configured
      // or return an error, depending on desired strictness.
      // For now, proceeding to calculate without cache.
      const clustersNoDB = findActiveClusters(earthquakes, maxDistanceKm, minQuakes);
      return new Response(JSON.stringify(clustersNoDB), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Cache-Hit': 'false', 'X-Cache-Info': 'DB not configured' },
      });
    }

    try {
      const cacheQuery = "SELECT clusterData FROM ClusterCache WHERE cacheKey = ? AND createdAt > datetime('now', '-1 hour')";
      const stmt = env.DB.prepare(cacheQuery).bind(cacheKey);
      const cachedResult = await stmt.first();

      if (cachedResult && cachedResult.clusterData) {
        try {
          JSON.parse(cachedResult.clusterData); // Validate JSON
          return new Response(cachedResult.clusterData, {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'X-Cache-Hit': 'true' },
          });
        } catch (parseError) {
          console.error('Error parsing cached JSON from D1:', parseError);
          // If parsing fails, proceed to compute and overwrite the bad cache entry
        }
      }
    } catch (dbError) {
      console.error('D1 GET error:', dbError);
      // Non-fatal, proceed to compute if D1 GET fails
    }

    const clusters = findActiveClusters(earthquakes, maxDistanceKm, minQuakes);
    const clusterDataString = JSON.stringify(clusters);

    try {
      const insertQuery = "INSERT OR REPLACE INTO ClusterCache (cacheKey, clusterData) VALUES (?, ?)";
      const stmt = env.DB.prepare(insertQuery).bind(cacheKey, clusterDataString);
      await stmt.run();
    } catch (dbError) {
      console.error('D1 PUT error:', dbError);
      // Non-fatal, return data even if PUT fails
    }

    return new Response(clusterDataString, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Cache-Hit': 'false' },
    });

  } catch (error) {
    console.error('Error processing request:', error);
    // Distinguish between client errors (e.g., bad JSON) and server errors
    if (error instanceof SyntaxError) { // Potentially from await context.request.json()
        return new Response(JSON.stringify({ error: 'Invalid JSON payload', details: error.message }), {
            status: 400, // Bad Request
            headers: { 'Content-Type': 'application/json' },
        });
    }
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
