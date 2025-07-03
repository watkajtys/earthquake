import { onRequest } from './[[catchall]]';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { server } from '../src/mocks/server.js'; // Corrected path
import { http, HttpResponse } from 'msw';

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
        // MSW will handle fetch lifecycle, server.resetHandlers() is in setupTests.js or called by vi.clearAllMocks()
        mockCache.match.mockReset();
        mockCache.put.mockReset();
    });

    it('/sitemap-earthquakes.xml should fetch data and return XML', async () => {
        // This test will use the default MSW handler for 2.5_week.geojson
        const request = new Request('http://localhost/sitemap-earthquakes.xml');
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('application/xml');
        const text = await response.text();
        expect(text).toContain('<urlset');
        // Check for data from the default MSW handler - updated for new URL structure
        const expectedMag = (3.0).toFixed(1);
        const expectedPlaceSlug = "default-msw-test-place";
        const expectedId = "msw_ev1";
        const expectedUrl = `https://earthquakeslive.com/quake/m${expectedMag}-${expectedPlaceSlug}-${expectedId}`;
        expect(text).toContain(`<loc>${expectedUrl}</loc>`);
    });

    it('/sitemap-earthquakes.xml should handle fetch error', async () => {
        server.use(
          http.get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson', () => {
            return HttpResponse.error(); // Simulates network error
          })
        );
        const request = new Request('http://localhost/sitemap-earthquakes.xml');
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(200); // Function handles error internally and returns 200 with error comment
        const text = await response.text();
        expect(text).toContain("<!-- Exception processing earthquake data: Failed to fetch -->");
    });

    it('/sitemap-earthquakes.xml should handle non-OK response from fetch', async () => {
        server.use(
          http.get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson', () => {
            return new HttpResponse("Server Error", { status: 503 });
          })
        );
        const request = new Request('http://localhost/sitemap-earthquakes.xml');
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(200); // Function handles error internally
        const text = await response.text();
        expect(text).toContain("<!-- Error fetching earthquake data -->");
    });

    it('/sitemap-earthquakes.xml should handle empty features array', async () => {
        server.use(
          http.get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson', () => {
            return HttpResponse.json({ features: [] });
          })
        );
        const request = new Request('http://localhost/sitemap-earthquakes.xml');
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(200);
        const text = await response.text();
        expect(text).not.toContain("<loc>");
    });

    it('/sitemap-earthquakes.xml should skip features missing id or properties', async () => {
      server.use(
        http.get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson', () => {
          return HttpResponse.json({
            features: [
              { properties: { mag: 3.0, place: "Test Place Valid", time: Date.now(), updated: Date.now() }, id: "ev_valid" }, // Valid
              { properties: { mag: 2.5, place: "Test Place Missing ID", time: Date.now(), updated: Date.now() } /* id implicitly undefined */ },
              { id: "ev_missing_props", /* properties implicitly undefined */ },
              { id: "ev_null_props", properties: null }
            ]
          });
        })
      );
      const request = new Request('http://localhost/sitemap-earthquakes.xml');
      const context = createMockContext(request);
      const response = await onRequest(context);
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/xml');
      const expectedMag = (3.0).toFixed(1);
      const expectedPlaceSlug = "test-place-valid";
      const expectedId = "ev_valid";
      const expectedUrl = `https://earthquakeslive.com/quake/m${expectedMag}-${expectedPlaceSlug}-${expectedId}`;
      expect(text).toContain(`<loc>${expectedUrl}</loc>`);
      const locCount = (text.match(/<loc>/g) || []).length;
      expect(locCount).toBe(1); // Only the valid entry should be present
    });

    it('/sitemap-earthquakes.xml should skip features with missing or invalid properties.updated', async () => {
      const now = Date.now();
      server.use(
        http.get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson', () => {
          return HttpResponse.json({
            features: [
              { properties: { mag: 3.1, place: "Test Place Valid Update", time: now, updated: now }, id: "ev_valid_upd" },
              { properties: { mag: 2.6, place: "Test Place Missing Update", time: now /* updated implicitly undefined */ }, id: "ev_missing_upd" },
              { properties: { mag: 2.7, place: "Test Place Invalid Update", time: now, updated: "not-a-number" }, id: "ev_invalid_upd" }
            ]
          });
        })
      );
      const request = new Request('http://localhost/sitemap-earthquakes.xml');
      const context = createMockContext(request);
      const response = await onRequest(context);
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/xml');
      const expectedMag = (3.1).toFixed(1);
      const expectedPlaceSlug = "test-place-valid-update";
      const expectedId = "ev_valid_upd";
      const expectedUrl = `https://earthquakeslive.com/quake/m${expectedMag}-${expectedPlaceSlug}-${expectedId}`;
      expect(text).toContain(`<loc>${expectedUrl}</loc>`);
      expect(text).toContain('<lastmod>');
      const urlCount = (text.match(/<url>/g) || []).length;
      expect(urlCount).toBe(1); // Only the valid entry
    });

    it('/sitemap-earthquakes.xml should use env.USGS_API_URL if provided', async () => {
      const customApiUrl = "https://example.com/custom/feed.geojson";
      // This test will use the MSW handler for customApiUrl (defined in setupTests.js or mocks/handlers.js)
      const request = new Request('http://localhost/sitemap-earthquakes.xml');
      const context = createMockContext(request, { USGS_API_URL: customApiUrl });
      const response = await onRequest(context);
      const text = await response.text();
      expect(response.status).toBe(200);
      const expectedMag = (2.0).toFixed(1); // Assuming custom MSW handler returns mag 2.0
      const expectedPlaceSlug = "custom-msw-feed-place";
      const expectedId = "msw_custom_ev1";
      const expectedUrl = `https://earthquakeslive.com/quake/m${expectedMag}-${expectedPlaceSlug}-${expectedId}`;
      expect(text).toContain(`<loc>${expectedUrl}</loc>`);
    });
});
