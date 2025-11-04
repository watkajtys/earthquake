import { onRequest } from './[[catchall]]'; // Adjust if main export is different
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { upsertEarthquakeFeaturesToD1 } from '../src/utils/d1Utils.js';

// Mock d1Utils
vi.mock('../src/utils/d1Utils.js', () => ({
  upsertEarthquakeFeaturesToD1: vi.fn(),
}));

// --- Mocks for Cloudflare Environment ---

// Mock 'caches' global
const mockCache = {
  match: vi.fn(),
  put: vi.fn().mockResolvedValue(undefined),
};
global.caches = {
  default: mockCache,
  open: vi.fn().mockResolvedValue(mockCache) // if open is used
};

// Mock 'fetch' global
// global.fetch = vi.fn(); // MSW will handle fetch

// --- Helper to create mock context ---
const createMockContext = (request, env = {}, cf = {}) => {
  const waitUntilPromises = [];
  const mockDbInstance = {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    first: vi.fn(),
    run: vi.fn(),
    all: vi.fn().mockResolvedValue({ results: [] }),
  };

  return {
    request,
    env: {
      DB: mockDbInstance, // Default D1 mock
      CLUSTER_KV: {
        get: vi.fn(),
        put: vi.fn(),
        list: vi.fn().mockResolvedValue({ keys: [], list_complete: true, cursor: undefined }),
      },
      USGS_LAST_RESPONSE_KV: {
        get: vi.fn(),
        put: vi.fn(),
      },
      ASSETS: {
          fetch: vi.fn().mockResolvedValue(new Response("SPA fallback", { headers: { 'Content-Type': 'text/html'}}))
      },
      ...env,
    },
    params: {},
    // next is fine here
    next: vi.fn().mockResolvedValue(new Response("Fallback to env.ASSETS.fetch for static assets", { status: 200 })),
    cf,
    // executionContext should contain waitUntil
    executionContext: {
      waitUntil: vi.fn((promise) => { // This is context.executionContext.waitUntil
        if (promise) { // Ensure promise exists before pushing
            waitUntilPromises.push(promise);
        }
      }),
    },
    // This helper will await promises pushed to `waitUntilPromises` via `context.executionContext.waitUntil`
    _awaitWaitUntilPromises: async () => {
      // Wait for all promises to settle, catching individual errors
      const results = await Promise.allSettled(waitUntilPromises);
      results.forEach(result => {
        if (result.status === 'rejected') {
          console.error("Error in waitUntil promise:", result.reason);
        }
      });
      waitUntilPromises.length = 0; // Clear after awaiting
    }
  };
};

// TODO: REVIEW_REDUNDANCY - This integration test suite for the USGS proxy
// overlaps significantly with the direct handler tests in
// `functions/api/usgs-proxy.test.js`. Consider slimming down this suite
// to focus on verifying the routing via `[[catchall]].js` and basic
// success/error propagation from the handler, rather than re-testing
// all detailed proxy logic (caching, D1 interactions, specific error cases)
// which are covered in the direct handler tests.
describe('/api/usgs-proxy', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        // Reset cache mock behavior
        mockCache.match.mockReset();
        mockCache.put.mockReset().mockResolvedValue(undefined);
        // MSW will handle fetch lifecycle, server.resetHandlers() is in setupTests.js or called by vi.clearAllMocks()
        upsertEarthquakeFeaturesToD1.mockReset(); // Ensure D1 util mock is reset
    });

    const proxyPath = '/api/usgs-proxy';

    it('should return 400 if apiUrl is missing', async () => {
      const request = new Request(`http://localhost${proxyPath}`);
      const context = createMockContext(request);
      const response = await onRequest(context);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.message).toBe("Missing apiUrl query parameter for proxy request");
    });

    it('should proxy to apiUrl, cache miss, and cache the response', async () => {
      const targetApiUrl = 'http://example.com/earthquakes';
      const mockApiResponseData = { data: 'live earthquake data' };
      mockCache.match.mockResolvedValueOnce(undefined); // Cache miss

      const request = new Request(`http://localhost${proxyPath}?apiUrl=${encodeURIComponent(targetApiUrl)}`);
      const context = createMockContext(request, { WORKER_CACHE_DURATION_SECONDS: '300' });
      upsertEarthquakeFeaturesToD1.mockResolvedValue({ successCount: 1, errorCount: 0 });


      const response = await onRequest(context);
      await context._awaitWaitUntilPromises(); // Wait for cache.put and D1 upsert

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual(mockApiResponseData);
      expect(mockCache.match).toHaveBeenCalled();
      expect(mockCache.put).toHaveBeenCalled();
      const cachedResponse = mockCache.put.mock.calls[0][1];
      expect(cachedResponse.headers.get('Cache-Control')).toBe('s-maxage=300');

      if (mockApiResponseData.features && mockApiResponseData.features.length > 0) {
        expect(upsertEarthquakeFeaturesToD1).toHaveBeenCalledWith(context.env.DB, mockApiResponseData.features);
      } else if (mockApiResponseData.id && mockApiResponseData.type === 'Feature') {
        expect(upsertEarthquakeFeaturesToD1).not.toHaveBeenCalled();
      } else {
        expect(upsertEarthquakeFeaturesToD1).not.toHaveBeenCalled();
      }
    });

    it('should proxy to apiUrl, call D1 upsert for multiple features, cache response', async () => {
      const targetApiUrl = 'http://example.com/earthquakes_multiple_features';
      const mockApiResponseData = {
        features: [
          { id: 'feat1', properties: {}, geometry: { coordinates: [1,2,3] }},
          { id: 'feat2', properties: {}, geometry: { coordinates: [4,5,6] }}
        ]
      };
      mockCache.match.mockResolvedValueOnce(undefined); // Cache miss
      upsertEarthquakeFeaturesToD1.mockResolvedValue({ successCount: 2, errorCount: 0 });


      const request = new Request(`http://localhost${proxyPath}?apiUrl=${encodeURIComponent(targetApiUrl)}`);
      const context = createMockContext(request, { WORKER_CACHE_DURATION_SECONDS: '300' });

      const response = await onRequest(context);
      await context._awaitWaitUntilPromises();

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual(mockApiResponseData);
      expect(mockCache.put).toHaveBeenCalled();
      expect(upsertEarthquakeFeaturesToD1).toHaveBeenCalledWith(context.env.DB, mockApiResponseData.features);
    });


    it('should return cached response on cache hit', async () => {
      const targetApiUrl = 'http://example.com/earthquakes_cached';
      const cachedData = { data: 'cached earthquake data' };
      const mockCachedResponse = new Response(JSON.stringify(cachedData), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 's-maxage=600' } });
      mockCache.match.mockResolvedValueOnce(mockCachedResponse);

      const request = new Request(`http://localhost${proxyPath}?apiUrl=${encodeURIComponent(targetApiUrl)}`);
      const context = createMockContext(request);

      const response = await onRequest(context);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual(cachedData);
      expect(mockCache.put).not.toHaveBeenCalled();
      expect(upsertEarthquakeFeaturesToD1).not.toHaveBeenCalled();
    });

    it('should handle fetch error during proxying', async () => {
      const targetApiUrl = 'http://example.com/earthquakes_fetch_error';
      mockCache.match.mockResolvedValueOnce(undefined);

      const request = new Request(`http://localhost${proxyPath}?apiUrl=${encodeURIComponent(targetApiUrl)}`);
      const context = createMockContext(request);

      const response = await onRequest(context);
      expect(response.status).toBe(500);
      const json = await response.json();
      // Adjusted to match HttpResponse.error() default behavior
      expect(json.message).toBe('USGS API fetch failed: Failed to fetch');
      expect(json.source).toBe('usgs-proxy-handler');
      expect(upsertEarthquakeFeaturesToD1).not.toHaveBeenCalled();
    });

    it('should handle non-JSON response from upstream API', async () => {
      const targetApiUrl = 'http://example.com/earthquakes_html_error';
      mockCache.match.mockResolvedValueOnce(undefined);

      const request = new Request(`http://localhost${proxyPath}?apiUrl=${encodeURIComponent(targetApiUrl)}`);
      const context = createMockContext(request);

      const response = await onRequest(context);
      expect(response.status).toBe(503);
      const json = await response.json();
      const expectedMessagePart = `Error fetching data from USGS API: 503`;
      expect(json.message.startsWith(expectedMessagePart)).toBe(true);
      expect(json.source).toBe('usgs-proxy-handler');
      expect(json.upstream_status).toBe(503);
      expect(upsertEarthquakeFeaturesToD1).not.toHaveBeenCalled();
    });

    it('should use default cache duration if WORKER_CACHE_DURATION_SECONDS is invalid', async () => {
      const targetApiUrl = 'http://example.com/earthquakes_invalid_ttl';
      mockCache.match.mockResolvedValueOnce(undefined); // Will be reset in loop
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});


      const request = new Request(`http://localhost${proxyPath}?apiUrl=${encodeURIComponent(targetApiUrl)}`);
      const invalidTTLs = ['abc', '0', '-100'];
      for (const ttl of invalidTTLs) {
        mockCache.match.mockResolvedValueOnce(undefined); // Ensure cache miss for each iteration
        mockCache.put.mockClear();
        const context = createMockContext(request, { WORKER_CACHE_DURATION_SECONDS: ttl });
        await onRequest(context);
        await context._awaitWaitUntilPromises();

        expect(mockCache.put).toHaveBeenCalled();
        const cachedResponseArgs = mockCache.put.mock.calls[0];
        if (cachedResponseArgs && cachedResponseArgs[1]) {
            expect(cachedResponseArgs[1].headers.get('Cache-Control')).toBe('s-maxage=600'); // Default
        } else {
            throw new Error('cache.put was not called with expected arguments');
        }
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`Invalid WORKER_CACHE_DURATION_SECONDS value: "${ttl}"`));
      }
      consoleWarnSpy.mockRestore();
    });

    it('should handle cache.put failure gracefully', async () => {
      const targetApiUrl = 'http://example.com/earthquakes_cache_put_fail';
      mockCache.match.mockResolvedValueOnce(undefined);
      mockCache.put.mockRejectedValueOnce(new Error('KV is full'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const request = new Request(`http://localhost${proxyPath}?apiUrl=${encodeURIComponent(targetApiUrl)}`);
      const context = createMockContext(request);

      const response = await onRequest(context);
      expect(response.status).toBe(200);
      await context._awaitWaitUntilPromises();

      expect(mockCache.put).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to cache response for ${targetApiUrl}`),
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });

    it('should batch the SELECT query when checking for existing earthquakes', async () => {
      const targetApiUrl = 'http://example.com/earthquakes_large_feed';
      const mockFeatures = Array.from({ length: 200 }, (_, i) => ({
        id: `quake${i}`,
        properties: { time: Date.now() + i, mag: 2.5, place: `Place ${i}`, detail: `url_${i}`, updated: Date.now() + i },
        geometry: { coordinates: [1, 2, 3] }
      }));
      const mockApiResponseData = { features: mockFeatures };

      mockCache.match.mockResolvedValueOnce(undefined); // Cache miss
      upsertEarthquakeFeaturesToD1.mockResolvedValue({ successCount: 200, errorCount: 0 });

      const request = new Request(`http://localhost${proxyPath}?apiUrl=${encodeURIComponent(targetApiUrl)}`);
      const context = createMockContext(request);

      // We need to spy on the prepare method of the mock DB to see what queries are being made
      const prepareSpy = vi.spyOn(context.env.DB, 'prepare');

      await onRequest(context);
      await context._awaitWaitUntilPromises();

      const selectCalls = prepareSpy.mock.calls.filter(call => call[0].includes('SELECT id FROM EarthquakeEvents'));

      // Batch size for SELECT is 90, so 200 features should result in 3 SELECT queries (90, 90, 20)
      expect(selectCalls).toHaveLength(3);

      // Check the number of placeholders in each SELECT query
      expect(selectCalls[0][0].split('?').length - 1).toBe(90);
      expect(selectCalls[1][0].split('?').length - 1).toBe(90);
      expect(selectCalls[2][0].split('?').length - 1).toBe(20);

      expect(upsertEarthquakeFeaturesToD1).toHaveBeenCalled();
    });

    it('should return a custom payload for cron requests', async () => {
      const targetApiUrl = 'http://example.com/earthquakes_cron_feed';
      const mockFeatures = [
        { id: 'cron_quake1', properties: { updated: 1000 }, geometry: { coordinates: [1,1,1] }},
        { id: 'cron_quake2', properties: { updated: 2000 }, geometry: { coordinates: [2,2,2] }}
      ];
      const mockApiResponseData = { features: mockFeatures };

      mockCache.match.mockResolvedValueOnce(undefined); // Cache miss
      upsertEarthquakeFeaturesToD1.mockResolvedValue({ successCount: 2, errorCount: 0 });

      const request = new Request(`http://localhost${proxyPath}?apiUrl=${encodeURIComponent(targetApiUrl)}&isCron=true`);
      const context = createMockContext(request);

      // Mock the KV store to return an empty set of old features, so all new features are considered "new"
      vi.spyOn(context.env.USGS_LAST_RESPONSE_KV, 'get').mockResolvedValue(null);

      const response = await onRequest(context);
      await context._awaitWaitUntilPromises();

      expect(response.status).toBe(200);
      const json = await response.json();

      // For cron requests, the response should have a specific structure
      expect(json).toHaveProperty('newOrUpdatedFeatures');
      expect(json).toHaveProperty('fullGeoJson');
      expect(json.newOrUpdatedFeatures).toEqual(mockFeatures);
      expect(json.fullGeoJson).toEqual(mockApiResponseData);
    });
  });
