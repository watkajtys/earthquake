import { onRequest, handleClustersSitemapRequest } from './[[catchall]]';
import { vi, describe, it, expect, beforeEach } from 'vitest';
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

    it('/sitemap-clusters.xml should list only clusters where the strongest quake is data-enhanced', async () => {
        const mockClusterDefinitions = [
            { slug: "cluster-with-shakemap", updatedAt: new Date().toISOString(), strongestQuakeId: "quake1" },
            { slug: "cluster-without-shakemap", updatedAt: new Date().toISOString(), strongestQuakeId: "quake2" },
        ];

        const mockEarthquakeEvents = [
            { id: "quake1", geojson_feature: JSON.stringify({ properties: { products: { shakemap: [{}] } } }) },
            { id: "quake2", geojson_feature: JSON.stringify({ properties: {} }) },
        ];

        const request = new Request('http://localhost/sitemap-clusters.xml');
        const context = createMockContext(request);

        // Mock the two D1 calls
        context.env.DB.all
            .mockResolvedValueOnce({ results: mockClusterDefinitions, success: true }) // First call for clusters
            .mockResolvedValueOnce({ results: mockEarthquakeEvents, success: true });   // Second call for quakes

        const response = await onRequest(context);
        const text = await response.text();

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('application/xml');
        expect(text).toContain('<urlset');

        // Check that the cluster with the shakemap is present
        expect(text).toContain('https://earthquakeslive.com/cluster/cluster-with-shakemap');
        // Check that the cluster without the shakemap is NOT present
        expect(text).not.toContain('https://earthquakeslive.com/cluster/cluster-without-shakemap');

        // Verify the SQL queries
        expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("SELECT slug, updatedAt, strongestQuakeId FROM ClusterDefinitions"));
        expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("SELECT id, geojson_feature FROM EarthquakeEvents WHERE id IN (?,?)"));
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
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("No valid cluster definitions found."));
      consoleLogSpy.mockRestore();
    });

    describe('handleClustersSitemapRequest New URL Generation (using direct slug from D1)', () => {

        it('should generate correct URLs for valid D1 entries (slug and updatedAt)', async () => {
            const mockContext = createMockContext(new Request('http://localhost/sitemap-clusters.xml'));
            const d1Results = [
                { slug: "cluster-with-shakemap", updatedAt: "2023-01-01T00:00:00Z", strongestQuakeId: "q1" },
            ];
            const quakeResults = [
                { id: "q1", geojson_feature: JSON.stringify({ properties: { products: { shakemap: [{}] } } }) }
            ];
            mockContext.env.DB.all
                .mockResolvedValueOnce({ results: d1Results, success: true })
                .mockResolvedValueOnce({ results: quakeResults, success: true });


            const response = await handleClustersSitemapRequest(mockContext);
            const xml = await response.text();

            expect(response.status).toBe(200);
            expect(xml).toContain('<loc>https://earthquakeslive.com/cluster/cluster-with-shakemap</loc>');
            expect(xml).toContain('<lastmod>2023-01-01T00:00:00.000Z</lastmod>');
        });

        it('should skip entries if D1 slug is missing or empty (handled by SQL, but defensive check in code)', async () => {
            const mockContext = createMockContext(new Request('http://localhost/sitemap-clusters.xml'));
            const d1Results = [
                { slug: "valid-slug", updatedAt: "2023-01-02T00:00:00Z", strongestQuakeId: "q1" },
            ];
             const quakeResults = [
                { id: "q1", geojson_feature: JSON.stringify({ properties: { products: { shakemap: [{}] } } }) }
            ];
            mockContext.env.DB.all
                .mockResolvedValueOnce({ results: d1Results, success: true })
                .mockResolvedValueOnce({ results: quakeResults, success: true });

            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const response = await handleClustersSitemapRequest(mockContext);
            const xml = await response.text();

            expect(xml).toContain('https://earthquakeslive.com/cluster/valid-slug');
            expect(consoleWarnSpy).not.toHaveBeenCalled();
            consoleWarnSpy.mockRestore();
        });


        // USGS fetching for slug generation was removed from the sitemap component.
        // The following tests are deprecated as they cover that removed functionality.
    });
});
