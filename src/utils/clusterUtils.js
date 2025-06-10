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
            // console.warn is not typically used in client-side utils directly affecting UI flow,
            // but for consistency in logic, the check is valuable.
            // Consider how to handle/log this in a client-specific way if needed.
            console.warn(`Client: Skipping quake with invalid coordinates in findActiveClusters: ${quake.id}`);
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
                console.warn(`Client: Skipping otherQuake with invalid coordinates in findActiveClusters: ${otherQuake.id}`);
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
