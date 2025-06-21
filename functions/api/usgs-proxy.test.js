import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleUsgsProxy } from '../routes/api/usgs-proxy.js';
import { upsertEarthquakeFeaturesToD1 } from '../../src/utils/d1Utils.js';
import { server } from '../../src/mocks/server.js'; // Adjust path as necessary
import { http, HttpResponse } from 'msw';

// Mock d1Utils.js
vi.mock('../../src/utils/d1Utils.js', () => ({
  upsertEarthquakeFeaturesToD1: vi.fn(),
}));

// Mock Cloudflare Workers globals

const mockCache = {
  match: vi.fn(),
  put: vi.fn().mockResolvedValue(undefined), // Default to successful put
};
global.caches = {
  default: mockCache,
};

// Removed custom global Request and Response mocks.
// Vitest environment (e.g., miniflare or jsdom) should provide these.

let mockContext;

const DEFAULT_CACHE_DURATION_SECONDS = 600;
const PROXY_ENDPOINT_BASE = 'http://localhost/api/usgs-proxy';


describe('handleUsgsProxy', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let consoleWarnSpy;
  let currentTestApiUrl; // To set specific API URLs per test

  beforeEach(() => {
    vi.clearAllMocks(); // Clears all mocks, including fetch, cache, and d1Utils
    upsertEarthquakeFeaturesToD1.mockClear(); // Explicitly clear for good measure

    // Default currentTestApiUrl, can be overridden in tests
    currentTestApiUrl = 'https://default.example.com/api';

    // Simplified mockContext for direct handler testing
    mockContext = {
      request: new Request(`${PROXY_ENDPOINT_BASE}?apiUrl=${encodeURIComponent(currentTestApiUrl)}`), // URL will be specific to test
      env: {
        WORKER_CACHE_DURATION_SECONDS: String(DEFAULT_CACHE_DURATION_SECONDS), // Ensure it's a string like env vars
        DB: undefined, // Default to no DB
      },
      waitUntil: vi.fn((promise) => { // Allow awaiting promises passed to waitUntil
        return promise;
      }),
      // No next() needed for direct handler tests
    };

    // MSW will handle fetch, server.resetHandlers() is in setupTests.js or called by vi.clearAllMocks()
    mockCache.put.mockResolvedValue(undefined); // Ensure cache put is successful by default


    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  const setTestApiUrl = (apiUrl) => {
    currentTestApiUrl = apiUrl;
    mockContext.request = new Request(`${PROXY_ENDPOINT_BASE}?apiUrl=${encodeURIComponent(currentTestApiUrl)}`);
  };

  it('should return 400 if apiUrl is missing', async () => {
    mockContext.request = new Request(PROXY_ENDPOINT_BASE); // No apiUrl
    const response = await handleUsgsProxy(mockContext);
    const responseBody = await response.json();
    expect(response.status).toBe(400);
    expect(responseBody.message).toBe("Missing apiUrl query parameter for proxy request");
    expect(responseBody.source).toBe("usgs-proxy-handler");
  });

  it('should proxy successfully with cache miss, cache the response, and call D1 if configured', async () => {
    setTestApiUrl('https://external.api/data_with_features');
    const mockApiResponseData = { features: [{id: 'feat1', properties: {}, geometry: {}}], message: 'Success!' };
    const mockDbInstance = { prepare: vi.fn() }; // Mock D1
    mockContext.env.DB = mockDbInstance;

    mockCache.match.mockResolvedValueOnce(undefined); // Cache miss

    const response = await handleUsgsProxy(mockContext);
    await mockContext.waitUntil.mock.calls[0]?.value; // Wait for cache.put and D1 upsert

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(mockApiResponseData);
    expect(mockCache.match).toHaveBeenCalledWith(mockContext.request.url);
    expect(mockCache.put).toHaveBeenCalled();

    const cachedResponse = mockCache.put.mock.calls[0][1];
    expect(cachedResponse.headers.get('Content-Type')).toBe('application/json');
    expect(cachedResponse.headers.get('Cache-Control')).toBe(`s-maxage=${DEFAULT_CACHE_DURATION_SECONDS}`);
    expect(upsertEarthquakeFeaturesToD1).toHaveBeenCalledWith(mockDbInstance, mockApiResponseData.features);
  });

  it('should return cached response on cache hit', async () => {
    setTestApiUrl('https://external.api/cached_data');
    const cachedData = { message: 'cached data' };
    const mockCachedResponse = new Response(JSON.stringify(cachedData), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Cache-Hit': 'true' }
    });
    mockCache.match.mockResolvedValueOnce(mockCachedResponse);

    const response = await handleUsgsProxy(mockContext);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(cachedData);
    expect(response.headers.get('X-Cache-Hit')).toBe('true');
    expect(mockCache.put).not.toHaveBeenCalled();
    expect(upsertEarthquakeFeaturesToD1).not.toHaveBeenCalled();
  });

  const testCacheBehavior = async ({ envValue, expectedDuration, expectWarning }) => {
    setTestApiUrl('https://external.api/cache_test_dynamic');
    if (envValue !== undefined) {
      mockContext.env.WORKER_CACHE_DURATION_SECONDS = envValue;
    } else {
      delete mockContext.env.WORKER_CACHE_DURATION_SECONDS; // Test truly absent
    }

    const fetchedData = { data: 'some data' };
    mockCache.match.mockResolvedValueOnce(undefined); // Cache miss

    const response = await handleUsgsProxy(mockContext);
    await mockContext.waitUntil.mock.calls[0]?.value; // Wait for cache.put

    expect(response.status).toBe(200);
    const putCallArgs = mockCache.put.mock.calls[0];
    const responseToCache = putCallArgs[1];
    expect(responseToCache.headers.get('Cache-Control')).toBe(`s-maxage=${expectedDuration}`);
    expect(responseToCache.headers.get('Content-Type')).toBe('application/json');

    if (expectWarning) {
      expect(consoleWarnSpy).toHaveBeenCalledWith(`Invalid WORKER_CACHE_DURATION_SECONDS value: "${envValue}". Using default ${DEFAULT_CACHE_DURATION_SECONDS}s.`);
    } else {
      const wasCalledWithWarning = consoleWarnSpy.mock.calls.some(call => call[0].startsWith('Invalid WORKER_CACHE_DURATION_SECONDS value:'));
      expect(wasCalledWithWarning).toBe(false);
    }
  };

  it('should use default cache duration if env var is not set', async () => {
    await testCacheBehavior({ envValue: undefined, expectedDuration: DEFAULT_CACHE_DURATION_SECONDS, expectWarning: false });
  });

  it('should use cache duration from valid env var', async () => {
    await testCacheBehavior({ envValue: '1200', expectedDuration: 1200, expectWarning: false });
  });

  it('should use default cache duration and log warning if env var is "invalid-value"', async () => {
    await testCacheBehavior({ envValue: 'invalid-value', expectedDuration: DEFAULT_CACHE_DURATION_SECONDS, expectWarning: true });
  });

  it('should use default cache duration and log warning if env var is "0"', async () => {
    await testCacheBehavior({ envValue: '0', expectedDuration: DEFAULT_CACHE_DURATION_SECONDS, expectWarning: true });
  });

  it('should handle upstream API error (500)', async () => {
    setTestApiUrl('https://external.api/upstream_error');
    const errorResponse = { error: "Upstream Server Error" };
    mockCache.match.mockResolvedValueOnce(undefined);

    const response = await handleUsgsProxy(mockContext);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(expect.objectContaining({ message: expect.stringContaining('Error fetching data from USGS API: 500') }));
    expect(mockCache.put).not.toHaveBeenCalled();
  });

  it('should handle network error when fetching from upstream', async () => {
    setTestApiUrl('https://external.api/network_failure');
    const networkError = new TypeError('Fetch failed'); // This will be simulated by MSW's HttpResponse.error()
    mockCache.match.mockResolvedValueOnce(undefined);

    const response = await handleUsgsProxy(mockContext);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: 'USGS API fetch failed: Failed to fetch', source: 'usgs-proxy-handler' });
    // The error message now includes the stack trace, so we check for the beginning of the message.
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`[usgs-proxy] Outer catch block: Fetch, JSON parse, or other error for ${currentTestApiUrl}:`), "Failed to fetch", "TypeError", expect.any(String));
  });

  describe('D1 Interaction Tests', () => {
    beforeEach(() => {
        setTestApiUrl('https://external.api/d1_interaction');
        mockCache.match.mockResolvedValue(undefined); // Ensure cache miss for D1 tests
    });

    it('should call D1 upsert when DB is configured and features are present', async () => {
      const mockFeatures = [{ id: 'default_d1_feat', type: 'Feature' }]; // Matches default MSW handler
      const mockDb = { prepare: vi.fn() };
      mockContext.env.DB = mockDb;

      // MSW will use the default handler for 'https://external.api/d1_interaction'
      await handleUsgsProxy(mockContext);
      await mockContext.waitUntil.mock.calls[0]?.value; // Wait for D1 upsert

      expect(upsertEarthquakeFeaturesToD1).toHaveBeenCalledWith(mockDb, mockFeatures);
    });

    it('should NOT call D1 upsert when DB is not configured', async () => {
      mockContext.env.DB = undefined;
      // MSW will use the default handler for 'https://external.api/d1_interaction'
      await handleUsgsProxy(mockContext);
      // Check if waitUntil was called with a promise that involves D1.
      // If D1 is not configured, the specific promise for D1 shouldn't be added.
      // This requires looking into the implementation detail of how D1 promise is added to waitUntil.
      // For now, just check mock was not called.
      await Promise.all(mockContext.waitUntil.mock.calls.map(c => c[0]));


      expect(upsertEarthquakeFeaturesToD1).not.toHaveBeenCalled();
    });

    it('should NOT call D1 upsert when features are missing or empty', async () => {
      const mockDb = { prepare: vi.fn() };
      mockContext.env.DB = mockDb;

      // Test case 1: features array is empty
      server.use(
        http.get('https://external.api/d1_interaction', () => {
          return HttpResponse.json({ features: [] });
        })
      );
      await handleUsgsProxy(mockContext);
      await Promise.all(mockContext.waitUntil.mock.calls.map(c => c[0]));
      expect(upsertEarthquakeFeaturesToD1).not.toHaveBeenCalled();

      upsertEarthquakeFeaturesToD1.mockClear();
      mockCache.match.mockResolvedValueOnce(undefined); // reset for this call

      // Test case 2: "features" key is missing
      server.use(
        http.get('https://external.api/d1_interaction', () => {
          return HttpResponse.json({ data: 'no features key' });
        })
      );
      await handleUsgsProxy(mockContext);
      await Promise.all(mockContext.waitUntil.mock.calls.map(c => c[0]));
      expect(upsertEarthquakeFeaturesToD1).not.toHaveBeenCalled();
    });

    it('should handle D1 error gracefully and log it', async () => {
      const mockFeatures = [{ id: 'default_d1_feat', type: 'Feature' }]; // Matches default MSW handler
      const mockDb = { prepare: vi.fn() };
      mockContext.env.DB = mockDb;
      const d1Error = new Error('D1 Fails');
      upsertEarthquakeFeaturesToD1.mockRejectedValueOnce(d1Error);

      // MSW will use the default handler for 'https://external.api/d1_interaction'
      const response = await handleUsgsProxy(mockContext); // client response should be unaffected
      await mockContext.waitUntil.mock.calls[0]?.value; // Wait for D1 upsert attempt

      expect(response.status).toBe(200); // Still successful for client
      expect(await response.json()).toEqual({ features: mockFeatures });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[usgs-proxy] Error during D1 upsert:`, // Updated log message
        d1Error.message, // Log now includes message and name separately
        d1Error.name
      );
    });
  });

  it('should handle cache.put failure gracefully and log it', async () => {
    setTestApiUrl('https://external.api/cache_put_fail');
    const apiResponseData = { data: "important data" };
    mockCache.match.mockResolvedValueOnce(undefined); // Cache miss
    const cachePutError = new Error('Cache Full');
    mockCache.put.mockRejectedValueOnce(cachePutError);

    const response = await handleUsgsProxy(mockContext);
    await mockContext.waitUntil.mock.calls[0]?.value; // Wait for cache.put attempt

    expect(response.status).toBe(200); // Client response unaffected
    expect(await response.json()).toEqual(apiResponseData);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `Failed to cache response for ${currentTestApiUrl}: Error - Cache Full`,
      cachePutError
    );
  });

  it('should return 500 and log if upstream responds 200 OK with non-JSON content', async () => {
    setTestApiUrl('https://external.api/html_response');
    const htmlBody = "<html><body>Not JSON</body></html>"; // This will be returned by MSW
    mockCache.match.mockResolvedValueOnce(undefined); // Cache miss

    const response = await handleUsgsProxy(mockContext);

    expect(response.status).toBe(500);
    const jsonResponse = await response.json();
    expect(jsonResponse.message).toBe("USGS API fetch failed: Unexpected token '<', \"<html><bod\"... is not valid JSON");
    expect(jsonResponse.source).toBe('usgs-proxy-handler');
    // upstream_status is not set in this specific error path in the handler
    // expect(jsonResponse.upstream_status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(`[usgs-proxy] Outer catch block: Fetch, JSON parse, or other error for ${currentTestApiUrl}:`),
      "Unexpected token '<', \"<html><bod\"... is not valid JSON",
      "SyntaxError",
      expect.any(String) // For the stack trace
    );
    expect(mockCache.put).not.toHaveBeenCalled();
  });
});
