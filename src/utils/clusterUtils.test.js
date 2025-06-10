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
    vi.spyOn(console, 'warn').mockImplementation(() => {}); // Mock console.warn
  });

  afterEach(() => {
    console.warn.mockRestore(); // Restore original console.warn
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

    calculateDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
      if ((lat1 === 10 && lon1 === 20 && lat2 === 10.1 && lon2 === 20.1) || (lat1 === 10.1 && lon1 === 20.1 && lat2 === 10 && lon2 === 20)) return 5;
      if ((lat1 === 10 && lon1 === 20 && lat2 === 10.2 && lon2 === 20.2) || (lat1 === 10.2 && lon1 === 20.2 && lat2 === 10 && lon2 === 20)) return 10;
      return 1000;
    });

    const clusters = findActiveClusters(quakes, 15, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0]).toEqual(expect.arrayContaining([q1, q2, q3]));
    expect(clusters[0].length).toBe(3);
  });

  it('should form multiple distinct clusters', () => {
    const q1 = createMockQuake('q1', 5, 10, 20);
    const q2 = createMockQuake('q2', 4.8, 10.1, 20.1);
    const q3 = createMockQuake('q3', 5.5, 30, 50);
    const q4 = createMockQuake('q4', 5.2, 30.1, 50.1);
    const q5 = createMockQuake('q5', 3, 0, 0);
    const quakes = [q1, q2, q3, q4, q5];

    calculateDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
      if (lat1 === 10 && lon1 === 20 && lat2 === 10.1 && lon2 === 20.1) return 5;
      if (lat1 === 10.1 && lon1 === 20.1 && lat2 === 10 && lon2 === 20) return 5;
      if (lat1 === 30 && lon1 === 50 && lat2 === 30.1 && lon2 === 50.1) return 5;
      if (lat1 === 30.1 && lon1 === 50.1 && lat2 === 30 && lon2 === 50) return 5;
      return 1000;
    });

    const clusters = findActiveClusters(quakes, 10, 2);
    expect(clusters.length).toBe(2);
    const clusterB = clusters.find(c => c.some(q => q.id === 'q3'));
    expect(clusterB).toBeDefined();
    expect(clusterB).toEqual(expect.arrayContaining([q3, q4]));
    expect(clusterB.length).toBe(2);
    const clusterA = clusters.find(c => c.some(q => q.id === 'q1'));
    expect(clusterA).toBeDefined();
    expect(clusterA).toEqual(expect.arrayContaining([q1, q2]));
    expect(clusterA.length).toBe(2);
    expect(clusters.every(c => !c.some(q => q.id === 'q5'))).toBe(true);
  });

  it('should handle earthquakes being used in only one cluster (desc mag sort behavior)', () => {
    const q_strongest = createMockQuake('q_strongest', 6, 0, 0);
    const q_close_to_strongest = createMockQuake('q_close_to_strongest', 3, 0.1, 0.1);
    const q_middle = createMockQuake('q_middle', 4, 0.15, 0.15);
    const quakes = [q_middle, q_strongest, q_close_to_strongest];

    calculateDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
      if ((lat1 === 0 && lon1 === 0 && lat2 === 0.1 && lon2 === 0.1) || (lat1 === 0.1 && lon1 === 0.1 && lat2 === 0 && lon2 === 0)) return 5;
      if ((lat1 === 0.15 && lon1 === 0.15 && lat2 === 0.1 && lon2 === 0.1) || (lat1 === 0.1 && lon1 === 0.1 && lat2 === 0.15 && lon2 === 0.15)) return 2;
      if ((lat1 === 0 && lon1 === 0 && lat2 === 0.15 && lon2 === 0.15) || (lat1 === 0.15 && lon1 === 0.15 && lat2 === 0 && lon2 === 0)) return 10;
      return 1000;
    });

    const clusters = findActiveClusters(quakes, 8, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0]).toEqual(expect.arrayContaining([q_strongest, q_close_to_strongest]));
    expect(clusters[0].length).toBe(2);
    expect(clusters[0].some(q => q.id === 'q_middle')).toBe(false);
  });

  it('should not add quakes to a cluster if distance is greater than maxDistanceKm', () => {
    const q1 = createMockQuake('q1', 5, 10, 20);
    const q2 = createMockQuake('q2', 4, 10.1, 20.1);
    const q3 = createMockQuake('q3', 3, 12, 22);
    const quakes = [q1, q2, q3];

    calculateDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
      if ((lat1 === 10 && lon1 === 20 && lat2 === 10.1 && lon2 === 20.1)) return 5;
      if ((lat1 === 10 && lon1 === 20 && lat2 === 12 && lon2 === 22)) return 50;
      return 1000;
    });

    const clusters = findActiveClusters(quakes, 10, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0]).toEqual(expect.arrayContaining([q1, q2]));
    expect(clusters[0].length).toBe(2);
    expect(clusters[0].some(q => q.id === 'q3')).toBe(false);
  });

  // --- Tests for malformed quake objects ---
  it('should handle null or undefined quake objects gracefully', () => {
    const validQuake = createMockQuake('q1', 5, 10, 20);
    const quakes = [
      validQuake,
      null,
      undefined,
      createMockQuake('q2', 4, 10.1, 20.1), // This is quakes[3]
    ];
    calculateDistance.mockReturnValue(5);

    const clusters = findActiveClusters(quakes, 10, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0]).toEqual(expect.arrayContaining([validQuake, quakes[3]]));
    expect(console.warn).toHaveBeenCalledWith("Skipping invalid quake object: null or undefined");
    expect(console.warn).toHaveBeenCalledTimes(2); // For null and for undefined
  });

  it('should handle quakes missing the id property (logs warning and skips)', () => {
    const validQuake = createMockQuake('q1', 5, 10, 20);
    const quakeMissingId = { properties: { mag: 4 }, geometry: { coordinates: [20.1, 10.1, 0] } }; // No id
    const quakes = [validQuake, quakeMissingId, createMockQuake('q2', 3, 10.2, 20.2)];
    calculateDistance.mockReturnValue(5);

    const clusters = findActiveClusters(quakes, 10, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0].some(q => q.id === 'q1')).toBe(true);
    expect(clusters[0].some(q => q.id === 'q2')).toBe(true);
    expect(clusters[0].length).toBe(2);
    expect(console.warn).toHaveBeenCalledWith("Skipping quake with missing or empty id during clustering attempt.");
  });

  it('should handle quakes missing the geometry property (logs invalid coords)', () => {
    const validQuake = createMockQuake('q1', 5, 10, 20);
    const quakeMissingGeometry = { id: 'qInvalidGeo', properties: { mag: 4 } }; // No geometry
    const quakes = [validQuake, quakeMissingGeometry, createMockQuake('q2', 3, 10.1, 20.1)];
    calculateDistance.mockReturnValue(5);

    const clusters = findActiveClusters(quakes, 10, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0].some(q => q.id === 'q1')).toBe(true);
    expect(clusters[0].some(q => q.id === 'q2')).toBe(true);
    expect(clusters[0].length).toBe(2);
    expect(console.warn).toHaveBeenCalledWith(`Client: Skipping quake ${quakeMissingGeometry.id} due to invalid coordinates in findActiveClusters.`);
  });

  it('should handle quakes with invalid geometry.coordinates (not an array)', () => {
    const validQuake = createMockQuake('q1', 5, 10, 20);
    const quakeInvalidCoords = createMockQuake('qInvalidCoords', 4, 0, 0);
    quakeInvalidCoords.geometry.coordinates = "not-an-array";
    const quakes = [validQuake, quakeInvalidCoords, createMockQuake('q2', 3, 10.1, 20.1)];
    calculateDistance.mockReturnValue(5);

    const clusters = findActiveClusters(quakes, 10, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0].some(q => q.id === 'q1')).toBe(true);
    expect(clusters[0].some(q => q.id === 'q2')).toBe(true);
    expect(clusters[0].length).toBe(2);
    expect(console.warn).toHaveBeenCalledWith(`Client: Skipping quake ${quakeInvalidCoords.id} due to invalid coordinates in findActiveClusters.`);
  });

  it('should handle quakes with invalid geometry.coordinates (less than 2 elements)', () => {
    const validQuake = createMockQuake('q1', 5, 10, 20);
    const quakeInvalidCoordsShort = createMockQuake('qInvalidShort', 4, 0, 0);
    quakeInvalidCoordsShort.geometry.coordinates = [10]; // Only one element
    const quakes = [validQuake, quakeInvalidCoordsShort, createMockQuake('q2', 3, 10.1, 20.1)];
    calculateDistance.mockReturnValue(5);

    const clusters = findActiveClusters(quakes, 10, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0].some(q => q.id === 'q1')).toBe(true);
    expect(clusters[0].some(q => q.id === 'q2')).toBe(true);
    expect(clusters[0].length).toBe(2);
    expect(console.warn).toHaveBeenCalledWith(`Client: Skipping quake ${quakeInvalidCoordsShort.id} due to invalid coordinates in findActiveClusters.`);
  });

  it('should correctly process valid quakes even when mixed with many invalid ones', () => {
    const q1 = createMockQuake('qValid1', 6, 40, -120);
    const q2 = createMockQuake('qValid2', 5.5, 40.1, -120.1);
    const q3_valid_isolated = createMockQuake('qValid3Isolated', 5, 50, -100);

    const malformedQuakesSource = [
      null,
      undefined,
      { properties: { mag: 5 }, geometry: { coordinates: [1, 1] } }, // Missing id
      { id: 'm2_missing_geom', properties: { mag: 5 } },
      { id: 'm3_invalid_coords_str', properties: { mag: 5 }, geometry: { coordinates: "invalid" } },
      { id: 'm4_short_coords', properties: { mag: 5 }, geometry: { coordinates: [1] } },
    ];

    const quakes = [
      malformedQuakesSource[0], q1, malformedQuakesSource[1], q2, malformedQuakesSource[2],
      q3_valid_isolated, malformedQuakesSource[3], malformedQuakesSource[4], malformedQuakesSource[5]
    ];

    calculateDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
      if ((lat1 === 40 && lon1 === -120 && lat2 === 40.1 && lon2 === -120.1) ||
          (lat1 === 40.1 && lon1 === -120.1 && lat2 === 40 && lon2 === -120)) {
        return 10;
      }
      return 1000;
    });

    const clusters = findActiveClusters(quakes, 20, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0]).toEqual(expect.arrayContaining([q1, q2]));
    expect(clusters[0].length).toBe(2);
    expect(clusters[0].some(q => q.id === 'qValid3Isolated')).toBe(false);

    expect(console.warn).toHaveBeenCalledWith("Skipping invalid quake object: null or undefined"); // For null and undefined
    // Expected counts:
    // 2 for null/undefined from the initial filter.
    // 1 for the quake missing an id (`malformedQuakesSource[2]`) when it's the main `quake`.
    // 3 for invalid coordinates (m2_missing_geom, m3_invalid_coords_str, m4_short_coords).
    expect(console.warn).toHaveBeenCalledTimes(2 + 1 + 3);
    expect(console.warn).toHaveBeenCalledWith("Skipping quake with missing or empty id during clustering attempt."); // For malformedQuakesSource[2]
    expect(console.warn).toHaveBeenCalledWith(`Client: Skipping quake ${malformedQuakesSource[3].id} due to invalid coordinates in findActiveClusters.`); // m2_missing_geom
    expect(console.warn).toHaveBeenCalledWith(`Client: Skipping quake ${malformedQuakesSource[4].id} due to invalid coordinates in findActiveClusters.`);
    expect(console.warn).toHaveBeenCalledWith(`Client: Skipping quake ${malformedQuakesSource[5].id} due to invalid coordinates in findActiveClusters.`);
  });
});
