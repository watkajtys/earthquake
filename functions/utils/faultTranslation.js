/**
 * @file faultTranslation.js
 * @description Utility functions to translate scientific fault data into human-readable descriptions
 * for museum visitors. Prioritizes accessibility while preserving scientific accuracy.
 */

/**
 * Converts slip type to human-readable movement description
 * @param {string} slipType - Scientific slip type (e.g., "Dextral", "Reverse")
 * @returns {string} Human-readable description
 */
export function translateSlipType(slipType) {
  if (!slipType) return "Movement type unknown";
  
  const type = slipType.toLowerCase();
  
  switch (type) {
    case 'dextral':
      return "Slides sideways (right-lateral) like a zipper";
    case 'sinistral':
      return "Slides sideways (left-lateral) like a zipper";
    case 'reverse':
      return "Pushes up and together like a bulldozer";
    case 'thrust':
      return "Pushes up and together like a bulldozer";
    case 'normal':
      return "Drops down and apart like a trapdoor";
    case 'dextral-normal':
      return "Slides sideways and drops down";
    case 'sinistral-normal':
      return "Slides sideways and drops down";
    case 'dextral-reverse':
      return "Slides sideways and pushes up";
    case 'sinistral-reverse':
      return "Slides sideways and pushes up";
    default:
      return `${slipType} fault movement`;
  }
}

/**
 * Converts slip rate to human-readable speed description
 * @param {number} slipRateMmPerYear - Slip rate in mm/year
 * @returns {string} Human-readable description with comparison
 */
export function translateSlipRate(slipRateMmPerYear) {
  if (!slipRateMmPerYear || slipRateMmPerYear <= 0) {
    return "Very slow or inactive";
  }
  
  const rate = parseFloat(slipRateMmPerYear);
  
  if (rate < 0.1) {
    return "Extremely slow (much slower than hair growth)";
  } else if (rate < 1) {
    return "Very slow (slower than hair growth)";
  } else if (rate < 5) {
    return "Slow (about as fast as fingernails grow)";
  } else if (rate < 20) {
    return `Moderate (${rate.toFixed(1)}mm/year - about as fast as hair grows)`;
  } else if (rate < 50) {
    return `Active (${rate.toFixed(1)}mm/year - faster than hair growth)`;
  } else {
    return `Very active (${rate.toFixed(1)}mm/year - very fast for a fault!)`;
  }
}

/**
 * Determines activity level based on slip rate
 * @param {number} slipRateMmPerYear - Slip rate in mm/year
 * @returns {string} Activity level classification
 */
export function getActivityLevel(slipRateMmPerYear) {
  if (!slipRateMmPerYear || slipRateMmPerYear <= 0) {
    return "Inactive";
  }
  
  const rate = parseFloat(slipRateMmPerYear);
  
  if (rate < 0.1) {
    return "Very Slow";
  } else if (rate < 1) {
    return "Slow";
  } else if (rate < 10) {
    return "Moderate";
  } else if (rate < 50) {
    return "Active";
  } else {
    return "Very Active";
  }
}

/**
 * Converts depth range to human-readable description
 * @param {number} upperDepth - Upper seismogenic depth in km
 * @param {number} lowerDepth - Lower seismogenic depth in km
 * @returns {string} Human-readable depth description
 */
export function translateDepthRange(upperDepth, lowerDepth) {
  const upper = parseFloat(upperDepth) || 0;
  const lower = parseFloat(lowerDepth) || 0;
  
  if (upper === 0 && lower === 0) {
    return "Depth range unknown";
  }
  
  if (upper === 0 && lower > 0) {
    if (lower <= 5) {
      return "Very shallow fault (surface to 5km deep)";
    } else if (lower <= 15) {
      return `Shallow fault (surface to ${lower.toFixed(0)}km deep)`;
    } else {
      return `Deep fault (surface to ${lower.toFixed(0)}km deep)`;
    }
  }
  
  if (upper > 0 && lower > upper) {
    const depth = lower - upper;
    if (depth <= 5) {
      return `Shallow fault zone (${upper.toFixed(0)}-${lower.toFixed(0)}km deep)`;
    } else if (depth <= 15) {
      return `Moderate depth fault (${upper.toFixed(0)}-${lower.toFixed(0)}km deep)`;
    } else {
      return `Deep fault zone (${upper.toFixed(0)}-${lower.toFixed(0)}km deep)`;
    }
  }
  
  return `Fault active at ${upper.toFixed(0)}-${lower.toFixed(0)}km depth`;
}

/**
 * Generates hazard description based on fault characteristics
 * @param {number} slipRate - Slip rate in mm/year
 * @param {string} slipType - Type of fault movement
 * @param {number} lengthKm - Fault length in kilometers
 * @returns {string} Human-readable hazard description
 */
export function generateHazardDescription(slipRate, slipType, lengthKm) {
  if (!slipRate || slipRate <= 0) {
    return "Low earthquake hazard (inactive fault)";
  }
  
  const rate = parseFloat(slipRate);
  const length = parseFloat(lengthKm) || 0;
  
  let magnitudeRange = "";
  if (length > 100) {
    magnitudeRange = "large M7+ earthquakes";
  } else if (length > 50) {
    magnitudeRange = "moderate to large M6-7 earthquakes";
  } else if (length > 20) {
    magnitudeRange = "moderate M5-6 earthquakes";
  } else {
    magnitudeRange = "small to moderate earthquakes";
  }
  
  if (rate < 1) {
    return `Low to moderate hazard - can produce ${magnitudeRange}`;
  } else if (rate < 10) {
    return `Moderate hazard - can produce ${magnitudeRange}`;
  } else if (rate < 50) {
    return `High hazard - can produce ${magnitudeRange}`;
  } else {
    return `Very high hazard - can produce ${magnitudeRange}`;
  }
}

/**
 * Creates a user-friendly display name from technical fault name
 * @param {string} technicalName - Original fault name from catalog
 * @returns {string} User-friendly display name
 */
export function createDisplayName(technicalName) {
  if (!technicalName) return "Unknown Fault";
  
  // Remove technical suffixes and parenthetical information for display
  let displayName = technicalName
    .replace(/\s*\([^)]*\)/g, '') // Remove parenthetical info
    .replace(/\s*(alt\d+|rev\s*\d+)/gi, '') // Remove "alt1", "rev 2011", etc.
    .replace(/\s*(2011|2012|2013|2014|2015|2016|2017|2018|2019|2020|2021|2022|2023|2024)/g, '') // Remove years
    .trim();
  
  // Capitalize properly
  displayName = displayName.replace(/\b\w/g, l => l.toUpperCase());
  
  // Add "Fault" if not present
  if (!displayName.toLowerCase().includes('fault')) {
    displayName += ' Fault';
  }
  
  return displayName;
}

/**
 * Parses tupled values from GeoJSON properties (e.g., "(1.55,0.8,2.22)")
 * @param {string} tupledString - String containing tupled values
 * @returns {Object} Object with min, best, max values or null if invalid
 */
export function parseTupledValues(tupledString) {
  if (!tupledString || typeof tupledString !== 'string') {
    return null;
  }
  
  // Remove parentheses and split by commas
  const cleanString = tupledString.replace(/[()]/g, '');
  const parts = cleanString.split(',').map(s => s.trim());
  
  if (parts.length !== 3) {
    return null;
  }
  
  const parseValue = (str) => {
    if (str === '' || str === 'null' || str === 'undefined') {
      return null;
    }
    const num = parseFloat(str);
    return isNaN(num) ? null : num;
  };
  
  return {
    min: parseValue(parts[1]), // Second value is minimum
    best: parseValue(parts[0]), // First value is best estimate
    max: parseValue(parts[2])   // Third value is maximum
  };
}

/**
 * Calculates the length of a fault from its LineString coordinates
 * @param {Array} coordinates - Array of [lon, lat] coordinate pairs
 * @returns {number} Length in kilometers
 */
export function calculateFaultLength(coordinates) {
  if (!coordinates || coordinates.length < 2) {
    return 0;
  }
  
  let totalLength = 0;
  
  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = coordinates[i - 1];
    const [lon2, lat2] = coordinates[i];
    
    // Use Haversine formula for distance calculation
    const distance = haversineDistance(lat1, lon1, lat2, lon2);
    totalLength += distance;
  }
  
  return totalLength;
}

/**
 * Calculates the bounding box of a fault from its coordinates
 * @param {Array} coordinates - Array of [lon, lat] coordinate pairs
 * @returns {Object} Bounding box with min/max lat/lon
 */
export function calculateBoundingBox(coordinates) {
  if (!coordinates || coordinates.length === 0) {
    return { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 };
  }
  
  let minLat = coordinates[0][1];
  let maxLat = coordinates[0][1];
  let minLon = coordinates[0][0];
  let maxLon = coordinates[0][0];
  
  for (const [lon, lat] of coordinates) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }
  
  return { minLat, maxLat, minLon, maxLon };
}

/**
 * Haversine distance calculation between two points
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Generates a complete human-readable fault description
 * @param {Object} faultData - Fault data from GeoJSON
 * @returns {Object} Complete fault description object
 */
export function generateFaultDescription(faultData) {
  const { properties, geometry } = faultData;
  
  // Parse slip rate
  const slipRateData = parseTupledValues(properties.net_slip_rate);
  const slipRate = slipRateData?.best || 0;
  
  // Parse depth values
  const upperDepth = parseTupledValues(properties.upper_seis_depth)?.best || 0;
  const lowerDepth = parseTupledValues(properties.lower_seis_depth)?.best || 0;
  
  // Calculate spatial properties
  const coordinates = geometry.coordinates;
  const lengthKm = calculateFaultLength(coordinates);
  const bbox = calculateBoundingBox(coordinates);
  
  return {
    displayName: createDisplayName(properties.name),
    movementDescription: translateSlipType(properties.slip_type),
    activityLevel: getActivityLevel(slipRate),
    speedDescription: translateSlipRate(slipRate),
    depthDescription: translateDepthRange(upperDepth, lowerDepth),
    hazardDescription: generateHazardDescription(slipRate, properties.slip_type, lengthKm),
    lengthKm,
    bbox
  };
}