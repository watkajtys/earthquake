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
export function isValidCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function normalizeLongitude(value) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

export function calculateBoundingBox(centerLat, centerLng, bufferKm) {
  if (!isValidCoordinate(centerLat, centerLng) || !Number.isFinite(bufferKm) || bufferKm < 0) {
    throw new RangeError('Expected valid coordinates and a finite nonnegative radius.');
  }
  // Spherical cap using the same 6371 km radius as exact clustering distance.
  const angular = Math.min(Math.PI, bufferKm / 6371);
  const latitude = centerLat * Math.PI / 180;
  const south = Math.max(-90, centerLat - angular * 180 / Math.PI);
  const north = Math.min(90, centerLat + angular * 180 / Math.PI);
  if (south <= -90 || north >= 90) return { south, north, west: -180, east: 180 };
  const longitudeDelta = Math.asin(Math.min(1, Math.sin(angular) / Math.cos(latitude))) * 180 / Math.PI;
  return { south, north, west: normalizeLongitude(centerLng - longitudeDelta), east: normalizeLongitude(centerLng + longitudeDelta) };
}

// Wrapped boxes use west > east. Older callers may also supply unwrapped bounds.
export function longitudeIntervals(bbox) {
  if (!bbox || ![bbox.south, bbox.north, bbox.west, bbox.east].every(Number.isFinite) || bbox.south > bbox.north) {
    throw new RangeError('Expected a finite, ordered latitude bounding box.');
  }
  if (Math.abs(bbox.east - bbox.west) >= 360) return [[-180, 180]];
  const west = normalizeLongitude(bbox.west);
  const east = normalizeLongitude(bbox.east);
  if (west === -180 && east !== -180) return [[west, east], [180, 180]];
  if (west === -180 && east === -180) return [[-180, -180], [180, 180]];
  return west <= east ? [[west, east]] : [[west, 180], [-180, east]];
}

export function createSpatialWorkBudget(limit = 1_000_000) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000_000) throw new RangeError('Invalid spatial work budget.');
  return {
    remaining: limit,
    consume(count = 1) {
      this.remaining -= count;
      if (this.remaining < 0) {
        const error = new Error('Spatial calculation exceeded its bounded work budget.');
        error.code = 'SPATIAL_BUDGET_EXCEEDED';
        throw error;
      }
    },
  };
}

export function gridCellRanges(bounds, cellSize, bbox) {
  if (!bounds || ![bounds.south, bounds.north, bounds.west, bounds.east, cellSize].every(Number.isFinite) ||
      cellSize <= 0 || bounds.south > bounds.north || bounds.west > bounds.east) {
    throw new RangeError('Expected finite grid bounds and a positive cell size.');
  }
  const intervals = longitudeIntervals(bbox);
  const south = Math.max(bounds.south, bbox.south, -90);
  const north = Math.min(bounds.north, bbox.north, 90);
  if (south > north) return [];
  const startRow = Math.max(0, Math.floor((south - bounds.south) / cellSize));
  const endRow = Math.min(Math.floor((bounds.north - bounds.south) / cellSize), Math.floor((north - bounds.south) / cellSize));
  const ranges = intervals.flatMap(([west, east]) => {
    const left = Math.max(bounds.west, west);
    const right = Math.min(bounds.east, east);
    if (left > right) return [];
    const startCol = Math.max(0, Math.floor((left - bounds.west) / cellSize));
    const endCol = Math.min(Math.floor((bounds.east - bounds.west) / cellSize), Math.floor((right - bounds.west) / cellSize));
    if (![startRow, endRow, startCol, endCol].every(Number.isSafeInteger)) throw new RangeError('Grid resolution is too small.');
    return [{ startRow, endRow, startCol, endCol }];
  }).sort((left, right) => left.startCol - right.startCol);
  // Coarse cells may overlap the two longitude intervals. Visit each cell once.
  if (ranges.length === 2 && ranges[0].endCol >= ranges[1].startCol) {
    ranges[0].endCol = Math.max(ranges[0].endCol, ranges[1].endCol);
    ranges.pop();
  }
  return ranges;
}

/**
 * Calculates a bounding box that encompasses all provided earthquake points with a buffer.
 * 
 * @param {Array} earthquakePoints - Array of [lat, lng] coordinate pairs
 * @param {number} bufferKm - Buffer distance in kilometers around the bounding box
 * @returns {Object|null} Bounding box or null if no valid points
 */
export function calculateBoundingBoxFromPoints(earthquakePoints, bufferKm = 50) {
  if (!earthquakePoints || earthquakePoints.length === 0) {
    return null;
  }
  
  // Filter out invalid points
  const validPoints = earthquakePoints.filter(point => 
    Array.isArray(point) && 
    point.length >= 2 && 
    isValidCoordinate(point[0], point[1])
  );
  
  if (validPoints.length === 0) {
    return null;
  }
  
  // Union the spherical buffers conservatively; a wrapped component needs all
  // longitudes in this single-box representation of several point circles.
  const combined = { north: -90, south: 90, east: -180, west: 180 };
  let fullLongitude = false;
  for (const [lat, lng] of validPoints) {
    const box = calculateBoundingBox(lat, lng, bufferKm);
    combined.north = Math.max(combined.north, box.north);
    combined.south = Math.min(combined.south, box.south);
    combined.east = Math.max(combined.east, box.east);
    combined.west = Math.min(combined.west, box.west);
    fullLongitude ||= box.west > box.east || box.west === -180 && box.east === 180;
  }
  if (fullLongitude) { combined.west = -180; combined.east = 180; }
  return combined;
}

/**
 * Checks if a coordinate pair is within a bounding box.
 * 
 * @param {number} lat - Latitude to check
 * @param {number} lng - Longitude to check
 * @param {Object} bbox - Bounding box with north, south, east, west properties
 * @returns {boolean} True if point is within bounding box
 */
export function isPointInBoundingBox(lat, lng, bbox) {
  if (!isValidCoordinate(lat, lng)) return false;
  return lat >= bbox.south && lat <= bbox.north && longitudeIntervals(bbox).some(([west, east]) =>
    lng >= west && lng <= east || lng === 180 && west === -180 || lng === -180 && east === 180);
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
export class SpatialGrid {
  constructor(bounds, cellSize = 1.0) {
    gridCellRanges(bounds, cellSize, bounds);
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
    
    const budget = createSpatialWorkBudget();
    for (const { startRow, endRow, startCol, endCol } of gridCellRanges(this.bounds, this.cellSize, bbox)) {
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          budget.consume();
          const cellFeatures = this.grid.get(`${row},${col}`);
          if (cellFeatures) for (const item of cellFeatures) {
            budget.consume();
            results.add(item);
          }
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
  const { north, south } = bbox;
  
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
      if (maxLat >= south && minLat <= north && longitudeIntervals(bbox).some(([left, right]) => maxLng >= left && minLng <= right)) {
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
    if (feature.geometry && feature.geometry.type === 'LineString') {
      feature.geometry.coordinates.forEach(([lng, lat]) => {
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
      });
    }
  });
  
  if (![minLat, maxLat, minLng, maxLng].every(Number.isFinite)) {
    globalSpatialIndex = null;
    return;
  }

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