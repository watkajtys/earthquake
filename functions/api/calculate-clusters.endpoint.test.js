import { onRequest } from './calculate-clusters'; // Changed from onRequestPost
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Helper to create mock context for calculate-clusters onRequest
const createMockContext = (requestBody, envOverrides = {}) => { // Renamed comment
  const mockDbInstance = {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    first: vi.fn(),
    run: vi.fn(),
  };

  return {
    request: {
      json: vi.fn().mockResolvedValue(requestBody),
      method: 'POST', // Ensure the method is POST for these tests
    },
    env: {
      DB: mockDbInstance,
      ...envOverrides,
    },
  };
};

describe('onRequest in calculate-clusters.js', () => { // Changed from onRequestPost
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
        const response = await onRequest(context); // Changed from onRequestPost
        expect(response.status).toBe(400);
        const json = await response.json();
        expect(json.error).toBe('Invalid earthquakes payload: not an array.');
    });

    it('should return 400 if earthquakes array is initially empty', async () => {
      const context = createMockContext({ ...defaultRequestBody, earthquakes: [] });
      const response = await onRequest(context); // Changed from onRequestPost
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Earthquakes array is empty, no clusters to calculate.');
    });

    it('should return 400 if maxDistanceKm is invalid', async () => {
      const context = createMockContext({ ...defaultRequestBody, maxDistanceKm: 0 });
      const response = await onRequest(context); // Changed from onRequestPost
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Invalid maxDistanceKm');
    });

    it('should return 400 if minQuakes is invalid', async () => {
      const context = createMockContext({ ...defaultRequestBody, minQuakes: 'invalid' });
      const response = await onRequest(context); // Changed from onRequestPost
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
        const response = await onRequest(context); // Changed from onRequestPost
        expect(response.status).toBe(400);
        const json = await response.json();
        expect(json.error).toMatch(tc.message);
      });
    }
  });

  describe('DB Availability and Operations', () => {
    it('should calculate clusters and return data if DB is not configured, with X-Cache-Info header', async () => {
      const context = createMockContext(defaultRequestBody, { DB: undefined });
      const response = await onRequest(context); // Changed from onRequestPost
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(Array.isArray(json)).toBe(true);
      expect(response.headers.get('X-Cache-Hit')).toBe('false');
      expect(response.headers.get('X-Cache-Info')).toBe('DB not configured');
      expect(consoleWarnSpy).toHaveBeenCalledWith("D1 Database (env.DB) not available. Proceeding without cache or definition storage.");
    });

    it('should return cached data if valid entry exists in D1', async () => {
      const mockCachedClusterData = [{ id: 'cluster1', quakes: ['q1'] }];
      const context = createMockContext(defaultRequestBody);
      context.env.DB.first.mockResolvedValueOnce({ clusterData: JSON.stringify(mockCachedClusterData) });

      const response = await onRequest(context); // Changed from onRequestPost
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

      const response = await onRequest(context); // Changed from onRequestPost
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

      const response = await onRequest(context); // Changed from onRequestPost
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

      const response = await onRequest(context); // Changed from onRequestPost
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

      const response = await onRequest(context); // Changed from onRequestPost
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(Array.isArray(json)).toBe(true);
      // When PUT fails, X-Cache-Hit might not be set to 'false', X-Cache-Info is more relevant
      expect(response.headers.get('X-Cache-Info')).toBe('Cache write failed');
      expect(consoleErrorSpy).toHaveBeenCalledWith(`D1 PUT error for cacheKey ${expectedDefaultCacheKey}:`, dbPutError.message, dbPutError.cause);
    });
  });

  describe('General Error Handling', () => {
    it('should handle syntax error in request JSON', async () => {
      const context = createMockContext(null);
      // Ensure the mocked error message will be caught by the specific check in implementation
      context.request.json.mockRejectedValueOnce(new SyntaxError("Unexpected token in JSON. Error trying to parse await context.request.json()"));
      const response = await onRequest(context); // Changed from onRequestPost
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Invalid JSON payload for the request.'); // Message from the more specific catch block
      expect(json.details).toContain("Unexpected token in JSON");
    });

    it('should handle generic error during processing (e.g. in findActiveClusters due to unexpected data shape not caught by validation)', async () => {
      const context = createMockContext(defaultRequestBody);
      const prepareError = new Error("Catastrophic D1 prepare failure");
      context.env.DB.prepare.mockImplementation(() => { throw prepareError; });

      const response = await onRequest(context); // Changed from onRequestPost
      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('Internal server error');
      expect(json.details).toBe(prepareError.message);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Unhandled error in onRequest:', prepareError.message, expect.any(String));
    });
  });
});
