/**
 * @file spatialClusterUtils.test.js
 * @description Test suite for spatial clustering optimization utilities
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  EarthquakeSpatialIndex, 
  buildEarthquakeSpatialIndex, 
  findActiveClustersOptimized,
  benchmarkClusteringComparison
} from './spatialClusterUtils.js';

// Test data generators
const createMockEarthquake = (id, lat, lng, mag = 5.0) => ({
  id: `eq_${id}`,
  properties: {
    mag,
    time: Date.now(),
    place: `Test Location ${id}`
  },
  geometry: {
    type: 'Point',
    coordinates: [lng, lat, 0] // [longitude, latitude, depth]
  }
});

const createClusteredEarthquakes = (centerLat, centerLng, count, radius = 0.1) => {
  const earthquakes = [];
  for (let i = 0; i < count; i++) {
    const lat = centerLat + (Math.random() - 0.5) * radius;
    const lng = centerLng + (Math.random() - 0.5) * radius;
    earthquakes.push(createMockEarthquake(i, lat, lng, 5.0 + Math.random()));
  }
  return earthquakes;
};

describe('EarthquakeSpatialIndex', () => {
  let spatialIndex;
  const testBounds = {
    north: 42,
    south: 32,
    east: -114,
    west: -125
  };

  beforeEach(() => {
    spatialIndex = new EarthquakeSpatialIndex(testBounds, 1.0);
  });

  describe('Basic Operations', () => {
    it('should create spatial index with correct bounds', () => {
      expect(spatialIndex.bounds).toEqual(testBounds);
      expect(spatialIndex.cellSize).toBe(1.0);
      expect(spatialIndex.earthquakeCount).toBe(0);
    });

    it('should insert earthquake into spatial index', () => {
      const earthquake = createMockEarthquake('test1', 34.0522, -118.2437);
      const result = spatialIndex.insert(earthquake);
      
      expect(result).toBe(true);
      expect(spatialIndex.earthquakeCount).toBe(1);
      expect(spatialIndex.grid.size).toBeGreaterThan(0);
    });

    it('should reject earthquakes outside bounds', () => {
      const earthquake = createMockEarthquake('outside', 50, -100); // Outside test bounds
      const result = spatialIndex.insert(earthquake);
      
      expect(result).toBe(false);
      expect(spatialIndex.earthquakeCount).toBe(0);
    });

    it('should reject earthquakes with invalid coordinates', () => {
      const invalidEarthquake = {
        id: 'invalid',
        properties: { mag: 5.0 },
        geometry: {
          type: 'Point',
          coordinates: 'invalid'
        }
      };
      
      const result = spatialIndex.insert(invalidEarthquake);
      expect(result).toBe(false);
    });
  });

  describe('Spatial Queries', () => {
    beforeEach(() => {
      // Insert test earthquakes
      const earthquakes = [
        createMockEarthquake('la1', 34.0522, -118.2437), // Los Angeles area
        createMockEarthquake('la2', 34.0622, -118.2337), // Close to LA
        createMockEarthquake('sf1', 37.7749, -122.4194), // San Francisco area
        createMockEarthquake('sf2', 37.7849, -122.4094), // Close to SF
        createMockEarthquake('far', 35.0000, -115.0000)  // Distant
      ];
      
      earthquakes.forEach(eq => spatialIndex.insert(eq));
    });

    it('should find earthquakes within radius', () => {
      // Query around Los Angeles
      const results = spatialIndex.findWithinRadius(34.0522, -118.2437, 50); // 50km radius
      
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.id === 'eq_la1')).toBe(true);
      
      // Check that distances are calculated
      results.forEach(result => {
        expect(result).toHaveProperty('distance');
        expect(result.distance).toBeLessThanOrEqual(50);
      });
    });

    it('should find multiple earthquakes in cluster', () => {
      // Query with larger radius to catch both LA earthquakes
      const results = spatialIndex.findWithinRadius(34.0522, -118.2437, 20);
      
      const laEarthquakes = results.filter(r => r.id.includes('la'));
      expect(laEarthquakes.length).toBe(2);
    });

    it('should not find distant earthquakes', () => {
      // Query around LA with small radius
      const results = spatialIndex.findWithinRadius(34.0522, -118.2437, 10);
      
      // Should not include SF or far earthquakes
      expect(results.some(r => r.id.includes('sf'))).toBe(false);
      expect(results.some(r => r.id === 'eq_far')).toBe(false);
    });

    it('should query by bounding box', () => {
      const bbox = {
        north: 35,
        south: 33,
        east: -117,
        west: -119
      };
      
      const results = spatialIndex.query(bbox);
      expect(results.length).toBeGreaterThan(0);
      
      // Should include LA earthquakes but not SF
      expect(results.some(r => r.earthquake.id.includes('la'))).toBe(true);
      expect(results.some(r => r.earthquake.id.includes('sf'))).toBe(false);
    });
  });

  describe('Performance Tracking', () => {
    it('should track statistics', () => {
      const earthquake = createMockEarthquake('test', 34.0, -118.0);
      spatialIndex.insert(earthquake);
      spatialIndex.findWithinRadius(34.0, -118.0, 10);
      
      const stats = spatialIndex.getStats();
      
      expect(stats.insertions).toBe(1);
      expect(stats.queries).toBe(1);
      expect(stats.earthquakeCount).toBe(1);
      expect(stats.gridCells).toBeGreaterThan(0);
    });

    it('should track distance calculations saved', () => {
      // Insert many earthquakes
      for (let i = 0; i < 100; i++) {
        const eq = createMockEarthquake(i, 34 + Math.random(), -118 + Math.random());
        spatialIndex.insert(eq);
      }
      
      spatialIndex.findWithinRadius(34.5, -118.5, 50);
      
      const stats = spatialIndex.getStats();
      expect(stats.distanceCalculationsSaved).toBeGreaterThan(0);
    });
  });

  describe('Cell Size Optimization', () => {
    it('should calculate optimal cell size', () => {
      const earthquakes = createClusteredEarthquakes(34.0, -118.0, 50);
      const cellSize = EarthquakeSpatialIndex.calculateOptimalCellSize(earthquakes, 100);
      
      expect(cellSize).toBeGreaterThan(0);
      expect(cellSize).toBeLessThan(10); // Should be reasonable
    });

    it('should handle empty earthquake arrays', () => {
      const cellSize = EarthquakeSpatialIndex.calculateOptimalCellSize([], 100);
      expect(cellSize).toBe(1.0); // Default
    });
  });
});

describe('buildEarthquakeSpatialIndex', () => {
  it('should build spatial index from earthquake array', () => {
    const earthquakes = createClusteredEarthquakes(34.0, -118.0, 20);
    const spatialIndex = buildEarthquakeSpatialIndex(earthquakes, 100);
    
    expect(spatialIndex).toBeDefined();
    expect(spatialIndex.earthquakeCount).toBe(20);
    expect(spatialIndex.bounds).toBeDefined();
  });

  it('should handle empty earthquake arrays', () => {
    const spatialIndex = buildEarthquakeSpatialIndex([], 100);
    expect(spatialIndex).toBeNull();
  });

  it('should filter out invalid earthquakes', () => {
    const earthquakes = [
      createMockEarthquake('valid', 34.0, -118.0),
      { id: 'invalid1', properties: {}, geometry: null },
      { id: 'invalid2', properties: {}, geometry: { coordinates: 'invalid' } },
      createMockEarthquake('valid2', 34.1, -118.1)
    ];
    
    const spatialIndex = buildEarthquakeSpatialIndex(earthquakes, 100);
    expect(spatialIndex.earthquakeCount).toBe(2); // Only valid earthquakes
  });

  it('should calculate appropriate bounds with buffer', () => {
    const earthquakes = [
      createMockEarthquake('1', 34.0, -118.0),
      createMockEarthquake('2', 35.0, -117.0)
    ];
    
    const spatialIndex = buildEarthquakeSpatialIndex(earthquakes, 100);
    
    // Bounds should include buffer
    expect(spatialIndex.bounds.south).toBeLessThan(34.0);
    expect(spatialIndex.bounds.north).toBeGreaterThan(35.0);
    expect(spatialIndex.bounds.west).toBeLessThan(-118.0);
    expect(spatialIndex.bounds.east).toBeGreaterThan(-117.0);
  });
});

describe('findActiveClustersOptimized', () => {
  it('should find clusters using spatial optimization', () => {
    // Create two distinct clusters
    const cluster1 = createClusteredEarthquakes(34.0, -118.0, 5, 0.05); // LA area
    const cluster2 = createClusteredEarthquakes(37.7, -122.4, 4, 0.05); // SF area
    const isolated = [createMockEarthquake('isolated', 35.0, -115.0, 3.0)]; // Isolated
    
    const allEarthquakes = [...cluster1, ...cluster2, ...isolated];
    
    const clusters = findActiveClustersOptimized(allEarthquakes, 20, 3); // 20km, min 3 quakes
    
    expect(clusters.length).toBe(2); // Should find 2 clusters
    
    // Verify cluster properties
    clusters.forEach(cluster => {
      expect(cluster.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('should maintain magnitude-based sorting behavior', () => {
    const earthquakes = [
      createMockEarthquake('low', 34.0, -118.0, 3.0),
      createMockEarthquake('high', 34.01, -118.01, 6.0),
      createMockEarthquake('medium', 34.02, -118.02, 4.5)
    ];
    
    const clusters = findActiveClustersOptimized(earthquakes, 10, 2);
    
    if (clusters.length > 0) {
      // First earthquake in cluster should be highest magnitude
      const firstCluster = clusters[0];
      expect(firstCluster[0].properties.mag).toBe(6.0);
    }
  });

  it('should handle edge cases gracefully', () => {
    // Empty array
    expect(findActiveClustersOptimized([], 100, 3)).toEqual([]);
    
    // Too few earthquakes
    const fewEarthquakes = [createMockEarthquake('1', 34.0, -118.0)];
    expect(findActiveClustersOptimized(fewEarthquakes, 100, 3)).toEqual([]);
    
    // Invalid earthquakes
    const invalidEarthquakes = [
      { id: 'invalid', properties: {}, geometry: null }
    ];
    expect(findActiveClustersOptimized(invalidEarthquakes, 100, 3)).toEqual([]);
  });

  it('should avoid duplicate clusters', () => {
    // Create overlapping earthquakes that could form duplicate clusters
    const earthquakes = [
      createMockEarthquake('1', 34.0, -118.0, 6.0),
      createMockEarthquake('2', 34.01, -118.01, 5.5),
      createMockEarthquake('3', 34.02, -118.02, 5.0),
      createMockEarthquake('4', 34.03, -118.03, 4.5)
    ];
    
    const clusters = findActiveClustersOptimized(earthquakes, 50, 2);
    
    // Should not create duplicate clusters
    const clusterQuakeIds = clusters.map(cluster => 
      new Set(cluster.map(q => q.id))
    );
    
    for (let i = 0; i < clusterQuakeIds.length; i++) {
      for (let j = i + 1; j < clusterQuakeIds.length; j++) {
        const intersection = new Set([...clusterQuakeIds[i]].filter(x => clusterQuakeIds[j].has(x)));
        expect(intersection.size).toBe(0); // No overlapping earthquakes
      }
    }
  });

  it('should handle different clustering parameters', () => {
    const earthquakes = createClusteredEarthquakes(34.0, -118.0, 10);
    
    // Tight clustering
    const tightClusters = findActiveClustersOptimized(earthquakes, 5, 5);
    
    // Loose clustering  
    const looseClusters = findActiveClustersOptimized(earthquakes, 50, 2);
    
    // Loose clustering should find more/larger clusters
    expect(looseClusters.length).toBeGreaterThanOrEqual(tightClusters.length);
  });
});

describe('Performance Comparison', () => {
  it('should provide benchmark comparison data', async () => {
    const earthquakes = createClusteredEarthquakes(34.0, -118.0, 100);
    
    const comparison = await benchmarkClusteringComparison(earthquakes, 50, 3);
    
    expect(comparison).toHaveProperty('optimized');
    expect(comparison.optimized).toHaveProperty('clusters');
    expect(comparison.optimized).toHaveProperty('clusterCount');
    expect(comparison.optimized).toHaveProperty('totalEarthquakes');
  });
});

describe('Integration Tests', () => {
  it('should maintain functional compatibility with existing clustering', () => {
    // Test with realistic earthquake data structure
    const earthquakes = [
      {
        id: 'us1000test1',
        properties: {
          mag: 5.2,
          time: 1640995200000,
          place: '10km NE of Los Angeles, CA',
          type: 'earthquake'
        },
        geometry: {
          type: 'Point',
          coordinates: [-118.2437, 34.0522, 10.0]
        }
      },
      {
        id: 'us1000test2', 
        properties: {
          mag: 4.8,
          time: 1640995260000,
          place: '12km NE of Los Angeles, CA',
          type: 'earthquake'
        },
        geometry: {
          type: 'Point',
          coordinates: [-118.2337, 34.0622, 8.5]
        }
      }
    ];
    
    const clusters = findActiveClustersOptimized(earthquakes, 20, 2);
    
    expect(clusters.length).toBeLessThanOrEqual(1);
    if (clusters.length > 0) {
      expect(clusters[0].length).toBe(2);
      expect(clusters[0][0].properties.mag).toBe(5.2); // Highest magnitude first
    }
  });

  it('should handle large datasets efficiently', () => {
    const startTime = performance.now();
    
    // Create larger dataset
    const earthquakes = createClusteredEarthquakes(34.0, -118.0, 500);
    
    const clusters = findActiveClustersOptimized(earthquakes, 50, 3);
    
    const endTime = performance.now();
    const executionTime = endTime - startTime;
    
    // Should complete in reasonable time (much faster than O(N²))
    expect(executionTime).toBeLessThan(1000); // Less than 1 second
    expect(clusters).toBeDefined();
  });
});