// functions/api/earthquake-summary.test.js
import { vi } from 'vitest';
import { onRequest } from './earthquake-summary'; // Adjust path as needed

// Mock Cloudflare Workers globals
global.fetch = vi.fn();

const mockCache = {
  match: vi.fn(),
  put: vi.fn().mockResolvedValue(undefined), // Ensure put returns a resolved promise
};
global.caches = {
  default: mockCache,
};

// Mock Request and Response constructors
global.Request = vi.fn().mockImplementation((urlOrRequest, options) => {
  if (typeof urlOrRequest === 'string') {
    return {
      url: urlOrRequest,
      method: options?.method || 'GET',
      headers: options?.headers || {},
      clone: vi.fn().mockReturnThis(), // Important for cacheKey
      ...options
    };
  }
  // If it's a Request object already (e.g. from cache.match)
  return {
    ...urlOrRequest,
    clone: vi.fn().mockReturnThis()
  };
});

global.Response = vi.fn().mockImplementation((body, init) => {
  let currentBody = body; // Store body to be accessible by json/text methods
  const response = {
    ok: init?.status ? (init.status >= 200 && init.status < 300) : true,
    status: init?.status || 200,
    statusText: init?.statusText || 'OK',
    headers: init?.headers || {},
    clone: vi.fn(() => {
      // Ensure cloned response also has json/text methods that work with its body
      const clonedResponse = { ...response, body: currentBody };
      clonedResponse.json = vi.fn(async () => JSON.parse(currentBody));
      clonedResponse.text = vi.fn(async () => String(currentBody));
      return clonedResponse;
    }),
    json: vi.fn(async () => JSON.parse(currentBody)), // Make sure this uses currentBody
    text: vi.fn(async () => String(currentBody)),   // Make sure this uses currentBody
  };
  return response;
});


const SIGNIFICANT_QUAKES_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_day.geojson";
const HOURLY_QUAKES_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";
const WORKER_SOURCE_NAME = "earthquake-summary-worker";
const DEFAULT_CACHE_DURATION_SECONDS = 300;


// Base mock context for Cloudflare Workers
const mockContextBase = {
  waitUntil: vi.fn((promise) => Promise.resolve(promise)), // Ensure waitUntil handles the promise
  request: {
    url: 'http://localhost/api/earthquake-summary', // Example request URL
    clone: vi.fn(() => mockContextBase.request) // Ensure clone returns the request object
  },
  // env will be set per test or in beforeEach
};

let mockContext; // Will be reassigned in beforeEach to ensure isolation

describe('earthquake-summary onRequest function', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    // Deep clone or more robustly reset mockContext for each test
    mockContext = JSON.parse(JSON.stringify(mockContextBase));
    // Re-attach mock functions that are not JSON-serializable
    mockContext.request = { ...mockContextBase.request, clone: vi.fn(() => mockContext.request) };
    mockContext.waitUntil = vi.fn((promise) => Promise.resolve(promise));
    mockContext.env = {}; // Default to no env variables for each test

    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console spies
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  const mockUsgsApiResponse = (url, data, status = 200) => {
    const response = new global.Response(JSON.stringify(data), { status });
    if (url === SIGNIFICANT_QUAKES_URL) {
      global.fetch.mockImplementationOnce(async (reqUrl) => {
        if (reqUrl === SIGNIFICANT_QUAKES_URL) return response;
        return new global.Response(JSON.stringify({}), {status: 404}); // Should not happen if called correctly
      });
    } else if (url === HOURLY_QUAKES_URL) {
       global.fetch.mockImplementationOnce(async (reqUrl) => {
        if (reqUrl === HOURLY_QUAKES_URL) return response;
        return new global.Response(JSON.stringify({}), {status: 404}); // Should not happen
      });
    } else {
       global.fetch.mockResolvedValueOnce(response); // Fallback for other URLs if any (should ideally be specific)
    }
  };

  const mockSuccessfulFetches = () => {
    const sigQuakesData = { metadata: { count: 2, title: "Significant Quakes", url: SIGNIFICANT_QUAKES_URL } };
    const hrQuakesData = { metadata: { count: 10, title: "Hourly Quakes", url: HOURLY_QUAKES_URL } };

    // Order matters for Promise.all, ensure fetch mocks are set up to resolve in the order they are called
     global.fetch.mockResolvedValueOnce(new global.Response(JSON.stringify(sigQuakesData), { status: 200 }));
     global.fetch.mockResolvedValueOnce(new global.Response(JSON.stringify(hrQuakesData), { status: 200 }));
  };


  it('should return cached response if available', async () => {
    const cachedData = { summary: 'cached data' };
    const mockCachedResponse = new global.Response(JSON.stringify(cachedData), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `s-maxage=${DEFAULT_CACHE_DURATION_SECONDS}` }
    });
    mockCache.match.mockResolvedValueOnce(mockCachedResponse);

    const response = await onRequest(mockContext);
    const responseBody = await response.json();

    expect(mockCache.match).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(responseBody).toEqual(cachedData);
    expect(consoleLogSpy).toHaveBeenCalledWith(`Cache hit for: ${WORKER_SOURCE_NAME}`);
  });

  it('should fetch, combine, and cache data if not in cache', async () => {
    mockCache.match.mockResolvedValueOnce(undefined); // Cache miss
    const sigQuakesData = { metadata: { count: 3, title: "Sig Day", url: SIGNIFICANT_QUAKES_URL } };
    const hrQuakesData = { metadata: { count: 15, title: "All Hour", url: HOURLY_QUAKES_URL } };

    // Ensure fetch is mocked correctly for both calls in Promise.all
    global.fetch
      .mockResolvedValueOnce(new global.Response(JSON.stringify(sigQuakesData), { status: 200 })) // For SIGNIFICANT_QUAKES_URL
      .mockResolvedValueOnce(new global.Response(JSON.stringify(hrQuakesData), { status: 200 }));  // For HOURLY_QUAKES_URL


    const response = await onRequest(mockContext);
    const responseBody = await response.json();

    expect(mockCache.match).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith(SIGNIFICANT_QUAKES_URL);
    expect(global.fetch).toHaveBeenCalledWith(HOURLY_QUAKES_URL);

    expect(responseBody.significant_quakes_past_day.count).toBe(3);
    expect(responseBody.all_quakes_past_hour.count).toBe(15);
    expect(responseBody.source).toBe(WORKER_SOURCE_NAME);

    expect(mockCache.put).toHaveBeenCalledTimes(1);
    // Wait for the cache.put promise chain to resolve
    await mockContext.waitUntil.mock.results[0].value;
    expect(consoleLogSpy).toHaveBeenCalledWith(`Cache miss for: ${WORKER_SOURCE_NAME}. Fetching from origin.`);
    expect(consoleLogSpy).toHaveBeenCalledWith(`Successfully cached response for: ${WORKER_SOURCE_NAME} (duration: ${DEFAULT_CACHE_DURATION_SECONDS}s)`);
  });

  it('should return 500 JSON error if significant quakes fetch fails', async () => {
    mockCache.match.mockResolvedValueOnce(undefined);
    // Mock significant quakes fetch to fail, hourly quakes to succeed (though it won't be called if first fails robustly)
    global.fetch
      .mockResolvedValueOnce(new global.Response(JSON.stringify({ error: "USGS error" }), { status: 503, statusText: "Service Unavailable" }))
      .mockResolvedValueOnce(new global.Response(JSON.stringify({ metadata: { count: 10 } }), { status: 200 }));


    const response = await onRequest(mockContext);
    const responseBody = await response.json();

    expect(response.status).toBe(500);
    expect(responseBody.status).toBe("error");
    expect(responseBody.message).toContain("Error fetching significant quakes: 503 Service Unavailable");
    expect(responseBody.upstream_status).toBe(503);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should return 500 JSON error if hourly quakes fetch fails', async () => {
    mockCache.match.mockResolvedValueOnce(undefined);
    // Mock significant quakes to succeed, hourly quakes to fail
    global.fetch
      .mockResolvedValueOnce(new global.Response(JSON.stringify({ metadata: { count: 2 } }), { status: 200 }))
      .mockResolvedValueOnce(new global.Response(JSON.stringify({ error: "USGS error" }), { status: 502, statusText: "Bad Gateway" }));

    const response = await onRequest(mockContext);
    const responseBody = await response.json();

    expect(response.status).toBe(500);
    expect(responseBody.status).toBe("error");
    expect(responseBody.message).toContain("Error fetching hourly quakes: 502 Bad Gateway");
    expect(responseBody.upstream_status).toBe(502);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  const testCacheDurationBehavior = async ({ envValue, expectedDuration, expectWarning }) => {
    mockCache.match.mockResolvedValueOnce(undefined); // Cache miss
    mockSuccessfulFetches(); // Ensure fetches are mocked successfully

    if (envValue !== undefined) {
      mockContext.env.EARTHQUAKE_SUMMARY_CACHE_SECONDS = envValue;
    }

    await onRequest(mockContext);
    // Wait for the cache.put promise chain to resolve before checking console logs or cache headers
    await mockContext.waitUntil.mock.results[0].value;


    const putCallArgs = mockCache.put.mock.calls[0];
    const responseToCache = putCallArgs[1]; // Second argument to cache.put is the Response object

    expect(responseToCache.headers['Cache-Control']).toBe(`s-maxage=${expectedDuration}`);
    expect(consoleLogSpy).toHaveBeenCalledWith(`Successfully cached response for: ${WORKER_SOURCE_NAME} (duration: ${expectedDuration}s)`);

    if (expectWarning) {
      expect(consoleWarnSpy).toHaveBeenCalledWith(`Invalid EARTHQUAKE_SUMMARY_CACHE_SECONDS value: "${envValue}". Using default: ${DEFAULT_CACHE_DURATION_SECONDS}s.`);
    } else {
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    }
  };

  it('should use default cache duration if env var is not set', async () => {
    await testCacheDurationBehavior({ envValue: undefined, expectedDuration: DEFAULT_CACHE_DURATION_SECONDS, expectWarning: false });
  });

  it('should use cache duration from valid env var', async () => {
    await testCacheDurationBehavior({ envValue: '600', expectedDuration: 600, expectWarning: false });
  });

  it('should use default cache duration and warn if env var is "invalid-value"', async () => {
    await testCacheDurationBehavior({ envValue: 'invalid-value', expectedDuration: DEFAULT_CACHE_DURATION_SECONDS, expectWarning: true });
  });

  it('should use default cache duration and warn if env var is "0"', async () => {
    await testCacheDurationBehavior({ envValue: '0', expectedDuration: DEFAULT_CACHE_DURATION_SECONDS, expectWarning: true });
  });
   it('should use default cache duration and warn if env var is "-100"', async () => {
    await testCacheDurationBehavior({ envValue: '-100', expectedDuration: DEFAULT_CACHE_DURATION_SECONDS, expectWarning: true });
  });

  it('should handle general errors during processing', async () => {
    mockCache.match.mockRejectedValueOnce(new Error("Cache unavailable")); // Simulate a cache read error

    const response = await onRequest(mockContext);
    const responseBody = await response.json();

    expect(response.status).toBe(500);
    expect(responseBody.status).toBe("error");
    expect(responseBody.message).toBe("Error processing request: Cache unavailable");
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Error in ${WORKER_SOURCE_NAME}: Cache unavailable`, expect.any(Error));
  });

});
