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

  const ACTIVITY_CONFIDENCE_MAP = {
    1: 'Certain',
    2: 'Probable',
    3: 'Possible',
    4: 'Questionable',
  };

  const EXPOSURE_QUALITY_MAP = {
    1: 'Excellent',
    2: 'Good',
    3: 'Fair',
    4: 'Poor',
  };

  const EXPLANATIONS = {
    'Dip': 'The angle at which the fault plane tilts down from horizontal.',
    'Dip direction': 'The compass direction towards which the fault plane slopes.',
    'Downthrown side': 'The side of the fault that has moved downward relative to the other side.',
    'Average rake': 'The direction of slip on the fault plane. 0° is horizontal, 90° is straight up the fault.',
    'Slip type': 'Describes how the fault blocks move relative to each other (e.g., side-by-side, up-down).',
    'Strike slip rate': 'How fast the fault is slipping horizontally each year.',
    'Dip slip rate': 'How fast the fault is slipping vertically (up or down the dip) each year.',
    'Vertical slip rate': 'The purely vertical component of fault movement per year.',
    'Shortening rate': 'How much the crust is being squeezed horizontally across the fault each year.',
    'Accuracy': "Indicates the precision of the fault's location on the map.",
    'Activity confidence': 'How sure scientists are that the fault is active.',
    'Exposure quality': 'How well the fault is visible or studied at the surface.',
  };

  const SLIP_TYPE_EXPLANATIONS = {
    'Sinistral strike_slip': 'Blocks move horizontally past each other, with the opposite side moving to the left.',
    'Dextral strike_slip': 'Blocks move horizontally past each other, with the opposite side moving to the right.',
    'Normal': 'The block above the fault moves down relative to the block below.',
    'Reverse': 'The block above the fault moves up relative to the block below.',
    // Add more specific types if known
  };

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
  const addProperty = (label, value, unit = '', explanationKey) => {
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.every(item => item === null || item === undefined))) {
      return; // Do not add if value is not meaningful
    }

    content += `<div><strong>${label}:</strong> `;
    let displayValue = '';

    if (label === 'Activity confidence') {
      displayValue = ACTIVITY_CONFIDENCE_MAP[value] ? `${value} (${ACTIVITY_CONFIDENCE_MAP[value]})` : `${value}`;
    } else if (label === 'Exposure quality') {
      displayValue = EXPOSURE_QUALITY_MAP[value] ? `${value} (${EXPOSURE_QUALITY_MAP[value]})` : `${value}`;
    } else if (label === 'Dip' || label === 'Average rake') {
      if (typeof value === 'string' && value.includes(',')) {
        displayValue = value.split(',').map(v => `${v.trim()}${unit}`).join(', ');
      } else if (Array.isArray(value)) {
        displayValue = formatTuple(value, unit);
      } else {
        displayValue = `${value}${unit}`;
      }
    } else if (Array.isArray(value)) {
      displayValue = formatTuple(value, unit);
    } else {
      displayValue = `${value}${unit}`;
    }
    content += displayValue;

    let explanationText = EXPLANATIONS[explanationKey || label];
    if (label === 'Slip type' && value && SLIP_TYPE_EXPLANATIONS[value]) {
      explanationText += ` <em>${SLIP_TYPE_EXPLANATIONS[value]}</em>`;
    }

    if (explanationText) {
      content += ` - <em>${explanationText.replace(/<em>(.*?)<\/em>/g, '$1')}</em>`; // Add explanation, remove nested em if any from slip type
    }
    content += `</div>`;
  };

  addProperty('Dip', properties.dip, '°', 'Dip');
  addProperty('Dip direction', properties.dip_dir, '', 'Dip direction');
  addProperty('Downthrown side', properties.downthrown_side, '', 'Downthrown side');
  addProperty('Average rake', properties.average_rake, '°', 'Average rake');
  addProperty('Slip type', properties.slip_type, '', 'Slip type');
  addProperty('Strike slip rate', properties.strike_slip_rate, ' mm/yr', 'Strike slip rate');
  addProperty('Dip slip rate', properties.dip_slip_rate, ' mm/yr', 'Dip slip rate');
  addProperty('Vertical slip rate', properties.vertical_slip_rate, ' mm/yr', 'Vertical slip rate');
  addProperty('Shortening rate', properties.shortening_rate, ' mm/yr', 'Shortening rate');
  addProperty('Accuracy', properties.accuracy, '', 'Accuracy');
  addProperty('Activity confidence', properties.activity_confidence, '', 'Activity confidence');
  addProperty('Exposure quality', properties.exposure_quality, '', 'Exposure quality');

  return content || '<div>No data available</div>';
}
