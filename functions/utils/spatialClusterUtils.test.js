/**
 * @file spatialClusterUtils.test.js
 * @description Test suite for spatial clustering optimization utilities
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  EarthquakeSpatialIndex, 
  buildEarthquakeSpatialIndex, 
  findActiveClustersOptimized
} from './spatialClusterUtils.js';
import { findActiveClusters } from '../../src/utils/clusterUtils.js';

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
      // Insert many earthquakes across a wider area to ensure spatial optimization benefits
      // Create clusters in different regions to test spatial partitioning
      for (let i = 0; i < 200; i++) {
        // Spread earthquakes across a larger geographic area
        const lat = 30 + Math.random() * 10; // 30-40 degrees latitude  
        const lng = -125 + Math.random() * 15; // -125 to -110 degrees longitude
        const eq = createMockEarthquake(i, lat, lng);
        spatialIndex.insert(eq);
      }
      
      // Search in a small area to demonstrate spatial optimization
      spatialIndex.findWithinRadius(34.5, -118.5, 10); // Smaller radius
      
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
    // Create two distinct clusters with unique IDs
    const cluster1 = [];
    for (let i = 0; i < 5; i++) {
      const lat = 34.0 + (Math.random() - 0.5) * 0.05;
      const lng = -118.0 + (Math.random() - 0.5) * 0.05;
      cluster1.push(createMockEarthquake(`cluster1-${i}`, lat, lng, 5.0 + Math.random()));
    }
    
    const cluster2 = [];
    for (let i = 0; i < 4; i++) {
      const lat = 37.7 + (Math.random() - 0.5) * 0.05;
      const lng = -122.4 + (Math.random() - 0.5) * 0.05;
      cluster2.push(createMockEarthquake(`cluster2-${i}`, lat, lng, 5.0 + Math.random()));
    }
    
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

describe('Clustering compatibility', () => {
  it('matches client cluster memberships for deterministic separated groups', () => {
    const earthquakes = [
      createMockEarthquake('la1', 34.0, -118.0, 5.0),
      createMockEarthquake('la2', 34.01, -118.01, 4.0),
      createMockEarthquake('sf1', 37.7, -122.4, 5.5),
      createMockEarthquake('sf2', 37.71, -122.41, 3.0),
      createMockEarthquake('isolated', 0, 0, 6.0),
    ];
    const memberships = clusters => clusters.map(cluster => cluster.map(quake => quake.id).sort()).sort();
    const optimized = memberships(findActiveClustersOptimized(earthquakes, 30, 2));
    expect(optimized).toEqual([['eq_la1', 'eq_la2'], ['eq_sf1', 'eq_sf2']]);
    expect(optimized).toEqual(memberships(findActiveClusters(earthquakes, 30, 2)));
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
describe('polar, wrapped and bounded clustering regressions', () => {
  const quake = (id, lng, lat, mag = 3) => ({ id, properties: { mag }, geometry: { type: 'Point', coordinates: [lng, lat, 10] } });

  it('finishes valid pole/minimum-one inputs and keeps bounded index coordinates', () => {
    for (const lat of [90, -90]) {
      const events = [quake('pole', 0, lat)];
      expect(findActiveClustersOptimized(events, 50, 1)).toEqual([events]);
      const index = buildEarthquakeSpatialIndex(events, 50);
      expect(index.bounds.north).toBeLessThanOrEqual(90);
      expect(index.bounds.south).toBeGreaterThanOrEqual(-90);
    }
  });
  it('clusters all three antimeridian neighbors with the strongest first', () => {
    const events = [quake('east', 179.9, 0, 5), quake('west1', -179.9, 0, 4), quake('west2', -179.8, 0, 3)];
    const clusters = findActiveClustersOptimized(events, 50, 3);
    expect(clusters).toHaveLength(1);
    expect(clusters[0][0].id).toBe('east');
    expect(clusters[0].map(item => item.id).sort()).toEqual(['east', 'west1', 'west2']);
  });
  it('finds near-pole neighbors on opposite meridians', () => {
    const events = [quake('a', -170, 89.9, 5), quake('b', 10, 89.9, 4), quake('c', 170, 89.95, 3)];
    expect(findActiveClustersOptimized(events, 50, 3)[0]).toHaveLength(3);
  });
  it('queries both representations of the date-line at zero distance', () => {
    const index = buildEarthquakeSpatialIndex([quake('east', 180, 0), quake('west', -180, 0)], 1);
    // Floating-point sin(pi) makes the exact great-circle comparison tiny but nonzero.
    expect(index.findWithinRadius(0, 180, 0.000001).map(item => item.id).sort()).toEqual(['east', 'west']);
  });
  it('drops nonfinite and out-of-world coordinates before any query', () => {
    const events = [quake('inf', Infinity, 0), quake('nan', 0, NaN), quake('badlat', 0, 91), quake('badlng', 181, 0), quake('ok', 0, 0)];
    expect(findActiveClustersOptimized(events, 50, 1).map(cluster => cluster[0].id)).toEqual(['ok']);
  });
  it('enforces a shared budget across insertion, grid cells and candidate work', () => {
    const events = [quake('a', 0, 0), quake('b', 0.01, 0)];
    expect(() => findActiveClustersOptimized(events, 50, 1, { maxWork: 5 })).toThrow(expect.objectContaining({ code: 'SPATIAL_BUDGET_EXCEEDED' }));
  });
  it('terminates a large empty-cell scan under the default one-million budget', () => {
    const index = new EarthquakeSpatialIndex({ north: 90, south: -90, east: 180, west: -180 }, 0.01);
    expect(() => index.findWithinRadius(89.9, 0, 500)).toThrow(expect.objectContaining({ code: 'SPATIAL_BUDGET_EXCEEDED' }));
  });
  it('does not scan outside the actual grid for very large queries', () => {
    const index = new EarthquakeSpatialIndex({ north: 1, south: 0, east: 1, west: 0 }, 1);
    index.insert(quake('a', 0, 0));
    expect(index.query({ north: 1e20, south: -1e20, east: 1e20, west: -1e20 })).toHaveLength(1);
    expect(index.workBudget.remaining).toBeGreaterThan(999_980);
  });
});
