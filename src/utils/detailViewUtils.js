/**
 * @file detailViewUtils.js
 * @description Utility functions specifically for use within the earthquake detail view components,
 * such as generating SVG paths for beachball diagrams.
 */

import { isValidNumber } from './utils.js';

/**
 * Determines the fault type and generates SVG path data for a simplified focal mechanism (beachball) diagram
 * based on the provided rake angle. The diagram is centered around internal constants `C` (center offset)
 * with a radius `R`.
 *
 * The fault type classification is based on standard rake angle ranges:
 * - Strike-Slip: -22.5° to 22.5°, or > 157.5°, or < -157.5°
 * - Reverse: 67.5° to 112.5°
 * - Normal: -112.5° to -67.5°
 * - Oblique-Reverse: (22.5° to 67.5°) or (112.5° to 157.5°)
 * - Oblique-Normal: (-67.5° to -22.5°) or (-157.5° to -112.5°)
 * A general 'STRIKE_SLIP_LIKE' category is used for some oblique types or as a fallback.
 *
 * @param {number} rake - The rake angle in degrees.
 * @returns {{shadedPaths: string[], faultType: string, nodalPlanes: Array<{type: string, x1:(number|undefined), y1:(number|undefined), x2:(number|undefined), y2:(number|undefined), d:(string|undefined)}>}}
 *   An object containing:
 *   - `shadedPaths` (Array<string>): An array of SVG path data strings for the shaded quadrants of the beachball.
 *   - `faultType` (string): Classified fault type (e.g., 'STRIKE_SLIP', 'NORMAL', 'REVERSE', 'OBLIQUE_REVERSE', 'OBLIQUE_NORMAL', 'STRIKE_SLIP_LIKE', 'UNKNOWN').
 *   - `nodalPlanes` (Array<Object>): Array of objects describing the nodal planes. Each object has a `type` ('line' or 'path')
 *     and corresponding SVG attributes (e.g., `x1, y1, x2, y2` for 'line', or `d` for 'path').
 *     Returns empty `shadedPaths` and `nodalPlanes` with faultType 'UNKNOWN' if the rake is not a valid number.
 */
export const getBeachballPathsAndType = (rake) => {
    let faultType = 'UNKNOWN';
    const r = parseFloat(rake);

    if (!isValidNumber(r)) return { shadedPaths: [], faultType, nodalPlanes: [] };

    // Classify fault type based on rake angle
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
