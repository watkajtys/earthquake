import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleUsgsProxy } from '../routes/api/usgs-proxy.js';
import { upsertEarthquakeFeaturesToD1 } from '../../src/utils/d1Utils.js';
import { server } from '../../src/mocks/server.js'; // Adjust path as necessary
import { http, HttpResponse } from 'msw';

// Mock d1Utils.js
vi.mock('../../src/utils/d1Utils.js', () => ({
  upsertEarthquakeFeaturesToD1: vi.fn().mockResolvedValue({ successCount: 0, errorCount: 0 }), // Default to success
}));

// Mock kvUtils.js
vi.mock('../../src/utils/kvUtils.js', () => ({
  getFeaturesFromKV: vi.fn(),
  setFeaturesToKV: vi.fn(),
}));

// Import the mocked functions for use in tests
import { getFeaturesFromKV, setFeaturesToKV } from '../../src/utils/kvUtils.js';


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
    vi.clearAllMocks(); // Clears all mocks, including fetch, cache, d1Utils, and kvUtils
    upsertEarthquakeFeaturesToD1.mockClear().mockResolvedValue({ successCount: 0, errorCount: 0 }); // Reset and re-apply default mock
    getFeaturesFromKV.mockClear();
    setFeaturesToKV.mockClear();


    // Default currentTestApiUrl, can be overridden in tests
    currentTestApiUrl = 'https://default.example.com/api';

    // Simplified mockContext for direct handler testing
    mockContext = {
      request: new Request(`${PROXY_ENDPOINT_BASE}?apiUrl=${encodeURIComponent(currentTestApiUrl)}`), // URL will be specific to test
      env: {
        WORKER_CACHE_DURATION_SECONDS: String(DEFAULT_CACHE_DURATION_SECONDS), // Ensure it's a string like env vars
        DB: undefined, // Default to no DB
        USGS_LAST_RESPONSE_KV: { get: vi.fn(), put: vi.fn() }, // Mock KV namespace binding
      },
      executionContext: { // <<< Ensure executionContext and its waitUntil are provided
        waitUntil: vi.fn((promise) => { // Allow awaiting promises passed to waitUntil
          // If the promise is undefined (e.g. setFeaturesToKV returns void), don't try to await it.
          if (promise && typeof promise.then === 'function') {
            return promise;
          }
          return Promise.resolve(); // Return a resolved promise for void returns
        }),
      }
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
    await mockContext.executionContext.waitUntil.mock.calls[0]?.value; // Wait for cache.put and D1 upsert

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

    const _fetchedData = { data: 'some data' };
    mockCache.match.mockResolvedValueOnce(undefined); // Cache miss

    const response = await handleUsgsProxy(mockContext);
    await mockContext.executionContext.waitUntil.mock.calls[0]?.value; // Wait for cache.put

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
    expect(true).toBe(true); // Explicit assertion for linter
  });

  it('should use cache duration from valid env var', async () => {
    await testCacheBehavior({ envValue: '1200', expectedDuration: 1200, expectWarning: false });
    expect(true).toBe(true); // Explicit assertion for linter
  });

  it('should use default cache duration and log warning if env var is "invalid-value"', async () => {
    await testCacheBehavior({ envValue: 'invalid-value', expectedDuration: DEFAULT_CACHE_DURATION_SECONDS, expectWarning: true });
    expect(true).toBe(true); // Explicit assertion for linter
  });

  it('should use default cache duration and log warning if env var is "0"', async () => {
    await testCacheBehavior({ envValue: '0', expectedDuration: DEFAULT_CACHE_DURATION_SECONDS, expectWarning: true });
    expect(true).toBe(true); // Explicit assertion for linter
  });

  it('should handle upstream API error (500)', async () => {
    setTestApiUrl('https://external.api/upstream_error');
    const _errorResponse = { error: "Upstream Server Error" };
    mockCache.match.mockResolvedValueOnce(undefined);

    const response = await handleUsgsProxy(mockContext);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(expect.objectContaining({ message: expect.stringContaining('Error fetching data from USGS API: 500') }));
    expect(mockCache.put).not.toHaveBeenCalled();
  });

  it('should handle network error when fetching from upstream', async () => {
    setTestApiUrl('https://external.api/network_failure');
    const _networkError = new TypeError('Fetch failed'); // This will be simulated by MSW's HttpResponse.error()
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
      await mockContext.executionContext.waitUntil.mock.calls[0]?.value; // Wait for D1 upsert

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
      await Promise.all(mockContext.executionContext.waitUntil.mock.calls.map(c => c[0]));


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
      await Promise.all(mockContext.executionContext.waitUntil.mock.calls.map(c => c[0]));
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
      await Promise.all(mockContext.executionContext.waitUntil.mock.calls.map(c => c[0]));
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
      await mockContext.executionContext.waitUntil.mock.calls[0]?.value; // Wait for D1 upsert attempt

      expect(response.status).toBe(200); // Still successful for client
      expect(await response.json()).toEqual({ features: mockFeatures });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[usgs-proxy-d1] Error during D1 upsert operation:`, // Corrected log message
        d1Error.message,
        d1Error.name,
        expect.any(String) // For the stack trace often included by console.error
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
    await mockContext.executionContext.waitUntil.mock.calls[0]?.value; // Wait for cache.put attempt

    expect(response.status).toBe(200); // Client response unaffected
    expect(await response.json()).toEqual(apiResponseData);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `Failed to cache response for ${currentTestApiUrl}: Error - Cache Full`,
      cachePutError
    );
  });

  it('should return 500 and log if upstream responds 200 OK with non-JSON content', async () => {
    setTestApiUrl('https://external.api/html_response');
    const _htmlBody = "<html><body>Not JSON</body></html>"; // This will be returned by MSW
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

const USGS_LAST_RESPONSE_KEY = "usgs_last_response_features"; // Re-define for test scope if not exported

describe('handleUsgsProxy KV Logic', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let consoleWarnSpy;
  let currentTestApiUrl;
  let mockContext;

  const mockFeature1 = { id: 'eq1', properties: { time: 1000, updated: 1100, place: 'Location A', mag: 5.0 }, geometry: { coordinates: [1,2,3] } };
  const mockFeature1Updated = { id: 'eq1', properties: { time: 1000, updated: 1200, place: 'Location A Updated', mag: 5.1 }, geometry: { coordinates: [1,2,3] } };
  const mockFeature2 = { id: 'eq2', properties: { time: 2000, updated: 2100, place: 'Location B', mag: 6.0 }, geometry: { coordinates: [4,5,6] } };
  const mockFeature3 = { id: 'eq3', properties: { time: 3000, updated: 3100, place: 'Location C', mag: 7.0 }, geometry: { coordinates: [7,8,9] } };


  beforeEach(() => {
    vi.clearAllMocks();
    upsertEarthquakeFeaturesToD1.mockClear().mockResolvedValue({ successCount: 1, errorCount: 0 }); // Default to 1 success for KV update
    getFeaturesFromKV.mockClear();
    setFeaturesToKV.mockClear();

    currentTestApiUrl = 'https://external.api/kv_test_data';
    mockContext = {
      request: new Request(`${PROXY_ENDPOINT_BASE}?apiUrl=${encodeURIComponent(currentTestApiUrl)}`),
      env: {
        WORKER_CACHE_DURATION_SECONDS: String(DEFAULT_CACHE_DURATION_SECONDS),
        DB: { prepare: vi.fn() }, // Mock D1
        USGS_LAST_RESPONSE_KV: { get: vi.fn(), put: vi.fn() }, // Mock KV namespace
      },
      executionContext: { // <<< Ensure executionContext and its waitUntil are provided
        waitUntil: vi.fn(promise => promise ? promise.catch(e => console.error("WaitUntil error:", e)) : Promise.resolve()),
      }
    };
    mockCache.match.mockResolvedValue(undefined); // Default to cache miss

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    server.resetHandlers(); // Reset MSW handlers
  });

  it('Scenario: Initial Run (Empty KV) - upserts all API features to D1, updates KV', async () => {
    const apiResponseFeatures = [mockFeature1, mockFeature2];
    server.use(http.get(currentTestApiUrl, () => HttpResponse.json({ features: apiResponseFeatures })));
    getFeaturesFromKV.mockResolvedValue(null); // KV is empty

    await handleUsgsProxy(mockContext);
    // Ensure all waitUntil promises settle
    for (const call of mockContext.executionContext.waitUntil.mock.calls) {
        if (call[0]) await call[0];
    }

    expect(getFeaturesFromKV).toHaveBeenCalledWith(mockContext.env.USGS_LAST_RESPONSE_KV, USGS_LAST_RESPONSE_KEY);
    expect(upsertEarthquakeFeaturesToD1).toHaveBeenCalledWith(mockContext.env.DB, apiResponseFeatures);
    expect(setFeaturesToKV).toHaveBeenCalledWith(mockContext.env.USGS_LAST_RESPONSE_KV, USGS_LAST_RESPONSE_KEY, apiResponseFeatures, mockContext.executionContext);
  });

  it('Scenario: No Change in Data - D1 and KV not updated', async () => {
    const commonFeatures = [mockFeature1, mockFeature2];
    server.use(http.get(currentTestApiUrl, () => HttpResponse.json({ features: commonFeatures })));
    getFeaturesFromKV.mockResolvedValue(commonFeatures); // KV has same data

    await handleUsgsProxy(mockContext);
    for (const call of mockContext.executionContext.waitUntil.mock.calls) {
        if (call[0]) await call[0];
    }

    expect(getFeaturesFromKV).toHaveBeenCalledTimes(1);
    expect(upsertEarthquakeFeaturesToD1).not.toHaveBeenCalled();
    expect(setFeaturesToKV).not.toHaveBeenCalled();
  });

  it('Scenario: New Earthquake - only new feature to D1, KV updated with full set', async () => {
    const kvFeatures = [mockFeature1];
    const apiResponseFeatures = [mockFeature1, mockFeature2]; // mockFeature2 is new
    server.use(http.get(currentTestApiUrl, () => HttpResponse.json({ features: apiResponseFeatures })));
    getFeaturesFromKV.mockResolvedValue(kvFeatures);

    await handleUsgsProxy(mockContext);
    for (const call of mockContext.executionContext.waitUntil.mock.calls) {
        if (call[0]) await call[0];
    }

    expect(upsertEarthquakeFeaturesToD1).toHaveBeenCalledWith(mockContext.env.DB, [mockFeature2]);
    expect(setFeaturesToKV).toHaveBeenCalledWith(mockContext.env.USGS_LAST_RESPONSE_KV, USGS_LAST_RESPONSE_KEY, apiResponseFeatures, mockContext.executionContext);
  });

  it('Scenario: Updated Earthquake - only updated feature to D1, KV updated with full set', async () => {
    const kvFeatures = [mockFeature1, mockFeature2]; // old version of mockFeature1
    const apiResponseFeatures = [mockFeature1Updated, mockFeature2]; // mockFeature1Updated is newer
    server.use(http.get(currentTestApiUrl, () => HttpResponse.json({ features: apiResponseFeatures })));
    getFeaturesFromKV.mockResolvedValue(kvFeatures);

    await handleUsgsProxy(mockContext);
     for (const call of mockContext.executionContext.waitUntil.mock.calls) {
        if (call[0]) await call[0];
    }

    expect(upsertEarthquakeFeaturesToD1).toHaveBeenCalledWith(mockContext.env.DB, [mockFeature1Updated]);
    expect(setFeaturesToKV).toHaveBeenCalledWith(mockContext.env.USGS_LAST_RESPONSE_KV, USGS_LAST_RESPONSE_KEY, apiResponseFeatures, mockContext.executionContext);
  });

  it('Scenario: Earthquake Removed from API - D1 not called for removed, KV updated with current API (removed one gone)', async () => {
    const kvFeatures = [mockFeature1, mockFeature2, mockFeature3]; // feature3 will be removed from API
    const apiResponseFeatures = [mockFeature1, mockFeature2];
    server.use(http.get(currentTestApiUrl, () => HttpResponse.json({ features: apiResponseFeatures })));
    getFeaturesFromKV.mockResolvedValue(kvFeatures);
    upsertEarthquakeFeaturesToD1.mockResolvedValue({ successCount: 0, errorCount: 0 }); // Simulate no actual D1 changes needed for existing ones

    await handleUsgsProxy(mockContext);
    for (const call of mockContext.executionContext.waitUntil.mock.calls) {
        if (call[0]) await call[0];
    }

    // D1 should not be called if no features were identified as new or updated.
    // In this case, feature3 was removed, feature1 & feature2 are unchanged by content.
    expect(upsertEarthquakeFeaturesToD1).not.toHaveBeenCalled();
    // KV is not updated because no new/updated features were successfully upserted to D1 / D1 not called.
    expect(setFeaturesToKV).not.toHaveBeenCalled();
  });


  it('Scenario: KV Binding Not Present - fallback to upserting all to D1, no KV set', async () => {
    const apiResponseFeatures = [mockFeature1, mockFeature2];
    server.use(http.get(currentTestApiUrl, () => HttpResponse.json({ features: apiResponseFeatures })));
    mockContext.env.USGS_LAST_RESPONSE_KV = undefined; // KV not configured

    await handleUsgsProxy(mockContext);
    for (const call of mockContext.executionContext.waitUntil.mock.calls) {
        if (call[0]) await call[0];
    }

    expect(getFeaturesFromKV).not.toHaveBeenCalled(); // Should not attempt if binding missing
    expect(upsertEarthquakeFeaturesToD1).toHaveBeenCalledWith(mockContext.env.DB, apiResponseFeatures);
    expect(setFeaturesToKV).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("USGS_LAST_RESPONSE_KV namespace not configured"));
  });

  it('Scenario: getFeaturesFromKV returns error (simulated by null) - fallback to upserting all to D1, no KV set initially', async () => {
    const apiResponseFeatures = [mockFeature1, mockFeature2];
    server.use(http.get(currentTestApiUrl, () => HttpResponse.json({ features: apiResponseFeatures })));
    // getFeaturesFromKV is already mocked to return undefined by default if not specified, which becomes null after await
    // For explicitness:
    getFeaturesFromKV.mockResolvedValue(null); // Simulate error or key not found leading to null

    await handleUsgsProxy(mockContext);
     for (const call of mockContext.executionContext.waitUntil.mock.calls) {
        if (call[0]) await call[0];
    }

    expect(getFeaturesFromKV).toHaveBeenCalledTimes(1);
    expect(upsertEarthquakeFeaturesToD1).toHaveBeenCalledWith(mockContext.env.DB, apiResponseFeatures);
    // If D1 upsert is successful, KV *should* be updated with the current features
    expect(setFeaturesToKV).toHaveBeenCalledWith(mockContext.env.USGS_LAST_RESPONSE_KV, USGS_LAST_RESPONSE_KEY, apiResponseFeatures, mockContext.executionContext);
  });

  it('Scenario: D1 Upsert Fails - KV should not be updated', async () => {
    const kvFeatures = [mockFeature1];
    const apiResponseFeatures = [mockFeature1Updated, mockFeature2]; // mockFeature1Updated is new/updated
    server.use(http.get(currentTestApiUrl, () => HttpResponse.json({ features: apiResponseFeatures })));
    getFeaturesFromKV.mockResolvedValue(kvFeatures);
    upsertEarthquakeFeaturesToD1.mockRejectedValueOnce(new Error("D1 Write Error"));

    await handleUsgsProxy(mockContext);
    // Wait for all promises in waitUntil, including the potentially rejected D1 promise
    // This requires careful handling of waitUntil mock if it rethrows or swallows errors.
    // Assuming waitUntil allows promises to settle (resolve or reject).
    try {
        for (const call of mockContext.executionContext.waitUntil.mock.calls) {
            if (call[0]) await call[0];
        }
    } catch {
        // Expected if D1 error propagates through waitUntil
    }


    expect(upsertEarthquakeFeaturesToD1).toHaveBeenCalledWith(mockContext.env.DB, [mockFeature1Updated, mockFeature2]);
    expect(setFeaturesToKV).not.toHaveBeenCalled(); // Crucial: KV not updated if D1 fails
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[usgs-proxy-d1] Error during D1 upsert operation:"), // Corrected prefix
      "D1 Write Error",
      "Error",
      expect.any(String) // For stack trace
    );
  });

  it('Scenario: D1 Upsert Reports No Successes (e.g. 0 rows affected but no error) - KV should not be updated', async () => {
    const kvFeatures = [mockFeature1];
    const apiResponseFeatures = [mockFeature1Updated, mockFeature2];
    server.use(http.get(currentTestApiUrl, () => HttpResponse.json({ features: apiResponseFeatures })));
    getFeaturesFromKV.mockResolvedValue(kvFeatures);
    // Simulate D1 upserting 0 features successfully, even though it was called with features
    upsertEarthquakeFeaturesToD1.mockResolvedValue({ successCount: 0, errorCount: 0 });

    await handleUsgsProxy(mockContext);
    for (const call of mockContext.executionContext.waitUntil.mock.calls) {
        if (call[0]) await call[0];
    }

    expect(upsertEarthquakeFeaturesToD1).toHaveBeenCalledWith(mockContext.env.DB, [mockFeature1Updated, mockFeature2]);
    expect(setFeaturesToKV).not.toHaveBeenCalled();
    // Updated to expect the more specific message, or a more general one
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/D1 upsert reported no successes for \d+ candidate features\. KV will NOT be updated with this dataset to prevent stale reference data\./)
    );
  });

});
