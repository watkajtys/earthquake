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
 * Calculates the energy released by an earthquake from its magnitude.
 * Formula: E = 10^(1.5 * M + 4.8) Joules
 *
 * @param {number} magnitude - The earthquake magnitude.
 * @returns {number} The calculated energy in Joules. Returns 0 if magnitude is null or not a number.
 */
export function calculateEnergyFromMagnitude(magnitude) {
    if (magnitude === null || typeof magnitude !== 'number' || isNaN(magnitude)) {
        return 0;
    }
    return Math.pow(10, (1.5 * magnitude + 4.8));
}

/**
 * Calculates the total seismic energy released by a list of earthquakes.
 *
 * @param {Array<object>} earthquakes - An array of earthquake objects.
 *                                     Each object is expected to have `properties.mag`.
 * @returns {number} The total energy in Joules. Returns 0 if the input is not an array or is empty.
 */
export function sumEnergyForEarthquakes(earthquakes) {
    if (!Array.isArray(earthquakes) || earthquakes.length === 0) {
        return 0;
    }

    let totalEnergy = 0;
    for (const earthquake of earthquakes) {
        if (earthquake && earthquake.properties && typeof earthquake.properties.mag === 'number') {
            totalEnergy += calculateEnergyFromMagnitude(earthquake.properties.mag);
        }
    }
    return totalEnergy;
}
