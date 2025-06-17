import { onRequest, handleClustersSitemapRequest } from './[[catchall]]'; // onRequest for routing, handleClustersSitemapRequest for specific new URL tests
import { vi, describe, it, expect, beforeEach } from 'vitest';

// --- Mocks for Cloudflare Environment ---

// Mock 'caches' global (though less used by sitemap, good for consistency if onRequest is used)
const mockCache = {
  match: vi.fn(),
  put: vi.fn().mockResolvedValue(undefined),
};
global.caches = {
  default: mockCache,
  open: vi.fn().mockResolvedValue(mockCache)
};

// Mock 'fetch' global
global.fetch = vi.fn();

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
      DB: mockDbInstance,
      CLUSTER_KV: {
        get: vi.fn(),
        put: vi.fn(),
        list: vi.fn().mockResolvedValue({ keys: [], list_complete: true, cursor: undefined }),
      },
      ASSETS: {
          fetch: vi.fn().mockResolvedValue(new Response("SPA fallback", { headers: { 'Content-Type': 'text/html'}}))
      },
      ...env,
    },
    params: {},
    waitUntil: vi.fn((promise) => { waitUntilPromises.push(promise); }),
    next: vi.fn().mockResolvedValue(new Response("Fallback to env.ASSETS.fetch for static assets", { status: 200 })),
    cf,
    _awaitWaitUntilPromises: async () => { await Promise.all(waitUntilPromises); }
  };
};

// --- Tests for Sitemap Handlers ---
describe('Sitemap Handlers', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        fetch.mockReset();
        mockCache.match.mockReset(); // Reset cache if onRequest is used for routing to sitemap handlers
        mockCache.put.mockReset();
    });

    it('/sitemap-index.xml should return XML sitemap index', async () => {
      const request = new Request('http://localhost/sitemap-index.xml');
      const context = createMockContext(request);
      const response = await onRequest(context);
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
        expect(text).toContain(encodeURIComponent("event_detail_url_1")); // Detail URL should be XML-escaped by handler
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('2.5_week.geojson'));
    });

    it('/sitemap-clusters.xml should list clusters from D1 and return XML', async () => {
        const mockD1Results = [
            { clusterId: "overview_cluster_cluster1_10", updatedAt: new Date().toISOString() },
        ];
        const request = new Request('http://localhost/sitemap-clusters.xml');
        const context = createMockContext(request);
        context.env.DB.all.mockResolvedValueOnce({ results: mockD1Results, success: true });
        fetch.mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "Test Place", mag: 5.0 } }), { status: 200 }));

        const response = await onRequest(context);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('application/xml');
        const text = await response.text();
        expect(text).toContain('<urlset');
        expect(text).toContain('https://earthquakeslive.com/cluster/10-quakes-near-test-place-up-to-m5.0-cluster1');
        expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("SELECT clusterId, updatedAt FROM ClusterDefinitions"));
    });

    it('/sitemap-earthquakes.xml should handle fetch error', async () => {
        fetch.mockRejectedValueOnce(new Error("USGS Feed Down"));
        const request = new Request('http://localhost/sitemap-earthquakes.xml');
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(200);
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
        const mockGeoJson = { features: [] };
        fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockGeoJson), { status: 200 }));
        const request = new Request('http://localhost/sitemap-earthquakes.xml');
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(200);
        const text = await response.text();
        expect(text).not.toContain("<loc>");
    });

    it('/sitemap-clusters.xml should handle DB not configured', async () => {
      const request = new Request('http://localhost/sitemap-clusters.xml');
      const context = createMockContext(request, { DB: undefined });
      const response = await onRequest(context);
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("<!-- D1 Database not available -->");
    });

    it('/sitemap-clusters.xml should handle D1 query failure', async () => {
      const request = new Request('http://localhost/sitemap-clusters.xml');
      const context = createMockContext(request);
      context.env.DB.all.mockRejectedValueOnce(new Error("D1 Query Error"));
      const response = await onRequest(context);
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("<!-- Exception processing cluster data from D1: D1 Query Error -->");
    });

    it('/sitemap-clusters.xml should handle empty results from D1', async () => {
      const request = new Request('http://localhost/sitemap-clusters.xml');
      const context = createMockContext(request);
      context.env.DB.all.mockResolvedValueOnce({ results: [], success: true });
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const response = await onRequest(context);
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).not.toContain("<loc>");
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("No cluster definitions found in D1 table ClusterDefinitions."));
      consoleLogSpy.mockRestore();
    });

    it('/sitemap-earthquakes.xml should skip features missing properties.detail', async () => {
      const mockGeoJson = {
        features: [
          { properties: { mag: 3.0, place: "Test Place Valid", time: Date.now(), updated: Date.now(), detail: "event_detail_url_valid" }, id: "ev_valid" },
          { properties: { mag: 2.5, place: "Test Place Missing Detail", time: Date.now(), updated: Date.now(), detail: null }, id: "ev_missing_detail" },
          { properties: { mag: 2.8, place: "Test Place Undefined Detail", time: Date.now(), updated: Date.now() }, id: "ev_undefined_detail" }
        ]
      };
      fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockGeoJson), { status: 200 }));
      const request = new Request('http://localhost/sitemap-earthquakes.xml');
      const context = createMockContext(request);
      const response = await onRequest(context);
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/xml');
      expect(text).toContain('<loc>event_detail_url_valid</loc>');
      const locCount = (text.match(/<loc>/g) || []).length;
      expect(locCount).toBe(1);
    });

    it('/sitemap-earthquakes.xml should skip features with missing or invalid properties.updated', async () => {
      const mockGeoJson = {
        features: [
          { properties: { mag: 3.1, place: "Test Place Valid Update", time: Date.now(), updated: Date.now(), detail: "event_detail_url_valid_update" }, id: "ev_valid_upd" },
          { properties: { mag: 2.6, place: "Test Place Missing Update", time: Date.now(), detail: "event_detail_url_missing_update" }, id: "ev_missing_upd" },
          { properties: { mag: 2.7, place: "Test Place Invalid Update", time: Date.now(), updated: "not-a-number", detail: "event_detail_url_invalid_update" }, id: "ev_invalid_upd" }
        ]
      };
      fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockGeoJson), { status: 200 }));
      const request = new Request('http://localhost/sitemap-earthquakes.xml');
      const context = createMockContext(request);
      const response = await onRequest(context);
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/xml');
      expect(text).toContain('<loc>event_detail_url_valid_update</loc>');
      expect(text).toContain('<lastmod>');
      const urlCount = (text.match(/<url>/g) || []).length;
      expect(urlCount).toBe(1);
    });

    it('/sitemap-earthquakes.xml should use env.USGS_API_URL if provided', async () => {
      const customApiUrl = "https://example.com/custom/feed.geojson";
      const mockGeoJson = { features: [] };
      fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockGeoJson), { status: 200 }));
      const request = new Request('http://localhost/sitemap-earthquakes.xml');
      const context = createMockContext(request, { USGS_API_URL: customApiUrl });
      await onRequest(context);
      expect(fetch).toHaveBeenCalledWith(customApiUrl);
    });

    describe('handleClustersSitemapRequest New URL Generation', () => {
        beforeEach(() => {
            vi.resetAllMocks();
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
                .mockResolvedValueOnce(new Response("USGS Error", { status: 500 }))
                .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "California", mag: 4.2 } }), { status: 200 }));
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const response = await handleClustersSitemapRequest(mockContext);
            const xml = await response.text();

            expect(xml).not.toContain('15-quakes-near');
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
                .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { mag: 5.0 } }), { status: 200 }))
                .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "Some Place" } }), { status: 200 }))
                .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "California", mag: 4.2 } }), { status: 200 }));
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const response = await handleClustersSitemapRequest(mockContext);
            const xml = await response.text();

            expect(xml).not.toContain('usMissingPlace');
            expect(xml).not.toContain('usMissingMag');
            expect(xml).toContain('https://earthquakeslive.com/cluster/5-quakes-near-california-up-to-m4.2-ci12345');
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Missing or invalid locationName for usMissingPlace'));
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Missing or invalid maxMagnitude for usMissingMag'));
            expect(fetch).toHaveBeenCalledTimes(3);
            consoleWarnSpy.mockRestore();
        });

        it('should skip entries with invalid updatedAt date format from D1 and log a warning', async () => {
            const mockContext = createMockContext(new Request('http://localhost/sitemap-clusters.xml'));
            const d1Results = [
                { clusterId: "overview_cluster_validEntry1_10", updatedAt: "2023-01-01T00:00:00Z" },
                { clusterId: "overview_cluster_invalidDate_5", updatedAt: "not-a-real-date" },
            ];
            mockContext.env.DB.all.mockResolvedValueOnce({ results: d1Results, success: true });
            fetch.mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "Valid Place", mag: 5.0 } }), { status: 200 }));
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const response = await handleClustersSitemapRequest(mockContext);
            const xml = await response.text();

            expect(response.status).toBe(200);
            expect(response.headers.get('Content-Type')).toContain('application/xml');
            expect(xml).toContain('https://earthquakeslive.com/cluster/10-quakes-near-valid-place-up-to-m5.0-validEntry1');
            expect(xml).not.toContain('invalidDate_5');
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid 'updated' date format for eventId invalidDate (raw overview_cluster_invalidDate_5): not-a-real-date"));
            expect(fetch).toHaveBeenCalledTimes(1);
            consoleWarnSpy.mockRestore();
        });

        it('should skip entries missing clusterId or updatedAt from D1 and log a warning', async () => {
            const mockContext = createMockContext(new Request('http://localhost/sitemap-clusters.xml'));
            const d1Results = [
                { clusterId: "overview_cluster_validEntry2_8", updatedAt: "2023-02-01T00:00:00Z" },
                { clusterId: null, updatedAt: "2023-02-02T00:00:00Z" },
                { clusterId: "overview_cluster_missingUpdate_3", updatedAt: undefined },
            ];
            mockContext.env.DB.all.mockResolvedValueOnce({ results: d1Results, success: true });
            fetch.mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "Another Valid Place", mag: 4.0 } }), { status: 200 }));
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const response = await handleClustersSitemapRequest(mockContext);
            const xml = await response.text();

            expect(response.status).toBe(200);
            expect(response.headers.get('Content-Type')).toContain('application/xml');
            expect(xml).toContain('https://earthquakeslive.com/cluster/8-quakes-near-another-valid-place-up-to-m4.0-validEntry2');
            expect(xml).not.toContain('null');
            expect(xml).not.toContain('missingUpdate_3');
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining("Invalid definition from D1 (missing clusterId or updated/updatedAt):"),
                expect.objectContaining({ clusterId: null, updatedAt: "2023-02-02T00:00:00Z" })
            );
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining("Invalid definition from D1 (missing clusterId or updated/updatedAt):"),
                expect.objectContaining({ clusterId: "overview_cluster_missingUpdate_3", updatedAt: undefined })
            );
            expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
            expect(fetch).toHaveBeenCalledTimes(1);
            consoleWarnSpy.mockRestore();
        });
    });
  });
