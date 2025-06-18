import { onRequest } from './[[catchall]]'; // Adjust if main export is different
import { vi, describe, it, expect, beforeEach } from 'vitest';

// --- Mocks for Cloudflare Environment ---

// Mock 'caches' global (not directly used by prerender, but often part of context)
const mockCache = {
  match: vi.fn(),
  put: vi.fn().mockResolvedValue(undefined),
};
global.caches = {
  default: mockCache,
  open: vi.fn().mockResolvedValue(mockCache)
};

// Mock 'fetch' global
// --- Helper to create mock context ---
const createMockContext = (request, env = {}, cf = {}) => {
  const waitUntilPromises = [];
  const mockDbInstance = { // Though not used by /quake prerender, part of standard context
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

// TODO: REVIEW_REDUNDANCY - This integration test suite for quake prerendering
// overlaps significantly with the direct handler tests in
// `functions/routes/prerender/quake-detail.test.js` (for `handleQuakeDetailPrerender`).
// Consider slimming down this suite to focus on verifying the routing via
// `[[catchall]].js` (including event ID parsing by the router) and basic
// success/error propagation, rather than re-testing all detailed handler logic
// (USGS fetch details, specific data validation, error cases for the handler)
// covered in the direct handler tests.
// --- Tests for Prerendering Quake Details ---
describe('Prerendering Handler: /quake/:id', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        // MSW will handle fetch lifecycle, server.resetHandlers() is in setupTests.js
    });

    it('/quake/some-quake-id should trigger prerender for crawler', async () => {
        const quakeId = "usgs_event_abc123";
        const expectedFetchUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=${quakeId}`;
        const mockQuakeData = {
            properties: { mag: 5, place: "Test Place", time: Date.now(), detail: expectedFetchUrl, title: `M 5.0 - Test Place` },
            geometry: { coordinates: [0,0,10] },
            id: quakeId
        };

        const request = new Request(`http://localhost/quake/${quakeId}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);

        const response = await onRequest(context);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('text/html');
        const text = await response.text();
        expect(text).toContain(`<title>M 5.0 - Test Place`);
    });

    it('/quake/some-quake-id should handle fetch error during prerender', async () => {
        const quakeId = "q_error";
        const request = new Request(`http://localhost/quake/${quakeId}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain("Error prerendering earthquake page");
    });

    it('/quake/some-quake-id should handle non-JSON response during prerender', async () => {
        const quakeId = "q_non_json";
        const request = new Request(`http://localhost/quake/${quakeId}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain("Error prerendering earthquake page");
    });

    it('/quake/some-quake-id should handle invalid quake data structure during prerender', async () => {
        const quakeId = "q_invalid_struct";
        const request = new Request(`http://localhost/quake/${quakeId}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain("Invalid earthquake data");
    });

    it('/quake/some-quake-id should handle non-ok fetch response during prerender', async () => {
        const quakeId = "q_404";
        const request = new Request(`http://localhost/quake/${quakeId}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        const response = await onRequest(context);
        expect(response.status).toBe(404);
        const text = await response.text();
        expect(text).toContain("Earthquake data not found");
    });
});
