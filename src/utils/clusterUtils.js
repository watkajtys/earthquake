// NOTE: This frontend version of findActiveClusters is largely synchronized with the backend version
// in functions/api/calculate-clusters.js. Key differences in the backend version include
// a duplicate cluster check and adjusted logging.
// This function uses calculateDistance imported from '../../common/mathUtils.js'.
// Algorithmic changes to core clustering logic should be synchronized with the backend version where applicable.
import { calculateDistance } from '../../common/mathUtils.js'; // Assuming utils.js is in the same directory

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
 * @example
 * const earthquakes = [
 *   { id: 'eq1', properties: { mag: 5.0 }, geometry: { coordinates: [10, 20] } },
 *   { id: 'eq2', properties: { mag: 4.5 }, geometry: { coordinates: [10.1, 20.1] } },
 *   { id: 'eq3', properties: { mag: 3.0 }, geometry: { coordinates: [50, 60] } }
 * ];
 * findActiveClusters(earthquakes, 20, 2); // returns [[eq1, eq2]]
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
