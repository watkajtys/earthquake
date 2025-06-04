import { vi } from 'vitest';
import { onRequest } from './usgs-proxy';

// Mock Cloudflare Workers globals
global.fetch = vi.fn();

const mockCache = {
  match: vi.fn(),
  put: vi.fn(),
};
global.caches = {
  default: mockCache,
};

// global.Request = vi.fn((url, init) => ({ url, ...init, clone: vi.fn(() => ({url, ...init})) }));
// More sophisticated mock for Request if needed by the function under test for cache key generation
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
  // If it's already a Request object (like context.request)
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
    clone: vi.fn(() => ({ ...response, body: currentBody, json: response.json, text: response.text })),
    json: vi.fn(async () => JSON.parse(currentBody)),
    text: vi.fn(async () => String(currentBody)),
  };
  return response;
});


// Mock context for waitUntil
const mockContext = {
  waitUntil: vi.fn((promise) => promise), // Make waitUntil execute the promise for testing
  request: {
    url: 'http://localhost/api/usgs-proxy?apiUrl=https://example.com/api',
    clone: vi.fn(() => mockContext.request)
  }
};

const TEST_API_URL = 'https://example.com/api';

describe('onRequest proxy function', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset request URL to a default valid one for most tests
    mockContext.request.url = `http://localhost/api/usgs-proxy?apiUrl=${TEST_API_URL}`;
  });

  it('should return 400 if apiUrl query parameter is missing', async () => {
    mockContext.request.url = 'http://localhost/api/usgs-proxy'; // No apiUrl
    const response = await onRequest(mockContext);

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('Missing apiUrl query parameter');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockCache.match).not.toHaveBeenCalled();
  });

  it('should return cached response if available', async () => {
    const cachedData = { message: 'cached data' };
    const mockCachedResponse = new global.Response(JSON.stringify(cachedData), { status: 200 });
    mockCache.match.mockResolvedValueOnce(mockCachedResponse);

    const response = await onRequest(mockContext);

    expect(mockCache.match).toHaveBeenCalledTimes(1);
    // Ensure the cache key is created correctly with the apiUrl
    expect(global.Request).toHaveBeenCalledWith(TEST_API_URL, expect.anything());
    const expectedCacheKey = global.Request.mock.results[0].value; // Get the Request instance created
    expect(mockCache.match).toHaveBeenCalledWith(expectedCacheKey);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(response).toBe(mockCachedResponse); // Should return the exact cached response object
    expect(await response.json()).toEqual(cachedData);
  });

  it('should fetch from API, cache, and return response if not in cache', async () => {
    const fetchedData = { features: ['test'] };
    const mockApiResponse = new global.Response(JSON.stringify(fetchedData), { status: 200 });
    mockApiResponse.ok = true; // ensure ok is true

    mockCache.match.mockResolvedValueOnce(undefined); // Cache miss
    global.fetch.mockResolvedValueOnce(mockApiResponse);

    const response = await onRequest(mockContext);

    expect(mockCache.match).toHaveBeenCalledTimes(1);
    const expectedCacheKey = global.Request.mock.results[0].value;
    expect(mockCache.match).toHaveBeenCalledWith(expectedCacheKey);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(TEST_API_URL);

    // Verify the response passed to cache.put
    expect(mockCache.put).toHaveBeenCalledTimes(1);
    const putCallArgs = mockCache.put.mock.calls[0];
    expect(putCallArgs[0]).toEqual(expectedCacheKey); // Correct cache key

    const responseToCache = putCallArgs[1];
    expect(responseToCache.status).toBe(200);
    expect(responseToCache.headers['Cache-Control']).toBe('s-maxage=600');
    expect(responseToCache.headers['Content-Type']).toBe('application/json');
    expect(await responseToCache.json()).toEqual(fetchedData);

    expect(mockContext.waitUntil).toHaveBeenCalledTimes(1);
    // Ensure waitUntil was called with the promise from cache.put
    expect(mockContext.waitUntil.mock.calls[0][0]).toBe(mockCache.put.mock.results[0].value);


    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(fetchedData);
    // Check that the returned response also has the Cache-Control header
    expect(response.headers['Cache-Control']).toBe('s-maxage=600');
  });

  it('should fetch from API but not cache if API returns an error', async () => {
    const errorResponseFromApi = new global.Response(JSON.stringify({ message: "Server Error" }), {
      status: 500,
      statusText: 'Server Error',
    });
    errorResponseFromApi.ok = false; // Manually set ok to false for error responses

    mockCache.match.mockResolvedValueOnce(undefined); // Cache miss
    global.fetch.mockResolvedValueOnce(errorResponseFromApi);

    const response = await onRequest(mockContext);

    expect(mockCache.match).toHaveBeenCalledTimes(1);
    const expectedCacheKey = global.Request.mock.results[0].value;
    expect(mockCache.match).toHaveBeenCalledWith(expectedCacheKey);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(TEST_API_URL);

    expect(mockCache.put).not.toHaveBeenCalled();
    expect(mockContext.waitUntil).not.toHaveBeenCalled();

    expect(response.status).toBe(500);
    // The actual function returns a plain text error message for upstream errors
    expect(await response.text()).toBe(`Error fetching data from USGS API: 500 Server Error`);
  });
});
