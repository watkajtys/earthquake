/**
 * Utility functions for geospatial operations, including bounding box calculations
 * and spatial filtering of GeoJSON features with performance optimizations.
 */

// Memoization cache for expensive calculations
const memoCache = new Map();
const CACHE_MAX_SIZE = 100;

/**
 * Simple memoization function for caching expensive spatial calculations
 */
function memoize(fn, keyFn) {
  return function(...args) {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    
    if (memoCache.has(key)) {
      return memoCache.get(key);
    }
    
    const result = fn.apply(this, args);
    
    // Simple LRU: if cache is full, remove oldest entry
    if (memoCache.size >= CACHE_MAX_SIZE) {
      const firstKey = memoCache.keys().next().value;
      memoCache.delete(firstKey);
    }
    
    memoCache.set(key, result);
    return result;
  };
}

/**
 * Calculates a bounding box around a center point with a specified buffer distance.
 * 
 * @param {number} centerLat - Center latitude
 * @param {number} centerLng - Center longitude
 * @param {number} bufferKm - Buffer distance in kilometers
 * @returns {Object} Bounding box with north, south, east, west coordinates
 */
export function calculateBoundingBox(centerLat, centerLng, bufferKm) {
  // Approximate degrees per kilometer (varies by latitude)
  const latDegreesPerKm = 1 / 110.574; // Roughly constant
  const lngDegreesPerKm = 1 / (110.574 * Math.cos(centerLat * Math.PI / 180)); // Varies by latitude
  
  const latBuffer = bufferKm * latDegreesPerKm;
  const lngBuffer = bufferKm * lngDegreesPerKm;
  
  return {
    north: centerLat + latBuffer,
    south: centerLat - latBuffer,
    east: centerLng + lngBuffer,
    west: centerLng - lngBuffer
  };
}

/**
 * Checks if a LineString geometry intersects with a bounding box.
 * Uses a simple approach checking if any coordinate is within the bounding box.
 * 
 * @param {Array} coordinates - LineString coordinates array
 * @param {Object} bbox - Bounding box with north, south, east, west properties
 * @returns {boolean} True if LineString intersects with bounding box
 */
export function doesLineStringIntersectBoundingBox(coordinates, bbox) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return false;
  }
  
  // Check if any point of the LineString is within the bounding box
  return coordinates.some(coord => {
    if (!Array.isArray(coord) || coord.length < 2) {
      return false;
    }
    const [lng, lat] = coord; // GeoJSON format: [longitude, latitude]
    return isPointInBoundingBox(lat, lng, bbox);
  });
}

/**
 * Simple spatial index using a grid system for faster lookups
 */
class SpatialGrid {
  constructor(bounds, cellSize = 1.0) {
    this.bounds = bounds;
    this.cellSize = cellSize;
    this.grid = new Map();
  }
  
  _getCellKey(lat, lng) {
    const row = Math.floor((lat - this.bounds.south) / this.cellSize);
    const col = Math.floor((lng - this.bounds.west) / this.cellSize);
    return `${row},${col}`;
  }
  
  insert(feature, id) {
    if (!feature.geometry || !feature.geometry.coordinates) return;
    
    const cells = new Set();
    
    if (feature.geometry.type === 'LineString') {
      feature.geometry.coordinates.forEach(([lng, lat]) => {
        if (lng >= this.bounds.west && lng <= this.bounds.east &&
            lat >= this.bounds.south && lat <= this.bounds.north) {
          cells.add(this._getCellKey(lat, lng));
        }
      });
    } else if (feature.geometry.type === 'Point') {
      // Add support for Point geometries (earthquakes)
      const [lng, lat] = feature.geometry.coordinates;
      if (lng >= this.bounds.west && lng <= this.bounds.east &&
          lat >= this.bounds.south && lat <= this.bounds.north) {
        cells.add(this._getCellKey(lat, lng));
      }
    } else if (feature.geometry.type === 'MultiLineString') {
      // Add support for MultiLineString geometries
      feature.geometry.coordinates.forEach(lineString => {
        lineString.forEach(([lng, lat]) => {
          if (lng >= this.bounds.west && lng <= this.bounds.east &&
              lat >= this.bounds.south && lat <= this.bounds.north) {
            cells.add(this._getCellKey(lat, lng));
          }
        });
      });
    }
    
    cells.forEach(cellKey => {
      if (!this.grid.has(cellKey)) {
        this.grid.set(cellKey, new Set());
      }
      this.grid.get(cellKey).add({ feature, id });
    });
  }
  
  query(bbox) {
    const results = new Set();
    
    const startRow = Math.floor((bbox.south - this.bounds.south) / this.cellSize);
    const endRow = Math.floor((bbox.north - this.bounds.south) / this.cellSize);
    const startCol = Math.floor((bbox.west - this.bounds.west) / this.cellSize);
    const endCol = Math.floor((bbox.east - this.bounds.west) / this.cellSize);
    
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const cellKey = `${row},${col}`;
        const cellFeatures = this.grid.get(cellKey);
        if (cellFeatures) {
          cellFeatures.forEach(item => results.add(item));
        }
      }
    }
    
    return Array.from(results);
  }
}

// Global spatial index cache
let globalSpatialIndex = null;

/**
 * Simplifies LineString coordinates by removing points that don't significantly 
 * change the line's shape (Douglas-Peucker algorithm simplified)
 */
function simplifyLineString(coordinates, tolerance = 0.001) {
  if (coordinates.length <= 2) return coordinates;
  
  // Simple point reduction: keep every nth point based on tolerance
  const step = Math.max(1, Math.floor(tolerance * 1000));
  const simplified = [];
  
  // Always keep first point
  simplified.push(coordinates[0]);
  
  // Keep points at intervals
  for (let i = step; i < coordinates.length - 1; i += step) {
    simplified.push(coordinates[i]);
  }
  
  // Always keep last point
  if (simplified[simplified.length - 1] !== coordinates[coordinates.length - 1]) {
    simplified.push(coordinates[coordinates.length - 1]);
  }
  
  return simplified;
}

/**
 * Optimized filtering function with multiple performance enhancements
 */
export const filterGeoJSONByBoundingBox = memoize((geoJson, bbox) => {
  if (!geoJson || !geoJson.features || !Array.isArray(geoJson.features)) {
    return geoJson;
  }
  
  if (!bbox) {
    return geoJson;
  }
  
  // Use spatial index if available, otherwise fall back to linear search
  if (globalSpatialIndex) {
    console.time('Spatial index query');
    const candidates = globalSpatialIndex.query(bbox);
    console.timeEnd('Spatial index query');
    
    const filteredFeatures = candidates.map(item => ({
      ...item.feature,
      // Simplify geometry for better rendering performance
      geometry: item.feature.geometry.type === 'LineString' ? {
        ...item.feature.geometry,
        coordinates: simplifyLineString(item.feature.geometry.coordinates, 0.002)
      } : item.feature.geometry
    }));
    
    return {
      ...geoJson,
      features: filteredFeatures
    };
  }
  
  // Fallback to linear search with optimizations
  console.time('Linear search filtering');
  const filteredFeatures = [];
  
  // Pre-calculate bbox bounds for faster comparison
  const { north, south, east, west } = bbox;
  
  for (let i = 0; i < geoJson.features.length; i++) {
    const feature = geoJson.features[i];
    
    if (!feature.geometry || !feature.geometry.coordinates) {
      continue;
    }
    
    let intersects = false;
    
    // Optimized intersection check
    if (feature.geometry.type === 'LineString') {
      const coords = feature.geometry.coordinates;
      
      // Early termination: check bounding box of the line first
      let minLat = Infinity, maxLat = -Infinity;
      let minLng = Infinity, maxLng = -Infinity;
      
      for (let j = 0; j < coords.length; j++) {
        const [lng, lat] = coords[j];
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
      }
      
      // Quick bbox intersection test
      if (maxLat >= south && minLat <= north && maxLng >= west && minLng <= east) {
        intersects = true;
      }
    } else if (feature.geometry.type === 'MultiLineString') {
      intersects = feature.geometry.coordinates.some(lineString => 
        doesLineStringIntersectBoundingBox(lineString, bbox)
      );
    } else if (feature.geometry.type === 'Point') {
      const [lng, lat] = feature.geometry.coordinates;
      intersects = isPointInBoundingBox(lat, lng, bbox);
    } else {
      intersects = true; // Conservative approach for unknown types
    }
    
    if (intersects) {
      // Simplify the feature for better rendering performance
      const simplifiedFeature = {
        ...feature,
        geometry: feature.geometry.type === 'LineString' ? {
          ...feature.geometry,
          coordinates: simplifyLineString(feature.geometry.coordinates, 0.002)
        } : feature.geometry
      };
      
      filteredFeatures.push(simplifiedFeature);
    }
  }
  
  console.timeEnd('Linear search filtering');
  
  return {
    ...geoJson,
    features: filteredFeatures
  };
}, (geoJson, bbox) => {
  // Custom key function for memoization
  const bboxKey = `${bbox.north}-${bbox.south}-${bbox.east}-${bbox.west}`;
  const dataKey = geoJson.features ? geoJson.features.length : 'empty';
  return `${dataKey}-${bboxKey}`;
});

/**
 * Initialize spatial index for faster repeated queries
 */
export function initializeSpatialIndex(geoJson) {
  if (!geoJson || !geoJson.features) {
    return;
  }
  
  console.time('Building spatial index');
  
  // Calculate global bounds for the grid
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  
  geoJson.features.forEach(feature => {
    if (!feature.geometry) return;

    const processCoordinates = (coords, isMulti) => {
      if (isMulti) {
        coords.forEach(line => line.forEach(([lng, lat]) => {
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
          minLng = Math.min(minLng, lng);
          maxLng = Math.max(maxLng, lng);
        }));
      } else {
        coords.forEach(([lng, lat]) => {
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
          minLng = Math.min(minLng, lng);
          maxLng = Math.max(maxLng, lng);
        });
      }
    };

    if (feature.geometry.type === 'LineString') {
      processCoordinates(feature.geometry.coordinates, false);
    } else if (feature.geometry.type === 'MultiLineString') {
      processCoordinates(feature.geometry.coordinates, true);
    } else if (feature.geometry.type === 'Point') {
      const [lng, lat] = feature.geometry.coordinates;
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    }
  });
  
  const bounds = {
    north: maxLat,
    south: minLat,
    east: maxLng,
    west: minLng
  };
  
  // Create spatial index with appropriate cell size (1 degree cells)
  globalSpatialIndex = new SpatialGrid(bounds, 1.0);
  
  // Index all features
  geoJson.features.forEach((feature, index) => {
    globalSpatialIndex.insert(feature, index);
  });
  
  console.timeEnd('Building spatial index');
  console.log(`Spatial index created with ${globalSpatialIndex.grid.size} cells`);
}

/**
 * Clear spatial index to free memory
 */
export function clearSpatialIndex() {
  globalSpatialIndex = null;
  memoCache.clear();
}