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
    next: vi.fn().mockResolvedValue(new Response("Fallback to env.ASSETS.fetch for static assets", { status: 200 })),
    cf,
    executionContext: { // <<< executionContext should contain waitUntil
      waitUntil: vi.fn((promise) => {
        if (promise) {
            waitUntilPromises.push(promise);
        }
      }),
    },
    _awaitWaitUntilPromises: async () => { // This helper will await promises pushed via executionContext.waitUntil
      const results = await Promise.allSettled(waitUntilPromises);
      results.forEach(result => {
        if (result.status === 'rejected') {
          console.error("Error in waitUntil promise (prerender-quake):", result.reason);
        }
      });
      waitUntilPromises.length = 0; // Clear after awaiting
    }
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

    it('/quake/test-event-jsonld should correctly populate JSON-LD for crawler', async () => {
        const quakeId = "usgs_event_jsonld_test";
        // Specific time: June 20, 2025 17:49:14 UTC
        const eventTime = new Date(Date.UTC(2025, 5, 20, 17, 49, 14)).getTime();
        const expectedIsoTime = new Date(eventTime).toISOString();
        const expectedKeywordDate = "june 20 2025";

        // Mock data for this specific test
        // This would typically be handled by MSW handlers, but for direct onRequest testing,
        // we'd need to ensure the global fetch mock inside createMockContext or via MSW
        // is set up to return this for "usgs_event_jsonld_test"
        // For now, assuming MSW is configured elsewhere (e.g. in setupTests.js or a specific handler for this ID)
        // to return the following structure when `https://earthquake.usgs.gov/.../usgs_event_jsonld_test` is fetched.
        // If not, this test would need more direct fetch mocking.

        const mockQuakeData = {
            properties: {
                mag: 5.1,
                place: "36 km SW of Semnan, Iran",
                time: eventTime,
                detail: `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=${quakeId}`,
                title: `M 5.1 - 36 km SW of Semnan, Iran`,
                url: `https://earthquake.usgs.gov/earthquakes/eventpage/${quakeId}` // sameAs if detail is not specific enough
            },
            geometry: { coordinates: [53.0699, 35.3758, 10] }, // lon, lat, depth
            id: quakeId
        };

        // Simulate that MSW (or a global fetch mock) will return mockQuakeData for this quakeId
        // This is a conceptual setup for the test. Actual MSW setup would be in mock server handlers.
        // For this test structure, we assume fetch is already mocked to provide mockQuakeData for this ID.

        const request = new Request(`http://localhost/quake/${quakeId}`, { headers: { 'User-Agent': 'Googlebot' } });
        const context = createMockContext(request); // Assumes createMockContext's fetch is or will be MSW-intercepted

        const response = await onRequest(context);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('text/html');

        const html = await response.text();

        // Extract JSON-LD
        const jsonLdScriptRegex = /<script type="application\/ld\+json">(.*?)<\/script>/s;
        const match = html.match(jsonLdScriptRegex);
        expect(match).toBeTruthy();
        expect(match[1]).toBeTruthy();

        let jsonLdData;
        try {
            jsonLdData = JSON.parse(match[1]);
        } catch (e) {
            throw new Error("Failed to parse JSON-LD: " + e.message);
        }

        // Assertions for JSON-LD content
        expect(jsonLdData['@context']).toBe('https://schema.org');
        expect(jsonLdData['@type']).toBe('Event');
        expect(jsonLdData.name).toBe(`M ${mockQuakeData.properties.mag} - ${mockQuakeData.properties.place}`);
        expect(jsonLdData.startDate).toBe(expectedIsoTime);
        expect(jsonLdData.endDate).toBe(expectedIsoTime); // As per plan
        expect(jsonLdData.eventStatus).toBe('https://schema.org/EventHappened');
        // expect(jsonLdData.eventAttendanceMode).toBe('https://schema.org/OfflineEventAttendanceMode'); // Property removed

        expect(jsonLdData.location).toBeDefined();
        expect(jsonLdData.location['@type']).toBe('Place');
        expect(jsonLdData.location.name).toBe(mockQuakeData.properties.place);
        expect(jsonLdData.location.geo).toBeDefined();
        expect(jsonLdData.location.geo['@type']).toBe('GeoCoordinates');
        expect(jsonLdData.location.geo.latitude).toBe(mockQuakeData.geometry.coordinates[1]);
        expect(jsonLdData.location.geo.longitude).toBe(mockQuakeData.geometry.coordinates[0]);
        expect(jsonLdData.location.geo.elevation).toBe(-mockQuakeData.geometry.coordinates[2] * 1000);

        expect(jsonLdData.image).toEqual(['https://earthquakeslive.com/social-default-earthquake.png']);

        expect(jsonLdData.organizer).toBeDefined();
        expect(jsonLdData.organizer['@type']).toBe('Organization');
        expect(jsonLdData.organizer.name).toBe('Earthquakes Live');
        expect(jsonLdData.organizer.url).toBe('https://earthquakeslive.com');

        expect(jsonLdData.identifier).toBe(quakeId);
        expect(jsonLdData.url).toBe(`https://earthquakeslive.com/quake/${quakeId}`); // Assuming slug construction remains simple like this

        // Check keywords
        expect(typeof jsonLdData.keywords).toBe('string'); // Corrected type check
        expect(jsonLdData.keywords).toContain(mockQuakeData.properties.place.split(', ')[0].toLowerCase()); // e.g. "36 km sw of semnan"
        expect(jsonLdData.keywords).toContain(mockQuakeData.properties.place.split(', ')[1].toLowerCase()); // e.g. "iran"
        expect(jsonLdData.keywords).toContain(`m${mockQuakeData.properties.mag}`);
        expect(jsonLdData.keywords).toContain("earthquake");
        expect(jsonLdData.keywords).toContain("seismic event");
        expect(jsonLdData.keywords).toContain("earthquake report");
        expect(jsonLdData.keywords).toContain(expectedKeywordDate);

        expect(jsonLdData.offers).toBeUndefined(); // As per plan

        // Check sameAs if detail URL was present
        if (mockQuakeData.properties.url) {
            expect(jsonLdData.sameAs).toBe(mockQuakeData.properties.url);
        } else if (mockQuakeData.properties.detail) {
            expect(jsonLdData.sameAs).toBe(mockQuakeData.properties.detail);
        }
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
