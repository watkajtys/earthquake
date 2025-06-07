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
 * Creates HTML content for a fault line tooltip.
 *
 * @param {object} properties The properties of the fault line feature.
 * @returns {string} HTML string for the tooltip.
 */
export function createFaultTooltipContent(properties) {
  let content = '';

  // Helper function to format tuples (main value and range)
  const formatTuple = (value, unit = '') => {
    if (Array.isArray(value) && value.length > 0) {
      let mainValue = value[0];
      if (mainValue === null || mainValue === undefined) {
        mainValue = 'N/A';
      }
      let range = '';
      if (value.length > 1 && value[1] !== null && value[2] !== null && value[1] !== undefined && value[2] !== undefined) {
        range = ` (${value[1]}-${value[2]})`;
      }
      return `${mainValue}${unit}${range}`;
    }
    return value !== null && value !== undefined ? `${value}${unit}` : 'N/A';
  };

  // Helper function to add a property to the content if it exists
  const addProperty = (label, value, unit = '') => {
    if (value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.every(item => item === null || item === undefined))) {
      content += `<div><strong>${label}:</strong> `;
      if (label === 'Dip' || label === 'Average rake') { // These can be comma-separated strings or arrays
        if (typeof value === 'string' && value.includes(',')) {
            content += value.split(',').map(v => `${v.trim()}${unit}`).join(', ');
        } else if (Array.isArray(value)) {
            content += formatTuple(value, unit);
        } else {
            content += `${value}${unit}`;
        }
      } else if (Array.isArray(value)) {
        content += formatTuple(value, unit);
      } else {
        content += `${value}${unit}`;
      }
      content += `</div>`;
    }
  };

  addProperty('Dip', properties.dip, '°');
  addProperty('Dip direction', properties.dip_dir);
  addProperty('Downthrown side', properties.downthrown_side);
  addProperty('Average rake', properties.average_rake, '°');
  addProperty('Slip type', properties.slip_type);
  addProperty('Strike slip rate', properties.strike_slip_rate, ' mm/yr');
  addProperty('Dip slip rate', properties.dip_slip_rate, ' mm/yr');
  addProperty('Vertical slip rate', properties.vertical_slip_rate, ' mm/yr');
  addProperty('Shortening rate', properties.shortening_rate, ' mm/yr');
  addProperty('Accuracy', properties.accuracy); // Assuming format like "1:40000" is a string
  addProperty('Activity confidence', properties.activity_confidence); // Raw value for now
  addProperty('Exposure quality', properties.exposure_quality); // Raw value for now

  return content || '<div>No data available</div>';
}
