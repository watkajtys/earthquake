import { onRequest } from './[[catchall]]';
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

// Constants needed for mocking DB responses for index-sitemap
const MIN_FEELABLE_MAGNITUDE_SITEMAP_TEST = 2.5;
const SITEMAP_PAGE_SIZE_SITEMAP_TEST = 40000;


describe('Sitemap Index and Static Pages Handlers', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        // fetch.mockReset(); // MSW will handle fetch lifecycle
        mockCache.match.mockReset();
        mockCache.put.mockReset();
    });

    it('/sitemap-index.xml should return XML sitemap index including dynamic earthquake sitemaps', async () => {
      const request = new Request('http://localhost/sitemap-index.xml');
      const context = createMockContext(request);

      // Mock D1 responses for earthquake sitemap generation
      const mockCountResult = { total: 85000 }; // Should result in 3 pages (85000 / 40000)
      const mockLatestModResult = { latest_mod_ts: new Date('2024-01-15T10:00:00.000Z').getTime() };

      context.env.DB.prepare = vi.fn().mockImplementation((query) => {
        const upperQuery = query.toUpperCase();
        if (upperQuery.startsWith("SELECT COUNT(*)")) {
          return {
            bind: vi.fn().mockImplementation((mag) => {
              expect(mag).toBe(MIN_FEELABLE_MAGNITUDE_SITEMAP_TEST);
              return { first: vi.fn().mockResolvedValue(mockCountResult) };
            })
          };
        }
        if (upperQuery.startsWith("SELECT MAX(CASE")) {
          return {
            bind: vi.fn().mockImplementation((mag) => {
              expect(mag).toBe(MIN_FEELABLE_MAGNITUDE_SITEMAP_TEST);
              return { first: vi.fn().mockResolvedValue(mockLatestModResult) };
            })
          };
        }
        // Fallback for any other prepare calls if necessary
        return { bind: vi.fn().mockReturnThis(), first: vi.fn(), all: vi.fn() };
      });

      const response = await onRequest(context);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/xml');
      const text = await response.text();

      expect(text).toContain('<sitemapindex');
      expect(text).toContain('<loc>https://earthquakeslive.com/sitemap-static-pages.xml</loc>');
      expect(text).toContain('<loc>https://earthquakeslive.com/sitemap-clusters.xml</loc>');

      // Check for dynamic earthquake sitemaps
      expect(text).toContain('<loc>https://earthquakeslive.com/sitemaps/earthquakes-1.xml</loc>');
      expect(text).toContain('<loc>https://earthquakeslive.com/sitemaps/earthquakes-2.xml</loc>');
      expect(text).toContain('<loc>https://earthquakeslive.com/sitemaps/earthquakes-3.xml</loc>');
      expect(text).not.toContain('<loc>https://earthquakeslive.com/sitemaps/earthquakes-4.xml</loc>');

      // Check lastmod for dynamic sitemaps
      const expectedLastMod = new Date(mockLatestModResult.latest_mod_ts).toISOString();
      // Ensure this lastmod is present for the dynamic entries (might be multiple times)
      expect(text.split(`<lastmod>${expectedLastMod}</lastmod>`).length - 1).toBeGreaterThanOrEqual(3);

      // Check that DB prepare was called for count and lastmod
      expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringMatching(/SELECT COUNT\(\*\) as total FROM EarthquakeEvents WHERE id IS NOT NULL AND place IS NOT NULL AND magnitude >= \?/i));
      expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringMatching(/SELECT MAX\(CASE WHEN geojson_feature IS NOT NULL THEN JSON_EXTRACT\(geojson_feature, '\$\.properties\.updated'\) ELSE event_time \* 1000 END\) as latest_mod_ts FROM EarthquakeEvents WHERE magnitude >= \?/i));
    });

    it('/sitemap-index.xml should handle DB error gracefully for earthquake sitemaps', async () => {
        const request = new Request('http://localhost/sitemap-index.xml');
        const context = createMockContext(request);
        context.env.DB.prepare = vi.fn().mockImplementation(() => {
            throw new Error("Simulated DB Error");
        });

        const response = await onRequest(context);
        expect(response.status).toBe(200); // Sitemap index should still render
        const text = await response.text();
        expect(text).toContain('<!-- Error generating earthquake sitemap list: Simulated DB Error -->');
        expect(text).toContain('<loc>https://earthquakeslive.com/sitemap-static-pages.xml</loc>');
        expect(text).toContain('<loc>https://earthquakeslive.com/sitemap-clusters.xml</loc>');
        expect(text).not.toContain('/sitemaps/earthquakes-');
    });


    it('/sitemap-index.xml should handle DB not configured for earthquake sitemaps', async () => {
        const request = new Request('http://localhost/sitemap-index.xml');
        const context = createMockContext(request, { DB: undefined }); // Explicitly set DB to undefined

        const response = await onRequest(context);
        expect(response.status).toBe(200);
        const text = await response.text();
        expect(text).toContain('<!-- Database not available: Earthquake sitemap list omitted. -->');
        expect(text).toContain('<loc>https://earthquakeslive.com/sitemap-static-pages.xml</loc>');
        expect(text).toContain('<loc>https://earthquakeslive.com/sitemap-clusters.xml</loc>');
        expect(text).not.toContain('/sitemaps/earthquakes-');
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
});
