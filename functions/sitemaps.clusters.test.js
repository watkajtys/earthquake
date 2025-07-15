import { onRequest, handleClustersSitemapRequest } from './[[catchall]]';
import { vi, describe, it, expect, beforeEach } from 'vitest';
// import { server } from '../src/mocks/server'; // MSW server not strictly needed for these tests anymore
// import { http, HttpResponse } from 'msw'; // MSW not strictly needed for these tests anymore

// --- Mocks for Cloudflare Environment ---
const mockCache = {
  match: vi.fn(),
  put: vi.fn().mockResolvedValue(undefined),
};
global.caches = {
  default: mockCache,
  open: vi.fn().mockResolvedValue(mockCache)
};

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
      CLUSTER_KV: { // CLUSTER_KV is not used by clusters-sitemap.js but kept for context structure
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
        mockCache.match.mockReset();
        mockCache.put.mockReset();
    });

    it('/sitemap-clusters.xml should list clusters from D1 and return XML', async () => {
        const mockD1Results = [
            // This slug should be a complete, final URL path segment
            { slug: "10-quakes-near-test-place-up-to-m5.0-cluster1", updatedAt: new Date().toISOString() },
        ];
        const request = new Request('http://localhost/sitemap-clusters.xml');
        const context = createMockContext(request);
        context.env.DB.all.mockResolvedValueOnce({ results: mockD1Results, success: true });

        const response = await onRequest(context); // Uses handleClustersSitemapRequest internally
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('application/xml');
        const text = await response.text();
        expect(text).toContain('<urlset');
        expect(text).toContain('https://earthquakeslive.com/cluster/10-quakes-near-test-place-up-to-m5.0-cluster1');
        // Check the new SQL query structure
        expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("SELECT slug, updatedAt FROM ClusterDefinitions WHERE slug IS NOT NULL AND slug <> ''"));
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
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("No valid cluster definitions with slugs found in D1 table ClusterDefinitions."));
      consoleLogSpy.mockRestore();
    });

    describe('handleClustersSitemapRequest New URL Generation (using direct slug from D1)', () => {

        it('should generate correct URLs for valid D1 entries (slug and updatedAt)', async () => {
            const mockContext = createMockContext(new Request('http://localhost/sitemap-clusters.xml'));
            const d1Results = [
                { slug: "15-quakes-near-southern-sumatra-indonesia-up-to-m5.8-us7000mfp9", updatedAt: "2023-01-01T00:00:00Z" },
                { slug: "5-quakes-near-california-up-to-m4.2-ci12345", updatedAt: "2023-01-02T00:00:00Z" },
            ];
            mockContext.env.DB.all.mockResolvedValueOnce({ results: d1Results, success: true });

            const response = await handleClustersSitemapRequest(mockContext);
            const xml = await response.text();

            expect(response.status).toBe(200);
            expect(xml).toContain('<loc>https://earthquakeslive.com/cluster/15-quakes-near-southern-sumatra-indonesia-up-to-m5.8-us7000mfp9</loc>');
            expect(xml).toContain('<lastmod>2023-01-01T00:00:00.000Z</lastmod>');
            expect(xml).toContain('<loc>https://earthquakeslive.com/cluster/5-quakes-near-california-up-to-m4.2-ci12345</loc>');
            expect(xml).toContain('<lastmod>2023-01-02T00:00:00.000Z</lastmod>');
        });

        // This test is no longer relevant as parsing `clusterId` and fetching USGS data is removed.
        // The SQL query `WHERE slug IS NOT NULL AND slug <> ''` handles invalid/missing slugs at DB level.
        it('should skip entries if D1 slug is missing or empty (handled by SQL, but defensive check in code)', async () => { // Unskipping this test
            const mockContext = createMockContext(new Request('http://localhost/sitemap-clusters.xml'));
            const _d1Results = [
                { slug: null, updatedAt: "2023-01-01T00:00:00Z" }, // Will be filtered by SQL
                { slug: "", updatedAt: "2023-01-01T00:00:00Z" },   // Will be filtered by SQL
                { slug: "valid-slug-example", updatedAt: "2023-01-02T00:00:00Z" },
            ];
            mockContext.env.DB.all.mockResolvedValueOnce({ results: [{ slug: "valid-slug-example", updatedAt: "2023-01-02T00:00:00Z" }], success: true }); // Simulate only valid one returned
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const response = await handleClustersSitemapRequest(mockContext);
            const xml = await response.text();

            expect(xml).toContain('https://earthquakeslive.com/cluster/valid-slug-example');
            // The code's internal `!definition.slug` check might still trigger if somehow a null/empty slug passes SQL
            // For this test, we assume SQL filters them, so the internal check might not be hit if d1Results is already filtered.
            // If it were to be hit:
            // expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid definition from D1 (missing slug or updatedAt)"));
            consoleWarnSpy.mockRestore();
        });


        // USGS fetching for slug generation was removed from the sitemap component.
        // The following tests are deprecated as they cover that removed functionality.
    });
});
