/**
 * @file spatialClusterUtils.js
 * @description Spatial indexing utilities for earthquake clustering optimization
 * Extends the existing SpatialGrid to support Point geometries for clustering
 */

import { SpatialGrid, calculateBoundingBox, isPointInBoundingBox } from '../../src/utils/geoSpatialUtils.js';
import { calculateDistance } from './mathUtils.js';

/**
 * Enhanced spatial grid specifically for earthquake Point geometries
 * Extends the existing SpatialGrid concept while maintaining compatibility
 */
export class EarthquakeSpatialIndex {
  constructor(bounds, cellSize = 1.0) {
    this.bounds = bounds;
    this.cellSize = cellSize;
    this.grid = new Map();
    this.earthquakeCount = 0;
    this.stats = {
      insertions: 0,
      queries: 0,
      distanceCalculationsSaved: 0
    };
  }
  
  /**
   * Calculate grid cell key for a coordinate pair
   * Compatible with existing SpatialGrid implementation
   */
  _getCellKey(lat, lng) {
    const row = Math.floor((lat - this.bounds.south) / this.cellSize);
    const col = Math.floor((lng - this.bounds.west) / this.cellSize);
    return `${row},${col}`;
  }
  
  /**
   * Insert earthquake into spatial index
   * @param {Object} earthquake - Earthquake object with geometry.coordinates
   * @param {string} id - Unique identifier (earthquake.id)
   */
  insert(earthquake, id = null) {
    if (!earthquake || !earthquake.geometry || !earthquake.geometry.coordinates) {
      return false;
    }
    
    const coords = earthquake.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      return false;
    }
    
    // Handle Point geometry (earthquake standard: [lng, lat, depth])
    const [lng, lat] = coords;
    
    // Validate coordinates are within bounds
    if (lng < this.bounds.west || lng > this.bounds.east ||
        lat < this.bounds.south || lat > this.bounds.north) {
      return false;
    }
    
    const cellKey = this._getCellKey(lat, lng);
    const earthquakeId = id || earthquake.id;
    
    if (!this.grid.has(cellKey)) {
      this.grid.set(cellKey, new Set());
    }
    
    // Store earthquake with additional metadata for efficient clustering
    const indexedEarthquake = {
      earthquake,
      id: earthquakeId,
      lat,
      lng,
      coords,
      cellKey
    };
    
    this.grid.get(cellKey).add(indexedEarthquake);
    this.earthquakeCount++;
    this.stats.insertions++;
    
    return true;
  }
  
  /**
   * Find earthquakes within a circular radius (for clustering)
   * This is the key optimization that replaces O(N²) distance calculations
   * @param {number} centerLat - Center latitude
   * @param {number} centerLng - Center longitude  
   * @param {number} radiusKm - Search radius in kilometers
   * @returns {Array} Array of earthquakes within radius
   */
  findWithinRadius(centerLat, centerLng, radiusKm) {
    this.stats.queries++;
    
    // Calculate bounding box for the radius (rectangular approximation)
    const bbox = calculateBoundingBox(centerLat, centerLng, radiusKm);
    
    // Get candidate cells that intersect with the bounding box
    const candidates = this._getCandidatesInBounds(bbox);
    
    // Filter candidates by exact distance calculation
    const results = [];
    let exactDistanceCalculations = 0;
    
    for (const candidate of candidates) {
      const distance = calculateDistance(centerLat, centerLng, candidate.lat, candidate.lng);
      exactDistanceCalculations++;
      
      if (distance <= radiusKm) {
        results.push({
          ...candidate,
          distance
        });
      }
    }
    
    // Track efficiency: how many distance calculations we saved
    const totalEarthquakes = this.earthquakeCount;
    const calculationsSaved = totalEarthquakes - exactDistanceCalculations;
    this.stats.distanceCalculationsSaved += calculationsSaved;
    
    return results;
  }
  
  /**
   * Get candidate earthquakes within bounding box (grid cell query)
   * @param {Object} bbox - Bounding box with north, south, east, west
   * @returns {Array} Candidate earthquakes
   */
  _getCandidatesInBounds(bbox) {
    const candidates = [];
    
    // Calculate grid cell range
    const startRow = Math.max(0, Math.floor((bbox.south - this.bounds.south) / this.cellSize));
    const endRow = Math.floor((bbox.north - this.bounds.south) / this.cellSize);
    const startCol = Math.max(0, Math.floor((bbox.west - this.bounds.west) / this.cellSize));
    const endCol = Math.floor((bbox.east - this.bounds.west) / this.cellSize);
    
    // Query relevant grid cells
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const cellKey = `${row},${col}`;
        const cellEarthquakes = this.grid.get(cellKey);
        
        if (cellEarthquakes) {
          cellEarthquakes.forEach(item => candidates.push(item));
        }
      }
    }
    
    return candidates;
  }
  
  /**
   * Query by bounding box (maintains compatibility with existing SpatialGrid)
   * @param {Object} bbox - Bounding box
   * @returns {Array} Earthquakes in bounding box
   */
  query(bbox) {
    const candidates = this._getCandidatesInBounds(bbox);
    
    // Filter candidates that are actually within the bounding box
    return candidates.filter(candidate => 
      isPointInBoundingBox(candidate.lat, candidate.lng, bbox)
    );
  }
  
  /**
   * Get all earthquakes (for compatibility)
   * @returns {Array} All indexed earthquakes
   */
  getAllEarthquakes() {
    const all = [];
    this.grid.forEach(cellSet => {
      cellSet.forEach(item => all.push(item));
    });
    return all;
  }
  
  /**
   * Get spatial index statistics
   * @returns {Object} Performance and usage statistics
   */
  getStats() {
    return {
      ...this.stats,
      earthquakeCount: this.earthquakeCount,
      gridCells: this.grid.size,
      averageEarthquakesPerCell: this.earthquakeCount / (this.grid.size || 1),
      bounds: this.bounds,
      cellSize: this.cellSize
    };
  }
  
  /**
   * Clear the spatial index
   */
  clear() {
    this.grid.clear();
    this.earthquakeCount = 0;
    this.stats = {
      insertions: 0,
      queries: 0,
      distanceCalculationsSaved: 0
    };
  }
  
  /**
   * Calculate optimal cell size based on earthquake distribution and clustering parameters
   * @param {Array} earthquakes - Sample of earthquakes
   * @param {number} maxDistanceKm - Maximum clustering distance
   * @returns {number} Recommended cell size in degrees
   */
  static calculateOptimalCellSize(earthquakes, maxDistanceKm) {
    if (!earthquakes || earthquakes.length === 0) {
      return 1.0; // Default 1 degree cells
    }
    
    // Cell size should be roughly the clustering distance
    // Convert km to degrees (approximate)
    const _avgLat = earthquakes.reduce((sum, eq) => {
      const coords = eq.geometry?.coordinates;
      return sum + (coords ? coords[1] : 0);
    }, 0) / earthquakes.length;
    
    const degreesPerKm = 1 / 110.574; // Rough conversion
    const baseCellSize = maxDistanceKm * degreesPerKm;
    
    // Adjust based on data density to balance performance
    const densityFactor = Math.min(2.0, earthquakes.length / 1000);
    return Math.max(0.1, baseCellSize * (1 + densityFactor));
  }
}

/**
 * Build spatial index from earthquake array
 * @param {Array} earthquakes - Array of earthquake objects
 * @param {number} maxDistanceKm - Maximum clustering distance (for cell size optimization)
 * @returns {EarthquakeSpatialIndex} Populated spatial index
 */
export function buildEarthquakeSpatialIndex(earthquakes, maxDistanceKm = 100) {
  if (!earthquakes || earthquakes.length === 0) {
    return null;
  }
  
  // Calculate bounds from earthquake data
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  
  const validEarthquakes = earthquakes.filter(eq => {
    const coords = eq.geometry?.coordinates;
    if (!coords || !Array.isArray(coords) || coords.length < 2) {
      return false;
    }
    
    const [lng, lat] = coords;
    if (typeof lat !== 'number' || typeof lng !== 'number' || 
        isNaN(lat) || isNaN(lng)) {
      return false;
    }
    
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    
    return true;
  });
  
  if (validEarthquakes.length === 0) {
    return null;
  }
  
  // Add buffer around bounds
  const latBuffer = Math.max(0.1, (maxLat - minLat) * 0.1);
  const lngBuffer = Math.max(0.1, (maxLng - minLng) * 0.1);
  
  const bounds = {
    north: maxLat + latBuffer,
    south: minLat - latBuffer,
    east: maxLng + lngBuffer,
    west: minLng - lngBuffer
  };
  
  // Calculate optimal cell size
  const cellSize = EarthquakeSpatialIndex.calculateOptimalCellSize(validEarthquakes, maxDistanceKm);
  
  // Create and populate index
  const spatialIndex = new EarthquakeSpatialIndex(bounds, cellSize);
  
  validEarthquakes.forEach(earthquake => {
    spatialIndex.insert(earthquake);
  });
  
  return spatialIndex;
}

/**
 * Optimized clustering algorithm using spatial indexing
 * Drop-in replacement for the O(N²) algorithm in findActiveClusters
 * @param {Array} earthquakes - Array of earthquake objects
 * @param {number} maxDistanceKm - Maximum distance for clustering
 * @param {number} minQuakes - Minimum earthquakes per cluster
 * @returns {Array} Array of clusters (arrays of earthquakes)
 */
export function findActiveClustersOptimized(earthquakes, maxDistanceKm, minQuakes) {
  if (!earthquakes || earthquakes.length === 0) {
    return [];
  }
  
  if (!earthquakes || earthquakes.length < minQuakes) {
    return [];
  }
  
  // Build spatial index
  const spatialIndex = buildEarthquakeSpatialIndex(earthquakes, maxDistanceKm);
  if (!spatialIndex) {
    return [];
  }
  
  // Sort earthquakes by magnitude (descending) - maintain existing behavior
  const sortedEarthquakes = [...earthquakes].sort((a, b) => {
    const magA = a.properties?.mag || 0;
    const magB = b.properties?.mag || 0;
    return magB - magA;
  });
  
  const processedQuakeIds = new Set();
  const clusters = [];
  
  // Iterate through earthquakes as potential cluster centers
  for (const baseQuake of sortedEarthquakes) {
    // Skip if already processed or invalid
    if (!baseQuake.id || processedQuakeIds.has(baseQuake.id)) {
      continue;
    }
    
    const baseCoords = baseQuake.geometry?.coordinates;
    if (!Array.isArray(baseCoords) || baseCoords.length < 2) {
      console.warn(`Skipping quake ${baseQuake.id} due to invalid coordinates in findActiveClustersOptimized.`);
      continue;
    }
    
    const [baseLng, baseLat] = baseCoords;
    
    // Use spatial index to find nearby earthquakes (KEY OPTIMIZATION)
    const nearbyEarthquakes = spatialIndex.findWithinRadius(baseLat, baseLng, maxDistanceKm);
    
    // Build cluster from nearby earthquakes
    const newCluster = [baseQuake];
    processedQuakeIds.add(baseQuake.id);
    
    for (const nearbyItem of nearbyEarthquakes) {
      const nearbyQuake = nearbyItem.earthquake;
      
      // Skip if same quake or already processed
      if (nearbyQuake.id === baseQuake.id || processedQuakeIds.has(nearbyQuake.id)) {
        continue;
      }
      
      // Distance already calculated in spatial index query
      if (nearbyItem.distance <= maxDistanceKm) {
        newCluster.push(nearbyQuake);
        processedQuakeIds.add(nearbyQuake.id);
      }
    }
    
    // Add cluster if it meets minimum size requirement
    if (newCluster.length >= minQuakes) {
      // Check for duplicate clusters (maintain existing behavior)
      const newClusterQuakeIds = new Set(newCluster.map(q => q.id));
      let isDuplicate = false;
      
      for (const existingCluster of clusters) {
        const existingIds = new Set(existingCluster.map(q => q.id));
        if (newClusterQuakeIds.size === existingIds.size && 
            [...newClusterQuakeIds].every(id => existingIds.has(id))) {
          isDuplicate = true;
          break;
        }
      }
      
      if (!isDuplicate) {
        clusters.push(newCluster);
      }
    }
  }
  
  return clusters;
}

/**
 * Benchmark comparison function
 * Compares spatial optimized vs original O(N²) algorithm
 * @param {Array} earthquakes - Test earthquakes
 * @param {number} maxDistanceKm - Clustering distance
 * @param {number} minQuakes - Minimum cluster size
 * @returns {Object} Comparison results
 */
export async function benchmarkClusteringComparison(earthquakes, maxDistanceKm, minQuakes) {
  console.time('Optimized Spatial Clustering');
  const optimizedResult = findActiveClustersOptimized(earthquakes, maxDistanceKm, minQuakes);
  console.timeEnd('Optimized Spatial Clustering');
  
  // Note: We'd import the original function for comparison
  // const originalResult = findActiveClusters(earthquakes, maxDistanceKm, minQuakes);
  
  return {
    optimized: {
      clusters: optimizedResult,
      clusterCount: optimizedResult.length,
      totalEarthquakes: optimizedResult.reduce((sum, cluster) => sum + cluster.length, 0)
    }
    // original: { ... } - would include original results for comparison
  };
}

/**
 * Creates a spatial index for a set of earthquakes.
 * @param {Array} earthquakes - An array of earthquake objects.
 * @returns {SpatialGrid} A spatial grid containing the earthquakes.
 */
export function createEarthquakeSpatialIndex(earthquakes) {
  if (!earthquakes || earthquakes.length === 0) {
    return null;
  }

  // Determine the bounds of the earthquakes.
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const quake of earthquakes) {
    const [lng, lat] = quake.geometry.coordinates;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }

  const bounds = {
    north: maxLat,
    south: minLat,
    east: maxLng,
    west: minLng
  };

  // Create a spatial grid with a cell size of 1 degree.
  const grid = new SpatialGrid(bounds, 1.0);

  // Insert each earthquake into the grid.
  for (const quake of earthquakes) {
    grid.insert(quake, quake.id);
  }

  return grid;
}