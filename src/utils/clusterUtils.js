/**
 * @file clusterUtils.js
 * @description Utilities for earthquake cluster operations.
 */

/**
 * Regenerates a cluster of earthquakes around a primary quake.
 *
 * @param {object} primaryQuake - The main earthquake object. Must have id, geometry.coordinates[1] (lat), geometry.coordinates[0] (lon).
 * @param {Array<object>} allQuakesList - A list of all earthquake objects to consider. Each must have id, geometry.coordinates.
 * @param {number} maxDistanceKm - Maximum distance in kilometers for an earthquake to be included in the cluster.
 * @param {number} minQuakes - Minimum number of earthquakes (including the primary) required to form a valid cluster.
 * @param {function} calculateDistanceFunc - A function (lat1, lon1, lat2, lon2) => distanceKm.
 * @returns {Array<object>|null} An array of earthquake objects forming the cluster, or null if the criteria are not met.
 */
export function regenerateClusterAroundQuake(primaryQuake, allQuakesList, maxDistanceKm, minQuakes, calculateDistanceFunc) {
    if (!primaryQuake || !primaryQuake.geometry || !primaryQuake.geometry.coordinates) {
        console.error("Primary quake is invalid or missing coordinates.");
        return null;
    }
    const primaryLat = primaryQuake.geometry.coordinates[1];
    const primaryLon = primaryQuake.geometry.coordinates[0];

    if (typeof primaryLat !== 'number' || typeof primaryLon !== 'number') {
        console.error("Primary quake has invalid coordinate types.");
        return null;
    }

    const newClusterQuakes = [primaryQuake];

    for (const otherQuake of allQuakesList) {
        if (!otherQuake || !otherQuake.id || !otherQuake.geometry || !otherQuake.geometry.coordinates) {
            console.warn("Skipping invalid otherQuake in allQuakesList.", otherQuake);
            continue;
        }
        if (otherQuake.id === primaryQuake.id) {
            continue;
        }

        const otherLat = otherQuake.geometry.coordinates[1];
        const otherLon = otherQuake.geometry.coordinates[0];

        if (typeof otherLat !== 'number' || typeof otherLon !== 'number') {
            console.warn(`Other quake ${otherQuake.id} has invalid coordinate types. Skipping.`);
            continue;
        }

        const distance = calculateDistanceFunc(primaryLat, primaryLon, otherLat, otherLon);

        if (distance <= maxDistanceKm) {
            newClusterQuakes.push(otherQuake);
        }
    }

    if (newClusterQuakes.length >= minQuakes) {
        return newClusterQuakes;
    } else {
        return null;
    }
}
