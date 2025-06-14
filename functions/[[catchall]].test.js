import { onRequest, isCrawler, escapeXml, handleClustersSitemapRequest, handlePrerenderCluster } from './[[catchall]]'; // Adjust if main export is different
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
    next: vi.fn().mockResolvedValue(new Response("Fallback to env.ASSETS.fetch for static assets", { status: 200 })), // Mock for Worker serving static assets
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
    fetch.mockReset(); // Reset global fetch mock
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
      expect(fetch).toHaveBeenCalledWith(targetApiUrl, { headers: { "User-Agent": "EarthquakesLive/1.0 (+https://earthquakeslive.com)" } });
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
      expect(fetch).toHaveBeenCalledWith(targetApiUrl, { headers: { "User-Agent": "EarthquakesLive/1.0 (+https://earthquakeslive.com)" } });
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
    beforeEach(() => {
        vi.resetAllMocks();
        fetch.mockReset(); // Reset global fetch for sitemap tests too
    });

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

    it('/sitemap-clusters.xml should list clusters from D1 and return XML (old format)', async () => {
        // This test remains to ensure the old logic (before new URL format changes) still works if needed,
        // or serves as a baseline before testing the new changes.
        // For the new URL format, specific tests are added in the suite below.
        const mockD1Results = [
            { clusterId: "overview_cluster_cluster1_10", updatedAt: new Date().toISOString() },
        ];
        const request = new Request('http://localhost/sitemap-clusters.xml');
        const context = createMockContext(request);
        context.env.DB.all.mockResolvedValueOnce({ results: mockD1Results, success: true });

        // Mock fetch for the new logic (it will be called by the updated sitemap handler)
        fetch.mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "Test Place", mag: 5.0 } }), { status: 200 }));


        const response = await onRequest(context); // Calls handleClustersSitemapRequest
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('application/xml');
        const text = await response.text();
        expect(text).toContain('<urlset');
        // The URL will now be in the new format due to the function updates
        expect(text).toContain('https://earthquakeslive.com/cluster/10-quakes-near-test-place-up-to-m5.0-cluster1');
        expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("SELECT clusterId, updatedAt FROM ClusterDefinitions"));
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

    // New tests for handleClustersSitemapRequest URL Generation
    describe('handleClustersSitemapRequest New URL Generation', () => {
        beforeEach(() => {
            vi.resetAllMocks(); // Resets global fetch and D1 mocks from createMockContext
            fetch.mockReset();
        });

        it('should generate correct new format URLs for valid D1 entries with successful USGS fetches', async () => {
            const mockContext = createMockContext(new Request('http://localhost/sitemap-clusters.xml'));
            const d1Results = [
                { clusterId: "overview_cluster_us7000mfp9_15", updatedAt: "2023-01-01T00:00:00Z" },
                { clusterId: "overview_cluster_ci12345_5", updatedAt: "2023-01-02T00:00:00Z" },
            ];
            mockContext.env.DB.all.mockResolvedValueOnce({ results: d1Results, success: true });

            fetch
                .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "Southern Sumatra, Indonesia", mag: 5.8 } }), { status: 200 }))
                .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "California", mag: 4.2 } }), { status: 200 }));

            const response = await handleClustersSitemapRequest(mockContext);
            const xml = await response.text();

            expect(response.status).toBe(200);
            expect(xml).toContain('<loc>https://earthquakeslive.com/cluster/15-quakes-near-southern-sumatra-indonesia-up-to-m5.8-us7000mfp9</loc>');
            expect(xml).toContain('<lastmod>2023-01-01T00:00:00.000Z</lastmod>');
            expect(xml).toContain('<loc>https://earthquakeslive.com/cluster/5-quakes-near-california-up-to-m4.2-ci12345</loc>');
            expect(xml).toContain('<lastmod>2023-01-02T00:00:00.000Z</lastmod>');
            expect(fetch).toHaveBeenCalledTimes(2);
        });

        it('should skip entries if D1 clusterId parsing fails and log a warning', async () => {
            const mockContext = createMockContext(new Request('http://localhost/sitemap-clusters.xml'));
            const d1Results = [
                { clusterId: "invalid_format_id", updatedAt: "2023-01-01T00:00:00Z" },
                { clusterId: "overview_cluster_ci12345_5", updatedAt: "2023-01-02T00:00:00Z" },
            ];
            mockContext.env.DB.all.mockResolvedValueOnce({ results: d1Results, success: true });
            fetch.mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "California", mag: 4.2 } }), { status: 200 }));
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const response = await handleClustersSitemapRequest(mockContext);
            const xml = await response.text();

            expect(xml).not.toContain('invalid_format_id');
            expect(xml).toContain('https://earthquakeslive.com/cluster/5-quakes-near-california-up-to-m4.2-ci12345');
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse D1 clusterId: invalid_format_id'));
            expect(fetch).toHaveBeenCalledTimes(1);
            consoleWarnSpy.mockRestore();
        });

        it('should skip entries if USGS fetch fails and log a warning/error', async () => {
            const mockContext = createMockContext(new Request('http://localhost/sitemap-clusters.xml'));
            const d1Results = [
                { clusterId: "overview_cluster_us7000mfp9_15", updatedAt: "2023-01-01T00:00:00Z" },
                { clusterId: "overview_cluster_ci12345_5", updatedAt: "2023-01-02T00:00:00Z" },
            ];
            mockContext.env.DB.all.mockResolvedValueOnce({ results: d1Results, success: true });

            fetch
                .mockResolvedValueOnce(new Response("USGS Error", { status: 500 })) // Fail for us7000mfp9
                .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "California", mag: 4.2 } }), { status: 200 }));
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const response = await handleClustersSitemapRequest(mockContext);
            const xml = await response.text();

            expect(xml).not.toContain('15-quakes-near'); // Should not contain the URL for the failed one
            expect(xml).toContain('https://earthquakeslive.com/cluster/5-quakes-near-california-up-to-m4.2-ci12345');
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('USGS fetch failed for us7000mfp9: 500'));
            expect(fetch).toHaveBeenCalledTimes(2);
            consoleWarnSpy.mockRestore();
        });

        it('should skip entries if USGS response is missing place or mag and log a warning', async () => {
            const mockContext = createMockContext(new Request('http://localhost/sitemap-clusters.xml'));
            const d1Results = [
                { clusterId: "overview_cluster_usMissingPlace_10", updatedAt: "2023-01-03T00:00:00Z" },
                { clusterId: "overview_cluster_usMissingMag_8", updatedAt: "2023-01-04T00:00:00Z" },
                { clusterId: "overview_cluster_ci12345_5", updatedAt: "2023-01-02T00:00:00Z" },
            ];
            mockContext.env.DB.all.mockResolvedValueOnce({ results: d1Results, success: true });

            fetch
                .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { mag: 5.0 } }), { status: 200 })) // Missing place
                .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "Some Place" } }), { status: 200 })) // Missing mag
                .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "California", mag: 4.2 } }), { status: 200 }));
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const response = await handleClustersSitemapRequest(mockContext);
            const xml = await response.text();

            expect(xml).not.toContain('usMissingPlace'); // URL part for usMissingPlace
            expect(xml).not.toContain('usMissingMag');   // URL part for usMissingMag
            expect(xml).toContain('https://earthquakeslive.com/cluster/5-quakes-near-california-up-to-m4.2-ci12345');
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Missing or invalid locationName for usMissingPlace'));
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Missing or invalid maxMagnitude for usMissingMag'));
            expect(fetch).toHaveBeenCalledTimes(3);
            consoleWarnSpy.mockRestore();
        });
    });
  });

  // -- Prerendering Handlers --
  describe('Prerendering Handlers', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        fetch.mockReset();
    });

    it('/quake/some-quake-id should trigger prerender for crawler', async () => {
        const quakeId = "usgs_event_abc123"; // This is the actual ID
        const expectedFetchUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=${quakeId}`;
        const mockQuakeData = {
            properties: { mag: 5, place: "Test Place", time: Date.now(), detail: expectedFetchUrl, title: `M 5.0 - Test Place` }, // Added title to mock
            geometry: { coordinates: [0,0,10] },
            id: quakeId
        };

        fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockQuakeData)));

        // Request path should use the simple quakeId
        const request = new Request(`http://localhost/quake/${quakeId}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);

        const response = await onRequest(context);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('text/html');
        const text = await response.text();
        expect(text).toContain(`<title>M 5.0 - Test Place`); // Adjusted to match mockQuakeData.properties.title
        expect(fetch).toHaveBeenCalledWith(expectedFetchUrl);
    });

    // Original test for /cluster/some-cluster-id (old format) - may be less relevant or removed if old URLs are not supported
    it('/cluster/some-cluster-id (old format) should trigger prerender for crawler using D1', async () => {
        const clusterIdOldFormat = "test-cluster-d1-old"; // This is an old format ID
        // Unused mockClusterD1Data and its properties removed
        // const mockStrongestQuakeDetails = { properties: { mag: 3, place: "Cluster Epicenter D1 Old" }, geometry: { coordinates: [1,1,1]}, id: 'q1' }; // Unused

        const request = new Request(`http://localhost/cluster/${clusterIdOldFormat}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);

        // For old format, the regex in handlePrerenderCluster will fail.
        // So, it should return 404 for "Invalid cluster URL format."
        const response = await onRequest(context); // Calls handlePrerenderCluster

        expect(response.status).toBe(404);
        const text = await response.text();
        expect(text).toContain("Invalid cluster URL format.");
        expect(context.env.DB.prepare).not.toHaveBeenCalled(); // D1 should not be called for invalid format
    });

    describe('handlePrerenderCluster Slug Parsing and D1 Query (New URL Format)', () => {
        beforeEach(() => {
          vi.resetAllMocks();
          fetch.mockReset();
        });

        const validSlugTestCase = {
          description: 'Valid slug',
          urlSlug: '15-quakes-near-southern-sumatra-indonesia-up-to-m5.8-us7000mfp9',
          expectedStrongestQuakeId: 'us7000mfp9',
          expectedCount: '15',
          expectedD1QueryId: 'overview_cluster_us7000mfp9_15',
        };

        it(`should correctly parse slug, query D1, fetch USGS, and generate HTML for: ${validSlugTestCase.description}`, async () => {
          const { urlSlug, expectedD1QueryId, expectedStrongestQuakeId } = validSlugTestCase;
          const mockContext = createMockContext(new Request(`http://localhost/cluster/${urlSlug}`)); // Request not strictly needed by direct call

          const mockD1ClusterData = {
            earthquakeIds: JSON.stringify(['id1', 'id2']),
            strongestQuakeId: expectedStrongestQuakeId,
            updatedAt: new Date().toISOString(),
          };
          mockContext.env.DB.first.mockResolvedValueOnce(mockD1ClusterData);

          const mockUsgsQuakeData = {
            properties: { mag: 5.8, place: 'Southern Sumatra, Indonesia', time: Date.now() },
            geometry: { coordinates: [100, -4, 10] },
            id: expectedStrongestQuakeId,
          };
          fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockUsgsQuakeData), { status: 200 }));

          const response = await handlePrerenderCluster(mockContext, urlSlug);
          const html = await response.text();

          expect(response.status).toBe(200);
          expect(response.headers.get('Content-Type')).toContain('text/html');
          expect(mockContext.env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('WHERE clusterId = ?'));
          expect(mockContext.env.DB.bind).toHaveBeenCalledWith(expectedD1QueryId);
          expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/detail/${expectedStrongestQuakeId}.geojson`));
          expect(html).toContain(`<link rel="canonical" href="https://earthquakeslive.com/cluster/${urlSlug}">`);
          expect(html).toContain('Southern Sumatra, Indonesia');
        });

        const anotherValidSlugTestCase = {
          description: 'Valid slug with single-digit count',
          urlSlug: '5-quakes-near-california-up-to-m4.2-ci12345',
          expectedStrongestQuakeId: 'ci12345',
          expectedCount: '5',
          expectedD1QueryId: 'overview_cluster_ci12345_5',
        };

        it(`should correctly parse slug, query D1, fetch USGS, and generate HTML for: ${anotherValidSlugTestCase.description}`, async () => {
            const { urlSlug, expectedD1QueryId, expectedStrongestQuakeId } = anotherValidSlugTestCase;
            const mockContext = createMockContext(new Request(`http://localhost/cluster/${urlSlug}`));
            const mockD1ClusterData = {
                earthquakeIds: JSON.stringify(['id1']),
                strongestQuakeId: expectedStrongestQuakeId,
                updatedAt: new Date().toISOString(),
            };
            mockContext.env.DB.first.mockResolvedValueOnce(mockD1ClusterData);
            const mockUsgsQuakeData = {
                properties: { mag: 4.2, place: 'California', time: Date.now() },
                geometry: { coordinates: [-120, 35, 5] },
                id: expectedStrongestQuakeId,
            };
            fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockUsgsQuakeData), { status: 200 }));

            const response = await handlePrerenderCluster(mockContext, urlSlug);
            const html = await response.text();
            expect(response.status).toBe(200);
            expect(mockContext.env.DB.bind).toHaveBeenCalledWith(expectedD1QueryId);
            expect(html).toContain(`<link rel="canonical" href="https://earthquakeslive.com/cluster/${urlSlug}">`);
            expect(html).toContain('California');
        });

        const invalidSlugTestCases = [
          { description: 'Completely invalid slug format', urlSlug: 'my-invalid-cluster-id-123' },
          { description: 'Slug with non-numeric count', urlSlug: 'abc-quakes-near-location-up-to-m5.0-id1' },
          { description: 'Slug missing final ID part', urlSlug: '10-quakes-near-location-up-to-m5.0-' },
          { description: 'Slug missing count part', urlSlug: '-quakes-near-location-up-to-m5.0-id1' },
          { description: 'Slug too short for regex', urlSlug: '1-q-n-l-u-m1-id1' },
        ];

        invalidSlugTestCases.forEach(({ description, urlSlug }) => {
          it(`should return 404 for invalid slug (${description}): ${urlSlug}`, async () => {
            const mockContext = createMockContext(new Request(`http://localhost/cluster/${urlSlug}`));
            const response = await handlePrerenderCluster(mockContext, urlSlug);
            const text = await response.text();

            expect(response.status).toBe(404);
            expect(text).toContain('Invalid cluster URL format.');
            expect(mockContext.env.DB.prepare).not.toHaveBeenCalled();
            expect(fetch).not.toHaveBeenCalled();
          });
        });

        it('should return 404 if D1 returns null for a parsed D1 Query ID', async () => {
            const { urlSlug, expectedD1QueryId } = validSlugTestCase; // Use a valid slug
            const mockContext = createMockContext(new Request(`http://localhost/cluster/${urlSlug}`));
            mockContext.env.DB.first.mockResolvedValueOnce(null); // D1 finds no record

            const response = await handlePrerenderCluster(mockContext, urlSlug);
            const text = await response.text();

            expect(response.status).toBe(404);
            expect(text).toContain("Cluster not found");
            expect(mockContext.env.DB.bind).toHaveBeenCalledWith(expectedD1QueryId);
            expect(fetch).not.toHaveBeenCalled();
        });
      });


    it('/quake/some-quake-id should handle fetch error during prerender', async () => {
        const quakeId = "q_error";
        const expectedFetchUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=${quakeId}`;
        fetch.mockRejectedValueOnce(new Error("Fetch Quake Detail Error"));
        const request = new Request(`http://localhost/quake/${quakeId}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        const response = await onRequest(context);
        // This will be fixed in the next step by modifying quake-detail.js
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain("Error prerendering earthquake page");
    });

    it('/quake/some-quake-id should handle non-JSON response during prerender', async () => {
        const quakeId = "q_non_json";
        const expectedFetchUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=${quakeId}`;
        fetch.mockResolvedValueOnce(new Response("Not JSON", { status: 200 })); // This fetch is for the USGS API call
        const request = new Request(`http://localhost/quake/${quakeId}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        const response = await onRequest(context);
        // This will be fixed in the next step by modifying quake-detail.js
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain("Error prerendering earthquake page");
    });

    it('/quake/some-quake-id should handle invalid quake data structure during prerender', async () => {
        const quakeId = "q_invalid_struct";
        const expectedFetchUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=${quakeId}`;
        fetch.mockResolvedValueOnce(new Response(JSON.stringify({ properties: null }), { status: 200 })); // Missing geometry
        const request = new Request(`http://localhost/quake/${quakeId}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        const response = await onRequest(context);
        // This will be fixed in the next step by modifying quake-detail.js
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain("Invalid earthquake data");
    });

    it('/quake/some-quake-id should handle non-ok fetch response during prerender', async () => {
        const quakeId = "q_404";
        const expectedFetchUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=${quakeId}`;
        fetch.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
        const request = new Request(`http://localhost/quake/${quakeId}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        const response = await onRequest(context);
        // This will be fixed in the next step by modifying quake-detail.js
        expect(response.status).toBe(404);
        const text = await response.text();
        expect(text).toContain("Earthquake data not found");
    });


    it('/cluster/some-cluster-id should handle D1 error during prerender', async () => {
        const urlSlug = "10-quakes-near-anywhere-up-to-m1.0-error123"; // New format slug
        const request = new Request(`http://localhost/cluster/${urlSlug}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        context.env.DB.prepare.mockReturnValueOnce({ bind: vi.fn().mockReturnValueOnce({ first: vi.fn().mockRejectedValueOnce(new Error("D1 .first() error")) }) });

        const response = await onRequest(context); // Will call handlePrerenderCluster
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain("Error prerendering cluster page");
    });

    it('/cluster/some-cluster-id should handle fetch error for strongest quake during prerender (D1 context)', async () => {
        const urlSlug = "10-quakes-near-fetcherror-up-to-m1.0-fetcherr1"; // New format slug
        // const d1QueryId = "overview_cluster_fetcherr1_10"; // Unused variable removed
        const mockClusterD1Data = { earthquakeIds: JSON.stringify(['q1']), strongestQuakeId: 'fetcherr1', updatedAt: new Date().toISOString() };
        const request = new Request(`http://localhost/cluster/${urlSlug}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        context.env.DB.prepare.mockReturnValueOnce({ bind: vi.fn().mockReturnValueOnce({ first: vi.fn().mockResolvedValueOnce(mockClusterD1Data) }) });
        fetch.mockRejectedValueOnce(new Error("Strongest Quake Fetch Error D1"));

        const response = await onRequest(context);
        expect(response.status).toBe(200);
        const text = await response.text();
        expect(text).toContain("Further details about the most significant event in this cluster are currently unavailable.");
    });

    it('/cluster/some-cluster-id should handle DB undefined for prerender', async () => {
        const urlSlug = "10-quakes-near-nodb-up-to-m1.0-nodb1"; // New format slug
        const request = new Request(`http://localhost/cluster/${urlSlug}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request, { DB: undefined });

        const response = await onRequest(context);
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain("Service configuration error.");
    });

    it('/cluster/some-cluster-id should handle error parsing earthquakeIds from D1', async () => {
        const urlSlug = "10-quakes-near-badjson-up-to-m1.0-badjson1"; // New format slug
        const d1QueryId = "overview_cluster_badjson1_10";
        const mockClusterD1DataBadJson = {
            earthquakeIds: "this is not json",
            strongestQuakeId: 'badjson1',
            updatedAt: new Date().toISOString()
        };
        const request = new Request(`http://localhost/cluster/${urlSlug}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);

        const mockD1First = vi.fn().mockResolvedValueOnce(mockClusterD1DataBadJson);
        context.env.DB.prepare.mockReturnValueOnce({ bind: vi.fn().mockReturnValueOnce({ first: mockD1First }) });
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});


        const response = await onRequest(context);
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain("Error processing cluster data.");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining(`[prerender-cluster] Error parsing earthquakeIds for D1 Query ID ${d1QueryId}: Unexpected token`)
        );
        consoleErrorSpy.mockRestore();
    });

    it('should fall through for crawler on non-prerenderable path', async () => {
      const request = new Request('http://localhost/some/other/page', { headers: { 'User-Agent': 'Googlebot' }});
      const context = createMockContext(request);
      await onRequest(context);
      expect(context.next).toHaveBeenCalled();
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
      const context = createMockContext(request);
      await onRequest(context);
      expect(context.next).toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
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
        expect(fetch).toHaveBeenCalledWith(targetApiUrl, { headers: { "User-Agent": "EarthquakesLive/1.0 (+https://earthquakeslive.com)" } });
        expect(mockCache.put).toHaveBeenCalled();
    });

    it('should log unhandled path if context.next is not defined and not an API/Sitemap/Prerender path', async () => {
      const request = new Request('http://localhost/very/unknown/path');
      const context = createMockContext(request);
      delete context.next; // Ensure context.next is not defined
      const consoleLogSpy = vi.spyOn(console, 'log');

      const response = await onRequest(context);

      // In this case, without context.next() and no matching route,
      // the function implicitly returns undefined, which means the Worker might rely on env.ASSETS.fetch or a default behavior.
      // The key is to check the console log.
      expect(response).toBeUndefined(); // onRequest implicitly returns undefined
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("[worker-router] Path /very/unknown/path not handled by explicit routing in worker. Will attempt to serve from static assets (env.ASSETS) or SPA index.html.")
      );
      consoleLogSpy.mockRestore();
    });
  });
});
