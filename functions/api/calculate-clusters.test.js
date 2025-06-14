import { onRequestPost, findActiveClusters } from './calculate-clusters';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Helper to create mock context for calculate-clusters
const createMockContext = (requestBody, envOverrides = {}) => {
  const mockDbInstance = {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    first: vi.fn(),
    run: vi.fn(),
  };

  return {
    request: {
      json: vi.fn().mockResolvedValue(requestBody),
    },
    env: {
      DB: mockDbInstance,
      ...envOverrides,
    },
  };
};

describe('onRequestPost in calculate-clusters.js', () => {
  let consoleErrorSpy;
  let consoleWarnSpy;

  const baseMockEarthquake = {
    id: 'q1',
    properties: { mag: 1, time: Date.now() },
    geometry: { coordinates: [0, 0, 0] }
  };

  const defaultRequestBody = {
    earthquakes: [baseMockEarthquake],
    maxDistanceKm: 100,
    minQuakes: 1,
    lastFetchTime: '2024-01-01T00:00:00Z',
    timeWindowHours: 24,
  };

  const getExpectedCacheKey = (params) => {
    const fullParams = {
      numQuakes: params.earthquakes?.length ?? 0,
      maxDistanceKm: params.maxDistanceKm,
      minQuakes: params.minQuakes,
      lastFetchTime: params.lastFetchTime,
      timeWindowHours: params.timeWindowHours,
    };
    return `clusters-${JSON.stringify(fullParams)}`;
  };

  const expectedDefaultCacheKey = getExpectedCacheKey(defaultRequestBody);


  beforeEach(() => {
    vi.resetAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('Input Validation', () => {
    it('should return 400 if earthquakes is not an array', async () => {
        const context = createMockContext({ ...defaultRequestBody, earthquakes: "not-an-array" });
        const response = await onRequestPost(context);
        expect(response.status).toBe(400);
        const json = await response.json();
        expect(json.error).toBe('Invalid earthquakes payload: not an array.');
    });

    it('should return 400 if earthquakes array is initially empty', async () => {
      const context = createMockContext({ ...defaultRequestBody, earthquakes: [] });
      const response = await onRequestPost(context);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Earthquakes array is empty, no clusters to calculate.');
    });

    it('should return 400 if maxDistanceKm is invalid', async () => {
      const context = createMockContext({ ...defaultRequestBody, maxDistanceKm: 0 });
      const response = await onRequestPost(context);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Invalid maxDistanceKm');
    });

    it('should return 400 if minQuakes is invalid', async () => {
      const context = createMockContext({ ...defaultRequestBody, minQuakes: 'invalid' });
      const response = await onRequestPost(context);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Invalid minQuakes');
    });

    const invalidEarthquakeTestCases = [
      { name: 'missing geometry', quake: { ...baseMockEarthquake, geometry: undefined }, message: /missing or invalid 'geometry' object/i },
      { name: 'null geometry', quake: { ...baseMockEarthquake, geometry: null }, message: /missing or invalid 'geometry' object/i },
      { name: 'geometry not an object', quake: { ...baseMockEarthquake, geometry: "string" }, message: /missing or invalid 'geometry' object/i },
      { name: 'missing coordinates', quake: { ...baseMockEarthquake, geometry: { coordinates: undefined } }, message: /'geometry.coordinates' must be an array/i },
      { name: 'coordinates not an array', quake: { ...baseMockEarthquake, geometry: { coordinates: "string" } }, message: /'geometry.coordinates' must be an array/i },
      { name: 'coordinates array too short', quake: { ...baseMockEarthquake, geometry: { coordinates: [0] } }, message: /'geometry.coordinates' must be an array of at least 2 numbers/i },
      { name: 'coordinates with non-number', quake: { ...baseMockEarthquake, geometry: { coordinates: [0, 'a'] } }, message: /'geometry.coordinates' must be an array of at least 2 numbers/i },
      { name: 'missing properties', quake: { ...baseMockEarthquake, properties: undefined }, message: /missing or invalid 'properties' object/i },
      { name: 'null properties', quake: { ...baseMockEarthquake, properties: null }, message: /missing or invalid 'properties' object/i },
      { name: 'properties not an object', quake: { ...baseMockEarthquake, properties: "string" }, message: /missing or invalid 'properties' object/i },
      { name: 'missing time', quake: { ...baseMockEarthquake, properties: { mag: 1, time: undefined } }, message: /'properties.time' must be a number/i },
      { name: 'time not a number', quake: { ...baseMockEarthquake, properties: { mag: 1, time: "string" } }, message: /'properties.time' must be a number/i },
      { name: 'missing id', quake: { ...baseMockEarthquake, id: undefined }, message: /missing 'id' property/i },
      { name: 'null id', quake: { ...baseMockEarthquake, id: null }, message: /missing 'id' property/i },
      { name: 'non-object in earthquakes array', quake: "string", message: /Invalid earthquake object at index 0/i}
    ];

    for (const tc of invalidEarthquakeTestCases) {
      it(`should return 400 for earthquake with ${tc.name}`, async () => {
        const context = createMockContext({ ...defaultRequestBody, earthquakes: [tc.quake] });
        const response = await onRequestPost(context);
        expect(response.status).toBe(400);
        const json = await response.json();
        expect(json.error).toMatch(tc.message);
      });
    }
  });

  describe('DB Availability and Operations', () => {
    it('should calculate clusters and return data if DB is not configured, with X-Cache-Info header', async () => {
      const context = createMockContext(defaultRequestBody, { DB: undefined });
      const response = await onRequestPost(context);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(Array.isArray(json)).toBe(true);
      expect(response.headers.get('X-Cache-Hit')).toBe('false');
      expect(response.headers.get('X-Cache-Info')).toBe('DB not configured');
      expect(consoleWarnSpy).toHaveBeenCalledWith("D1 Database (env.DB) not available. Proceeding without cache.");
    });

    it('should return cached data if valid entry exists in D1', async () => {
      const mockCachedClusterData = [{ id: 'cluster1', quakes: ['q1'] }];
      const context = createMockContext(defaultRequestBody);
      context.env.DB.first.mockResolvedValueOnce({ clusterData: JSON.stringify(mockCachedClusterData) });

      const response = await onRequestPost(context);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual(mockCachedClusterData);
      expect(response.headers.get('X-Cache-Hit')).toBe('true');
      expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("SELECT clusterData FROM ClusterCache"));
      expect(context.env.DB.bind).toHaveBeenCalledWith(expectedDefaultCacheKey);
      expect(context.env.DB.run).not.toHaveBeenCalled();
    });

    it('should calculate, store, and return data if cache miss (D1 returns null)', async () => {
      const context = createMockContext(defaultRequestBody);
      context.env.DB.first.mockResolvedValueOnce(null);
      context.env.DB.run.mockResolvedValueOnce({ success: true });

      const response = await onRequestPost(context);
      expect(response.status).toBe(200);
      const jsonResponse = await response.json();
      expect(Array.isArray(jsonResponse)).toBe(true);
      expect(response.headers.get('X-Cache-Hit')).toBe('false');

      expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("SELECT clusterData FROM ClusterCache"));
      expect(context.env.DB.bind).toHaveBeenCalledWith(expectedDefaultCacheKey);
      expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT OR REPLACE INTO ClusterCache"));
      expect(context.env.DB.bind).toHaveBeenCalledWith(expectedDefaultCacheKey, JSON.stringify(jsonResponse), JSON.stringify({
        numQuakes: defaultRequestBody.earthquakes.length,
        maxDistanceKm: defaultRequestBody.maxDistanceKm,
        minQuakes: defaultRequestBody.minQuakes,
        lastFetchTime: defaultRequestBody.lastFetchTime,
        timeWindowHours: defaultRequestBody.timeWindowHours
      }));
      expect(context.env.DB.run).toHaveBeenCalled();
    });

    it('should calculate, store, and return data if cached data is invalid JSON', async () => {
      const context = createMockContext(defaultRequestBody);
      context.env.DB.first.mockResolvedValueOnce({ clusterData: "invalid json" });
      context.env.DB.run.mockResolvedValueOnce({ success: true });

      const response = await onRequestPost(context);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(Array.isArray(json)).toBe(true);
      expect(response.headers.get('X-Cache-Hit')).toBe('false');
      expect(consoleErrorSpy).toHaveBeenCalledWith(`D1 Cache: Error parsing cached JSON for key ${expectedDefaultCacheKey}:`, expect.any(String));
      expect(context.env.DB.run).toHaveBeenCalled();
    });

    it('should calculate and return data if D1 GET (first()) throws an error, and still attempt PUT', async () => {
      const context = createMockContext(defaultRequestBody);
      const dbGetError = new Error('D1 SELECT failed');
      context.env.DB.first.mockRejectedValueOnce(dbGetError);
      context.env.DB.run.mockResolvedValueOnce({ success: true }); // Assume PUT is successful

      const response = await onRequestPost(context);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(Array.isArray(json)).toBe(true);
      expect(response.headers.get('X-Cache-Hit')).toBe('false');
      expect(consoleErrorSpy).toHaveBeenCalledWith(`D1 GET error for cacheKey ${expectedDefaultCacheKey}:`, dbGetError.message, dbGetError.cause);
      expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT OR REPLACE")); // Should still try to cache
      expect(context.env.DB.run).toHaveBeenCalled();
    });

    it('should calculate and return data if D1 PUT (run()) throws an error', async () => {
      const context = createMockContext(defaultRequestBody);
      context.env.DB.first.mockResolvedValueOnce(null); // Cache miss
      const dbPutError = new Error('D1 INSERT failed');
      context.env.DB.run.mockRejectedValueOnce(dbPutError);

      const response = await onRequestPost(context);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(Array.isArray(json)).toBe(true);
      expect(response.headers.get('X-Cache-Hit')).toBe('false');
      expect(consoleErrorSpy).toHaveBeenCalledWith(`D1 PUT error for cacheKey ${expectedDefaultCacheKey}:`, dbPutError.message, dbPutError.cause);
    });
  });

  describe('General Error Handling', () => {
    it('should handle syntax error in request JSON', async () => {
      const context = createMockContext(null);
      context.request.json.mockRejectedValueOnce(new SyntaxError("Unexpected token in JSON"));
      const response = await onRequestPost(context);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Invalid JSON payload');
      expect(json.details).toContain("Unexpected token in JSON");
    });

    it('should handle generic error during processing (e.g. in findActiveClusters due to unexpected data shape not caught by validation)', async () => {
      const context = createMockContext(defaultRequestBody);
      const prepareError = new Error("Catastrophic D1 prepare failure");
      context.env.DB.prepare.mockImplementation(() => { throw prepareError; });

      const response = await onRequestPost(context);
      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('Internal server error');
      expect(json.details).toBe(prepareError.message);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Unhandled error processing request:', prepareError.message, expect.any(String));
    });
  });
});

// --- Tests for findActiveClusters (internal, adapted from src/utils/clusterUtils.test.js) ---
const createMockQuake = (id, mag, lat, lon, time = Date.now()) => ({
  id,
  properties: { mag, time },
  geometry: { coordinates: [lon, lat, 0] },
});

describe('findActiveClusters (internal)', () => {
  let localConsoleWarnSpy; // Use a different name to avoid conflict with the one in onRequestPost describe block

  beforeEach(() => {
    localConsoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    localConsoleWarnSpy.mockRestore();
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
    const clusters = findActiveClusters(quakes, 20, 3);
    expect(clusters).toEqual([]);
  });

  it('should form a single cluster if quakes are close enough and meet minQuakes', () => {
    const q1 = createMockQuake('q1', 5, 10, 20);
    const q2 = createMockQuake('q2', 4, 10.01, 20.01);
    const q3 = createMockQuake('q3', 3, 10.02, 20.02);
    const quakes = [q1, q2, q3];
    const clusters = findActiveClusters(quakes, 5, 2);
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
    const clusters = findActiveClusters(quakes, 5, 2);
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
    const quakes = [q_middle, q_strongest, q_close_to_strongest];
    const clusters = findActiveClusters(quakes, 2, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0]).toEqual(expect.arrayContaining([q_strongest, q_close_to_strongest]));
    expect(clusters[0].some(q => q.id === 'q_middle')).toBe(false);
  });

  it('should not add quakes to a cluster if distance is greater than maxDistanceKm', () => {
    const q1 = createMockQuake('q1', 5, 10, 20);
    const q2 = createMockQuake('q2', 4, 10.01, 20.01);
    const q3 = createMockQuake('q3', 3, 12, 22);
    const quakes = [q1, q2, q3];
    const clusters = findActiveClusters(quakes, 2, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0]).toEqual(expect.arrayContaining([q1, q2]));
    expect(clusters[0].some(q => q.id === 'q3')).toBe(false);
  });

  it('should handle null or undefined quake objects gracefully (skips them, no warning in this version)', () => {
    const validQuake = createMockQuake('q1', 5, 10, 20);
    const quakes = [ validQuake, null, undefined, createMockQuake('q2', 4, 10.01, 20.01)];
    const clusters = findActiveClusters(quakes, 5, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0]).toEqual(expect.arrayContaining([validQuake, quakes[3]]));
    expect(localConsoleWarnSpy).not.toHaveBeenCalledWith("Skipping invalid quake object: null or undefined");
  });

  it('should handle quakes missing the id property (logs warning and skips)', () => {
    const validQuake = createMockQuake('q1', 5, 10, 20);
    const quakeMissingId = { properties: { mag: 4 }, geometry: { coordinates: [20.01, 10.01, 0] } };
    const quakes = [validQuake, quakeMissingId, createMockQuake('q2', 3, 10.02, 20.02)];
    const clusters = findActiveClusters(quakes, 5, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0].some(q => q.id === 'q1')).toBe(true);
    expect(clusters[0].some(q => q.id === 'q2')).toBe(true);
    expect(localConsoleWarnSpy).toHaveBeenCalledWith("Skipping quake with missing ID or invalid object in findActiveClusters.");
  });

  it('should handle quakes missing the geometry property (logs invalid coords)', () => {
    const validQuake = createMockQuake('q1', 5, 10, 20);
    const quakeMissingGeometry = { id: 'qInvalidGeo', properties: { mag: 4 } };
    const quakes = [validQuake, quakeMissingGeometry, createMockQuake('q2', 3, 10.01, 20.01)];
    const clusters = findActiveClusters(quakes, 5, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0].some(q => q.id === 'q1')).toBe(true);
    expect(clusters[0].some(q => q.id === 'q2')).toBe(true);
    expect(localConsoleWarnSpy).toHaveBeenCalledWith(`Skipping quake ${quakeMissingGeometry.id} due to invalid coordinates in findActiveClusters.`);
  });

  it('should handle quakes with invalid geometry.coordinates (not an array)', () => {
    const validQuake = createMockQuake('q1', 5, 10, 20);
    const quakeInvalidCoords = createMockQuake('qInvCoords1', 4, 0, 0);
    quakeInvalidCoords.geometry.coordinates = "not-an-array";
    const quakes = [validQuake, quakeInvalidCoords, createMockQuake('q2', 3, 10.01, 20.01)];
    const clusters = findActiveClusters(quakes, 5, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0].some(q => q.id === 'q1')).toBe(true);
    expect(clusters[0].some(q => q.id === 'q2')).toBe(true);
    expect(localConsoleWarnSpy).toHaveBeenCalledWith(`Skipping quake ${quakeInvalidCoords.id} due to invalid coordinates in findActiveClusters.`);
  });

  it('should handle quakes with invalid geometry.coordinates (less than 2 elements)', () => {
    const validQuake = createMockQuake('q1', 5, 10, 20);
    const quakeInvalidCoordsShort = createMockQuake('qInvCoords2', 4, 0, 0);
    quakeInvalidCoordsShort.geometry.coordinates = [10];
    const quakes = [validQuake, quakeInvalidCoordsShort, createMockQuake('q2', 3, 10.01, 20.01)];
    const clusters = findActiveClusters(quakes, 5, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0].some(q => q.id === 'q1')).toBe(true);
    expect(clusters[0].some(q => q.id === 'q2')).toBe(true);
    expect(localConsoleWarnSpy).toHaveBeenCalledWith(`Skipping quake ${quakeInvalidCoordsShort.id} due to invalid coordinates in findActiveClusters.`);
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
    const clusters = findActiveClusters(quakes, 5, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0]).toEqual(expect.arrayContaining([qA1, qA2]));
    expect(clusters[0].some(q => q.id === 'qB_iso')).toBe(false);

    // Outer loop warnings:
    expect(localConsoleWarnSpy).toHaveBeenCalledWith("Skipping quake with missing ID or invalid object in findActiveClusters."); // For malformedQuakesSource[2]
    expect(localConsoleWarnSpy).toHaveBeenCalledWith(`Skipping quake ${malformedQuakesSource[3].id} due to invalid coordinates in findActiveClusters.`);
    expect(localConsoleWarnSpy).toHaveBeenCalledWith(`Skipping quake ${malformedQuakesSource[4].id} due to invalid coordinates in findActiveClusters.`);
    expect(localConsoleWarnSpy).toHaveBeenCalledWith(`Skipping quake ${malformedQuakesSource[5].id} due to invalid coordinates in findActiveClusters.`);

    // Inner loop warnings for otherQuake:
    // When qA1 is base:
    expect(localConsoleWarnSpy).toHaveBeenCalledWith("Skipping potential cluster member with missing ID or invalid object."); // for malformedQuakesSource[2] as otherQuake
    expect(localConsoleWarnSpy).toHaveBeenCalledWith(`Skipping potential cluster member ${malformedQuakesSource[3].id} due to invalid coordinates.`);
    expect(localConsoleWarnSpy).toHaveBeenCalledWith(`Skipping potential cluster member ${malformedQuakesSource[4].id} due to invalid coordinates.`);
    expect(localConsoleWarnSpy).toHaveBeenCalledWith(`Skipping potential cluster member ${malformedQuakesSource[5].id} due to invalid coordinates.`);
    // When qB_iso is base: (these will be called again)
    // Total calls: 1 (outer missing ID) + 3 (outer invalid_coord) + 2 * (1 (inner missing ID) + 3 (inner invalid_coord)) = 4 + 2*4 = 12
    expect(localConsoleWarnSpy).toHaveBeenCalledTimes(12);
  });
});
