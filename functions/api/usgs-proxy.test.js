import { vi } from 'vitest';
import { onRequest } from '../[[catchall]].js';

// Mock Cloudflare Workers globals
global.fetch = vi.fn();

const mockCache = {
  match: vi.fn(),
  put: vi.fn().mockResolvedValue(undefined),
};
global.caches = {
  default: mockCache,
};

global.Request = vi.fn().mockImplementation((urlOrRequest, options) => {
  if (typeof urlOrRequest === 'string') {
    return {
      url: urlOrRequest,
      method: options?.method || 'GET',
      headers: options?.headers || {},
      clone: vi.fn().mockReturnThis(),
      ...options
    };
  }
  return {
    ...urlOrRequest,
    clone: vi.fn().mockReturnThis()
  };
});

global.Response = vi.fn().mockImplementation((body, init) => {
  let currentBody = body;
  const response = {
    ok: init?.status ? (init.status >= 200 && init.status < 300) : true,
    status: init?.status || 200,
    statusText: init?.statusText || 'OK',
    headers: init?.headers || {},
    clone: vi.fn(() => {
      const clonedResponse = { ...response, body: currentBody };
      clonedResponse.json = vi.fn(async () => JSON.parse(currentBody));
      clonedResponse.text = vi.fn(async () => String(currentBody));
      return clonedResponse;
    }),
    json: vi.fn(async () => JSON.parse(currentBody)),
    text: vi.fn(async () => String(currentBody)),
  };
  return response;
});

const mockContextBase = {
  waitUntil: vi.fn((promise) => Promise.resolve(promise)),
  request: {
    url: 'http://localhost/api/usgs-proxy?apiUrl=https://example.com/api',
    clone: vi.fn(() => mockContextBase.request) // Point to the base object
  },
  // env will be set per test or in beforeEach
};
let mockContext; // Will be reassigned in beforeEach

const TEST_API_URL = 'https://example.com/api';
const PROXY_SOURCE_NAME = "usgs-proxy-worker";
const DEFAULT_CACHE_DURATION_SECONDS = 600;

describe('onRequest proxy function', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    // Deep clone or reset mockContext for each test to ensure env isolation
    mockContext = JSON.parse(JSON.stringify(mockContextBase));
    // mockContext.request.clone = vi.fn(() => mockContext.request); // Re-attach mock function if lost in stringify/parse
    // A bit manual for clone, but ensures env is fresh. For more complex request mocking, a better deep clone is needed.
    mockContext.request = { ...mockContextBase.request, clone: vi.fn(() => mockContext.request) };
    mockContext.waitUntil = vi.fn((promise) => Promise.resolve(promise)); // Ensure waitUntil is a fresh mock
    mockContext.env = {}; // Default to no env variables
    mockContext.request.url = `http://localhost/api/usgs-proxy?apiUrl=${TEST_API_URL}`;

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('should return 400 JSON error if apiUrl query parameter is missing', async () => {
    mockContext.request.url = 'http://localhost/api/usgs-proxy';
    const response = await onRequest(mockContext);
    const responseBody = await response.json();
    expect(response.status).toBe(400);
    // ... (rest of assertions remain the same)
    expect(responseBody.message).toBe("Missing apiUrl query parameter for proxy request");
    expect(responseBody.source).toBe("usgs-proxy-router"); // Also check the sourceName
  });

  it('should return cached response if available and log cache hit', async () => {
    const cachedData = { message: 'cached data' };
    const mockCachedResponse = new global.Response(JSON.stringify(cachedData), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `s-maxage=${DEFAULT_CACHE_DURATION_SECONDS}`}
    });
    mockCache.match.mockResolvedValueOnce(mockCachedResponse);
    await onRequest(mockContext); // Call the function
    expect(consoleLogSpy).toHaveBeenCalledWith(`Cache hit for: ${TEST_API_URL}`);
    // ... (rest of assertions remain the same)
  });

  const testCacheBehavior = async ({ envValue, expectedDuration, expectWarning }) => {
    if (envValue !== undefined) {
      mockContext.env.WORKER_CACHE_DURATION_SECONDS = envValue;
    }

    const fetchedData = { features: ['test'] };
    const mockApiResponse = new global.Response(JSON.stringify(fetchedData), { status: 200 });
    mockCache.match.mockResolvedValueOnce(undefined);
    global.fetch.mockResolvedValueOnce(mockApiResponse);

    const response = await onRequest(mockContext);
    await mockContext.waitUntil.mock.results[0].value; // Wait for cache.put promise chain

    expect(consoleLogSpy).toHaveBeenCalledWith(`Cache miss for: ${TEST_API_URL}. Fetching from origin.`);
    const putCallArgs = mockCache.put.mock.calls[0];
    const responseToCache = putCallArgs[1];
    expect(responseToCache.headers['Cache-Control']).toBe(`s-maxage=${expectedDuration}`);
    expect(consoleLogSpy).toHaveBeenCalledWith(`Successfully cached response for: ${TEST_API_URL} (duration: ${expectedDuration}s)`);

    if (expectWarning) {
        expect(consoleWarnSpy).toHaveBeenCalledWith(`Invalid WORKER_CACHE_DURATION_SECONDS value: "${envValue}". Using default: ${DEFAULT_CACHE_DURATION_SECONDS}s.`);
    } else {
        expect(consoleWarnSpy).not.toHaveBeenCalled();
    }
    expect((await response.json())).toEqual(fetchedData);
  };

  it('should use default cache duration if env var is not set', async () => {
    await testCacheBehavior({ envValue: undefined, expectedDuration: DEFAULT_CACHE_DURATION_SECONDS, expectWarning: false });
  });

  it('should use cache duration from valid env var', async () => {
    await testCacheBehavior({ envValue: '1200', expectedDuration: 1200, expectWarning: false });
  });

  it('should use default cache duration and warn if env var is "invalid-value"', async () => {
    await testCacheBehavior({ envValue: 'invalid-value', expectedDuration: DEFAULT_CACHE_DURATION_SECONDS, expectWarning: true });
  });

  it('should use default cache duration and warn if env var is "0"', async () => {
    await testCacheBehavior({ envValue: '0', expectedDuration: DEFAULT_CACHE_DURATION_SECONDS, expectWarning: true });
  });

  it('should use default cache duration and warn if env var is "-300"', async () => {
    await testCacheBehavior({ envValue: '-300', expectedDuration: DEFAULT_CACHE_DURATION_SECONDS, expectWarning: true });
  });


  it('should return JSON error and log if API returns an error', async () => {
    const upstreamStatus = 502; // ...
    const mockApiErrorResponse = new global.Response(/* ... */); // As before
    mockApiErrorResponse.status = upstreamStatus; // Ensure status is set
    mockApiErrorResponse.statusText = 'Bad Gateway';
    mockApiErrorResponse.ok = false;


    mockCache.match.mockResolvedValueOnce(undefined);
    global.fetch.mockResolvedValueOnce(mockApiErrorResponse);
    await onRequest(mockContext);
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Error fetching data from USGS API (${TEST_API_URL}): ${upstreamStatus} Bad Gateway`);
    // ... (rest of assertions remain the same)
  });

  it('should return JSON error and log if fetch itself throws an error', async () => {
    const networkError = new Error('Network failure'); // ...
    global.fetch.mockRejectedValueOnce(networkError);
    mockCache.match.mockResolvedValueOnce(undefined);
    await onRequest(mockContext);
    expect(consoleErrorSpy).toHaveBeenCalledWith(`USGS API fetch failed for ${TEST_API_URL}: Network failure`, networkError);
    // ... (rest of assertions remain the same)
  });

  it('should return JSON error and log for generic errors (e.g., response.json() fails)', async () => {
    const parsingError = new Error('Unexpected token Z'); // ...
    const mockApiResponse = new global.Response("Invalid JSON", { status: 200 });
    mockApiResponse.json = vi.fn().mockRejectedValueOnce(parsingError);
    mockCache.match.mockResolvedValueOnce(undefined);
    global.fetch.mockResolvedValueOnce(mockApiResponse);
    await onRequest(mockContext);
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Error processing request for ${TEST_API_URL}: Unexpected token Z`, parsingError);
    // ... (rest of assertions remain the same)
  });
});
