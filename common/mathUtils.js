/**
 * @file mathUtils.js
 * @description Common math utility functions.
 */

// Original source: src/utils/utils.js
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
 * Converts earthquake magnitude to a simplified Modified Mercalli Intensity (MMI) value.
 * This is a simplified conversion and does not account for depth, distance, or local soil conditions.
 * @param {number} magnitude The earthquake magnitude.
 * @returns {string} The estimated MMI value as a Roman numeral string.
 */
export function magnitudeToMMI(magnitude) {
    if (magnitude < 3.5) {
        return "I";
    } else if (magnitude < 4.2) {
        return "II-III";
    } else if (magnitude < 4.8) {
        return "IV";
    } else if (magnitude < 5.4) {
        return "V";
    } else if (magnitude < 6.1) {
        return "VI";
    } else if (magnitude < 6.5) {
        return "VII";
    } else if (magnitude < 7.0) {
        return "VIII";
    } else if (magnitude < 7.4) {
        return "IX";
    } else if (magnitude < 8.1) {
        return "X";
    } else if (magnitude < 8.9) {
        return "XI";
    } else {
        return "XII";
    }
}
