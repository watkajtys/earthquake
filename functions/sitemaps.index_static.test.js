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
const SITEMAP_PAGE_SIZE_SITEMAP_TEST = 40000;


describe('Sitemap Index and Static Pages Handlers', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockCache.match.mockReset();
        mockCache.put.mockReset();
    });

    it('/sitemap-index.xml should return XML sitemap index including correctly paginated earthquake sitemaps', async () => {
      const request = new Request('http://localhost/sitemap-index.xml');
      const context = createMockContext(request);

      const mockDbResponse = { success: true, results: [{ total: 85000 }] };
      context.env.DB.all.mockResolvedValue(mockDbResponse);

      const response = await onRequest(context);
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/xml');
      expect(text).toContain('<sitemapindex');

      // Check that the DB was queried correctly
      expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringMatching(/SELECT COUNT\(\*\) AS total FROM EarthquakeEvents/i));
      expect(context.env.DB.bind).toHaveBeenCalledWith(2.5, 4.5);

      // Check for static sitemaps
      expect(text).toContain('<loc>https://earthquakeslive.com/sitemap-static-pages.xml</loc>');
      expect(text).toContain('<loc>https://earthquakeslive.com/sitemap-clusters.xml</loc>');

      // Check for dynamic earthquake sitemaps
      // 85000 significant events / 40000 per page = 3 pages
      expect(text).toContain('<loc>https://earthquakeslive.com/sitemaps/earthquakes-1.xml</loc>');
      expect(text).toContain('<loc>https://earthquakeslive.com/sitemaps/earthquakes-2.xml</loc>');
      expect(text).toContain('<loc>https://earthquakeslive.com/sitemaps/earthquakes-3.xml</loc>');
      expect(text).not.toContain('<loc>https://earthquakeslive.com/sitemaps/earthquakes-4.xml</loc>');
    });

    it('/sitemap-index.xml should handle DB error gracefully for earthquake sitemaps', async () => {
        const request = new Request('http://localhost/sitemap-index.xml');
        const context = createMockContext(request);
        context.env.DB.prepare = vi.fn().mockImplementation(() => {
            throw new Error("Simulated DB Error");
        });

        const response = await onRequest(context);
        expect(response.status).toBe(503);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(await response.text()).toBe('Sitemap database unavailable');
    });


    it('/sitemap-index.xml should handle DB not configured for earthquake sitemaps', async () => {
        const request = new Request('http://localhost/sitemap-index.xml');
        const context = createMockContext(request, { DB: undefined }); // Explicitly set DB to undefined

        const response = await onRequest(context);
        expect(response.status).toBe(503);
        expect(await response.text()).toBe('Sitemap database unavailable');
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
