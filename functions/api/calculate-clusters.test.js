import { onRequestPost } from './calculate-clusters'; // Adjust path as needed
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Helper to create mock context for calculate-clusters
const createMockContext = (requestBody, envOverrides = {}) => {
  const mockDbInstance = {
    prepare: vi.fn().mockReturnThis(), // Ensure prepare() returns the mock itself for chaining
    bind: vi.fn().mockReturnThis(),   // Ensure bind() returns the mock itself
    first: vi.fn(),
    run: vi.fn(),
    all: vi.fn(), // Though not used by calculate-clusters, good for a generic mock
  };

  return {
    request: {
      json: vi.fn().mockResolvedValue(requestBody),
    },
    env: {
      DB: mockDbInstance, // Default mock DB
      ...envOverrides,
    },
    // Add other context properties if your function uses them (e.g., waitUntil)
  };
};

describe('onRequestPost in calculate-clusters.js', () => {
  const mockEarthquakes = [{ id: 'q1', properties: { mag: 1 }, geometry: { coordinates: [0, 0, 0] } }];
  const defaultRequestBody = {
    earthquakes: mockEarthquakes,
    maxDistanceKm: 100,
    minQuakes: 1,
    lastFetchTime: '2024-01-01T00:00:00Z',
    timeWindowHours: 24,
  };
  const expectedCacheKeyParams = {
      numQuakes: mockEarthquakes.length,
      maxDistanceKm: defaultRequestBody.maxDistanceKm,
      minQuakes: defaultRequestBody.minQuakes,
      lastFetchTime: defaultRequestBody.lastFetchTime,
      timeWindowHours: defaultRequestBody.timeWindowHours
  };
  const expectedCacheKey = `clusters-${JSON.stringify(expectedCacheKeyParams)}`;


  beforeEach(() => {
    vi.resetAllMocks(); // Reset mocks before each test
  });

  it('should return 400 if earthquakes array is missing or empty', async () => {
    const context = createMockContext({ ...defaultRequestBody, earthquakes: [] });
    const response = await onRequestPost(context);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Invalid or empty earthquakes array');
  });

  it('should return 400 if maxDistanceKm is invalid', async () => {
    const context = createMockContext({ ...defaultRequestBody, maxDistanceKm: 0 });
    const response = await onRequestPost(context);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Invalid maxDistanceKm');
  });

  it('should return 400 if minQuakes is invalid', async () => {
    const context = createMockContext({ ...defaultRequestBody, minQuakes: 0 });
    const response = await onRequestPost(context);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Invalid minQuakes');
  });

  it('should calculate clusters and return data if DB is not configured, with X-Cache-Info header', async () => {
    const context = createMockContext(defaultRequestBody, { DB: undefined });
    const response = await onRequestPost(context);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(Array.isArray(json)).toBe(true); // Basic check for cluster data
    expect(response.headers.get('X-Cache-Hit')).toBe('false');
    expect(response.headers.get('X-Cache-Info')).toBe('DB not configured');
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
    expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("SELECT clusterData FROM ClusterCache WHERE cacheKey = ? AND createdAt > datetime('now', '-1 hour')"));
    expect(context.env.DB.bind).toHaveBeenCalledWith(expectedCacheKey);
    expect(context.env.DB.run).not.toHaveBeenCalled(); // Should not insert
  });

  it('should calculate, store, and return data if cache miss (D1 returns null)', async () => {
    const context = createMockContext(defaultRequestBody);
    context.env.DB.first.mockResolvedValueOnce(null); // Cache miss
    context.env.DB.run.mockResolvedValueOnce({ success: true }); // Mock successful insert

    const response = await onRequestPost(context);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(Array.isArray(json)).toBe(true); // Basic check
    expect(response.headers.get('X-Cache-Hit')).toBe('false');

    expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("SELECT clusterData FROM ClusterCache"));
    expect(context.env.DB.bind).toHaveBeenCalledWith(expectedCacheKey);
    expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT OR REPLACE INTO ClusterCache"));
    expect(context.env.DB.bind).toHaveBeenCalledWith(expectedCacheKey, JSON.stringify(json));
    expect(context.env.DB.run).toHaveBeenCalled();
  });

  it('should calculate, store, and return data if cached data is invalid JSON', async () => {
    const context = createMockContext(defaultRequestBody);
    context.env.DB.first.mockResolvedValueOnce({ clusterData: "invalid json" }); // Invalid JSON in cache
    context.env.DB.run.mockResolvedValueOnce({ success: true });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});


    const response = await onRequestPost(context);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(Array.isArray(json)).toBe(true);
    expect(response.headers.get('X-Cache-Hit')).toBe('false');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error parsing cached JSON from D1:', expect.any(Error));
    expect(context.env.DB.run).toHaveBeenCalled(); // Should re-calculate and store
    consoleErrorSpy.mockRestore();
  });

  it('should calculate and return data if D1 SELECT fails, without caching', async () => {
    const context = createMockContext(defaultRequestBody);
    context.env.DB.first.mockRejectedValueOnce(new Error('D1 SELECT failed'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await onRequestPost(context);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(Array.isArray(json)).toBe(true);
    expect(response.headers.get('X-Cache-Hit')).toBe('false');
    expect(consoleErrorSpy).toHaveBeenCalledWith('D1 GET error:', expect.any(Error));
    // Should still attempt to store if SELECT fails but calculation succeeds
    expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT OR REPLACE"));
    expect(context.env.DB.run).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('should calculate and return data if D1 INSERT fails, header X-Cache-Hit false', async () => {
    const context = createMockContext(defaultRequestBody);
    context.env.DB.first.mockResolvedValueOnce(null); // Cache miss
    context.env.DB.run.mockRejectedValueOnce(new Error('D1 INSERT failed')); // Insert fails
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});


    const response = await onRequestPost(context);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(Array.isArray(json)).toBe(true);
    expect(response.headers.get('X-Cache-Hit')).toBe('false');
    expect(consoleErrorSpy).toHaveBeenCalledWith('D1 PUT error:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it('should handle syntax error in request JSON', async () => {
    const context = createMockContext(null); // requestBody is null
    context.request.json.mockRejectedValueOnce(new SyntaxError("Unexpected token")); // Simulate JSON parse error
    const response = await onRequestPost(context);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Invalid JSON payload');
  });

  it('should handle generic error during processing', async () => {
    const problematicEarthquakes = [
      { id: 'q1', properties: { mag: 1 }, geometry: { coordinates: [0, 0, 0] } },
      { id: 'q2', properties: { mag: 2 }, geometry: null }, // This will cause an error in findActiveClusters
    ];
    const requestBodyWithError = {
      ...defaultRequestBody,
      earthquakes: problematicEarthquakes,
    };
    // Generate a unique cache key for this specific problematic input
    const errorCacheKeyParams = {
        numQuakes: problematicEarthquakes.length,
        maxDistanceKm: defaultRequestBody.maxDistanceKm,
        minQuakes: defaultRequestBody.minQuakes,
        lastFetchTime: defaultRequestBody.lastFetchTime,
        timeWindowHours: defaultRequestBody.timeWindowHours
    };
    const errorCacheKey = `clusters-${JSON.stringify(errorCacheKeyParams)}`;

    const context = createMockContext(requestBodyWithError);
    // Ensure it's a cache miss for this specific cache key
    context.env.DB.prepare.mockImplementation((query) => {
        if (query.includes("SELECT clusterData FROM ClusterCache")) {
            return { bind: vi.fn((key) => {
                if (key === errorCacheKey) {
                    return { first: vi.fn().mockResolvedValueOnce(null) };
                }
                return { first: vi.fn().mockResolvedValueOnce({ clusterData: "[]" }) }; // Default for other keys
            })};
        }
        return { bind: vi.fn().mockReturnThis(), run: vi.fn().mockResolvedValueOnce({ success: true }) };
    });


    const response = await onRequestPost(context);
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Internal server error');
    // Check if the details message indicates a TypeError, which is likely from accessing properties of null
    expect(json.details).toMatch(/TypeError|Cannot read properties of null/i);
  });
});
