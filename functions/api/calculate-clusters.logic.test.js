import { findActiveClustersOptimized } from './calculate-clusters.POST.js';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Helper to create mock quake for findActiveClustersOptimized tests
const createMockQuake = (id, mag, lat, lon, time = Date.now()) => ({
  id,
  properties: { mag, time },
  geometry: { coordinates: [lon, lat, 0] }, // Assuming depth is 0 or not used by findActiveClustersOptimized distance calc
});

// PERFORMANCE REVIEW NEEDED for findActiveClustersOptimized in './calculate-clusters.js':
// The function's core clustering logic involves:
// 1. Sorting earthquakes (typically by magnitude).
// 2. An outer loop iterating through each earthquake as a potential 'baseQuake' for a new cluster.
// 3. An inner loop that iterates through remaining earthquakes ('otherQuake') to compare with the 'baseQuake'.
// 4. A distance calculation (e.g., Haversine) performed for many pairs within the inner loop.
//
// This structure can lead to O(n^2) complexity in the worst-case scenario with 'n'
// being the number of earthquakes, particularly due to the nested iteration and
// repeated distance calculations.
//
// Potential areas for performance degradation with large datasets (e.g., >10k events):
// - Time taken by the nested loops and pairwise distance calculations.
// - Memory usage if intermediate arrays or cluster structures become very large.
//
// Recommendations:
// - Profile `findActiveClustersOptimized` with realistic large datasets to identify actual bottlenecks.
// - Consider optimizations if performance is an issue:
//   - Spatial indexing (e.g., k-d trees, quadtrees) to speed up finding nearby quakes,
//     reducing the need for pairwise distance checks against all remaining points.
//   - Exploring more optimized clustering algorithms if the current greedy approach proves too slow.
//   - Optimizing the `calculateDistance` function itself, though the main concern is usually
//     the number of times it's called.
describe('findActiveClustersOptimized (internal)', () => {
  let localConsoleWarnSpy;

  beforeEach(() => {
    localConsoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    localConsoleWarnSpy.mockRestore();
  });

  it('should return an empty array if no earthquakes are provided', () => {
    const clusters = findActiveClustersOptimized([], 100, 2);
    expect(clusters).toEqual([]);
  });

  it('should return an empty array if no clusters meet minQuakes criteria', () => {
    const quakes = [
      createMockQuake('q1', 5, 10, 20),
      createMockQuake('q2', 4, 10.1, 20.1),
    ];
    const clusters = findActiveClustersOptimized(quakes, 20, 3);
    expect(clusters).toEqual([]);
  });

  it('should form a single cluster if quakes are close enough and meet minQuakes', () => {
    const q1 = createMockQuake('q1', 5, 10, 20);
    const q2 = createMockQuake('q2', 4, 10.01, 20.01);
    const q3 = createMockQuake('q3', 3, 10.02, 20.02);
    const quakes = [q1, q2, q3];
    const clusters = findActiveClustersOptimized(quakes, 5, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0]).toEqual(expect.arrayContaining([q1, q2, q3]));
    expect(clusters[0].length).toBe(3);
  });

  it('should form multiple distinct clusters', () => {
    const qA1 = createMockQuake('qA1', 5, 10, 20);
    const qA2 = createMockQuake('qA2', 4.8, 10.01, 20.01);
    const qB1 = createMockQuake('qB1', 5.5, 30, 50);
    const qB2 = createMockQuake('qB2', 5.2, 30.01, 50.01);
    const qNoise = createMockQuake('qNoise', 3, 0, 0);
    const quakes = [qA1, qA2, qB1, qB2, qNoise];
    const clusters = findActiveClustersOptimized(quakes, 5, 2);
    expect(clusters.length).toBe(2);
    const clusterA = clusters.find(c => c.some(q => q.id === 'qA1'));
    expect(clusterA).toEqual(expect.arrayContaining([qA1, qA2]));
    const clusterB = clusters.find(c => c.some(q => q.id === 'qB1'));
    expect(clusterB).toEqual(expect.arrayContaining([qB1, qB2]));
    expect(clusters.every(c => !c.some(q => q.id === 'qNoise'))).toBe(true);
  });

  it('should handle earthquakes being used in only one cluster (desc mag sort behavior)', () => {
    const q_strongest = createMockQuake('q_strongest', 6, 0, 0);
    const q_close_to_strongest = createMockQuake('q_close_to_strongest', 3, 0.01, 0.01);
    const q_middle = createMockQuake('q_middle', 4, 0.02, 0.02);
    const quakes = [q_middle, q_strongest, q_close_to_strongest]; // Note: order changed to test sorting
    const clusters = findActiveClustersOptimized(quakes, 2, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0]).toEqual(expect.arrayContaining([q_strongest, q_close_to_strongest]));
    expect(clusters[0].some(q => q.id === 'q_middle')).toBe(false);
  });

  it('should not add quakes to a cluster if distance is greater than maxDistanceKm', () => {
    const q1 = createMockQuake('q1', 5, 10, 20);
    const q2 = createMockQuake('q2', 4, 10.01, 20.01); // Approx 1.5km away
    const q3 = createMockQuake('q3', 3, 12, 22); // Approx 300km away
    const quakes = [q1, q2, q3];
    const clusters = findActiveClustersOptimized(quakes, 2, 2); // Max distance 2km
    expect(clusters.length).toBe(1);
    expect(clusters[0]).toEqual(expect.arrayContaining([q1, q2]));
    expect(clusters[0].some(q => q.id === 'q3')).toBe(false);
  });

  it('should handle null or undefined quake objects gracefully (skips them, no warning in this version)', () => {
    const validQuake = createMockQuake('q1', 5, 10, 20);
    const quakes = [ validQuake, null, undefined, createMockQuake('q2', 4, 10.01, 20.01)];
    const clusters = findActiveClustersOptimized(quakes, 5, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0]).toEqual(expect.arrayContaining([validQuake, quakes[3]])); // quakes[3] is the second valid quake
    expect(localConsoleWarnSpy).not.toHaveBeenCalledWith("Skipping invalid quake object: null or undefined");
  });

  it('should handle quakes missing the id property (logs warning and skips)', () => {
    const validQuake = createMockQuake('q1', 5, 10, 20);
    const quakeMissingId = { properties: { mag: 4 }, geometry: { coordinates: [20.01, 10.01, 0] } };
    const quakes = [validQuake, quakeMissingId, createMockQuake('q2', 3, 10.02, 20.02)];
    const clusters = findActiveClustersOptimized(quakes, 5, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0].some(q => q.id === 'q1')).toBe(true);
    expect(clusters[0].some(q => q.id === 'q2')).toBe(true);
    expect(localConsoleWarnSpy).toHaveBeenCalledWith("Skipping quake with missing ID or invalid object in findActiveClustersOptimized.");
  });

  it('should handle quakes missing the geometry property (logs invalid coords)', () => {
    const validQuake = createMockQuake('q1', 5, 10, 20);
    const quakeMissingGeometry = { id: 'qInvalidGeo', properties: { mag: 4 } };
    const quakes = [validQuake, quakeMissingGeometry, createMockQuake('q2', 3, 10.01, 20.01)];
    const clusters = findActiveClustersOptimized(quakes, 5, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0].some(q => q.id === 'q1')).toBe(true);
    expect(clusters[0].some(q => q.id === 'q2')).toBe(true);
    expect(localConsoleWarnSpy).toHaveBeenCalledWith(`Skipping quake ${quakeMissingGeometry.id} due to invalid coordinates in findActiveClustersOptimized.`);
  });

  it('should handle quakes with invalid geometry.coordinates (not an array)', () => {
    const validQuake = createMockQuake('q1', 5, 10, 20);
    const quakeInvalidCoords = createMockQuake('qInvCoords1', 4, 0, 0);
    quakeInvalidCoords.geometry.coordinates = "not-an-array";
    const quakes = [validQuake, quakeInvalidCoords, createMockQuake('q2', 3, 10.01, 20.01)];
    const clusters = findActiveClustersOptimized(quakes, 5, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0].some(q => q.id === 'q1')).toBe(true);
    expect(clusters[0].some(q => q.id === 'q2')).toBe(true);
    expect(localConsoleWarnSpy).toHaveBeenCalledWith(`Skipping quake ${quakeInvalidCoords.id} due to invalid coordinates in findActiveClustersOptimized.`);
  });

  it('should handle quakes with invalid geometry.coordinates (less than 2 elements)', () => {
    const validQuake = createMockQuake('q1', 5, 10, 20);
    const quakeInvalidCoordsShort = createMockQuake('qInvCoords2', 4, 0, 0);
    quakeInvalidCoordsShort.geometry.coordinates = [10];
    const quakes = [validQuake, quakeInvalidCoordsShort, createMockQuake('q2', 3, 10.01, 20.01)];
    const clusters = findActiveClustersOptimized(quakes, 5, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0].some(q => q.id === 'q1')).toBe(true);
    expect(clusters[0].some(q => q.id === 'q2')).toBe(true);
    expect(localConsoleWarnSpy).toHaveBeenCalledWith(`Skipping quake ${quakeInvalidCoordsShort.id} due to invalid coordinates in findActiveClustersOptimized.`);
  });

  it('should correctly process valid quakes mixed with various invalid ones', () => {
    const qA1 = createMockQuake('qA1', 6, 40, -120);
    const qA2 = createMockQuake('qA2', 5.5, 40.01, -120.01);
    const qB_valid_isolated = createMockQuake('qB_iso', 5, 50, -100);
    const malformedQuakesSource = [
      null,
      undefined,
      { properties: { mag: 5 }, geometry: { coordinates: [1, 1] } }, // Missing id
      { id: 'm_no_geom', properties: { mag: 5 } },
      { id: 'm_bad_coords1', properties: { mag: 5 }, geometry: { coordinates: "invalid" } },
      { id: 'm_bad_coords2', properties: { mag: 5 }, geometry: { coordinates: [1] } },
    ];
    const quakes = [
      malformedQuakesSource[0], qA1, malformedQuakesSource[1], qA2, malformedQuakesSource[2],
      qB_valid_isolated, malformedQuakesSource[3], malformedQuakesSource[4], malformedQuakesSource[5]
    ];
    const clusters = findActiveClustersOptimized(quakes, 5, 2); // maxDist 5km, minQuakes 2
    expect(clusters.length).toBe(1); // Only qA1 and qA2 should form a cluster
    expect(clusters[0]).toEqual(expect.arrayContaining([qA1, qA2]));
    expect(clusters[0].some(q => q.id === 'qB_iso')).toBe(false); // qB_iso is too far or alone

    // Outer loop warnings (for baseQuake):
    // These are generated when an invalid quake is first encountered as a potential `baseQuake`.
    // - malformedQuakesSource[2] (missing id) -> 1 warning
    // - malformedQuakesSource[3] (m_no_geom) -> 1 warning
    // - malformedQuakesSource[4] (m_bad_coords1) -> 1 warning
    // - malformedQuakesSource[5] (m_bad_coords2) -> 1 warning
    // Total outer loop warnings = 4.
    expect(localConsoleWarnSpy).toHaveBeenCalledWith("Skipping quake with missing ID or invalid object in findActiveClustersOptimized."); // For malformedQuakesSource[2]
    expect(localConsoleWarnSpy).toHaveBeenCalledWith(`Skipping quake ${malformedQuakesSource[3].id} due to invalid coordinates in findActiveClustersOptimized.`);
    expect(localConsoleWarnSpy).toHaveBeenCalledWith(`Skipping quake ${malformedQuakesSource[4].id} due to invalid coordinates in findActiveClustersOptimized.`);
    expect(localConsoleWarnSpy).toHaveBeenCalledWith(`Skipping quake ${malformedQuakesSource[5].id} due to invalid coordinates in findActiveClustersOptimized.`);

    // Inner loop warnings (for otherQuake):
    // These occur when a *valid* `baseQuake` is being processed, and it encounters an invalid `otherQuake`.
    // Valid baseQuakes in order of processing (due to magnitude sort then original order for ties): qA1, qB_valid_isolated.
    // qA2 is processed with qA1 and added to processedQuakeIds, so it won't be a baseQuake for inner loop warning generation against malformed items.
    //
    // 1. When `qA1` is baseQuake:
    //    - Compares with malformedQuakesSource[2] (missing id) -> 1 "Skipping potential cluster member with missing ID..."
    //    - Compares with malformedQuakesSource[3] (m_no_geom) -> 1 "Skipping potential cluster member m_no_geom due to invalid coordinates."
    //    - Compares with malformedQuakesSource[4] (m_bad_coords1) -> 1 "Skipping potential cluster member m_bad_coords1 due to invalid coordinates."
    //    - Compares with malformedQuakesSource[5] (m_bad_coords2) -> 1 "Skipping potential cluster member m_bad_coords2 due to invalid coordinates."
    //    Total for qA1 as base = 4 warnings.
    //
    // 2. When `qB_valid_isolated` is baseQuake (it's processed after qA1/qA2 cluster is formed):
    //    - It will also iterate through the malformed quakes that were not part of any cluster yet.
    //    - Compares with malformedQuakesSource[2] -> 1 warning
    //    - Compares with malformedQuakesSource[3] -> 1 warning
    //    - Compares with malformedQuakesSource[4] -> 1 warning
    //    - Compares with malformedQuakesSource[5] -> 1 warning
    //    Total for qB_valid_isolated as base = 4 warnings.
    //
    // Total inner loop warnings = 4 (from qA1) + 4 (from qB_valid_isolated) = 8.
    // Total warnings = 4 (outer) + 8 (inner) = 12.
    expect(localConsoleWarnSpy).toHaveBeenCalledTimes(12);
    // More specific checks for inner loop if needed:
    expect(localConsoleWarnSpy).toHaveBeenCalledWith("Skipping potential cluster member with missing ID or invalid object.");
    expect(localConsoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`Skipping potential cluster member m_no_geom due to invalid coordinates.`));
  });
});
