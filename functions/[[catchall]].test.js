import { onRequest, isCrawler, escapeXml, handleSitemapIndexRequest, handleStaticPagesSitemapRequest, handleEarthquakesSitemapRequest, handleClustersSitemapRequest, handlePrerenderEarthquake, handlePrerenderCluster } from './[[catchall]]'; // Adjust if main export is different
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
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
global.fetch = vi.fn();

// Mock Request, Response, URL - Vitest/JSDOM might provide these, but explicit mocks can be useful
// For now, assume they are sufficiently polyfilled or use actual implementations where simple.
// If specific behaviors are needed (like Response.redirect), they might need explicit mocking.

// --- Helper to create mock context ---
const createMockContext = (request, env = {}, cf = {}) => {
  const waitUntilPromises = [];
  const mockDbInstance = {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    first: vi.fn(),
    run: vi.fn(),
    all: vi.fn(),
  };

  return {
    request,
    env: {
      DB: mockDbInstance, // Default D1 mock
      // Default KV mock, can be overridden per test (though less used now)
      CLUSTER_KV: { // Kept for any tests that might still use it or for completeness
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
      // Ensure upsertEarthquakeFeaturesToD1 is reset and configured for this test
      upsertEarthquakeFeaturesToD1.mockResolvedValue({ successCount: 1, errorCount: 0 });


      const response = await onRequest(context);
      await context._awaitWaitUntilPromises(); // Wait for cache.put and D1 upsert

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual(mockApiResponseData);
      expect(fetch).toHaveBeenCalledWith(targetApiUrl);
      expect(mockCache.match).toHaveBeenCalled();
      expect(mockCache.put).toHaveBeenCalled();
      const cachedResponse = mockCache.put.mock.calls[0][1];
      expect(cachedResponse.headers.get('Cache-Control')).toBe('s-maxage=300');

      // Verify that the D1 utility was called if data.features existed
      if (mockApiResponseData.features && mockApiResponseData.features.length > 0) {
        expect(upsertEarthquakeFeaturesToD1).toHaveBeenCalledWith(context.env.DB, mockApiResponseData.features);
      } else if (mockApiResponseData.id && mockApiResponseData.type === 'Feature') {
        // If it's a single feature, current proxy logic doesn't call the bulk upsert.
        // This part of the test might need adjustment based on whether single features should also be upserted by the proxy.
        // For now, assume it's not called for single features by the proxy.
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
      fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockApiResponseData), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      mockCache.match.mockResolvedValueOnce(undefined); // Cache miss
      upsertEarthquakeFeaturesToD1.mockResolvedValue({ successCount: 2, errorCount: 0 });


      const request = new Request(`http://localhost${proxyPath}?apiUrl=${encodeURIComponent(targetApiUrl)}`);
      const context = createMockContext(request, { WORKER_CACHE_DURATION_SECONDS: '300' });

      const response = await onRequest(context);
      await context._awaitWaitUntilPromises();

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual(mockApiResponseData);
      expect(fetch).toHaveBeenCalledWith(targetApiUrl);
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
      expect(fetch).not.toHaveBeenCalled();
      expect(mockCache.put).not.toHaveBeenCalled();
      expect(upsertEarthquakeFeaturesToD1).not.toHaveBeenCalled(); // D1 util should not be called on cache hit
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
      expect(upsertEarthquakeFeaturesToD1).not.toHaveBeenCalled();
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
      expect(response.status).toBe(503); // Status from upstream
      const json = await response.json();
      const expectedMessagePart = `Error fetching data from USGS API: 503`;
      expect(json.message.startsWith(expectedMessagePart)).toBe(true);
      expect(json.source).toBe('usgs-proxy-handler');
      expect(json.upstream_status).toBe(503);
      expect(upsertEarthquakeFeaturesToD1).not.toHaveBeenCalled();
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

    it('/sitemap-clusters.xml should list clusters from D1 and return XML', async () => {
        const mockD1Results = [
            { clusterId: "cluster1", updatedAt: new Date().toISOString() },
            { clusterId: "cluster2", updatedAt: new Date(Date.now() - 86400000).toISOString() } // 1 day ago
        ];
        const request = new Request('http://localhost/sitemap-clusters.xml');
        const context = createMockContext(request);
        context.env.DB.all.mockResolvedValueOnce({ results: mockD1Results, success: true });

        const response = await onRequest(context);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('application/xml');
        const text = await response.text();
        expect(text).toContain('<urlset');
        expect(text).toContain('/cluster/cluster1');
        expect(text).toContain(mockD1Results[0].updatedAt);
        expect(text).toContain('/cluster/cluster2');
        expect(text).toContain(mockD1Results[1].updatedAt);
        expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("SELECT clusterId, updatedAt FROM ClusterDefinitions"));
        expect(context.env.DB.all).toHaveBeenCalled();
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

    it('/sitemap-clusters.xml should handle DB not configured', async () => {
      const request = new Request('http://localhost/sitemap-clusters.xml');
      // Explicitly set DB to undefined for this specific test
      const context = createMockContext(request, { DB: undefined });
      const response = await onRequest(context);
      expect(response.status).toBe(200); // Sitemap handler itself returns 200
      const text = await response.text();
      // Check for the specific comment indicating DB is not available
      expect(text).toContain("<!-- D1 Database not available -->");
    });

    it('/sitemap-clusters.xml should handle D1 query failure', async () => {
      const request = new Request('http://localhost/sitemap-clusters.xml');
      const context = createMockContext(request);
      context.env.DB.all.mockRejectedValueOnce(new Error("D1 Query Error")); // Simulate D1 throwing an error
      const response = await onRequest(context);
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("<!-- Exception processing cluster data from D1: D1 Query Error -->");
    });

    it('/sitemap-clusters.xml should handle empty results from D1', async () => {
      const request = new Request('http://localhost/sitemap-clusters.xml');
      const context = createMockContext(request);
      context.env.DB.all.mockResolvedValueOnce({ results: [], success: true }); // D1 returns empty array
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); // Spy on console.log
      const response = await onRequest(context);
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).not.toContain("<loc>"); // No <loc> tags if no results
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("No cluster definitions found in D1 table ClusterDefinitions."));
      consoleLogSpy.mockRestore();
    });

    it('/sitemap-clusters.xml should use current date if updatedAt is null/missing from D1', async () => {
      const mockD1Results = [{ clusterId: "cluster_no_date", updatedAt: null }];
      const request = new Request('http://localhost/sitemap-clusters.xml');
      const context = createMockContext(request);
      context.env.DB.all.mockResolvedValueOnce({ results: mockD1Results, success: true });
      const currentDate = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD part

      const response = await onRequest(context);
      const text = await response.text();
      expect(text).toContain(`<loc>https://earthquakeslive.com/cluster/cluster_no_date</loc>`);
      expect(text).toContain(`<lastmod>${currentDate}`); // Check if it contains the current date part
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

    it('/cluster/some-cluster-id should trigger prerender for crawler using D1', async () => {
        const clusterId = "test-cluster-d1";
        const mockClusterD1Data = {
            earthquakeIds: JSON.stringify(['q1', 'q2']), // Stored as JSON string
            strongestQuakeId: 'q1',
            updatedAt: new Date().toISOString()
        };
        const mockStrongestQuakeDetails = { properties: { mag: 3, place: "Cluster Epicenter D1" }, geometry: { coordinates: [1,1,1]}, id: 'q1' };

        const request = new Request(`http://localhost/cluster/${clusterId}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);

        // Setup mocks for D1
        const mockD1First = vi.fn().mockResolvedValueOnce(mockClusterD1Data);
        const mockD1Bind = vi.fn().mockReturnValueOnce({ first: mockD1First });
        context.env.DB.prepare.mockReturnValueOnce({ bind: mockD1Bind });

        // Mock fetch for strongest quake details
        fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockStrongestQuakeDetails)));

        const response = await onRequest(context);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('text/html');
        const text = await response.text();
        expect(text).toContain(`<title>Earthquake Cluster near Cluster Epicenter D1`);
        expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("SELECT earthquakeIds, strongestQuakeId, updatedAt FROM ClusterDefinitions WHERE clusterId = ?"));
        expect(mockD1Bind).toHaveBeenCalledWith(clusterId); // Assert on the captured mock
        expect(mockD1First).toHaveBeenCalled(); // Assert on the captured mock
    });

    // ... (other /quake/ tests remain unchanged) ...

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


    it('/cluster/some-cluster-id should handle D1 returning null for prerender', async () => {
        const clusterId = "test-cluster-notfound-d1";
        const request = new Request(`http://localhost/cluster/${clusterId}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        context.env.DB.prepare.mockReturnValueOnce({ bind: vi.fn().mockReturnValueOnce({ first: vi.fn().mockResolvedValueOnce(null) }) }); // D1 returns null for the cluster

        const response = await onRequest(context);
        expect(response.status).toBe(404);
        const text = await response.text();
        expect(text).toContain("Cluster not found");
    });

    it('/cluster/some-cluster-id should handle D1 error during prerender', async () => {
        const clusterId = "test-cluster-d1-error";
        const request = new Request(`http://localhost/cluster/${clusterId}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        context.env.DB.prepare.mockReturnValueOnce({ bind: vi.fn().mockReturnValueOnce({ first: vi.fn().mockRejectedValueOnce(new Error("D1 .first() error")) }) });

        const response = await onRequest(context);
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain("Error prerendering cluster page");
    });

    it('/cluster/some-cluster-id should handle fetch error for strongest quake during prerender (D1 context)', async () => {
        const clusterId = "test-cluster-fetch-error-d1";
        const mockClusterD1Data = { earthquakeIds: JSON.stringify(['q1']), strongestQuakeId: 'q1', updatedAt: new Date().toISOString() };
        const request = new Request(`http://localhost/cluster/${clusterId}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        context.env.DB.prepare.mockReturnValueOnce({ bind: vi.fn().mockReturnValueOnce({ first: vi.fn().mockResolvedValueOnce(mockClusterD1Data) }) });
        fetch.mockRejectedValueOnce(new Error("Strongest Quake Fetch Error D1"));

        const response = await onRequest(context);
        expect(response.status).toBe(200); // Should still render the page but with a fallback message
        const text = await response.text();
        expect(text).toContain("Further details about the most significant event in this cluster are currently unavailable.");
    });

    it('/cluster/some-cluster-id should handle DB undefined for prerender', async () => {
        const clusterId = "test-cluster-no-db";
        const request = new Request(`http://localhost/cluster/${clusterId}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request, { DB: undefined }); // DB is not configured

        const response = await onRequest(context);
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain("Service configuration error.");
    });

    it('/cluster/some-cluster-id should handle error parsing earthquakeIds from D1', async () => {
        const clusterId = "test-cluster-bad-json-d1";
        const mockClusterD1DataBadJson = {
            earthquakeIds: "this is not json", // Invalid JSON string
            strongestQuakeId: 'q1',
            updatedAt: new Date().toISOString()
        };
        const request = new Request(`http://localhost/cluster/${clusterId}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);

        const mockD1First = vi.fn().mockResolvedValueOnce(mockClusterD1DataBadJson);
        context.env.DB.prepare.mockReturnValueOnce({ bind: vi.fn().mockReturnValueOnce({ first: mockD1First }) });
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});


        const response = await onRequest(context);
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain("Error processing cluster data.");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining(`[prerender-cluster] Error parsing earthquakeIds for cluster ${clusterId}: Unexpected token`)
        );
        consoleErrorSpy.mockRestore();
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
