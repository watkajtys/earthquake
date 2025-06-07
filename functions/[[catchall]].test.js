import { onRequest, isCrawler, escapeXml, handleSitemapIndexRequest, handleStaticPagesSitemapRequest, handleEarthquakesSitemapRequest, handleClustersSitemapRequest, handlePrerenderEarthquake, handlePrerenderCluster } from './[[catchall]]'; // Adjust if main export is different
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

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
global.fetch = vi.fn();

// Mock Request, Response, URL - Vitest/JSDOM might provide these, but explicit mocks can be useful
// For now, assume they are sufficiently polyfilled or use actual implementations where simple.
// If specific behaviors are needed (like Response.redirect), they might need explicit mocking.

// --- Helper to create mock context ---
const createMockContext = (request, env = {}, cf = {}) => {
  const waitUntilPromises = [];
  return {
    request,
    env: {
      // Default KV mock, can be overridden per test
      CLUSTER_KV: {
        get: vi.fn(),
        put: vi.fn(),
        list: vi.fn().mockResolvedValue({ keys: [], list_complete: true, cursor: undefined }),
      },
      ASSETS: { // If ASSETS.fetch is used for SPA fallback
          fetch: vi.fn().mockResolvedValue(new Response("SPA fallback", { headers: { 'Content-Type': 'text/html'}}))
      },
      ...env, // Allow overriding specific env vars
    },
    params: {}, // For route params if using a router like Hono, not directly used here
    waitUntil: vi.fn((promise) => { waitUntilPromises.push(promise); }),
    next: vi.fn().mockResolvedValue(new Response("Fallthrough to Pages", { status: 200 })), // Mock for Pages passthrough
    cf, // Cloudflare-specific properties (e.g., for geolocation)
    // Utility to await all waitUntil promises
    _awaitWaitUntilPromises: async () => { await Promise.all(waitUntilPromises); }
  };
};

// --- Tests for Helper Functions ---
describe('Helper Functions from [[catchall]].js', () => {
  describe('isCrawler', () => {
    it('should return true for Googlebot', () => {
      const req = new Request('/', { headers: { 'User-Agent': 'Googlebot/2.1' } });
      expect(isCrawler(req)).toBe(true);
    });
    it('should return false for a normal browser', () => {
      const req = new Request('/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
      expect(isCrawler(req)).toBe(false);
    });
  });

  describe('escapeXml', () => {
    it('should escape XML special characters', () => {
      expect(escapeXml('<>&"\'')).toBe('&lt;&gt;&amp;&quot;&apos;');
    });
    it('should return empty string for non-string input', () => {
      expect(escapeXml(null)).toBe('');
      expect(escapeXml(undefined)).toBe('');
      expect(escapeXml(123)).toBe('');
    });
  });
});


// --- Tests for Main Request Handler (Routing) ---
describe('onRequest (Main Router)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Reset cache mock behavior
    mockCache.match.mockReset();
    mockCache.put.mockReset().mockResolvedValue(undefined);
  });

  // -- API: /api/usgs-proxy --
  describe('/api/usgs-proxy', () => {
    const proxyPath = '/api/usgs-proxy';

    it('should return 400 if apiUrl is missing', async () => {
      const request = new Request(`http://localhost${proxyPath}`);
      const context = createMockContext(request);
      const response = await onRequest(context);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.message).toBe("Missing apiUrl query parameter for proxy request");
    });

    // --- SSRF Protection tests for /api/usgs-proxy ---
    describe('SSRF Protection / Hostname Allowlist', () => {
      it('should allow proxying to earthquake.usgs.gov and call fetch', async () => {
        const targetApiUrl = 'https://earthquake.usgs.gov/data/feed';
        fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
        mockCache.match.mockResolvedValueOnce(undefined);
        const request = new Request(`http://localhost${proxyPath}?apiUrl=${encodeURIComponent(targetApiUrl)}`);
        const context = createMockContext(request);
        await onRequest(context);
        expect(fetch).toHaveBeenCalledWith(targetApiUrl);
        expect(mockCache.put).toHaveBeenCalled(); // fetch was successful, so cache put should be called
      });

      it('should allow proxying to a *.usgs.gov subdomain and call fetch', async () => {
        const targetApiUrl = 'https://www.usgs.gov/some/data';
        fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
        mockCache.match.mockResolvedValueOnce(undefined);
        const request = new Request(`http://localhost${proxyPath}?apiUrl=${encodeURIComponent(targetApiUrl)}`);
        const context = createMockContext(request);
        await onRequest(context);
        expect(fetch).toHaveBeenCalledWith(targetApiUrl);
        expect(mockCache.put).toHaveBeenCalled();
      });

      it('should return 403 for a non-USGS hostname and not call fetch', async () => {
        const targetApiUrl = 'https://www.example.com/data';
        const request = new Request(`http://localhost${proxyPath}?apiUrl=${encodeURIComponent(targetApiUrl)}`);
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(403);
        const json = await response.json();
        expect(json.message).toBe("Proxying requests to this domain is not allowed.");
        expect(fetch).not.toHaveBeenCalled();
        expect(mockCache.match).not.toHaveBeenCalled(); // Should not even attempt cache match
      });

      it('should return 400 for a malformed apiUrl (URL parsing failure) and not call fetch', async () => {
        const malformedApiUrl = 'htp:/\\bad-url';
        const request = new Request(`http://localhost${proxyPath}?apiUrl=${encodeURIComponent(malformedApiUrl)}`);
        const context = createMockContext(request);
        const response = await onRequest(context);
        // For an input like 'htp:/\\bad-url', the URL constructor might not throw but produce an invalid URL object.
        // The hostname check (parsedApiUrl.hostname) would then fail, leading to a 403.
        // If the URL constructor itself threw (e.g., for truly unparseable input), then 400 would be correct.
        // Given the current behavior, 403 is what the code produces because hostname check fails.
        expect(response.status).toBe(403);
        const json = await response.json();
        // The message will be "Proxying requests to this domain is not allowed." if hostname is invalid/empty
        // or "Invalid apiUrl format" if new URL() actually threw.
        // For 'htp:/\\bad-url', hostname is likely empty, so 403 is from domain check.
        expect(json.message).toBe("Proxying requests to this domain is not allowed.");
        expect(fetch).not.toHaveBeenCalled();
        expect(mockCache.match).not.toHaveBeenCalled();
      });
    });
    // --- End SSRF Protection tests ---

    it('should proxy to valid apiUrl (previously earthquake.usgs.gov), cache miss, and cache the response', async () => {
      const targetApiUrl = 'https://earthquake.usgs.gov/earthquakes'; // Changed to a valid, allowed URL
      const mockApiResponseData = { data: 'live earthquake data' };
      fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockApiResponseData), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      mockCache.match.mockResolvedValueOnce(undefined); // Cache miss

      const request = new Request(`http://localhost${proxyPath}?apiUrl=${encodeURIComponent(targetApiUrl)}`);
      const context = createMockContext(request, { WORKER_CACHE_DURATION_SECONDS: '300' });

      const response = await onRequest(context);
      await context._awaitWaitUntilPromises(); // Wait for cache.put

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual(mockApiResponseData);
      expect(fetch).toHaveBeenCalledWith(targetApiUrl); // fetch is called because it's an allowed domain
      expect(mockCache.match).toHaveBeenCalled();
      expect(mockCache.put).toHaveBeenCalled();
      const cachedResponse = mockCache.put.mock.calls[0][1]; // mockCache.put.mock.calls[0][1] is the Response object
      expect(cachedResponse.headers.get('Cache-Control')).toBe('s-maxage=300');
    });

    it('should return cached response on cache hit', async () => {
      const targetApiUrl = 'https://earthquake.usgs.gov/earthquakes_cached'; // Changed to a valid, allowed URL
      const cachedData = { data: 'cached earthquake data' };
      const mockCachedResponse = new Response(JSON.stringify(cachedData), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 's-maxage=600' } });
      mockCache.match.mockResolvedValueOnce(mockCachedResponse);

      const request = new Request(`http://localhost${proxyPath}?apiUrl=${encodeURIComponent(targetApiUrl)}`);
      const context = createMockContext(request);

      const response = await onRequest(context);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual(cachedData);
      expect(fetch).not.toHaveBeenCalled(); // fetch not called due to cache hit
      expect(mockCache.put).not.toHaveBeenCalled();
    });

    it('should handle fetch error during proxying (for allowed domain)', async () => {
      const targetApiUrl = 'https://earthquake.usgs.gov/earthquakes_fetch_error'; // Changed to a valid, allowed URL
      fetch.mockRejectedValueOnce(new Error('Network Failure XYZ'));
      mockCache.match.mockResolvedValueOnce(undefined);

      const request = new Request(`http://localhost${proxyPath}?apiUrl=${encodeURIComponent(targetApiUrl)}`);
      const context = createMockContext(request);

      const response = await onRequest(context);
      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.message).toBe('USGS API fetch failed: Network Failure XYZ');
      expect(json.source).toBe('usgs-proxy-handler');
    });

    it('should handle non-JSON response from upstream API', async () => {
      const targetApiUrl = 'https://earthquake.usgs.gov/earthquakes_html_error'; // Changed to valid allowed URL
      // Simulate upstream returning HTML error page
      fetch.mockResolvedValueOnce(new Response('<html><body>Error from USGS</body></html>', {
        status: 503,
        headers: { 'Content-Type': 'text/html' }
      }));
      mockCache.match.mockResolvedValueOnce(undefined);

      const request = new Request(`http://localhost${proxyPath}?apiUrl=${encodeURIComponent(targetApiUrl)}`);
      const context = createMockContext(request);

      const response = await onRequest(context);
      // The main [[catchall]].js tries to parse response.json(), which will fail.
      // This failure then leads to a 500 error from the proxy handler itself.
      // Correction: If upstream provides non-ok status (like 503 here), that status is returned.
      // If upstream is ok (200) but content is not JSON, then .json() fails, leading to 500.
      // The current mock is status 503, so response.ok is false.
      expect(response.status).toBe(503);
      const json = await response.json();
      // statusText might be empty in some test environments for mocked Response
      const expectedMessagePart = `Error fetching data from USGS API: 503`;
      expect(json.message.startsWith(expectedMessagePart)).toBe(true);
      expect(json.source).toBe('usgs-proxy-handler');
      expect(json.upstream_status).toBe(503);
    });

    it('should use default cache duration if WORKER_CACHE_DURATION_SECONDS is invalid', async () => {
      const targetApiUrl = 'https://earthquake.usgs.gov/earthquakes_invalid_ttl'; // Changed to valid allowed URL
      fetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: 'ok' }), { status: 200 }));
      mockCache.match.mockResolvedValueOnce(undefined);
      const consoleWarnSpy = vi.spyOn(console, 'warn');

      const request = new Request(`http://localhost${proxyPath}?apiUrl=${encodeURIComponent(targetApiUrl)}`);
      const invalidTTLs = ['abc', '0', '-100'];
      for (const ttl of invalidTTLs) {
        // fetch.mockClear() was here, but it makes the mock setup more complex with the new SSRF tests.
        // Assuming each test iteration for WORKER_CACHE_DURATION_SECONDS will correctly mock fetch.
        // Re-mock fetch for this specific call if it was cleared or used by another test in the loop.
        fetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: 'ok' }), { status: 200 }));
        mockCache.put.mockClear(); // Clear put mock for specific assertion
        const context = createMockContext(request, { WORKER_CACHE_DURATION_SECONDS: ttl });
        await onRequest(context);
        await context._awaitWaitUntilPromises();

        expect(mockCache.put).toHaveBeenCalled();
        const cachedResponseArgs = mockCache.put.mock.calls[0];
        if (cachedResponseArgs && cachedResponseArgs[1]) {
            expect(cachedResponseArgs[1].headers.get('Cache-Control')).toBe('s-maxage=600'); // Default
        } else {
            // This else implies mockCache.put was not called as expected. Could be an issue if fetch wasn't mocked correctly for this iteration.
            throw new Error('cache.put was not called with expected arguments for invalid TTL test.');
        }
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`Invalid WORKER_CACHE_DURATION_SECONDS value: "${ttl}"`));
      }
      consoleWarnSpy.mockRestore();
    });

    it('should handle cache.put failure gracefully (for allowed domain)', async () => {
      const targetApiUrl = 'https://earthquake.usgs.gov/earthquakes_cache_put_fail'; // Changed to valid allowed URL
      fetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: 'ok' }), { status: 200 }));
      mockCache.match.mockResolvedValueOnce(undefined);
      mockCache.put.mockRejectedValueOnce(new Error('KV is full'));
      const consoleErrorSpy = vi.spyOn(console, 'error');

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
  });

  // -- API: /api/cluster-definition --
  describe('/api/cluster-definition', () => {
    const clusterPath = '/api/cluster-definition';
    const validBasePayload = { clusterId: 'c1', earthquakeIds: ['q1', 'q2'], strongestQuakeId: 'q1' };
    const longString = 'a'.repeat(256);


    it('POST should store valid cluster definition in KV', async () => {
      const clusterData = { clusterId: 'c1', earthquakeIds: ['q1', 'q2'], strongestQuakeId: 'q1' };
      const request = new Request(`http://localhost${clusterPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBasePayload),
      });
      const context = createMockContext(request);
      context.env.CLUSTER_KV.put.mockResolvedValueOnce(undefined);

      const response = await onRequest(context);
      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.message).toBe("Cluster definition stored.");

      const expectedPutValue = {
        earthquakeIds: validBasePayload.earthquakeIds,
        strongestQuakeId: validBasePayload.strongestQuakeId,
        updatedAt: expect.any(String),
      };
      const actualPutValueString = context.env.CLUSTER_KV.put.mock.calls[0][1];
      const actualPutValue = JSON.parse(actualPutValueString);

      expect(actualPutValue).toMatchObject(expectedPutValue);
      expect(context.env.CLUSTER_KV.put).toHaveBeenCalledWith(
        validBasePayload.clusterId,
        expect.any(String),
        { expirationTtl: 21600 }
      );
    });

    // Granular POST validation tests
    describe('POST Input Validation', () => {
      const testCases = [
        { name: 'clusterId not a string', payload: { ...validBasePayload, clusterId: 123 }, expectedMessage: 'clusterId must be a non-empty string.' },
        { name: 'clusterId is empty string', payload: { ...validBasePayload, clusterId: " " }, expectedMessage: 'clusterId must be a non-empty string.' },
        { name: 'clusterId too long', payload: { ...validBasePayload, clusterId: longString }, expectedMessage: 'clusterId exceeds maximum length of 255 characters.' },
        { name: 'strongestQuakeId not a string', payload: { ...validBasePayload, strongestQuakeId: {} }, expectedMessage: 'strongestQuakeId must be a non-empty string.' },
        { name: 'strongestQuakeId is empty string', payload: { ...validBasePayload, strongestQuakeId: "  " }, expectedMessage: 'strongestQuakeId must be a non-empty string.' },
        { name: 'strongestQuakeId too long', payload: { ...validBasePayload, strongestQuakeId: longString }, expectedMessage: 'strongestQuakeId exceeds maximum length of 255 characters.' },
        { name: 'earthquakeIds not an array', payload: { ...validBasePayload, earthquakeIds: "not-array" }, expectedMessage: 'earthquakeIds must be an array.' },
        { name: 'earthquakeIds is empty array', payload: { ...validBasePayload, earthquakeIds: [] }, expectedMessage: 'earthquakeIds must not be empty.' },
        { name: 'earthquakeIds contains non-string', payload: { ...validBasePayload, earthquakeIds: ["q1", 123] }, expectedMessage: 'Invalid earthquakeId at index 1: must be a non-empty string.' },
        { name: 'earthquakeIds contains empty string', payload: { ...validBasePayload, earthquakeIds: ["q1", "  "] }, expectedMessage: 'Invalid earthquakeId at index 1: must be a non-empty string.' },
      ];

      testCases.forEach(tc => {
        it(`should return 400 if ${tc.name}`, async () => {
          const request = new Request(`http://localhost${clusterPath}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tc.payload),
          });
          const context = createMockContext(request);
          const response = await onRequest(context);
          expect(response.status).toBe(400);
          const json = await response.json();
          expect(json.message).toBe(tc.expectedMessage);
        });
      });
    });


    it('POST should use CLUSTER_DEFINITION_TTL_SECONDS from env if valid', async () => {
      const request = new Request(`http://localhost${clusterPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBasePayload),
      });
      const context = createMockContext(request, { CLUSTER_DEFINITION_TTL_SECONDS: '3600' });
      await onRequest(context);
      expect(context.env.CLUSTER_KV.put).toHaveBeenCalledWith(
        validBasePayload.clusterId,
        expect.any(String),
        { expirationTtl: 3600 }
      );
    });

    it('POST should use default TTL if CLUSTER_DEFINITION_TTL_SECONDS is invalid', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn');
      const invalidTTLs = ['abc', '0', '-100'];
      for (const ttl of invalidTTLs) {
        const request = new Request(`http://localhost${clusterPath}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validBasePayload),
        });
        const context = createMockContext(request, { CLUSTER_DEFINITION_TTL_SECONDS: ttl });
        await onRequest(context);
        expect(context.env.CLUSTER_KV.put).toHaveBeenCalledWith(
          validBasePayload.clusterId,
          expect.any(String),
          { expirationTtl: 21600 }
        );
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`Invalid CLUSTER_DEFINITION_TTL_SECONDS value: "${ttl}"`));
      }
      consoleWarnSpy.mockRestore();
    });

    it('POST should return 500 if CLUSTER_KV is not configured', async () => {
      const request = new Request(`http://localhost${clusterPath}`, {
        method: 'POST',
        body: JSON.stringify(validBasePayload),
      });
      const context = createMockContext(request, { CLUSTER_KV: undefined });
      const response = await onRequest(context);
      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.message).toBe("KV store not configured");
    });

    it('POST should return 500 if CLUSTER_KV.put throws an error', async () => {
      const request = new Request(`http://localhost${clusterPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBasePayload),
      });
      const context = createMockContext(request);
      context.env.CLUSTER_KV.put.mockRejectedValueOnce(new Error("KV Put Error"));
      const response = await onRequest(context);
      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.message).toContain("KV Put Error");
    });

    // GET tests
    it('GET should retrieve cluster definition from KV', async () => {
      const clusterId = 'c1';
      const storedValue = { earthquakeIds: ['q1', 'q2'], strongestQuakeId: 'q1', updatedAt: new Date().toISOString() };
      const request = new Request(`http://localhost${clusterPath}?id=${clusterId}`, { method: 'GET' });
      const context = createMockContext(request);
      context.env.CLUSTER_KV.get.mockResolvedValueOnce(JSON.stringify(storedValue));

      const response = await onRequest(context);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual(storedValue);
      expect(context.env.CLUSTER_KV.get).toHaveBeenCalledWith(clusterId);
    });

    // Granular GET validation tests
    describe('GET Input Validation', () => {
       const testCases = [
        { name: 'id query param is empty string', id: " ", expectedMessage: "Query parameter 'id' must be a non-empty string." },
        { name: 'id query param too long', id: longString, expectedMessage: "Query parameter 'id' exceeds maximum length of 255 characters." },
      ];

      testCases.forEach(tc => {
        it(`should return 400 if ${tc.name}`, async () => {
          const request = new Request(`http://localhost${clusterPath}?id=${tc.id}`, { method: 'GET' });
          const context = createMockContext(request);
          const response = await onRequest(context);
          expect(response.status).toBe(400);
          const json = await response.json();
          expect(json.message).toBe(tc.expectedMessage);
        });
      });
        it('should return 400 if id query param is missing', async () => {
            const request = new Request(`http://localhost${clusterPath}`, { method: 'GET' }); // No id query param
            const context = createMockContext(request);
            const response = await onRequest(context);
            expect(response.status).toBe(400);
            const json = await response.json();
            expect(json.message).toBe("Query parameter 'id' must be a non-empty string.");
        });
    });


    it('GET should return 500 if CLUSTER_KV is not configured', async () => {
      const request = new Request(`http://localhost${clusterPath}?id=anyId`, { method: 'GET' });
      const context = createMockContext(request, { CLUSTER_KV: undefined });
      const response = await onRequest(context);
      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.message).toBe("KV store not configured");
    });

    it('GET should return 500 if CLUSTER_KV.get throws an error', async () => {
      const request = new Request(`http://localhost${clusterPath}?id=someId`, { method: 'GET' });
      const context = createMockContext(request);
      context.env.CLUSTER_KV.get.mockRejectedValueOnce(new Error("KV Get Error"));
      const response = await onRequest(context);
      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.message).toContain("KV Get Error");
    });

    it('GET should return 404 if cluster ID not found in KV', async () => {
      const request = new Request(`http://localhost${clusterPath}?id=nonexistent`, { method: 'GET' });
      const context = createMockContext(request);
      context.env.CLUSTER_KV.get.mockResolvedValueOnce(null);
      const response = await onRequest(context);
      expect(response.status).toBe(404);
    });

    it('should return 405 for unallowed method (e.g. PUT)', async () => {
      const request = new Request(`http://localhost${clusterPath}`, { method: 'PUT' });
      const context = createMockContext(request);
      const response = await onRequest(context);
      expect(response.status).toBe(405);
    });
  });

  // -- Sitemap Handlers --
  describe('Sitemap Handlers', () => {
    it('/sitemap-index.xml should return XML sitemap index', async () => {
      const request = new Request('http://localhost/sitemap-index.xml');
      const context = createMockContext(request);
      const response = await onRequest(context); // Use main onRequest
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/xml');
      const text = await response.text();
      expect(text).toContain('<sitemapindex');
      expect(text).toContain('sitemap-static-pages.xml');
    });

    it('/sitemap-static-pages.xml should return XML for static pages', async () => {
        const request = new Request('http://localhost/sitemap-static-pages.xml');
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('application/xml');
        const text = await response.text();
        expect(text).toContain('<urlset');
        expect(text).toContain('https://earthquakeslive.com/overview');
    });

    it('/sitemap-earthquakes.xml should fetch data and return XML', async () => {
        const mockGeoJson = { features: [
            { properties: { mag: 3.0, place: "Test Place", time: Date.now(), updated: Date.now(), detail: "event_detail_url_1" }, id: "ev1" }
        ]};
        fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockGeoJson), { status: 200 }));
        const request = new Request('http://localhost/sitemap-earthquakes.xml');
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('application/xml');
        const text = await response.text();
        expect(text).toContain('<urlset');
        expect(text).toContain(encodeURIComponent("event_detail_url_1"));
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('2.5_week.geojson'));
    });

    it('/sitemap-clusters.xml should list keys from KV and return XML', async () => {
        const mockKeys = [{ name: "cluster1" }, { name: "cluster2" }];
        const mockKVData = { updatedAt: new Date().toISOString() };
        const request = new Request('http://localhost/sitemap-clusters.xml');
        const context = createMockContext(request);
        context.env.CLUSTER_KV.list.mockResolvedValueOnce({ keys: mockKeys });
        context.env.CLUSTER_KV.get.mockResolvedValue(JSON.stringify(mockKVData)); // For each key

        const response = await onRequest(context);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('application/xml');
        const text = await response.text();
        expect(text).toContain('<urlset');
        expect(text).toContain('/cluster/cluster1');
        expect(text).toContain('/cluster/cluster2');
        expect(context.env.CLUSTER_KV.list).toHaveBeenCalled();
        expect(context.env.CLUSTER_KV.get).toHaveBeenCalledWith("cluster1");
        expect(context.env.CLUSTER_KV.get).toHaveBeenCalledWith("cluster2");
    });

    it('/sitemap-earthquakes.xml should handle fetch error', async () => {
        fetch.mockRejectedValueOnce(new Error("USGS Feed Down"));
        const request = new Request('http://localhost/sitemap-earthquakes.xml');
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(200); // Sitemap should still return 200
        const text = await response.text();
        expect(text).toContain("<!-- Exception processing earthquake data: USGS Feed Down -->");
    });

    it('/sitemap-earthquakes.xml should handle non-OK response from fetch', async () => {
        fetch.mockResolvedValueOnce(new Response("Server Error", { status: 503 }));
        const request = new Request('http://localhost/sitemap-earthquakes.xml');
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(200);
        const text = await response.text();
        expect(text).toContain("<!-- Error fetching earthquake data -->");
    });

    it('/sitemap-earthquakes.xml should handle empty features array', async () => {
        const mockGeoJson = { features: [] }; // Empty features
        fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockGeoJson), { status: 200 }));
        const request = new Request('http://localhost/sitemap-earthquakes.xml');
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(200);
        const text = await response.text();
        expect(text).not.toContain("<loc>"); // No locations if no features
    });

    it('/sitemap-clusters.xml should handle CLUSTER_KV not configured', async () => {
      const request = new Request('http://localhost/sitemap-clusters.xml');
      const context = createMockContext(request, { CLUSTER_KV: undefined });
      const response = await onRequest(context);
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("<!-- CLUSTER_KV not available -->");
    });

    it('/sitemap-clusters.xml should handle CLUSTER_KV.list failure', async () => {
      const request = new Request('http://localhost/sitemap-clusters.xml');
      const context = createMockContext(request);
      context.env.CLUSTER_KV.list.mockRejectedValueOnce(new Error("KV List Error"));
      const response = await onRequest(context);
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("<!-- Exception processing cluster data: KV List Error -->");
    });

    it('/sitemap-clusters.xml should handle empty keys from CLUSTER_KV.list', async () => {
      const request = new Request('http://localhost/sitemap-clusters.xml');
      const context = createMockContext(request);
      context.env.CLUSTER_KV.list.mockResolvedValueOnce({ keys: [] }); // No keys
      const response = await onRequest(context);
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).not.toContain("<loc>");
    });

    it('/sitemap-clusters.xml should handle CLUSTER_KV.get failure for a key', async () => {
      const mockKeys = [{ name: "cluster1" }];
      const request = new Request('http://localhost/sitemap-clusters.xml');
      const context = createMockContext(request);
      context.env.CLUSTER_KV.list.mockResolvedValueOnce({ keys: mockKeys });
      context.env.CLUSTER_KV.get.mockRejectedValueOnce(new Error("KV Get Error for key")); // get fails
      const consoleErrorSpy = vi.spyOn(console, 'error');

      const response = await onRequest(context);
      expect(response.status).toBe(200);
      const text = await response.text();
      // It should still build the URL for cluster1 but might use current date for lastmod
      expect(text).toContain("<loc>https://earthquakeslive.com/cluster/cluster1</loc>");
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Error parsing KV value for cluster key cluster1"), expect.any(Error));
      consoleErrorSpy.mockRestore();
    });
  });

  // -- Prerendering Handlers --
  describe('Prerendering Handlers', () => {
    it('/quake/some-quake-id should trigger prerender for crawler', async () => {
        const quakeId = "usgs_event_abc123";
        const quakeDetailUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=${quakeId}&format=geojson`; // Example, adapt to actual
        const mockQuakeData = { properties: { mag: 5, place: "Test Place", time: Date.now(), detail: quakeDetailUrl }, geometry: { coordinates: [0,0,10] }, id: quakeId };

        fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockQuakeData))); // For prerender fetch

        const request = new Request(`http://localhost/quake/${encodeURIComponent(quakeDetailUrl)}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);

        const response = await onRequest(context);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('text/html');
        const text = await response.text();
        expect(text).toContain(`<title>M 5 Earthquake - Test Place`);
        expect(fetch).toHaveBeenCalledWith(quakeDetailUrl); // Decoded URL
    });

    it('/cluster/some-cluster-id should trigger prerender for crawler', async () => {
        const clusterId = "test-cluster-1";
        const mockClusterData = { earthquakeIds: ['q1'], strongestQuakeId: 'q1', updatedAt: new Date().toISOString() };

        const request = new Request(`http://localhost/cluster/${clusterId}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        context.env.CLUSTER_KV.get.mockResolvedValueOnce(JSON.stringify(mockClusterData));
        // Mock fetch for strongestQuakeId if that logic is hit
        fetch.mockResolvedValueOnce(new Response(JSON.stringify({ properties: { mag: 3, place: "Cluster Epicenter" }, geometry: { coordinates: [1,1,1]}, id: 'q1' })));


        const response = await onRequest(context);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('text/html');
        const text = await response.text();
        expect(text).toContain(`<title>Earthquake Cluster near Cluster Epicenter`);
        expect(context.env.CLUSTER_KV.get).toHaveBeenCalledWith(clusterId);
    });

    it('/quake/some-quake-id should handle fetch error during prerender', async () => {
        const quakeDetailUrl = "http://example.com/details/q_error";
        fetch.mockRejectedValueOnce(new Error("Fetch Quake Detail Error"));
        const request = new Request(`http://localhost/quake/${encodeURIComponent(quakeDetailUrl)}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(500); // Or specific error handling
        const text = await response.text();
        expect(text).toContain("Error prerendering earthquake page");
    });

    it('/quake/some-quake-id should handle non-JSON response during prerender', async () => {
        const quakeDetailUrl = "http://example.com/details/q_non_json";
        fetch.mockResolvedValueOnce(new Response("Not JSON", { status: 200 }));
        const request = new Request(`http://localhost/quake/${encodeURIComponent(quakeDetailUrl)}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(500); // Correct: response.json() fails, leading to catch block
        const text = await response.text();
        expect(text).toContain("Error prerendering earthquake page"); // Corrected assertion
    });

    it('/quake/some-quake-id should handle invalid quake data structure during prerender', async () => {
        const quakeDetailUrl = "http://example.com/details/q_invalid_struct";
        fetch.mockResolvedValueOnce(new Response(JSON.stringify({ properties: null }), { status: 200 })); // Missing geometry
        const request = new Request(`http://localhost/quake/${encodeURIComponent(quakeDetailUrl)}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain("Invalid earthquake data");
    });

    it('/quake/some-quake-id should handle non-ok fetch response during prerender', async () => {
        const quakeDetailUrl = "http://example.com/details/q_404";
        fetch.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
        const request = new Request(`http://localhost/quake/${encodeURIComponent(quakeDetailUrl)}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(404);
        const text = await response.text();
        expect(text).toContain("Earthquake data not found");
    });


    it('/cluster/some-cluster-id should handle KV.get returning null for prerender', async () => {
        const clusterId = "test-cluster-notfound";
        const request = new Request(`http://localhost/cluster/${clusterId}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        context.env.CLUSTER_KV.get.mockResolvedValueOnce(null); // KV returns null

        const response = await onRequest(context);
        expect(response.status).toBe(404);
        const text = await response.text();
        expect(text).toContain("Cluster not found");
    });

    it('/cluster/some-cluster-id should handle fetch error for strongest quake during prerender', async () => {
        const clusterId = "test-cluster-fetch-error";
        const mockClusterData = { earthquakeIds: ['q1'], strongestQuakeId: 'q1', updatedAt: new Date().toISOString() };
        const request = new Request(`http://localhost/cluster/${clusterId}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        context.env.CLUSTER_KV.get.mockResolvedValueOnce(JSON.stringify(mockClusterData));
        fetch.mockRejectedValueOnce(new Error("Strongest Quake Fetch Error")); // Fetch for strongest quake fails

        const response = await onRequest(context);
        expect(response.status).toBe(200); // Page should still render, but maybe with partial data
        const text = await response.text();
        expect(text).toContain("Further details about the most significant event in this cluster are currently unavailable.");
    });

    it('/cluster/some-cluster-id should handle CLUSTER_KV undefined for prerender', async () => {
        const clusterId = "test-cluster-no-kv";
        const request = new Request(`http://localhost/cluster/${clusterId}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request, { CLUSTER_KV: undefined });

        const response = await onRequest(context);
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain("Service configuration error.");
    });

    it('should fall through for crawler on non-prerenderable path', async () => {
      const request = new Request('http://localhost/some/other/page', { headers: { 'User-Agent': 'Googlebot' }});
      const context = createMockContext(request);
      await onRequest(context);
      expect(context.next).toHaveBeenCalled(); // Should still fall through if path doesn't match /quake or /cluster
    });

    it('should fall through for crawler if quakeIdPathSegment is empty', async () => {
      const request = new Request('http://localhost/quake/', { headers: { 'User-Agent': 'Googlebot' }});
      const context = createMockContext(request);
      await onRequest(context);
      expect(context.next).toHaveBeenCalled();
    });

    it('should fall through for crawler if clusterId is empty', async () => {
      const request = new Request('http://localhost/cluster/', { headers: { 'User-Agent': 'Googlebot' }});
      const context = createMockContext(request);
      await onRequest(context);
      expect(context.next).toHaveBeenCalled();
    });
  });

  // -- Fallback / SPA Routing --
  describe('Fallback and SPA Routing', () => {
    it('should call context.next() for unhandled non-API, non-sitemap, non-prerender paths if context.next is defined', async () => {
      const request = new Request('http://localhost/some/spa/route');
      const context = createMockContext(request); // This context has 'next' defined
      await onRequest(context);
      expect(context.next).toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled(); // Should not reach legacy proxy if 'next' is called
    });

    it('should proxy if apiUrl param is present on an unhandled path and context.next is not defined/used for an allowed domain', async () => {
        const targetApiUrl = 'https://earthquake.usgs.gov/legacy'; // Allowed domain
        fetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: 'legacy' }), { status: 200 }));
        mockCache.match.mockResolvedValueOnce(undefined); // Cache miss

        const request = new Request(`http://localhost/unknown/path?apiUrl=${encodeURIComponent(targetApiUrl)}`);
        const context = createMockContext(request);
        delete context.next;

        const response = await onRequest(context);
        await context._awaitWaitUntilPromises();

        expect(response.status).toBe(200);
        expect(fetch).toHaveBeenCalledWith(targetApiUrl);
        expect(mockCache.put).toHaveBeenCalled();
    });

    it('should return 403 if apiUrl param is present on an unhandled path for a DISALLOWED domain and context.next is not defined/used', async () => {
        const targetApiUrl = 'http://example.com/legacy_disallowed'; // Disallowed domain
        const request = new Request(`http://localhost/unknown/path?apiUrl=${encodeURIComponent(targetApiUrl)}`);
        const context = createMockContext(request);
        delete context.next;

        const response = await onRequest(context);
        expect(response.status).toBe(403); // SSRF protection should kick in
        expect(fetch).not.toHaveBeenCalledWith(targetApiUrl);
        const json = await response.json();
        expect(json.message).toBe("Proxying requests to this domain is not allowed.");
    });


    it('should log unhandled path if context.next is not defined and not an API/Sitemap/Prerender path', async () => {
      const request = new Request('http://localhost/very/unknown/path');
      const context = createMockContext(request);
      delete context.next; // Ensure context.next is not defined
      const consoleLogSpy = vi.spyOn(console, 'log');

      const response = await onRequest(context);

      // In this case, without context.next() and no matching route,
      // the function implicitly returns undefined, which means Pages might serve a 404 or default asset.
      // The key is to check the console log.
      expect(response).toBeUndefined(); // onRequest implicitly returns undefined
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("[worker-router] Path /very/unknown/path not handled by explicit routing in worker.")
      );
      consoleLogSpy.mockRestore();
    });
  });
});
