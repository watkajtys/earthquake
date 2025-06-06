import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { findActiveClusters } from './clusterUtils'; // Adjust path as necessary
import * as utils from './utils'; // To mock calculateDistance

// Mock the calculateDistance function from utils.js
vi.mock('./utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    calculateDistance: vi.fn(),
  };
});

// Helper to create mock earthquake objects
const createMockQuake = (id, lat, lon, mag = 5, time = Date.now()) => ({
  id,
  properties: { mag, time, place: `Quake ${id}` },
  geometry: { coordinates: [lon, lat, 10] }, // lon, lat, depth
});

describe('findActiveClusters', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks(); // Clear all mocks including calculateDistance calls
    // If clusterUtils uses console.error, spy on it
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('Basic Scenarios', () => {
    it('should return an empty array for empty earthquakes input', () => {
      const earthquakes = [];
      const clusters = findActiveClusters(earthquakes, 100, 2);
      expect(clusters).toEqual([]);
      expect(utils.calculateDistance).not.toHaveBeenCalled();
    });

    it('should return an empty array if no earthquakes are close enough', () => {
      const earthquakes = [
        createMockQuake('q1', 0, 0),
        createMockQuake('q2', 10, 10), // 1570km away
      ];
      utils.calculateDistance.mockReturnValue(1570); // All quakes far apart
      const clusters = findActiveClusters(earthquakes, 100, 2);
      expect(clusters).toEqual([]);
      expect(utils.calculateDistance).toHaveBeenCalled();
    });

    it('should form a single cluster meeting minQuakes criteria', () => {
      const q1 = createMockQuake('q1', 0, 0, 6);
      const q2 = createMockQuake('q2', 0.1, 0.1, 5); // close to q1
      const q3 = createMockQuake('q3', 0.2, 0.2, 4); // close to q1
      const q4 = createMockQuake('q4', 10, 10, 5);   // far from q1
      const earthquakes = [q1, q2, q3, q4];

      utils.calculateDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
        if ((lat1 === 0 && lon1 === 0 && lat2 === 0.1 && lon2 === 0.1) || (lat1 === 0.1 && lon1 === 0.1 && lat2 === 0 && lon2 === 0)) return 10; // q1-q2
        if ((lat1 === 0 && lon1 === 0 && lat2 === 0.2 && lon2 === 0.2) || (lat1 === 0.2 && lon1 === 0.2 && lat2 === 0 && lon2 === 0)) return 20; // q1-q3
        if ((lat1 === 0 && lon1 === 0 && lat2 === 10 && lon2 === 10)) return 1000; // q1-q4
        // Distances from q2 (seed)
        if ((lat1 === 0.1 && lon1 === 0.1 && lat2 === 0.2 && lon2 === 0.2)) return 10; // q2-q3 (not relevant as q1 is seed)
        return 1000; // Default large distance
      });

      const clusters = findActiveClusters(earthquakes, 50, 3);
      expect(clusters.length).toBe(1);
      expect(clusters[0]).toEqual(expect.arrayContaining([q1, q2, q3]));
      expect(clusters[0].length).toBe(3);
    });

    it('should form multiple distinct clusters', () => {
      const q1 = createMockQuake('q1', 0, 0, 6); // Cluster A seed
      const q2 = createMockQuake('q2', 0.1, 0.1, 5); // Cluster A
      const q3 = createMockQuake('q3', 10, 10, 7); // Cluster B seed
      const q4 = createMockQuake('q4', 10.1, 10.1, 4); // Cluster B
      const q5 = createMockQuake('q5', 20, 20, 5); // Noise
      const earthquakes = [q1, q2, q3, q4, q5];

      utils.calculateDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
        // Cluster A (around q1)
        if (lat1 === 0 && lon1 === 0 && lat2 === 0.1 && lon2 === 0.1) return 10; // q1-q2
        // Cluster B (around q3)
        if (lat1 === 10 && lon1 === 10 && lat2 === 10.1 && lon2 === 10.1) return 10; // q3-q4
        return 1000; // All other pairs are far
      });

      const clusters = findActiveClusters(earthquakes, 50, 2);
      expect(clusters.length).toBe(2);
      // Order of clusters depends on magnitude sort, q3 is stronger so its cluster forms first
      expect(clusters[0]).toEqual(expect.arrayContaining([q3, q4]));
      expect(clusters[1]).toEqual(expect.arrayContaining([q1, q2]));
    });
  });

  describe('Edge Cases', () => {
    it('minQuakes = 1: every earthquake forms its own cluster if not part of a larger one', () => {
      const q1 = createMockQuake('q1', 0, 0, 6);
      const q2 = createMockQuake('q2', 0.1, 0.1, 5); // close to q1
      const q3 = createMockQuake('q3', 10, 10, 4); // far from q1,q2
      const earthquakes = [q1, q2, q3];

      utils.calculateDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
        if (lat1 === 0 && lon1 === 0 && lat2 === 0.1 && lon2 === 0.1) return 10; // q1-q2
        return 1000;
      });

      const clusters = findActiveClusters(earthquakes, 50, 1);
      expect(clusters.length).toBe(2); // Cluster [q1, q2] and cluster [q3]
      // q1 is stronger, forms cluster with q2. q3 is alone.
      expect(clusters[0]).toEqual(expect.arrayContaining([q1, q2]));
      expect(clusters[1]).toEqual(expect.arrayContaining([q3]));
    });

    it('minQuakes > total number of earthquakes: should return empty array', () => {
      const earthquakes = [createMockQuake('q1', 0, 0), createMockQuake('q2', 0.1, 0.1)];
      utils.calculateDistance.mockReturnValue(10);
      const clusters = findActiveClusters(earthquakes, 100, 3);
      expect(clusters).toEqual([]);
    });

    it('maxDistanceKm = 0: only earthquakes at exact same location can cluster', () => {
      const q1 = createMockQuake('q1', 0, 0, 6);
      const q2 = createMockQuake('q2', 0, 0, 5);    // Same location as q1
      const q3 = createMockQuake('q3', 0.0001, 0.0001, 4); // Very close, but not 0 distance
      const earthquakes = [q1, q2, q3];

      utils.calculateDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
        if (lat1 === 0 && lon1 === 0 && lat2 === 0 && lon2 === 0) return 0; // q1-q2
        if (lat1 === 0 && lon1 === 0 && lat2 === 0.0001 && lon2 === 0.0001) return 0.01; // q1-q3
        return 1000;
      });
      const clusters = findActiveClusters(earthquakes, 0, 2);
      expect(clusters.length).toBe(1);
      expect(clusters[0]).toEqual(expect.arrayContaining([q1, q2]));
      expect(clusters[0].length).toBe(2);
    });
  });

  describe('calculateDistance Mocking & Calls', () => {
    it('should call calculateDistance with correct lat/lon pairs', () => {
      const q1 = createMockQuake('q1', 10, 20, 6); // Seed
      const q2 = createMockQuake('q2', 10.1, 20.1, 5);
      const q3 = createMockQuake('q3', 10.2, 20.2, 4);
      const earthquakes = [q1, q2, q3];

      utils.calculateDistance.mockReturnValue(10); // All close

      findActiveClusters(earthquakes, 100, 2);

      // q1 is seed. It checks against q2 and q3.
      // Then q2 becomes seed (if not processed), checks against q3.
      // Then q3 becomes seed (if not processed).

      // Calls for q1 as seed:
      expect(utils.calculateDistance).toHaveBeenCalledWith(10, 20, 10.1, 20.1); // q1 -> q2
      expect(utils.calculateDistance).toHaveBeenCalledWith(10, 20, 10.2, 20.2); // q1 -> q3

      // Since q2 and q3 get added to q1's cluster, they become processed.
      // So, they won't be seed quakes themselves.
      expect(utils.calculateDistance).toHaveBeenCalledTimes(2);
    });

    it('should handle boundary conditions for maxDistanceKm', () => {
      const q1 = createMockQuake('q1', 0, 0, 6);
      const q2Close = createMockQuake('q2', 0.1, 0, 5); // Just below maxDistance
      const q3At = createMockQuake('q3', 0.2, 0, 4);    // At maxDistance
      const q4Far = createMockQuake('q4', 0.3, 0, 3);   // Just above maxDistance
      const earthquakes = [q1, q2Close, q3At, q4Far];

      utils.calculateDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
        if (lat2 === 0.1) return 49.9; // q1-q2Close
        if (lat2 === 0.2) return 50.0; // q1-q3At
        if (lat2 === 0.3) return 50.1; // q1-q4Far
        return 1000;
      });

      const clusters = findActiveClusters(earthquakes, 50, 2);
      expect(clusters.length).toBe(1);
      expect(clusters[0]).toEqual(expect.arrayContaining([q1, q2Close, q3At]));
      expect(clusters[0]).not.toContain(q4Far);
    });
  });

  describe('Data Integrity', () => {
    it('should not modify the original earthquake objects or array', () => {
      const q1 = createMockQuake('q1', 0, 0);
      const q2 = createMockQuake('q2', 0.1, 0.1);
      const earthquakes = [q1, q2];
      const originalEarthquakes = JSON.parse(JSON.stringify(earthquakes)); // Deep copy for comparison

      utils.calculateDistance.mockReturnValue(10);
      findActiveClusters(earthquakes, 100, 1);

      expect(earthquakes).toEqual(originalEarthquakes); // Check if original array and objects are unchanged
    });

    it('returned clusters should contain the correct earthquake objects', () => {
      const q1 = createMockQuake('q1', 0, 0, 6);
      const q2 = createMockQuake('q2', 0.1, 0.1, 5);
      const earthquakes = [q1, q2];
      utils.calculateDistance.mockReturnValue(10);

      const clusters = findActiveClusters(earthquakes, 100, 2);
      expect(clusters.length).toBe(1);
      expect(clusters[0].length).toBe(2);
      // Check if the objects in the cluster are the same instances
      expect(clusters[0].find(q => q.id === 'q1')).toBe(q1);
      expect(clusters[0].find(q => q.id === 'q2')).toBe(q2);
    });

    it('earthquakes should not appear in more than one cluster', () => {
      // This is implicitly tested by how processedQuakeIds works.
      // Create a scenario where a quake could potentially be added to two if logic was flawed.
      const q1 = createMockQuake('q1', 0, 0, 7);     // Cluster A seed
      const q2 = createMockQuake('q2', 0.1, 0.1, 6); // Close to q1
      const q3 = createMockQuake('q3', 0.2, 0.2, 5); // Close to q1 and q2 (could be seed for B if q2 was seed)
      const earthquakes = [q1, q2, q3];

      utils.calculateDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
        if (lat1 === 0 && lon1 === 0) { // From q1
          if (lat2 === 0.1) return 10; // q1-q2
          if (lat2 === 0.2) return 20; // q1-q3
        }
        if (lat1 === 0.1 && lon1 === 0.1) { // From q2
           if (lat2 === 0.2) return 10; // q2-q3
        }
        return 1000;
      });

      const clusters = findActiveClusters(earthquakes, 50, 2);
      expect(clusters.length).toBe(1); // Only one cluster should form around q1
      expect(clusters[0].length).toBe(3);
      expect(clusters[0]).toEqual(expect.arrayContaining([q1, q2, q3]));

      const allClusteredQuakes = clusters.flat();
      const uniqueClusteredQuakes = new Set(allClusteredQuakes.map(q => q.id));
      expect(allClusteredQuakes.length).toBe(uniqueClusteredQuakes.size);
    });
  });

  describe('Quake Properties', () => {
    it('should handle earthquakes with missing or null properties.mag for sorting', () => {
      const q1 = createMockQuake('q1', 0, 0, 6);
      const q2WithNullMag = createMockQuake('q2', 0.1, 0.1, null);
      const q3WithUndefinedMag = createMockQuake('q3', 10, 10, undefined);
      q3WithUndefinedMag.properties.mag = undefined; // More explicit
      const q4 = createMockQuake('q4', 0.2, 0.2, 5);
      const earthquakes = [q1, q2WithNullMag, q3WithUndefinedMag, q4];

      utils.calculateDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
        if (lat1 === 0 && lon1 === 0) { // From q1
            if (lat2 === 0.1) return 10; // q1-q2WithNullMag
            if (lat2 === 0.2) return 10; // q1-q4
        }
        return 1000;
      });

      // Expect no errors during sorting due to null/undefined mag
      // q1 (6) should be first seed, then q4 (5), then q2/q3 (0)
      expect(() => findActiveClusters(earthquakes, 50, 2)).not.toThrow();
      const clusters = findActiveClusters(earthquakes, 50, 2);
      // q1 forms cluster with q2 (null mag) and q4 (mag 5)
      expect(clusters.length).toBe(1);
      expect(clusters[0]).toEqual(expect.arrayContaining([q1, q2WithNullMag, q4]));
      expect(clusters[0].length).toBe(3);
    });

    it('should handle earthquakes with identical IDs (first one processed wins)', () => {
      // The Set `processedQuakeIds` handles this naturally.
      const q1a = createMockQuake('q1', 0, 0, 6);
      const q1b = createMockQuake('q1', 0.1, 0.1, 5); // Same ID as q1a
      const q2 = createMockQuake('q2', 0.2, 0.2, 4); // Close to q1a
      const earthquakes = [q1a, q1b, q2];

      utils.calculateDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
        if (lat1 === 0 && lon1 === 0) { // From q1a
          if (lat2 === 0.1) return 10; // q1a to q1b (ignored due to same ID if q1a is seed, or processedId)
          if (lat2 === 0.2) return 20; // q1a to q2
        }
        return 1000;
      });

      const clusters = findActiveClusters(earthquakes, 50, 2);
      // q1a is stronger, will be processed first. It will cluster with q2.
      // q1b will be skipped because its ID 'q1' is already in processedQuakeIds.
      expect(clusters.length).toBe(1);
      expect(clusters[0]).toEqual(expect.arrayContaining([q1a, q2]));
      expect(clusters[0].length).toBe(2);
      expect(clusters[0].find(q => q.id === 'q1')).toBe(q1a); // Ensure it's q1a, not q1b
    });
  });
});
