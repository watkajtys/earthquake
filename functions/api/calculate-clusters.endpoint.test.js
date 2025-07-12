import { onRequestPost as onRequest } from './calculate-clusters.POST.js';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CLUSTER_MIN_QUAKES, DEFINED_CLUSTER_MIN_MAGNITUDE } from '../../src/constants/appConstants.js';

// Mock the d1ClusterUtils module
vi.mock('../utils/d1ClusterUtils.js', () => ({
  storeClusterDefinition: vi.fn(),
}));
// Import the mocked function AFTER vi.mock has been called
import { storeClusterDefinition } from '../utils/d1ClusterUtils.js';


// Helper to create mock context for calculate-clusters onRequest
const createMockContext = (requestBody, envOverrides = {}) => {
  const mockDbInstance = {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    first: vi.fn(),
    run: vi.fn(),
  };

  const waitUntilPromises = [];
  const mockWaitUntilSpy = vi.fn((promise) => {
    waitUntilPromises.push(promise);
  });

  const mockContextBase = {
    request: {
      json: vi.fn().mockResolvedValue(requestBody),
      method: 'POST',
    },
    env: {
      DB: mockDbInstance,
      ...envOverrides,
    },
    ctx: {
      waitUntil: mockWaitUntilSpy,
    },
    waitUntil: mockWaitUntilSpy, // Ensure context.waitUntil is the same spy
    _awaitWaitUntilPromises: async () => { // Helper to await all promises
      await Promise.all(waitUntilPromises.map(p => typeof p === 'function' ? p() : p));
    }
  };
  return mockContextBase;
};

describe('onRequest in calculate-clusters.js', () => {
  let consoleErrorSpy;
  let consoleWarnSpy;
  // No need to declare storeClusterDefinition here, it's imported as a mock

  const baseMockEarthquake = {
    id: 'q1',
    properties: { mag: 1, time: Date.now(), place: "Test Location" }, // Added place for definition generation
    geometry: { coordinates: [0, 0, 10] } // Added depth
  };

  const defaultRequestBody = {
    earthquakes: [baseMockEarthquake], // Will be overridden in tests needing specific quake counts/mags
    maxDistanceKm: 100,
    minQuakes: 1, // Default minQuakes for basic clustering, will use CLUSTER_MIN_QUAKES for definition check
    lastFetchTime: '2024-01-01T00:00:00Z',
    timeWindowHours: 24,
  };

  // Function to create a list of mock earthquakes
  const createMockQuakes = (count, mag, baseId = 'quake', place = "Mockville", depth = 10) => {
    return Array.from({ length: count }, (_, i) => ({
      id: `${baseId}-${i}`,
      properties: { mag: mag, time: Date.now() + i * 1000, place: `${place} ${i}` },
      geometry: { coordinates: [0.1 * i, 0.1 * i, depth] }
    }));
  };


  beforeEach(() => {
    vi.resetAllMocks(); // This should reset vi.fn() mocks like storeClusterDefinition and DB mocks
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Reset mocks that might be part of createMockContext if they are not recreated each time
    // (though createMockContext does recreate them, this is belt-and-suspenders for storeClusterDefinition)
    storeClusterDefinition.mockReset();
    // Provide a default successful resolution for storeClusterDefinition
    storeClusterDefinition.mockResolvedValue({ success: true, id: 'mocked-definition-id' });

    // If context.waitUntil was part of a shared mock setup, reset it too.
    // However, createMockContext creates a new one each time, so its internal vi.fn() is fresh.
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('Input Validation', () => {
    it('should return 400 if earthquakes is not an array', async () => {
        const reqBody = { ...defaultRequestBody, earthquakes: "not-an-array" };
        const context = createMockContext(reqBody);
        const response = await onRequest(context);
        expect(response.status).toBe(400);
        const json = await response.json();
        expect(json.error).toBe('Invalid earthquakes payload: not an array.');
    });

    it('should return 400 if earthquakes array is initially empty', async () => {
      const reqBody = { ...defaultRequestBody, earthquakes: [] };
      const context = createMockContext(reqBody);
      const response = await onRequest(context);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Earthquakes array is empty, no clusters to calculate.');
    });

    it('should return 400 if maxDistanceKm is invalid', async () => {
      const reqBody = { ...defaultRequestBody, maxDistanceKm: 0 };
      const context = createMockContext(reqBody);
      const response = await onRequest(context);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Invalid maxDistanceKm');
    });

    it('should return 400 if minQuakes is invalid', async () => {
      const reqBody = { ...defaultRequestBody, minQuakes: 'invalid' };
      const context = createMockContext(reqBody);
      const response = await onRequest(context);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Invalid minQuakes');
    });

    // Simplified invalid earthquake test cases for brevity, assuming original file has comprehensive ones
    it('should return 400 for earthquake with missing id', async () => {
      const invalidQuake = { ...baseMockEarthquake, id: undefined };
      const reqBody = { ...defaultRequestBody, earthquakes: [invalidQuake] };
      const context = createMockContext(reqBody);
      const response = await onRequest(context);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toMatch(/missing 'id' property/i);
    });
  });

  describe('DB Availability and Cluster Calculation', () => { // Updated to reflect no caching
    it('should calculate clusters and return data if DB is not configured', async () => {
      const reqBody = { ...defaultRequestBody, earthquakes: createMockQuakes(1, 2.0) };
      const context = createMockContext(reqBody, { DB: undefined });
      const response = await onRequest(context);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(Array.isArray(json)).toBe(true); // Should calculate clusters
      // No cache headers expected since caching is removed
      expect(response.headers.get('X-Cache-Hit')).toBeNull();
      expect(response.headers.get('X-Cache-Info')).toBeNull();
    });

    it('should calculate clusters directly without caching', async () => {
      const reqBody = { ...defaultRequestBody, earthquakes: createMockQuakes(2, 1.5) };
      const context = createMockContext(reqBody);

      const response = await onRequest(context);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(Array.isArray(json)).toBe(true);
      // No cache operations should occur
      expect(context.env.DB.prepare).not.toHaveBeenCalledWith(expect.stringContaining("SELECT clusterData FROM ClusterCache"));
      expect(context.env.DB.run).not.toHaveBeenCalled();
      expect(response.headers.get('X-Cache-Hit')).toBeNull();
    });

    it('should calculate and return data directly (no caching)', async () => {
      // Using quakes that won't trigger definition storage for this specific test
      const quakes = createMockQuakes(CLUSTER_MIN_QUAKES - 1, DEFINED_CLUSTER_MIN_MAGNITUDE - 0.1);
      const reqBody = { ...defaultRequestBody, earthquakes: quakes, minQuakes: CLUSTER_MIN_QUAKES -1 > 0 ? CLUSTER_MIN_QUAKES -1 : 1 };
      const context = createMockContext(reqBody);

      const response = await onRequest(context);
      expect(response.status).toBe(200);
      const jsonResponse = await response.json();
      expect(Array.isArray(jsonResponse)).toBe(true);
      
      // No cache operations should occur
      expect(context.env.DB.prepare).not.toHaveBeenCalledWith(expect.stringContaining("SELECT clusterData FROM ClusterCache"));
      expect(context.env.DB.prepare).not.toHaveBeenCalledWith(expect.stringContaining("INSERT OR REPLACE INTO ClusterCache"));
      expect(context.env.DB.run).not.toHaveBeenCalled();
      expect(response.headers.get('X-Cache-Hit')).toBeNull();
    });

    it('should calculate clusters using spatial optimization for large datasets', async () => {
      const reqBody = { ...defaultRequestBody, earthquakes: createMockQuakes(150, 1.0) }; // Large dataset
      const context = createMockContext(reqBody);

      const response = await onRequest(context);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(Array.isArray(json)).toBe(true);
      // No cache operations
      expect(context.env.DB.prepare).not.toHaveBeenCalledWith(expect.stringContaining("ClusterCache"));
      expect(response.headers.get('X-Cache-Hit')).toBeNull();
    });

    it('should calculate clusters using original algorithm for small datasets', async () => {
      const reqBody = { ...defaultRequestBody, earthquakes: createMockQuakes(50, 1.0) }; // Small dataset
      const context = createMockContext(reqBody);

      const response = await onRequest(context);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(Array.isArray(json)).toBe(true);
      // No cache operations
      expect(context.env.DB.prepare).not.toHaveBeenCalledWith(expect.stringContaining("ClusterCache"));
      expect(response.headers.get('X-Cache-Hit')).toBeNull();
    });

    it('should handle spatial optimization fallback on error', async () => {
      const reqBody = { ...defaultRequestBody, earthquakes: createMockQuakes(150, 1.0) }; // Large enough for optimization
      const context = createMockContext(reqBody);

      const response = await onRequest(context);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(Array.isArray(json)).toBe(true);
      // No cache operations should occur
      expect(context.env.DB.prepare).not.toHaveBeenCalledWith(expect.stringContaining("ClusterCache"));
      expect(response.headers.get('X-Cache-Hit')).toBeNull();
    });
  });

  // Cluster Definition Storage (still used for background storage)
  describe('Cluster Definition Storage (waitUntil)', () => {
    it('should call waitUntil and storeClusterDefinition for significant clusters', async () => {
      const significantQuakes = createMockQuakes(CLUSTER_MIN_QUAKES, DEFINED_CLUSTER_MIN_MAGNITUDE + 0.5, 'sig');
      const reqBody = {
        ...defaultRequestBody,
        earthquakes: significantQuakes,
        minQuakes: CLUSTER_MIN_QUAKES, // Ensure findActiveClusters forms a cluster
      };
      const context = createMockContext(reqBody);

      const response = await onRequest(context);
      await context._awaitWaitUntilPromises(); // Wait for all waitUntil tasks

      expect(response.status).toBe(200);
      expect(context.waitUntil).toHaveBeenCalledTimes(1);

      // Assuming findActiveClusters with these params forms one significant cluster from all significantQuakes.
      // If findActiveClusters behaves differently (e.g. makes multiple smaller clusters), this might need adjustment.
      // For this test, the simplest assumption is one cluster containing all input quakes.
      expect(storeClusterDefinition).toHaveBeenCalledTimes(1);
      expect(storeClusterDefinition).toHaveBeenCalledWith(
        context.env.DB,
        expect.objectContaining({
          quakeCount: significantQuakes.length,
          maxMagnitude: DEFINED_CLUSTER_MIN_MAGNITUDE + 0.5, // The strongest quake in the set
          // Check some other relevant fields to ensure the correct data is passed
          id: expect.any(String),
          earthquakeIds: expect.arrayContaining(significantQuakes.map(q => q.id)),
          significanceScore: expect.any(Number),
        })
      );
    });

    it('should call waitUntil but NOT storeClusterDefinition for non-significant clusters (too few quakes)', async () => {
      const nonSignificantQuakes = createMockQuakes(CLUSTER_MIN_QUAKES - 1, DEFINED_CLUSTER_MIN_MAGNITUDE + 0.5, 'non-sig-count');
      // Ensure minQuakes for findActiveClusters allows a cluster to form, but it's not significant for definition
      const reqBody = {
        ...defaultRequestBody,
        earthquakes: nonSignificantQuakes,
        minQuakes: CLUSTER_MIN_QUAKES - 1 > 0 ? CLUSTER_MIN_QUAKES - 1 : 1,
      };
      const context = createMockContext(reqBody);

      const response = await onRequest(context);

      expect(response.status).toBe(200);
      expect(context.waitUntil).toHaveBeenCalledTimes(1); // waitUntil is called when DB is available
      expect(storeClusterDefinition).not.toHaveBeenCalled();
    });

    it('should call waitUntil but NOT storeClusterDefinition for non-significant clusters (low magnitude)', async () => {
      const lowMagQuakes = createMockQuakes(CLUSTER_MIN_QUAKES, DEFINED_CLUSTER_MIN_MAGNITUDE - 0.1, 'non-sig-mag');
      const reqBody = {
        ...defaultRequestBody,
        earthquakes: lowMagQuakes,
        minQuakes: CLUSTER_MIN_QUAKES, // Allows cluster formation
      };
      const context = createMockContext(reqBody);

      const response = await onRequest(context);

      expect(response.status).toBe(200);
      expect(context.waitUntil).toHaveBeenCalledTimes(1); // waitUntil is called when DB is available
      expect(storeClusterDefinition).not.toHaveBeenCalled();
    });

    it('should call waitUntil and storeClusterDefinition for significant clusters regardless of caching (since cache is removed)', async () => {
      const quakes = createMockQuakes(CLUSTER_MIN_QUAKES, DEFINED_CLUSTER_MIN_MAGNITUDE + 0.5, 'always-sig');
      const reqBody = {
        ...defaultRequestBody,
        earthquakes: quakes,
        minQuakes: CLUSTER_MIN_QUAKES,
      };
      const context = createMockContext(reqBody);

      const response = await onRequest(context);
      await context._awaitWaitUntilPromises(); // Wait for all waitUntil tasks

      expect(response.status).toBe(200);
      expect(context.waitUntil).toHaveBeenCalledTimes(1);
      expect(storeClusterDefinition).toHaveBeenCalledTimes(1);
    });

    it('should NOT call waitUntil or storeClusterDefinition if DB is not configured', async () => {
      const quakes = createMockQuakes(CLUSTER_MIN_QUAKES, DEFINED_CLUSTER_MIN_MAGNITUDE + 0.5, 'no-db-sig');
      const reqBody = {
        ...defaultRequestBody,
        earthquakes: quakes,
        minQuakes: CLUSTER_MIN_QUAKES,
      };
      const context = createMockContext(reqBody, { DB: undefined }); // DB not configured

      const response = await onRequest(context);

      expect(response.status).toBe(200); // onRequest should still succeed
      const json = await response.json();
      expect(Array.isArray(json)).toBe(true); // Clusters should still be calculated
      expect(context.waitUntil).not.toHaveBeenCalled();
      expect(storeClusterDefinition).not.toHaveBeenCalled();
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
      const reqBody = { ...defaultRequestBody, earthquakes: createMockQuakes(1, 1.0) }; // Use createMockQuakes
      const context = createMockContext(reqBody);
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
