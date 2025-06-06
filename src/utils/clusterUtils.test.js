import { describe, it, expect, vi } from 'vitest';
import { findActiveClusters } from './clusterUtils';
import { calculateDistance } from './utils'; // Path to the actual utils

// Mock the calculateDistance function
vi.mock('./utils', () => ({
  calculateDistance: vi.fn(),
}));

// Helper function to create mock earthquake objects
const createMockQuake = (id, mag, lat, lon, time = Date.now()) => ({
  id,
  properties: { mag, time },
  geometry: { coordinates: [lon, lat, 0] }, // lon, lat, depth
});

describe('findActiveClusters', () => {
  beforeEach(() => {
    // Reset mocks before each test
    calculateDistance.mockReset();
  });

  it('should return an empty array if no earthquakes are provided', () => {
    const clusters = findActiveClusters([], 100, 2);
    expect(clusters).toEqual([]);
  });

  it('should return an empty array if no clusters meet minQuakes criteria', () => {
    const quakes = [
      createMockQuake('q1', 5, 10, 20),
      createMockQuake('q2', 4, 10.1, 20.1),
    ];
    calculateDistance.mockReturnValue(10); // All within distance
    const clusters = findActiveClusters(quakes, 20, 3); // minQuakes is 3
    expect(clusters).toEqual([]);
  });

  it('should form a single cluster if quakes are close enough and meet minQuakes', () => {
    const q1 = createMockQuake('q1', 5, 10, 20);
    const q2 = createMockQuake('q2', 4, 10.1, 20.1);
    const q3 = createMockQuake('q3', 3, 10.2, 20.2);
    const quakes = [q1, q2, q3];

    // q1 to q2, q1 to q3
    calculateDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
      if ((lat1 === 10 && lon1 === 20 && lat2 === 10.1 && lon2 === 20.1) || (lat1 === 10.1 && lon1 === 20.1 && lat2 === 10 && lon2 === 20)) return 5; // q1-q2
      if ((lat1 === 10 && lon1 === 20 && lat2 === 10.2 && lon2 === 20.2) || (lat1 === 10.2 && lon1 === 20.2 && lat2 === 10 && lon2 === 20)) return 10; // q1-q3
      return 1000; // Other distances are large
    });

    const clusters = findActiveClusters(quakes, 15, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0]).toEqual(expect.arrayContaining([q1, q2, q3]));
    expect(clusters[0].length).toBe(3);
  });

  it('should form multiple distinct clusters', () => {
    const q1 = createMockQuake('q1', 5, 10, 20); // Cluster A
    const q2 = createMockQuake('q2', 4.8, 10.1, 20.1); // Cluster A
    const q3 = createMockQuake('q3', 5.5, 30, 50); // Cluster B
    const q4 = createMockQuake('q4', 5.2, 30.1, 50.1); // Cluster B
    const q5 = createMockQuake('q5', 3, 0, 0); // Noise, not part of any cluster

    const quakes = [q1, q2, q3, q4, q5]; // Order might matter due to sorting, ensure test handles it

    calculateDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
      // Cluster A (around q1 or q3 depending on sorting - test assumes q3 is base for its cluster due to mag)
      if (lat1 === 10 && lon1 === 20 && lat2 === 10.1 && lon2 === 20.1) return 5; // q1-q2
      if (lat1 === 10.1 && lon1 === 20.1 && lat2 === 10 && lon2 === 20) return 5; // q2-q1

      // Cluster B (around q3 or q1 - test assumes q1 is base for its cluster)
      if (lat1 === 30 && lon1 === 50 && lat2 === 30.1 && lon2 === 50.1) return 5; // q3-q4
      if (lat1 === 30.1 && lon1 === 50.1 && lat2 === 30 && lon2 === 50) return 5; // q4-q3

      return 1000; // All other pairings are distant
    });

    // Note: The implementation sorts by magnitude. q3 (5.5) will be processed first.
    // Then q4 will be added to q3's cluster.
    // Then q1 (5.0) will be processed.
    // Then q2 will be added to q1's cluster.

    const clusters = findActiveClusters(quakes, 10, 2);
    expect(clusters.length).toBe(2);

    // Check for cluster around q3, q4
    const clusterB = clusters.find(c => c.some(q => q.id === 'q3'));
    expect(clusterB).toBeDefined();
    expect(clusterB).toEqual(expect.arrayContaining([q3, q4]));
    expect(clusterB.length).toBe(2);

    // Check for cluster around q1, q2
    const clusterA = clusters.find(c => c.some(q => q.id === 'q1'));
    expect(clusterA).toBeDefined();
    expect(clusterA).toEqual(expect.arrayContaining([q1, q2]));
    expect(clusterA.length).toBe(2);

    // Ensure q5 is not in any cluster
    expect(clusters.every(c => !c.some(q => q.id === 'q5'))).toBe(true);
  });

  it('should handle earthquakes being used in only one cluster (desc mag sort behavior)', () => {
    // q_strongest should attract q_close_to_strongest
    // q_middle should not be able to claim q_close_to_strongest if q_strongest already did
    const q_strongest = createMockQuake('q_strongest', 6, 0, 0);
    const q_close_to_strongest = createMockQuake('q_close_to_strongest', 3, 0.1, 0.1);
    const q_middle = createMockQuake('q_middle', 4, 0.15, 0.15); // Also close to q_close_to_strongest

    const quakes = [q_middle, q_strongest, q_close_to_strongest]; // Intentionally not sorted by mag

    calculateDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
      // q_strongest to q_close_to_strongest
      if ((lat1 === 0 && lon1 === 0 && lat2 === 0.1 && lon2 === 0.1) || (lat1 === 0.1 && lon1 === 0.1 && lat2 === 0 && lon2 === 0)) return 5;
      // q_middle to q_close_to_strongest
      if ((lat1 === 0.15 && lon1 === 0.15 && lat2 === 0.1 && lon2 === 0.1) || (lat1 === 0.1 && lon1 === 0.1 && lat2 === 0.15 && lon2 === 0.15)) return 2;
      // q_strongest to q_middle (further away)
      if ((lat1 === 0 && lon1 === 0 && lat2 === 0.15 && lon2 === 0.15) || (lat1 === 0.15 && lon1 === 0.15 && lat2 === 0 && lon2 === 0)) return 10;
      return 1000;
    });

    // sorted: q_strongest, q_middle, q_close_to_strongest
    // 1. q_strongest cluster:
    //    - checks q_middle: dist 10. Adds if maxDistanceKm >= 10
    //    - checks q_close_to_strongest: dist 5. Adds if maxDistanceKm >= 5
    // 2. q_middle (if not processed):
    //    - checks q_close_to_strongest (if not processed): dist 2.

    const clusters = findActiveClusters(quakes, 8, 2); // maxDistanceKm = 8
    // Expected: q_strongest processes first.
    // It will find q_close_to_strongest (dist 5, within 8km). Adds it.
    // It will not find q_middle (dist 10, not within 8km).
    // Cluster 1: [q_strongest, q_close_to_strongest]
    // Then q_middle is processed. It's alone. No new cluster.

    expect(clusters.length).toBe(1);
    expect(clusters[0]).toEqual(expect.arrayContaining([q_strongest, q_close_to_strongest]));
    expect(clusters[0].length).toBe(2);
    expect(clusters[0].some(q => q.id === 'q_middle')).toBe(false);
  });

  it('should not add quakes to a cluster if distance is greater than maxDistanceKm', () => {
    const q1 = createMockQuake('q1', 5, 10, 20);
    const q2 = createMockQuake('q2', 4, 10.1, 20.1); // Close
    const q3 = createMockQuake('q3', 3, 12, 22);   // Far

    const quakes = [q1, q2, q3];
    calculateDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
      if ((lat1 === 10 && lon1 === 20 && lat2 === 10.1 && lon2 === 20.1)) return 5; // q1-q2
      if ((lat1 === 10 && lon1 === 20 && lat2 === 12 && lon2 === 22)) return 50;    // q1-q3
      return 1000;
    });

    const clusters = findActiveClusters(quakes, 10, 2); // maxDistanceKm = 10
    expect(clusters.length).toBe(1);
    expect(clusters[0]).toEqual(expect.arrayContaining([q1, q2]));
    expect(clusters[0].length).toBe(2);
    expect(clusters[0].some(q => q.id === 'q3')).toBe(false);
  });
});
