// Helper Functions

// This function is used by getBeachballPathsAndType
// isValidNumber was moved to utils.js
import { isValidNumber } from './utils.js';


export const getBeachballPathsAndType = (rake) => { // dip parameter removed
    let faultType = 'UNKNOWN';
    const r = parseFloat(rake);

    if (!isValidNumber(r)) return { shadedPaths: [], faultType, nodalPlanes: [] }; // Uses imported isValidNumber

    if ((r >= -22.5 && r <= 22.5) || r > 157.5 || r < -157.5) {
        faultType = 'STRIKE_SLIP';
    } else if (r >= 67.5 && r <= 112.5) {
        faultType = 'REVERSE';
    } else if (r <= -67.5 && r >= -112.5) {
        faultType = 'NORMAL';
    } else if (r > 22.5 && r < 67.5) {
        faultType = 'OBLIQUE_REVERSE';
    } else if (r > 112.5 && r < 157.5) {
        faultType = 'OBLIQUE_REVERSE';
    } else if (r < -22.5 && r > -67.5) {
        faultType = 'OBLIQUE_NORMAL';
    } else if (r < -112.5 && r > -157.5) {
        faultType = 'OBLIQUE_NORMAL';
    }

    let shadedPaths = [];
    let nodalPlanes = [];
    const R = 50; 
    const C = 60; 

    switch (faultType) {
        case 'STRIKE_SLIP':
        case 'OBLIQUE_REVERSE':
        case 'OBLIQUE_NORMAL':
            shadedPaths = [
                `M${C},${C-R} A${R},${R} 0 0 1 ${C+R},${C} L${C},${C} Z`,
                `M${C},${C+R} A${R},${R} 0 0 1 ${C-R},${C} L${C},${C} Z`
            ];
            nodalPlanes = [
                { type: 'line', x1: C, y1: C - R, x2: C, y2: C + R },
                { type: 'line', x1: C - R, y1: C, x2: C + R, y2: C }
            ];
            faultType = 'STRIKE_SLIP_LIKE';
            break;
        case 'NORMAL':
            shadedPaths = [
                `M${C},${C-R} C ${C-R*1.5},${C-R*0.5}, ${C-R*1.5},${C+R*0.5}, ${C},${C+R} C ${C-R*0.5},${C+R*0.5}, ${C-R*0.5},${C-R*0.5}, ${C},${C-R} Z`,
                `M${C},${C-R} C ${C+R*1.5},${C-R*0.5}, ${C+R*1.5},${C+R*0.5}, ${C},${C+R} C ${C+R*0.5},${C+R*0.5}, ${C+R*0.5},${C-R*0.5}, ${C},${C-R} Z`
            ];
            nodalPlanes = [
                { type: 'path', d: `M${C-R*0.8},${C-R*0.6} Q${C},${C} ${C-R*0.8},${C+R*0.6}` },
                { type: 'path', d: `M${C+R*0.8},${C-R*0.6} Q${C},${C} ${C+R*0.8},${C+R*0.6}` }
            ];
            break;
        case 'REVERSE':
            shadedPaths = [
                `M${C-R},${C} C ${C-R*0.5},${C-R*1.5}, ${C+R*0.5},${C-R*1.5}, ${C+R},${C} C ${C+R*0.5},${C-R*0.5}, ${C-R*0.5},${C-R*0.5}, ${C-R},${C} Z`,
                `M${C-R},${C} C ${C-R*0.5},${C+R*1.5}, ${C+R*0.5},${C+R*1.5}, ${C+R},${C} C ${C+R*0.5},${C+R*0.5}, ${C-R*0.5},${C+R*0.5}, ${C-R},${C} Z`
            ];
            nodalPlanes = [
                { type: 'path', d: `M${C-R*0.6},${C-R*0.8} Q${C},${C} ${C+R*0.6},${C-R*0.8}` },
                { type: 'path', d: `M${C-R*0.6},${C+R*0.8} Q${C},${C} ${C+R*0.6},${C+R*0.8}` }
            ];
            break;
        default:
            faultType = 'STRIKE_SLIP_LIKE';
            shadedPaths = [
                `M${C-R},${C} A${R},${R} 0 0 1 ${C},${C-R} L${C},${C} Z`,
                `M${C+R},${C} A${R},${R} 0 0 1 ${C},${C+R} L${C},${C} Z`
            ];
            nodalPlanes = [
                { type: 'line', x1: C, y1: C - R, x2: C, y2: C + R },
                { type: 'line', x1: C - R, y1: C, x2: C + R, y2: C }
            ];
            break;
    }
    return { shadedPaths, faultType, nodalPlanes };
};

/**
 * Placeholder for P-wave travel time calculation.
 * Assumes an average P-wave velocity (e.g., 6.0-8.0 km/s in crust/upper mantle).
 * This is a highly simplified model.
 * @param {number} distanceKm - Distance from epicenter in kilometers.
 * @returns {number} Approximate P-wave travel time in seconds.
 */
export const calculatePWaveTravelTime = (distanceKm) => {
  if (!isValidNumber(distanceKm) || distanceKm < 0) return 0;
  const averagePWaveVelocityKmS = 6.5; // Simplified average velocity
  return distanceKm / averagePWaveVelocityKmS;
};

/**
 * Placeholder for S-wave travel time calculation.
 * Assumes an average S-wave velocity (e.g., 3.5-4.5 km/s in crust/upper mantle).
 * S-waves are roughly 1.7 times slower than P-waves.
 * This is a highly simplified model.
 * @param {number} distanceKm - Distance from epicenter in kilometers.
 * @returns {number} Approximate S-wave travel time in seconds.
 */
export const calculateSWaveTravelTime = (distanceKm) => {
  if (!isValidNumber(distanceKm) || distanceKm < 0) return 0;
  const averageSWaveVelocityKmS = 3.75; // Simplified average velocity
  return distanceKm / averageSWaveVelocityKmS;
};
