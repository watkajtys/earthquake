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

    it('should proxy to apiUrl, cache miss, and cache the response', async () => {
      const targetApiUrl = 'http://example.com/earthquakes';
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
      expect(fetch).toHaveBeenCalledWith(targetApiUrl);
      expect(mockCache.match).toHaveBeenCalled();
      expect(mockCache.put).toHaveBeenCalled();
      const cachedResponse = mockCache.put.mock.calls[0][1];
      expect(cachedResponse.headers.get('Cache-Control')).toBe('s-maxage=300');
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
      expect(fetch).not.toHaveBeenCalled();
      expect(mockCache.put).not.toHaveBeenCalled();
    });

    it('should handle fetch error during proxying', async () => {
      const targetApiUrl = 'http://example.com/earthquakes_fetch_error';
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
      const targetApiUrl = 'http://example.com/earthquakes_html_error';
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
      expect(response.status).toBe(500);
      const json = await response.json();
      // The error message will be about failing to parse JSON, not the upstream status directly in message
      expect(json.message).toMatch(/invalid json response body|Unexpected token/i);
      expect(json.source).toBe('usgs-proxy-handler');
    });

    it('should use default cache duration if WORKER_CACHE_DURATION_SECONDS is invalid', async () => {
      const targetApiUrl = 'http://example.com/earthquakes_invalid_ttl';
      fetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: 'ok' }), { status: 200 }));
      mockCache.match.mockResolvedValueOnce(undefined);
      const consoleWarnSpy = vi.spyOn(console, 'warn');

      const request = new Request(`http://localhost${proxyPath}?apiUrl=${encodeURIComponent(targetApiUrl)}`);
      const invalidTTLs = ['abc', '0', '-100'];
      for (const ttl of invalidTTLs) {
        fetch.mockClear(); // Clear fetch for next iteration's call
        fetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: 'ok' }), { status: 200 }));
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

    it('POST should store valid cluster definition in KV', async () => {
      const clusterData = { clusterId: 'c1', earthquakeIds: ['q1', 'q2'], strongestQuakeId: 'q1' };
      const request = new Request(`http://localhost${clusterPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clusterData),
      });
      const context = createMockContext(request);
      context.env.CLUSTER_KV.put.mockResolvedValueOnce(undefined);

      const response = await onRequest(context);
      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.message).toBe("Cluster definition stored.");

      const expectedPutValue = {
        earthquakeIds: clusterData.earthquakeIds,
        strongestQuakeId: clusterData.strongestQuakeId,
        updatedAt: expect.any(String), // Check that updatedAt is a string (ISO date)
      };
      const actualPutValueString = context.env.CLUSTER_KV.put.mock.calls[0][1];
      const actualPutValue = JSON.parse(actualPutValueString);

      expect(actualPutValue).toMatchObject(expectedPutValue);
      expect(context.env.CLUSTER_KV.put).toHaveBeenCalledWith(
        clusterData.clusterId,
        expect.any(String), // Already checked content with toMatchObject
        { expirationTtl: 21600 } // Default TTL
      );
    });

    it('POST should use CLUSTER_DEFINITION_TTL_SECONDS from env if valid', async () => {
      const clusterData = { clusterId: 'c_ttl_test', earthquakeIds: ['q1'], strongestQuakeId: 'q1' };
      const request = new Request(`http://localhost${clusterPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clusterData),
      });
      const context = createMockContext(request, { CLUSTER_DEFINITION_TTL_SECONDS: '3600' });
      await onRequest(context);
      expect(context.env.CLUSTER_KV.put).toHaveBeenCalledWith(
        clusterData.clusterId,
        expect.any(String),
        { expirationTtl: 3600 }
      );
    });

    it('POST should use default TTL if CLUSTER_DEFINITION_TTL_SECONDS is invalid', async () => {
      const clusterData = { clusterId: 'c_invalid_ttl', earthquakeIds: ['q1'], strongestQuakeId: 'q1' };
      const request = new Request(`http://localhost${clusterPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clusterData),
      });
      const consoleWarnSpy = vi.spyOn(console, 'warn');
      // Test with various invalid values
      const invalidTTLs = ['abc', '0', '-100'];
      for (const ttl of invalidTTLs) {
        context.env.CLUSTER_KV.put.mockClear(); // Clear put mock for next iteration
        const context = createMockContext(request, { CLUSTER_DEFINITION_TTL_SECONDS: ttl });
        await onRequest(context);
        expect(context.env.CLUSTER_KV.put).toHaveBeenCalledWith(
          clusterData.clusterId,
          expect.any(String),
          { expirationTtl: 21600 } // Default TTL
        );
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`Invalid CLUSTER_DEFINITION_TTL_SECONDS value: "${ttl}"`));
      }
      consoleWarnSpy.mockRestore();
    });

    it('POST should return 500 if CLUSTER_KV is not configured', async () => {
      const clusterData = { clusterId: 'c1', earthquakeIds: ['q1'], strongestQuakeId: 'q1' };
      const request = new Request(`http://localhost${clusterPath}`, {
        method: 'POST',
        body: JSON.stringify(clusterData), // Content-Type header missing, but function doesn't check it strictly
      });
      const context = createMockContext(request, { CLUSTER_KV: undefined }); // Undefined KV
      const response = await onRequest(context);
      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.message).toBe("KV store not configured");
    });

    it('POST should return 500 if CLUSTER_KV.put throws an error', async () => {
      const clusterData = { clusterId: 'c1', earthquakeIds: ['q1'], strongestQuakeId: 'q1' };
      const request = new Request(`http://localhost${clusterPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clusterData),
      });
      const context = createMockContext(request);
      context.env.CLUSTER_KV.put.mockRejectedValueOnce(new Error("KV Put Error"));
      const response = await onRequest(context);
      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.message).toContain("KV Put Error");
    });

    it('POST should return 400 for invalid data', async () => {
      const request = new Request(`http://localhost${clusterPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId: 'c1' }), // Missing fields
      });
      const context = createMockContext(request);
      const response = await onRequest(context);
      expect(response.status).toBe(400);
    });

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

    it('GET should return 500 if CLUSTER_KV is not configured', async () => {
      const request = new Request(`http://localhost${clusterPath}?id=anyId`, { method: 'GET' });
      const context = createMockContext(request, { CLUSTER_KV: undefined }); // Undefined KV
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

    it('should return 405 for unallowed method', async () => {
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
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain("Invalid earthquake data"); // From JSON parse failure
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

    it('should proxy if apiUrl param is present on an unhandled path and context.next is not defined/used', async () => {
        const targetApiUrl = 'http://example.com/legacy';
        fetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: 'legacy' }), { status: 200 }));
        mockCache.match.mockResolvedValueOnce(undefined); // Cache miss

        const request = new Request(`http://localhost/unknown/path?apiUrl=${encodeURIComponent(targetApiUrl)}`);
        // Create context without 'next' for this specific test
        const context = createMockContext(request);
        delete context.next;

        const response = await onRequest(context);
        await context._awaitWaitUntilPromises();

        expect(response.status).toBe(200);
        expect(fetch).toHaveBeenCalledWith(targetApiUrl);
        expect(mockCache.put).toHaveBeenCalled();
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
