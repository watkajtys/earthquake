/**
 * @file seismicUtils.js
 * Utility functions related to seismic wave calculations.
 */

/**
 * Average P-wave velocity in km/s.
 * This is a simplified average for crustal P-waves.
 * @type {number}
 */
export const AVERAGE_P_WAVE_VELOCITY_KM_S = 6.5;

/**
 * Average S-wave velocity in km/s.
 * This is a simplified average for crustal S-waves.
 * @type {number}
 */
export const AVERAGE_S_WAVE_VELOCITY_KM_S = 3.75;

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
 * Calculates the distance in kilometers between two points on Earth using the Haversine formula.
 * @param {number} lat1 Latitude of point 1
 * @param {number} lon1 Longitude of point 1
 * @param {number} lat2 Latitude of point 2
 * @param {number} lon2 Longitude of point 2
 * @returns {number} Distance in kilometers
 */
export const calculateGreatCircleDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180; // Convert degrees to radians
  const dLon = (lon2 - lon1) * Math.PI / 180; // Convert degrees to radians
  const rLat1 = lat1 * Math.PI / 180; // Convert degrees to radians
  const rLat2 = lat2 * Math.PI / 180; // Convert degrees to radians

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(rLat1) * Math.cos(rLat2) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance;
};

/**
 * Calculates the hypocentral distance between an earthquake and a station.
 * @param {object} earthquake Earthquake object with geometry.coordinates [lon, lat, depth]
 * @param {number} stationLat Latitude of the station
 * @param {number} stationLon Longitude of the station
 * @returns {number} Hypocentral distance in kilometers, or NaN if inputs are invalid
 */
export const calculateHypocentralDistance = (earthquake, stationLat, stationLon) => {
  if (
    !earthquake ||
    !earthquake.geometry ||
    !earthquake.geometry.coordinates ||
    earthquake.geometry.coordinates.length < 3 ||
    typeof earthquake.geometry.coordinates[0] !== 'number' ||
    typeof earthquake.geometry.coordinates[1] !== 'number' ||
    typeof earthquake.geometry.coordinates[2] !== 'number' ||
    typeof stationLat !== 'number' ||
    typeof stationLon !== 'number'
  ) {
    // Consider logging an error here if a logging library is available
    return NaN;
  }

  const [lon, lat, depth] = earthquake.geometry.coordinates;

  // Ensure latitude and longitude are valid numbers before proceeding
  if (isNaN(lat) || isNaN(lon) || isNaN(depth)) {
      return NaN;
  }


  const surfaceDistance = calculateGreatCircleDistance(lat, lon, stationLat, stationLon);

  if (isNaN(surfaceDistance)) {
      // This might happen if calculateGreatCircleDistance itself has issues or invalid intermediate results
      return NaN;
  }

  // Ensure depth is a non-negative number
  if (depth < 0) {
      // Or handle as an error, depending on requirements for negative depth
      return NaN;
  }

  const hypocentralDistance = Math.sqrt(Math.pow(surfaceDistance, 2) + Math.pow(depth, 2));
  return hypocentralDistance;
};
