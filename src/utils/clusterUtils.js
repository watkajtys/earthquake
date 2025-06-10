// NOTE: This function is duplicated in functions/api/calculate-clusters.js
// Any algorithmic changes should be synchronized.
import { calculateDistance } from './utils.js'; // Assuming utils.js is in the same directory

/**
 * Finds clusters of earthquakes based on proximity and time.
 * The algorithm sorts earthquakes by magnitude in descending order.
 * It then iterates through sorted earthquakes, greedily assigning them to the first cluster
 * they are close enough to (within maxDistanceKm). If an earthquake doesn't fit an existing
 * cluster being built, it can start a new one.
 * Temporal proximity (time difference between quakes) is not a direct factor in this clustering logic,
 * which could be a potential area for future enhancement.
 * @param {Array<object>} earthquakes - Array of earthquake objects. Expected to have `properties.time` and `geometry.coordinates`.
 * @param {number} maxDistanceKm - Maximum distance between quakes to be considered in the same cluster.
 * @param {number} minQuakes - Minimum number of quakes to form a valid cluster.
 * @returns {Array<Array<object>>} An array of clusters, where each cluster is an array of earthquake objects.
 */
export function findActiveClusters(earthquakes, maxDistanceKm, minQuakes) {
    const clusters = [];
    const processedQuakeIds = new Set();

    // Filter out null or undefined earthquake objects first.
    const validEarthquakes = earthquakes.filter(q => {
        if (!q) {
            // Use a generic message as the object itself is null/undefined
            console.warn("Skipping invalid quake object: null or undefined");
            return false;
        }
        // Further checks for id, geometry will be handled within the loops or by their absence causing issues.
        return true;
    });

    // Sort earthquakes by magnitude (descending) to potentially form clusters around stronger events first.
    const sortedEarthquakes = [...validEarthquakes].sort((a, b) => (b.properties?.mag || 0) - (a.properties?.mag || 0));

    for (const quake of sortedEarthquakes) {
        // ID check is crucial; if a quake somehow passed the filter without an ID (e.g. empty string id), skip.
        if (!quake.id || processedQuakeIds.has(quake.id)) {
            if (!quake.id && !processedQuakeIds.has(quake.id)) { // Added specific warning for missing ID if it reaches here.
                console.warn("Skipping quake with missing or empty id during clustering attempt.");
            }
            continue;
        }

        const baseCoords = quake.geometry?.coordinates;
        if (!Array.isArray(baseCoords) || baseCoords.length < 2) {
            console.warn(`Client: Skipping quake ${quake.id} due to invalid coordinates in findActiveClusters.`);
            continue;
        }
        const baseLat = baseCoords[1];
        const baseLon = baseCoords[0];

        // Quake is valid enough to start a cluster attempt
        const newCluster = [quake];
        processedQuakeIds.add(quake.id);

        // Iterate through remaining quakes to see if they belong to this newCluster
        for (const otherQuake of sortedEarthquakes) {
            // ID check for otherQuake as well. If it's missing an ID, or already processed, or the same as the current quake, skip.
            if (!otherQuake.id || processedQuakeIds.has(otherQuake.id) || otherQuake.id === quake.id) {
                // The warning for missing ID on `otherQuake` was removed as it could be noisy.
                // `quake` (the base of the cluster) already has its ID checked and warned if missing.
                // `otherQuake` without an ID will simply be skipped here.
                continue;
            }

            const otherCoords = otherQuake.geometry?.coordinates;
            if (!Array.isArray(otherCoords) || otherCoords.length < 2) {
                // Warning removed here to avoid duplicate warnings from the outer loop's check.
                // The quake will be skipped by the outer loop check when its turn comes.
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
