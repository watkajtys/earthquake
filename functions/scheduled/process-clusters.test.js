import { describe, it, expect } from 'vitest';
import { calculateDistance, findActiveClusters } from './process-clusters.js';

describe('calculateDistance', () => {
  it('should return 0 for the same point', () => {
    expect(calculateDistance(0, 0, 0, 0)).toBe(0);
  });

  it('should calculate distance correctly for known points (approx)', () => {
    // Paris to London (approx 344km)
    const lat1 = 48.8566; // Paris
    const lon1 = 2.3522;
    const lat2 = 51.5074; // London
    const lon2 = 0.1278;
    const distance = calculateDistance(lat1, lon1, lat2, lon2);
    // Adjusted assertion for Paris to London (approx 334.57km with these coords/formula)
    expect(distance).toBeGreaterThan(330);
    expect(distance).toBeLessThan(340);
  });

  it('should handle negative coordinates', () => {
    const lat1 = -33.8688; // Sydney
    const lon1 = 151.2093;
    const lat2 = -34.6037; // Buenos Aires
    const lon2 = -58.3816;
    // Approx 11800 km, just checking it computes without error and gives a large number
    expect(calculateDistance(lat1, lon1, lat2, lon2)).toBeGreaterThan(10000);
  });
});

describe('findActiveClusters', () => {
  const createMockEarthquake = (id, time, mag, lon, lat) => ({
    id,
    properties: { time, mag, place: `Place ${id}` },
    geometry: { coordinates: [lon, lat, 10] }, // depth 10
  });

  it('should return an empty array if no earthquakes are provided', () => {
    const clusters = findActiveClusters([], 100, 3);
    expect(clusters).toEqual([]);
  });

  it('should not form a cluster if minQuakes is not met', () => {
    const earthquakes = [
      createMockEarthquake('eq1', Date.now(), 3.0, 0, 0),
      createMockEarthquake('eq2', Date.now() - 1000, 3.5, 0.1, 0.1), // ~15km
    ];
    const clusters = findActiveClusters(earthquakes, 100, 3);
    expect(clusters).toEqual([]);
  });

  it('should not form a cluster if quakes are too far apart', () => {
    const earthquakes = [
      createMockEarthquake('eq1', Date.now(), 3.0, 0, 0),
      createMockEarthquake('eq2', Date.now() - 1000, 3.5, 1, 1),     // ~150km
      createMockEarthquake('eq3', Date.now() - 2000, 3.2, 0.05, 0.05), // ~7km from eq1
    ];
    // eq1 and eq3 might be close, but eq2 is far from both.
    // If CLUSTER_MAX_DISTANCE_KM = 50, only eq1 & eq3 could potentially cluster, but need 3.
    const clusters = findActiveClusters(earthquakes, 50, 3);
    expect(clusters.length).toBe(0);
  });

  it('should form a single cluster if all quakes are close and meet minQuakes', () => {
    const earthquakes = [
      createMockEarthquake('eq1', Date.now(), 3.0, 0, 0),
      createMockEarthquake('eq2', Date.now() - 1000, 3.5, 0.1, 0.1), // ~15km
      createMockEarthquake('eq3', Date.now() - 2000, 3.2, 0.05, 0.05), // ~7km from eq1
    ];
    const clusters = findActiveClusters(earthquakes, 100, 3);
    expect(clusters.length).toBe(1);
    expect(clusters[0].length).toBe(3);
    // Test sorting by time (most recent first)
    expect(clusters[0][0].id).toBe('eq1');
    expect(clusters[0][1].id).toBe('eq2');
    expect(clusters[0][2].id).toBe('eq3');
  });

  it('should form multiple distinct clusters', () => {
    const earthquakes = [
      // Cluster 1
      createMockEarthquake('c1_eq1', Date.now(), 3.0, 0, 0),
      createMockEarthquake('c1_eq2', Date.now() - 100, 3.1, 0.1, 0.1),
      createMockEarthquake('c1_eq3', Date.now() - 200, 3.2, 0.05, 0.05),
      // Cluster 2 (far from Cluster 1)
      createMockEarthquake('c2_eq1', Date.now() - 5000, 4.0, 10, 10),
      createMockEarthquake('c2_eq2', Date.now() - 5100, 4.1, 10.1, 10.1),
      createMockEarthquake('c2_eq3', Date.now() - 5200, 4.2, 10.05, 10.05),
      // Noise quake (far from both)
      createMockEarthquake('noise1', Date.now() - 10000, 2.0, 20, 20),
    ];
    const clusters = findActiveClusters(earthquakes, 100, 3);
    expect(clusters.length).toBe(2);
    // Check contents (IDs are easiest to verify for correct grouping)
    const cluster1IDs = clusters.find(c => c.some(q => q.id === 'c1_eq1')).map(q => q.id).sort();
    const cluster2IDs = clusters.find(c => c.some(q => q.id === 'c2_eq1')).map(q => q.id).sort();

    expect(cluster1IDs).toEqual(['c1_eq1', 'c1_eq2', 'c1_eq3'].sort());
    expect(cluster2IDs).toEqual(['c2_eq1', 'c2_eq2', 'c2_eq3'].sort());
  });

  it('should handle earthquakes with null or invalid geometry gracefully', () => {
    const earthquakes = [
      createMockEarthquake('eq1', Date.now(), 3.0, 0, 0),
      { id: 'eq2_bad_geom', properties: { time: Date.now() -1000, mag: 3.5, place: 'Bad Place' }, geometry: null },
      createMockEarthquake('eq3', Date.now() - 2000, 3.2, 0.05, 0.05),
      { id: 'eq4_bad_coords', properties: { time: Date.now() -3000, mag: 3.8, place: 'Bad Coords' }, geometry: { coordinates: [null, null, 10]} },
      createMockEarthquake('eq5', Date.now() - 4000, 3.2, 0.08, 0.08),
    ];
    // Expect eq1, eq3, eq5 to form a cluster. eq2 and eq4 should be skipped.
    const clusters = findActiveClusters(earthquakes, 100, 3);
    expect(clusters.length).toBe(1);
    expect(clusters[0].length).toBe(3);
    const clusterIDs = clusters[0].map(q => q.id).sort();
    expect(clusterIDs).toEqual(['eq1', 'eq3', 'eq5'].sort());
  });

  it('should correctly cluster based on maxDistanceKm exactly', () => {
    const d = 0.899; // Approx 99.9km when lat is 0, lon is d
    const earthquakes = [
      createMockEarthquake('eqA', Date.now(), 3.0, 0, 0),
      createMockEarthquake('eqB', Date.now() - 100, 3.1, d, 0), // Should be just within 100km
      createMockEarthquake('eqC', Date.now() - 200, 3.2, 0, d), // Should be just within 100km
    ];
    let clusters = findActiveClusters(earthquakes, 99.8, 3); // Max distance too small
    expect(clusters.length).toBe(0);

    clusters = findActiveClusters(earthquakes, 100.0, 3); // Max distance just enough
    expect(clusters.length).toBe(1);
    expect(clusters[0].length).toBe(3);
  });
});
