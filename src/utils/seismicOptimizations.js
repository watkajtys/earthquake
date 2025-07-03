// Proposed optimizations for seismic analysis system

/**
 * Pre-computed geological data cache for faster analysis
 */
class GeologicalDataCache {
  constructor() {
    this.faultCentroids = new Map(); // Pre-computed fault center points
    this.analysisResults = new Map(); // Cached analysis by location grid
    this.stressFields = new Map();   // Cached stress calculations
  }

  // Pre-compute fault centroids for faster distance calculations
  precomputeFaultCentroids(faults) {
    faults.forEach(fault => {
      if (!this.faultCentroids.has(fault.properties.catalog_id)) {
        const centroid = this.calculateFaultCentroid(fault.geometry.coordinates);
        this.faultCentroids.set(fault.properties.catalog_id, {
          ...centroid,
          length: this.calculateFaultLength(fault.geometry.coordinates),
          info: fault.properties
        });
      }
    });
  }

  calculateFaultCentroid(coordinates) {
    let sumLat = 0, sumLng = 0;
    coordinates.forEach(([lng, lat]) => {
      sumLat += lat;
      sumLng += lng;
    });
    return {
      lat: sumLat / coordinates.length,
      lng: sumLng / coordinates.length
    };
  }

  calculateFaultLength(coordinates) {
    // Approximate fault length by summing segment distances
    let totalLength = 0;
    for (let i = 1; i < coordinates.length; i++) {
      const [lng1, lat1] = coordinates[i-1];
      const [lng2, lat2] = coordinates[i];
      totalLength += this.haversineDistance(lat1, lng1, lat2, lng2);
    }
    return totalLength;
  }

  haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
}

/**
 * Enhanced magnitude prediction using Wells & Coppersmith (1994) scaling
 */
export const predictMagnitudeFromFault = (faultLength, faultType) => {
  // Wells & Coppersmith scaling relationships
  const scalingRelations = {
    'Dextral': { a: 5.16, b: 1.12 },     // Strike-slip
    'Sinistral': { a: 5.16, b: 1.12 },   // Strike-slip  
    'Reverse': { a: 5.00, b: 1.22 },     // Reverse/thrust
    'Normal': { a: 4.86, b: 1.32 },      // Normal
    'Transform': { a: 5.16, b: 1.12 }    // Strike-slip
  };

  const relation = scalingRelations[faultType] || scalingRelations['Dextral'];
  const logLength = Math.log10(faultLength); // Length in km
  const magnitude = relation.a + relation.b * logLength;
  
  return {
    magnitude: Math.round(magnitude * 10) / 10,
    uncertainty: 0.3, // Typical uncertainty
    method: 'Wells & Coppersmith (1994)'
  };
};

/**
 * Temporal earthquake pattern analysis
 */
export const analyzeTemporalPatterns = (earthquakes) => {
  if (!earthquakes || earthquakes.length < 3) {
    return { pattern: 'insufficient_data' };
  }

  const sortedQuakes = earthquakes
    .filter(q => q.properties?.time)
    .sort((a, b) => a.properties.time - b.properties.time);

  // Detect earthquake swarms (multiple events in short time)
  const swarmThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days
  const swarms = [];
  let currentSwarm = [sortedQuakes[0]];

  for (let i = 1; i < sortedQuakes.length; i++) {
    const timeDiff = sortedQuakes[i].properties.time - sortedQuakes[i-1].properties.time;
    if (timeDiff <= swarmThreshold) {
      currentSwarm.push(sortedQuakes[i]);
    } else {
      if (currentSwarm.length >= 3) {
        swarms.push(currentSwarm);
      }
      currentSwarm = [sortedQuakes[i]];
    }
  }

  if (currentSwarm.length >= 3) {
    swarms.push(currentSwarm);
  }

  // Analyze magnitude progression for foreshock/mainshock/aftershock
  const magnitudes = sortedQuakes.map(q => q.properties.mag).filter(m => typeof m === 'number');
  const maxMag = Math.max(...magnitudes);
  const maxMagIndex = magnitudes.indexOf(maxMag);
  const maxMagTime = sortedQuakes[maxMagIndex]?.properties.time;

  const beforeMainshock = sortedQuakes.filter(q => q.properties.time < maxMagTime);
  const afterMainshock = sortedQuakes.filter(q => q.properties.time > maxMagTime);

  return {
    pattern: swarms.length > 0 ? 'swarm' : 'mainshock_sequence',
    swarms: swarms.map(swarm => ({
      count: swarm.length,
      duration: swarm[swarm.length-1].properties.time - swarm[0].properties.time,
      maxMagnitude: Math.max(...swarm.map(q => q.properties.mag))
    })),
    mainshock: {
      magnitude: maxMag,
      time: maxMagTime,
      foreshocks: beforeMainshock.length,
      aftershocks: afterMainshock.length
    }
  };
};

/**
 * Regional stress field approximation
 */
export const analyzeRegionalStressField = (faults, earthquakes) => {
  // Simplified stress analysis based on fault orientations
  const stressIndicators = {
    compressive: 0,
    extensional: 0,
    shear: 0
  };

  faults.forEach(fault => {
    const slipType = fault.properties?.slip_type;
    if (slipType === 'Reverse' || slipType === 'Thrust') {
      stressIndicators.compressive++;
    } else if (slipType === 'Normal') {
      stressIndicators.extensional++;
    } else if (slipType === 'Dextral' || slipType === 'Sinistral' || slipType === 'Transform') {
      stressIndicators.shear++;
    }
  });

  const total = stressIndicators.compressive + stressIndicators.extensional + stressIndicators.shear;
  if (total === 0) return { regime: 'unknown' };

  const percentages = {
    compressive: (stressIndicators.compressive / total) * 100,
    extensional: (stressIndicators.extensional / total) * 100,
    shear: (stressIndicators.shear / total) * 100
  };

  const dominantRegime = Object.entries(percentages)
    .sort(([,a], [,b]) => b - a)[0][0];

  return {
    regime: dominantRegime,
    percentages,
    interpretation: getStressInterpretation(dominantRegime, percentages[dominantRegime])
  };
};

const getStressInterpretation = (regime, percentage) => {
  const strength = percentage > 60 ? 'strong' : percentage > 40 ? 'moderate' : 'weak';
  
  const interpretations = {
    compressive: `${strength} compressional stress regime - rocks being squeezed together`,
    extensional: `${strength} extensional stress regime - rocks being pulled apart`,
    shear: `${strength} shear stress regime - horizontal sliding motion`
  };

  return interpretations[regime] || 'mixed stress conditions';
};

export const geologicalCache = new GeologicalDataCache();