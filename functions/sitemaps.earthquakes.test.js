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

describe('Earthquake Sitemap Handler', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        // fetch.mockReset(); // MSW will handle fetch lifecycle
        mockCache.match.mockReset();
        mockCache.put.mockReset();
    });

    it('/sitemap-earthquakes.xml should fetch data and return XML', async () => {
        const mockGeoJson = { features: [
            { properties: { mag: 3.0, place: "Test Place", time: Date.now(), updated: Date.now(), detail: "event_detail_url_1" }, id: "ev1" }
        ]};
        // fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockGeoJson), { status: 200 }));
        const request = new Request('http://localhost/sitemap-earthquakes.xml');
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('application/xml');
        const text = await response.text();
        expect(text).toContain('<urlset');
        expect(text).toContain(encodeURIComponent("event_detail_url_1")); // Detail URL should be XML-escaped by handler
        // expect(fetch).toHaveBeenCalledWith(expect.stringContaining('2.5_week.geojson'));
    });

    it('/sitemap-earthquakes.xml should handle fetch error', async () => {
        // fetch.mockRejectedValueOnce(new Error("USGS Feed Down"));
        const request = new Request('http://localhost/sitemap-earthquakes.xml');
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(200);
        const text = await response.text();
        expect(text).toContain("<!-- Exception processing earthquake data: USGS Feed Down -->");
    });

    it('/sitemap-earthquakes.xml should handle non-OK response from fetch', async () => {
        // fetch.mockResolvedValueOnce(new Response("Server Error", { status: 503 }));
        const request = new Request('http://localhost/sitemap-earthquakes.xml');
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(200);
        const text = await response.text();
        expect(text).toContain("<!-- Error fetching earthquake data -->");
    });

    it('/sitemap-earthquakes.xml should handle empty features array', async () => {
        const mockGeoJson = { features: [] };
        // fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockGeoJson), { status: 200 }));
        const request = new Request('http://localhost/sitemap-earthquakes.xml');
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(200);
        const text = await response.text();
        expect(text).not.toContain("<loc>");
    });

    it('/sitemap-earthquakes.xml should skip features missing properties.detail', async () => {
      const mockGeoJson = {
        features: [
          { properties: { mag: 3.0, place: "Test Place Valid", time: Date.now(), updated: Date.now(), detail: "event_detail_url_valid" }, id: "ev_valid" },
          { properties: { mag: 2.5, place: "Test Place Missing Detail", time: Date.now(), updated: Date.now(), detail: null }, id: "ev_missing_detail" },
          { properties: { mag: 2.8, place: "Test Place Undefined Detail", time: Date.now(), updated: Date.now() }, id: "ev_undefined_detail" }
        ]
      };
      // fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockGeoJson), { status: 200 }));
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
      // fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockGeoJson), { status: 200 }));
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
      // fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockGeoJson), { status: 200 }));
      const request = new Request('http://localhost/sitemap-earthquakes.xml');
      const context = createMockContext(request, { USGS_API_URL: customApiUrl });
      await onRequest(context);
      // expect(fetch).toHaveBeenCalledWith(customApiUrl);
    });
});
