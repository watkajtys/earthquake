// functions/api/calculate-clusters.js

/**
 * Calculates the distance between two geographical coordinates using the Haversine formula.
 * @param {number} lat1 Latitude of the first point.
 * @param {number} lon1 Longitude of the first point.
 * @param {number} lat2 Latitude of the second point.
 * @param {number} lon2 Longitude of the second point.
 * @returns {number} Distance in kilometers.
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
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
 * Generates a SHA-256 hash of sorted earthquake IDs.
 * @param {Array<object>} earthquakes - Array of earthquake objects. Expected to have `id`.
 * @returns {Promise<string>} A hex string representation of the hash.
 */
export async function generateEarthquakeHash(earthquakes) {
    if (!earthquakes || earthquakes.length === 0) {
        return ''; // Return an empty string or a predefined constant for empty/invalid input
    }
    const ids = earthquakes.map(eq => eq.id).sort();
    const idString = ids.join(',');
    const encoder = new TextEncoder();
    const data = encoder.encode(idString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); // convert bytes to hex string
    return hashHex;
}

/**
 * Finds clusters of earthquakes based on proximity and time.
 * @param {Array<object>} earthquakes - Array of earthquake objects. Expected to have `properties.time` and `geometry.coordinates`.
 * @param {number} maxDistanceKm - Maximum distance between quakes to be considered in the same cluster.
 * @param {number} minQuakes - Minimum number of quakes to form a valid cluster.
 * @param {number} maxTimeDifferenceMs - Maximum time difference in milliseconds between quakes to be considered in the same cluster.
 * @returns {Array<Array<object>>} An array of clusters, where each cluster is an array of earthquake objects.
 */
export function findActiveClusters(earthquakes, maxDistanceKm, minQuakes, maxTimeDifferenceMs) {
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

            const timeDifference = Math.abs(otherQuake.properties.time - quake.properties.time);

            if (dist <= maxDistanceKm && timeDifference <= maxTimeDifferenceMs) {
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
    const { earthquakes, maxDistanceKm, minQuakes, maxTimeDifferenceMs } = await context.request.json();

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
    if (typeof maxTimeDifferenceMs !== 'number' || maxTimeDifferenceMs <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid maxTimeDifferenceMs' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Generate a cache key
    const earthquakeHash = await generateEarthquakeHash(earthquakes);
    const cacheKey = `clusters-${earthquakeHash}-${maxDistanceKm}-${minQuakes}-${maxTimeDifferenceMs}`;

    try {
      // Check cache first
      if (env.CLUSTER_KV) {
        const cachedData = await env.CLUSTER_KV.get(cacheKey);
        if (cachedData) {
          try {
            JSON.parse(cachedData); // Validate JSON before sending
            return new Response(cachedData, {
              status: 200,
              headers: { 'Content-Type': 'application/json', 'X-Cache-Hit': 'true' },
            });
          } catch (parseError) {
            console.error('Error parsing cached JSON:', parseError);
            // If parsing fails, proceed to compute and overwrite the bad cache entry
          }
        }
      }
    } catch (kvError) {
      console.error('KV GET error:', kvError);
      // Non-fatal, proceed to compute if KV GET fails
    }

    const clusters = findActiveClusters(earthquakes, maxDistanceKm, minQuakes, maxTimeDifferenceMs);
    const clusterDataString = JSON.stringify(clusters);

    try {
      if (env.CLUSTER_KV) {
        await env.CLUSTER_KV.put(cacheKey, clusterDataString, { expirationTtl: 3600 }); // Cache for 1 hour
      }
    } catch (kvError) {
      console.error('KV PUT error:', kvError);
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
