import { filterNearbyFaults, getFaultDisplayInfo } from './faultUtils.js';
import { calculateDistance } from '../../common/mathUtils.js';

// Regional earthquake frequency categories
const SEISMICITY_LEVELS = {
  VERY_HIGH: { threshold: 50, label: 'Very High', description: 'extremely active seismic zone' },
  HIGH: { threshold: 20, label: 'High', description: 'highly active seismic region' },
  MODERATE: { threshold: 8, label: 'Moderate', description: 'moderately active seismic area' },
  LOW: { threshold: 3, label: 'Low', description: 'relatively quiet seismic zone' },
  VERY_LOW: { threshold: 0, label: 'Very Low', description: 'seismically quiet region' }
};

// Fault proximity categories for earthquake causation
const FAULT_PROXIMITY = {
  VERY_CLOSE: { threshold: 5, description: 'directly on or very near' },
  CLOSE: { threshold: 15, description: 'close to' },
  NEARBY: { threshold: 50, description: 'in the vicinity of' },
  REGIONAL: { threshold: 200, description: 'in the same region as' }
};

// Earthquake mechanism inference based on fault types and regional patterns
const EARTHQUAKE_MECHANISMS = {
  'Dextral': {
    description: 'right-lateral strike-slip movement',
    process: 'horizontal sliding motion where the far side moves to the right',
    typical_magnitudes: '5.0-7.5',
    characteristics: 'often produces linear surface ruptures and lateral displacement'
  },
  'Sinistral': {
    description: 'left-lateral strike-slip movement',
    process: 'horizontal sliding motion where the far side moves to the left',
    typical_magnitudes: '5.0-7.5',
    characteristics: 'commonly associated with transform plate boundaries'
  },
  'Reverse': {
    description: 'thrust faulting with compressional stress',
    process: 'rocks are pushed together, causing one side to ride up over the other',
    typical_magnitudes: '4.0-8.0+',
    characteristics: 'can produce significant vertical displacement and uplift'
  },
  'Normal': {
    description: 'extensional faulting with tensional stress',
    process: 'rocks are pulled apart, causing one side to drop down relative to the other',
    typical_magnitudes: '4.0-7.0',
    characteristics: 'creates valleys and basins, common in rifting environments'
  },
  'Transform': {
    description: 'strike-slip motion along transform boundaries',
    process: 'horizontal shearing between tectonic plates',
    typical_magnitudes: '6.0-8.0+',
    characteristics: 'major plate boundary faults capable of very large earthquakes'
  }
};

/**
 * Analyzes regional seismicity based on nearby faults and earthquake patterns
 */
export const analyzeRegionalSeismicity = async (centerLat, centerLng, regionalQuakes = [], radiusKm = 200) => {
  try {
    // Get nearby faults
    const nearbyFaults = await filterNearbyFaults(centerLat, centerLng, radiusKm);
    
    // Analyze fault characteristics
    const faultAnalysis = analyzeFaultCharacteristics(nearbyFaults, centerLat, centerLng);
    
    // Analyze earthquake frequency and patterns
    const frequencyAnalysis = analyzeEarthquakeFrequency(regionalQuakes, radiusKm);
    
    // Infer likely earthquake mechanisms
    const mechanismAnalysis = inferEarthquakeMechanisms(faultAnalysis, regionalQuakes);
    
    // Generate tectonic context
    const tectonicContext = generateTectonicContext(centerLat, centerLng, faultAnalysis);
    
    return {
      faultAnalysis,
      frequencyAnalysis,
      mechanismAnalysis,
      tectonicContext,
      summary: generateSeismicitySummary(faultAnalysis, frequencyAnalysis, mechanismAnalysis, tectonicContext)
    };
    
  } catch (error) {
    console.error('Error analyzing regional seismicity:', error);
    return null;
  }
};

/**
 * Analyzes characteristics of nearby faults
 */
const analyzeFaultCharacteristics = (faults, centerLat, centerLng) => {
  if (!faults || faults.length === 0) {
    return {
      count: 0,
      dominantType: null,
      closestFault: null,
      faultTypes: {},
      averageDistance: null
    };
  }
  
  const faultTypes = {};
  let totalDistance = 0;
  let closestFault = null;
  let closestDistance = Infinity;
  
  faults.forEach(fault => {
    const faultInfo = getFaultDisplayInfo(fault);
    const distance = calculateMinDistanceToFault(centerLat, centerLng, fault.geometry.coordinates);
    
    // Count fault types
    faultTypes[faultInfo.slipType] = (faultTypes[faultInfo.slipType] || 0) + 1;
    
    // Track distances
    totalDistance += distance;
    if (distance < closestDistance) {
      closestDistance = distance;
      closestFault = { ...faultInfo, distance };
    }
  });
  
  // Find dominant fault type
  const dominantType = Object.entries(faultTypes)
    .sort(([,a], [,b]) => b - a)[0]?.[0] || null;
  
  return {
    count: faults.length,
    dominantType,
    closestFault,
    faultTypes,
    averageDistance: totalDistance / faults.length
  };
};

/**
 * Calculates minimum distance from point to fault line
 */
const calculateMinDistanceToFault = (lat, lng, faultCoordinates) => {
  let minDistance = Infinity;
  
  for (const coord of faultCoordinates) {
    if (Array.isArray(coord) && coord.length >= 2) {
      const distance = calculateDistance(lat, lng, coord[1], coord[0]);
      if (distance < minDistance) {
        minDistance = distance;
      }
    }
  }
  
  return minDistance;
};

/**
 * Analyzes earthquake frequency and patterns
 */
const analyzeEarthquakeFrequency = (earthquakes, radiusKm) => {
  if (!earthquakes || earthquakes.length === 0) {
    return {
      count: 0,
      level: SEISMICITY_LEVELS.VERY_LOW,
      magnitudeDistribution: {},
      recentActivity: false
    };
  }
  
  // Analyze magnitude distribution
  const magnitudeDistribution = {
    'minor': 0,    // M < 4.0
    'light': 0,    // M 4.0-4.9
    'moderate': 0, // M 5.0-5.9
    'strong': 0,   // M 6.0-6.9
    'major': 0     // M 7.0+
  };
  
  const now = Date.now();
  const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
  let recentCount = 0;
  
  earthquakes.forEach(quake => {
    const mag = quake.properties?.mag || 0;
    const time = quake.properties?.time || 0;
    
    if (time > oneWeekAgo) recentCount++;
    
    if (mag < 4.0) magnitudeDistribution.minor++;
    else if (mag < 5.0) magnitudeDistribution.light++;
    else if (mag < 6.0) magnitudeDistribution.moderate++;
    else if (mag < 7.0) magnitudeDistribution.strong++;
    else magnitudeDistribution.major++;
  });
  
  // Determine seismicity level
  let level = SEISMICITY_LEVELS.VERY_LOW;
  for (const [key, config] of Object.entries(SEISMICITY_LEVELS)) {
    if (earthquakes.length >= config.threshold) {
      level = config;
      break;
    }
  }
  
  return {
    count: earthquakes.length,
    level,
    magnitudeDistribution,
    recentActivity: recentCount > 0,
    recentCount
  };
};

/**
 * Infers likely earthquake mechanisms based on faults and patterns
 */
const inferEarthquakeMechanisms = (faultAnalysis, earthquakes) => {
  const mechanisms = [];
  
  if (faultAnalysis.dominantType && EARTHQUAKE_MECHANISMS[faultAnalysis.dominantType]) {
    const mechanism = EARTHQUAKE_MECHANISMS[faultAnalysis.dominantType];
    mechanisms.push({
      type: faultAnalysis.dominantType,
      ...mechanism,
      confidence: 'high',
      reason: `dominant fault type in the region`
    });
  }
  
  // Analyze fault types for additional mechanisms
  Object.entries(faultAnalysis.faultTypes).forEach(([type, count]) => {
    if (type !== faultAnalysis.dominantType && EARTHQUAKE_MECHANISMS[type] && count >= 2) {
      mechanisms.push({
        type,
        ...EARTHQUAKE_MECHANISMS[type],
        confidence: 'moderate',
        reason: `${count} ${type.toLowerCase()} faults present in the region`
      });
    }
  });
  
  return mechanisms;
};

/**
 * Generates tectonic context based on location and fault patterns
 */
const generateTectonicContext = (lat, lng, faultAnalysis) => {
  // California-specific contexts (can be expanded for other regions)
  const contexts = [];
  
  // San Andreas system
  if (lng >= -125 && lng <= -114 && lat >= 32 && lat <= 42) {
    contexts.push({
      system: 'San Andreas Fault System',
      description: 'Part of the complex San Andreas transform fault system',
      significance: 'Major plate boundary between Pacific and North American plates'
    });
  }
  
  // Basin and Range
  if (lng >= -120 && lng <= -114 && lat >= 35 && lat <= 42) {
    if (faultAnalysis.dominantType === 'Normal') {
      contexts.push({
        system: 'Basin and Range Province',
        description: 'Extensional tectonic province with normal faulting',
        significance: 'Active crustal extension creating mountains and valleys'
      });
    }
  }
  
  // Add general context if no specific region identified
  if (contexts.length === 0) {
    contexts.push({
      system: 'Regional Fault Network',
      description: 'Local fault system contributing to regional seismic activity',
      significance: 'Part of broader tectonic stress patterns'
    });
  }
  
  return contexts;
};

/**
 * Generates a comprehensive seismicity summary
 */
const generateSeismicitySummary = (faultAnalysis, frequencyAnalysis, mechanismAnalysis, tectonicContext) => {
  let summary = '';
  
  // Regional activity level
  summary += `This is a ${frequencyAnalysis.level.description} with ${frequencyAnalysis.count} recorded earthquakes in the region. `;
  
  // Fault context
  if (faultAnalysis.count > 0) {
    const proximityCategory = getProximityCategory(faultAnalysis.closestFault?.distance || Infinity);
    summary += `The area is ${proximityCategory.description} ${faultAnalysis.count} active fault${faultAnalysis.count > 1 ? 's' : ''}`;
    
    if (faultAnalysis.closestFault) {
      summary += `, including the ${faultAnalysis.closestFault.name} (${faultAnalysis.closestFault.distance.toFixed(1)}km away)`;
    }
    summary += '. ';
    
    // Dominant fault mechanism
    if (faultAnalysis.dominantType && mechanismAnalysis.length > 0) {
      const primaryMechanism = mechanismAnalysis[0];
      summary += `Earthquakes here are likely caused by ${primaryMechanism.description}, `;
      summary += `which involves ${primaryMechanism.process}. `;
    }
  } else {
    summary += 'No major active faults are identified in the immediate vicinity, suggesting earthquakes may be related to regional stress patterns or deeper crustal processes. ';
  }
  
  // Recent activity
  if (frequencyAnalysis.recentActivity) {
    summary += `There has been recent seismic activity with ${frequencyAnalysis.recentCount} earthquake${frequencyAnalysis.recentCount > 1 ? 's' : ''} in the past week. `;
  }
  
  // Tectonic context
  if (tectonicContext.length > 0) {
    const context = tectonicContext[0];
    summary += `This region is part of the ${context.system}, ${context.description}.`;
  }
  
  return summary;
};

/**
 * Determines proximity category based on distance
 */
const getProximityCategory = (distance) => {
  for (const [key, config] of Object.entries(FAULT_PROXIMITY)) {
    if (distance <= config.threshold) {
      return config;
    }
  }
  return FAULT_PROXIMITY.REGIONAL;
};

/**
 * Generates a formatted description for display in UI
 */
export const formatSeismicityDescription = (analysis) => {
  if (!analysis) {
    return {
      title: 'Regional Seismicity',
      summary: 'Seismic analysis unavailable for this location.',
      details: []
    };
  }
  
  const details = [];
  
  // Fault information
  if (analysis.faultAnalysis.count > 0) {
    details.push({
      category: 'Local Faults',
      content: `${analysis.faultAnalysis.count} active fault${analysis.faultAnalysis.count > 1 ? 's' : ''} within 200km`,
      subcontent: analysis.faultAnalysis.closestFault ? 
        `Closest: ${analysis.faultAnalysis.closestFault.name} (${analysis.faultAnalysis.closestFault.distance.toFixed(1)}km)` : null
    });
  }
  
  // Earthquake frequency
  details.push({
    category: 'Seismic Activity',
    content: `${analysis.frequencyAnalysis.level.label} activity level`,
    subcontent: `${analysis.frequencyAnalysis.count} earthquakes recorded in regional database`
  });
  
  // Likely mechanisms
  if (analysis.mechanismAnalysis.length > 0) {
    const mechanism = analysis.mechanismAnalysis[0];
    details.push({
      category: 'Earthquake Type',
      content: `Likely ${mechanism.type.toLowerCase()} faulting`,
      subcontent: mechanism.description
    });
  }
  
  return {
    title: 'Regional Seismicity Context',
    summary: analysis.summary,
    details
  };
};