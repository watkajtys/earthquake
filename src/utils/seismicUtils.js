/**
 * @file seismicUtils.js
 * Utility functions related to seismic wave calculations.
 */

/**
 * Average P-wave velocity in km/s.
 * This is a simplified average for crustal P-waves.
 * @type {number}
 */
const AVERAGE_P_WAVE_VELOCITY_KM_S = 6.5;

/**
 * Average S-wave velocity in km/s.
 * This is a simplified average for crustal S-waves.
 * @type {number}
 */
const AVERAGE_S_WAVE_VELOCITY_KM_S = 3.75;

/**
 * Calculates the travel time for a P-wave over a given distance.
 * This is a simplified calculation assuming a constant average velocity
 * and does not account for earthquake depth or complex velocity models.
 *
 * @param {number} distanceKm - The distance from the earthquake epicenter in kilometers.
 * @returns {number} The estimated P-wave travel time in seconds. Returns 0 if distance is 0.
 */
export function calculatePWaveTravelTime(distanceKm) {
    if (typeof distanceKm !== 'number' || distanceKm < 0) {
        // Or throw an error, depending on desired error handling
        console.warn(`Invalid distanceKm: ${distanceKm}. Returning 0.`);
        return 0;
    }
    if (distanceKm === 0) {
        return 0;
    }
    return distanceKm / AVERAGE_P_WAVE_VELOCITY_KM_S;
}

/**
 * Calculates the travel time for an S-wave over a given distance.
 * This is a simplified calculation assuming a constant average velocity
 * and does not account for earthquake depth or complex velocity models.
 *
 * @param {number} distanceKm - The distance from the earthquake epicenter in kilometers.
 * @returns {number} The estimated S-wave travel time in seconds. Returns 0 if distance is 0.
 */
export function calculateSWaveTravelTime(distanceKm) {
    if (typeof distanceKm !== 'number' || distanceKm < 0) {
        // Or throw an error, depending on desired error handling
        console.warn(`Invalid distanceKm: ${distanceKm}. Returning 0.`);
        return 0;
    }
    if (distanceKm === 0) {
        return 0;
    }
    return distanceKm / AVERAGE_S_WAVE_VELOCITY_KM_S;
}

/**
 * Calculates the Haversine distance between two geographic coordinates.
 * @param {number} lat1 - Latitude of the first point.
 * @param {number} lon1 - Longitude of the first point.
 * @param {number} lat2 - Latitude of the second point.
 * @param {number} lon2 - Longitude of the second point.
 * @returns {number} The distance in kilometers.
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
};
