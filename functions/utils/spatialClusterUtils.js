import { calculateBoundingBox, isPointInBoundingBox, isValidCoordinate, gridCellRanges, createSpatialWorkBudget } from '../../src/utils/geoSpatialUtils.js';
import { calculateDistance } from './mathUtils.js';

var EarthquakeSpatialIndex = class {
  constructor(bounds, cellSize = 1, workBudget = createSpatialWorkBudget()) {
    gridCellRanges(bounds, cellSize, bounds);
    this.workBudget = workBudget;
    this.bounds = bounds;
    this.cellSize = cellSize;
    this.grid = /* @__PURE__ */ new Map();
    this.earthquakeCount = 0;
    this.stats = {
      insertions: 0,
      queries: 0,
      distanceCalculationsSaved: 0,
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
    if (
      !earthquake ||
      !earthquake.geometry ||
      !earthquake.geometry.coordinates
    ) {
      return false;
    }
    const coords = earthquake.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      return false;
    }
    const [lng, lat] = coords;
    if (!isValidCoordinate(lat, lng)) return false;
    if (
      lng < this.bounds.west ||
      lng > this.bounds.east ||
      lat < this.bounds.south ||
      lat > this.bounds.north
    ) {
      return false;
    }
    this.workBudget.consume();
    const cellKey = this._getCellKey(lat, lng);
    const earthquakeId = id || earthquake.id;
    if (!this.grid.has(cellKey)) {
      this.grid.set(cellKey, /* @__PURE__ */ new Set());
    }
    const indexedEarthquake = {
      earthquake,
      id: earthquakeId,
      lat,
      lng,
      coords,
      cellKey,
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
    const bbox = calculateBoundingBox(centerLat, centerLng, radiusKm);
    const candidates = this._getCandidatesInBounds(bbox);
    const results = [];
    let exactDistanceCalculations = 0;
    for (const candidate of candidates) {
      this.workBudget.consume();
      const distance = calculateDistance(
        centerLat,
        centerLng,
        candidate.lat,
        candidate.lng,
      );
      exactDistanceCalculations++;
      if (distance <= radiusKm) {
        results.push({
          ...candidate,
          distance,
        });
      }
    }
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
    for (const { startRow, endRow, startCol, endCol } of gridCellRanges(this.bounds, this.cellSize, bbox)) {
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          this.workBudget.consume();
          const cellKey = `${row},${col}`;
          const cellEarthquakes = this.grid.get(cellKey);
          if (cellEarthquakes) for (const item of cellEarthquakes) {
            this.workBudget.consume();
            candidates.push(item);
          }
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
    return candidates.filter((candidate) =>
      isPointInBoundingBox(candidate.lat, candidate.lng, bbox),
    );
  }
  /**
   * Get all earthquakes (for compatibility)
   * @returns {Array} All indexed earthquakes
   */
  getAllEarthquakes() {
    const all = [];
    this.grid.forEach((cellSet) => {
      cellSet.forEach((item) => all.push(item));
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
      cellSize: this.cellSize,
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
      distanceCalculationsSaved: 0,
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
      return 1;
    }
    const degreesPerKm = 1 / 110.574;
    const baseCellSize = maxDistanceKm * degreesPerKm;
    const densityFactor = Math.min(2, earthquakes.length / 1e3);
    return Math.max(0.1, baseCellSize * (1 + densityFactor));
  }
};
function buildEarthquakeSpatialIndex(earthquakes, maxDistanceKm = 100, workBudget = createSpatialWorkBudget()) {
  if (!earthquakes || earthquakes.length === 0) {
    return null;
  }
  let minLat = Infinity,
    maxLat = -Infinity;
  let minLng = Infinity,
    maxLng = -Infinity;
  const validEarthquakes = earthquakes.filter((eq) => {
    workBudget.consume();
    const coords = eq?.geometry?.coordinates;
    if (!coords || !Array.isArray(coords) || coords.length < 2) {
      return false;
    }
    const [lng, lat] = coords;
    if (!isValidCoordinate(lat, lng)) return false;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    return true;
  });
  if (validEarthquakes.length === 0) {
    return null;
  }
  const latBuffer = Math.max(0.1, (maxLat - minLat) * 0.1);
  const lngBuffer = Math.max(0.1, (maxLng - minLng) * 0.1);
  const bounds = {
    north: Math.min(90, maxLat + latBuffer),
    south: Math.max(-90, minLat - latBuffer),
    east: Math.min(180, maxLng + lngBuffer),
    west: Math.max(-180, minLng - lngBuffer),
  };
  const cellSize = EarthquakeSpatialIndex.calculateOptimalCellSize(
    validEarthquakes,
    maxDistanceKm,
  );
  const spatialIndex = new EarthquakeSpatialIndex(bounds, cellSize, workBudget);
  validEarthquakes.forEach((earthquake) => {
    spatialIndex.insert(earthquake);
  });
  return spatialIndex;
}
function findActiveClustersOptimized(earthquakes, maxDistanceKm, minQuakes, { maxWork = 1_000_000 } = {}) {
  if (!Number.isFinite(maxDistanceKm) || maxDistanceKm < 0 || !Number.isSafeInteger(minQuakes) || minQuakes < 1) {
    throw new RangeError('Expected a finite nonnegative distance and positive minimum quake count.');
  }
  const workBudget = createSpatialWorkBudget(maxWork);
  if (!earthquakes || earthquakes.length === 0) {
    return [];
  }
  if (!earthquakes || earthquakes.length < minQuakes) {
    return [];
  }
  const spatialIndex = buildEarthquakeSpatialIndex(earthquakes, maxDistanceKm, workBudget);
  if (!spatialIndex) {
    return [];
  }
  const sortedEarthquakes = [...earthquakes].sort((a, b) => {
    const magA = a?.properties?.mag || 0;
    const magB = b?.properties?.mag || 0;
    return magB - magA;
  });
  const processedQuakeIds = /* @__PURE__ */ new Set();
  const clusters = [];
  for (const baseQuake of sortedEarthquakes) {
    workBudget.consume();
    if (!baseQuake?.id || processedQuakeIds.has(baseQuake.id)) {
      continue;
    }
    const baseCoords = baseQuake.geometry?.coordinates;
    if (!Array.isArray(baseCoords) || baseCoords.length < 2) {
      console.warn(
        `Skipping quake ${baseQuake.id} due to invalid coordinates in findActiveClustersOptimized.`,
      );
      continue;
    }
    const [baseLng, baseLat] = baseCoords;
    if (!isValidCoordinate(baseLat, baseLng)) continue;
    const nearbyEarthquakes = spatialIndex.findWithinRadius(
      baseLat,
      baseLng,
      maxDistanceKm,
    );
    const newCluster = [baseQuake];
    processedQuakeIds.add(baseQuake.id);
    for (const nearbyItem of nearbyEarthquakes) {
      workBudget.consume();
      const nearbyQuake = nearbyItem.earthquake;
      if (
        nearbyQuake.id === baseQuake.id ||
        processedQuakeIds.has(nearbyQuake.id)
      ) {
        continue;
      }
      if (nearbyItem.distance <= maxDistanceKm) {
        newCluster.push(nearbyQuake);
        processedQuakeIds.add(nearbyQuake.id);
      }
    }
    // Processed IDs make clusters disjoint; a second quadratic duplicate scan
    // cannot remove any additional cluster and defeats the work bound.
    if (newCluster.length >= minQuakes) clusters.push(newCluster);
  }
  return clusters;
}

export { EarthquakeSpatialIndex, buildEarthquakeSpatialIndex, findActiveClustersOptimized };
