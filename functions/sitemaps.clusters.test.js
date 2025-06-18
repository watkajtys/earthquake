import { onRequest, handleClustersSitemapRequest } from './[[catchall]]';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// --- Mocks for Cloudflare Environment ---
const mockCache = {
  match: vi.fn(),
  put: vi.fn().mockResolvedValue(undefined),
};
global.caches = {
  default: mockCache,
  open: vi.fn().mockResolvedValue(mockCache)
};

// global.fetch = vi.fn(); // MSW will handle fetch

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

describe('Cluster Sitemap Handler and URL Generation', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        // fetch.mockReset(); // MSW will handle fetch lifecycle
        mockCache.match.mockReset();
        mockCache.put.mockReset();
    });

    it('/sitemap-clusters.xml should list clusters from D1 and return XML', async () => {
        const mockD1Results = [
            { clusterId: "overview_cluster_cluster1_10", updatedAt: new Date().toISOString() },
        ];
        const request = new Request('http://localhost/sitemap-clusters.xml');
        const context = createMockContext(request);
        context.env.DB.all.mockResolvedValueOnce({ results: mockD1Results, success: true });
        // This fetch is for the new URL generation logic inside handleClustersSitemapRequest
        // fetch.mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "Test Place", mag: 5.0 } }), { status: 200 }));

        const response = await onRequest(context); // Uses handleClustersSitemapRequest internally
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('application/xml');
        const text = await response.text();
        expect(text).toContain('<urlset');
        // Check for the new URL format
        expect(text).toContain('https://earthquakeslive.com/cluster/10-quakes-near-test-place-up-to-m5.0-cluster1');
        expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("SELECT clusterId, updatedAt FROM ClusterDefinitions"));
    });

    it('/sitemap-clusters.xml should handle DB not configured', async () => {
      const request = new Request('http://localhost/sitemap-clusters.xml');
      const context = createMockContext(request, { DB: undefined });
      const response = await onRequest(context); // Uses handleClustersSitemapRequest internally
      expect(response.status).toBe(200); // The handler itself returns 200 with a comment
      const text = await response.text();
      expect(text).toContain("<!-- D1 Database not available -->");
    });

    it('/sitemap-clusters.xml should handle D1 query failure', async () => {
      const request = new Request('http://localhost/sitemap-clusters.xml');
      const context = createMockContext(request);
      context.env.DB.all.mockRejectedValueOnce(new Error("D1 Query Error"));
      const response = await onRequest(context); // Uses handleClustersSitemapRequest internally
      expect(response.status).toBe(200); // The handler itself returns 200 with a comment
      const text = await response.text();
      expect(text).toContain("<!-- Exception processing cluster data from D1: D1 Query Error -->");
    });

    it('/sitemap-clusters.xml should handle empty results from D1', async () => {
      const request = new Request('http://localhost/sitemap-clusters.xml');
      const context = createMockContext(request);
      context.env.DB.all.mockResolvedValueOnce({ results: [], success: true });
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const response = await onRequest(context); // Uses handleClustersSitemapRequest internally
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).not.toContain("<loc>");
      // This log comes from within handleClustersSitemapRequest
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("No cluster definitions found in D1 table ClusterDefinitions."));
      consoleLogSpy.mockRestore();
    });

    describe('handleClustersSitemapRequest New URL Generation', () => {
        beforeEach(() => {
            // vi.resetAllMocks(); // Already done in outer describe
            // fetch.mockReset(); // Already done in outer describe
        });

        it('should generate correct new format URLs for valid D1 entries with successful USGS fetches', async () => {
            const mockContext = createMockContext(new Request('http://localhost/sitemap-clusters.xml'));
            const d1Results = [
                { clusterId: "overview_cluster_us7000mfp9_15", updatedAt: "2023-01-01T00:00:00Z" },
                { clusterId: "overview_cluster_ci12345_5", updatedAt: "2023-01-02T00:00:00Z" },
            ];
            mockContext.env.DB.all.mockResolvedValueOnce({ results: d1Results, success: true });

            // fetch
            //     .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "Southern Sumatra, Indonesia", mag: 5.8 } }), { status: 200 }))
            //     .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "California", mag: 4.2 } }), { status: 200 }));

            const response = await handleClustersSitemapRequest(mockContext);
            const xml = await response.text();

            expect(response.status).toBe(200);
            expect(xml).toContain('<loc>https://earthquakeslive.com/cluster/15-quakes-near-southern-sumatra-indonesia-up-to-m5.8-us7000mfp9</loc>');
            expect(xml).toContain('<lastmod>2023-01-01T00:00:00.000Z</lastmod>');
            expect(xml).toContain('<loc>https://earthquakeslive.com/cluster/5-quakes-near-california-up-to-m4.2-ci12345</loc>');
            expect(xml).toContain('<lastmod>2023-01-02T00:00:00.000Z</lastmod>');
            // expect(fetch).toHaveBeenCalledTimes(2);
        });

        it('should skip entries if D1 clusterId parsing fails and log a warning', async () => {
            const mockContext = createMockContext(new Request('http://localhost/sitemap-clusters.xml'));
            const d1Results = [
                { clusterId: "invalid_format_id", updatedAt: "2023-01-01T00:00:00Z" },
                { clusterId: "overview_cluster_ci12345_5", updatedAt: "2023-01-02T00:00:00Z" },
            ];
            mockContext.env.DB.all.mockResolvedValueOnce({ results: d1Results, success: true });
            // fetch.mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "California", mag: 4.2 } }), { status: 200 }));
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const response = await handleClustersSitemapRequest(mockContext);
            const xml = await response.text();

            expect(xml).not.toContain('invalid_format_id');
            expect(xml).toContain('https://earthquakeslive.com/cluster/5-quakes-near-california-up-to-m4.2-ci12345');
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse D1 clusterId: invalid_format_id'));
            // expect(fetch).toHaveBeenCalledTimes(1);
            consoleWarnSpy.mockRestore();
        });

        it('should skip entries if USGS fetch fails and log a warning/error', async () => {
            const mockContext = createMockContext(new Request('http://localhost/sitemap-clusters.xml'));
            const d1Results = [
                { clusterId: "overview_cluster_us7000mfp9_15", updatedAt: "2023-01-01T00:00:00Z" },
                { clusterId: "overview_cluster_ci12345_5", updatedAt: "2023-01-02T00:00:00Z" },
            ];
            mockContext.env.DB.all.mockResolvedValueOnce({ results: d1Results, success: true });

            // fetch
            //     .mockResolvedValueOnce(new Response("USGS Error", { status: 500 }))
            //     .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "California", mag: 4.2 } }), { status: 200 }));
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const response = await handleClustersSitemapRequest(mockContext);
            const xml = await response.text();

            expect(xml).not.toContain('15-quakes-near');
            expect(xml).toContain('https://earthquakeslive.com/cluster/5-quakes-near-california-up-to-m4.2-ci12345');
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('USGS fetch failed for us7000mfp9: 500'));
            // expect(fetch).toHaveBeenCalledTimes(2);
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

            // fetch
            //     .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { mag: 5.0 } }), { status: 200 })) // Missing place
            //     .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "Some Place" } }), { status: 200 })) // Missing mag
            //     .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "California", mag: 4.2 } }), { status: 200 }));
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const response = await handleClustersSitemapRequest(mockContext);
            const xml = await response.text();

            expect(xml).not.toContain('usMissingPlace');
            expect(xml).not.toContain('usMissingMag');
            expect(xml).toContain('https://earthquakeslive.com/cluster/5-quakes-near-california-up-to-m4.2-ci12345');
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Missing or invalid locationName for usMissingPlace'));
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Missing or invalid maxMagnitude for usMissingMag'));
            // expect(fetch).toHaveBeenCalledTimes(3);
            consoleWarnSpy.mockRestore();
        });

        it('should skip entries with invalid updatedAt date format from D1 and log a warning', async () => {
            const mockContext = createMockContext(new Request('http://localhost/sitemap-clusters.xml'));
            const d1Results = [
                { clusterId: "overview_cluster_validEntry1_10", updatedAt: "2023-01-01T00:00:00Z" },
                { clusterId: "overview_cluster_invalidDate_5", updatedAt: "not-a-real-date" },
            ];
            mockContext.env.DB.all.mockResolvedValueOnce({ results: d1Results, success: true });
            // fetch.mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "Valid Place", mag: 5.0 } }), { status: 200 }));
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const response = await handleClustersSitemapRequest(mockContext);
            const xml = await response.text();

            expect(response.status).toBe(200);
            expect(response.headers.get('Content-Type')).toContain('application/xml');
            expect(xml).toContain('https://earthquakeslive.com/cluster/10-quakes-near-valid-place-up-to-m5.0-validEntry1');
            expect(xml).not.toContain('invalidDate_5');
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid 'updated' date format for eventId invalidDate (raw overview_cluster_invalidDate_5): not-a-real-date"));
            // expect(fetch).toHaveBeenCalledTimes(1);
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
            // fetch.mockResolvedValueOnce(new Response(JSON.stringify({ properties: { place: "Another Valid Place", mag: 4.0 } }), { status: 200 }));
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
            // expect(fetch).toHaveBeenCalledTimes(1);
            consoleWarnSpy.mockRestore();
        });
    });
});
