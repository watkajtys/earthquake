// NOTE: This function is duplicated in functions/api/calculate-clusters.js
// Any algorithmic changes should be synchronized.
import { calculateDistance } from './utils.js'; // Assuming utils.js is in the same directory

/**
 * @file clusterUtils.js
 * @description Utility functions for earthquake cluster analysis, primarily `findActiveClusters`.
 */

/**
 * Finds clusters of earthquakes based on geographic proximity.
 * The algorithm sorts earthquakes by magnitude in descending order to prioritize stronger events as potential cluster centers.
 * It then iterates through these sorted earthquakes. If an earthquake hasn't been processed yet,
 * it starts a new potential cluster with this quake. It then iterates through all other unprocessed earthquakes,
 * adding them to this new cluster if they are within `maxDistanceKm` of the initial quake.
 * Once an earthquake is added to any cluster (or processed as a potential cluster starter), it's marked as processed
 * and won't be considered again for starting new clusters or being added to subsequent ones.
 * Clusters with fewer than `minQuakes` are discarded.
 *
 * Note: Temporal proximity (time difference between quakes within a cluster) is not a direct factor in this specific clustering logic,
 * which could be an area for future enhancement if time-constrained clusters are desired.
 * Console warnings are issued for quakes with invalid coordinate data.
 *
 * @param {Array<Object>} earthquakes - Array of earthquake objects. Each object is expected to have an `id`,
 *   `properties.mag` (magnitude), and `geometry.coordinates` (an array like `[longitude, latitude, depth_optional]`).
 * @param {number} maxDistanceKm - Maximum geographic distance (in kilometers) between an earthquake and the
 *   initial earthquake of a cluster for it to be included in that cluster.
 * @param {number} minQuakes - Minimum number of earthquakes required to form a valid cluster.
 * @returns {Array<Array<Object>>} An array of clusters. Each cluster is an array of earthquake objects that meet the criteria.
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
