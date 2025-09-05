import { onRequest } from './[[catchall]]';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// The significance logic is now self-contained within the sitemap generator,
// so we no longer need to import it here for testing.

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
const createMockContext = (request, env = {}, cf = {}, mockDbResults = { results: [] }) => {
  const waitUntilPromises = [];
  const mockDbInstance = {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    first: vi.fn(),
    run: vi.fn(),
    all: vi.fn().mockResolvedValue(mockDbResults), // Default to empty results
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
      ...env, // Allow overriding DB or other env vars if needed for specific tests
    },
    params: {},
    waitUntil: vi.fn((promise) => { waitUntilPromises.push(promise); }),
    next: vi.fn().mockResolvedValue(new Response("Fallback to env.ASSETS.fetch for static assets", { status: 200 })),
    cf,
    _awaitWaitUntilPromises: async () => { await Promise.all(waitUntilPromises); }
  };
};

// SITEMAP_PAGE_SIZE from the main module, assuming it's 40000 for tests
const SITEMAP_PAGE_SIZE_FOR_TEST = 40000;
// const MIN_FEELABLE_MAGNITUDE_FOR_TEST = 2.5; // Replaced by import


describe('Paginated Earthquake Sitemaps Handler (D1)', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockCache.match.mockReset();
        mockCache.put.mockReset();
    });

    it('/sitemaps/earthquakes-1.xml should return XML with only earthquakes having enhanced data', async () => {
        const now = Date.now();
        const nowInSeconds = Math.floor(now / 1000);

        const mockDbResults = {
            results: [
                // 1. Formerly significant by magnitude, now should be excluded
                {
                    id: "ev_high_mag_no_data", magnitude: 5.0, place: "Big Quake City",
                    event_time: nowInSeconds - 3600, geojson_feature: JSON.stringify({ properties: { updated: now } })
                },
                // 2. Included due to enhanced data (moment-tensor)
                {
                    id: "ev_with_enhanced_data", magnitude: 4.4, place: "Faulty Towers",
                    event_time: nowInSeconds - 7200, geojson_feature: JSON.stringify({
                        properties: { updated: now - 10000, products: { "moment-tensor": [{}] } }
                    })
                },
                // 3. Excluded, no enhanced data
                {
                    id: "ev_no_data", magnitude: 4.4, place: "Quiet Corner",
                    event_time: nowInSeconds - 5000, geojson_feature: JSON.stringify({ properties: { updated: now - 2000 } })
                },
                 // 4. Included due to enhanced data (focal-mechanism)
                {
                    id: "ev_with_focal_mechanism", magnitude: 3.9, place: "Focus Point",
                    event_time: nowInSeconds - 8200, geojson_feature: JSON.stringify({
                        properties: { updated: now - 11000, products: { "focal-mechanism": [{}] } }
                    })
                },
            ]
        };

        const request = new Request('http://localhost/sitemaps/earthquakes-1.xml');
        const context = createMockContext(request, {}, {}, mockDbResults);

        const response = await onRequest(context);
        const text = await response.text();

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('application/xml');

        // The DB query should now fetch all quakes >= 2.5 for in-code filtering
        expect(context.env.DB.bind).toHaveBeenCalledWith(2.5, SITEMAP_PAGE_SIZE_FOR_TEST, 0);

        expect(response.headers.get('Content-Type')).toContain('application/xml');
        expect(context.env.DB.bind).toHaveBeenCalledWith(2.5, SITEMAP_PAGE_SIZE_FOR_TEST, 0);

        // Check for the event that SHOULD be in the sitemap
        const expectedUrl1 = `https://earthquakeslive.com/quake/m4.4-faulty-towers-ev_with_enhanced_data`;
        expect(text).toContain(`<loc>${expectedUrl1}</loc>`);

        const expectedUrl2 = `https://earthquakeslive.com/quake/m3.9-focus-point-ev_with_focal_mechanism`;
        expect(text).toContain(`<loc>${expectedUrl2}</loc>`);


        // Check for events that SHOULD NOT be in the sitemap
        expect(text).not.toContain("ev_high_mag_no_data");
        expect(text).not.toContain("ev_no_data");

        const urlCount = (text.match(/<url>/g) || []).length;
        expect(urlCount).toBe(2); // Only the 2 events with enhanced data
    });

    it('/sitemaps/earthquakes-1.xml should use event_time if geojson_feature.properties.updated is missing/invalid', async () => {
        const eventTime1 = Math.floor(Date.now() / 1000) - 86400;
        const now = Date.now();

        const mockDbResults = {
            results: [
                // This event has enhanced data, making it sitemap-worthy, but is missing the 'updated' property
                // to test the event_time fallback.
                {
                    id: "ev_fallback_to_event_time",
                    magnitude: 5.0,
                    place: "Fallback Test",
                    event_time: eventTime1,
                    geojson_feature: JSON.stringify({
                        properties: {
                            products: { "moment-tensor": [{}] }
                            // 'updated' property is deliberately missing
                        }
                    })
                }
            ]
        };

        const request = new Request('http://localhost/sitemaps/earthquakes-1.xml');
        const context = createMockContext(request, {}, {}, mockDbResults);
        const response = await onRequest(context);
        const text = await response.text();

        expect(response.status).toBe(200);
        const expectedUrl1 = `https://earthquakeslive.com/quake/m5.0-fallback-test-ev_fallback_to_event_time`;
        expect(text).toContain(`<loc>${expectedUrl1}</loc>`);
        expect(text).toContain(`<lastmod>${new Date(eventTime1 * 1000).toISOString()}</lastmod>`);
        const urlCount = (text.match(/<url>/g) || []).length;
        expect(urlCount).toBe(1);
    });

    it('/sitemaps/earthquakes-1.xml should handle D1 query error for a page', async () => {
        const request = new Request('http://localhost/sitemaps/earthquakes-1.xml');
        const context = createMockContext(request);
        context.env.DB.prepare = vi.fn().mockReturnThis();
        context.env.DB.bind = vi.fn().mockReturnThis(); // Ensure bind is also mocked before all
        context.env.DB.all = vi.fn().mockRejectedValue(new Error("D1 unavailable for page"));

        const response = await onRequest(context);
        expect(response.status).toBe(500); // Errors should be 500
        const text = await response.text();
        expect(text).toContain("<!-- Error processing page 1: D1 unavailable for page -->");
    });

    it('should handle D1 not configured for a paginated earthquake sitemap request', async () => {
        // Test a page request
        const request = new Request('http://localhost/sitemaps/earthquakes-1.xml'); // Corrected path
        const context = createMockContext(request, { DB: undefined });
        const response = await onRequest(context);
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain("<message>Database not configured</message>");
    });

    it('/sitemaps/earthquakes-1.xml should handle empty results from D1 for a page', async () => {
        const request = new Request('http://localhost/sitemaps/earthquakes-1.xml'); // Corrected path
        const context = createMockContext(request); // Defaults to empty results

        const response = await onRequest(context);
        expect(response.status).toBe(200);
        const text = await response.text();
        expect(text).toContain("<!-- No events for page 1 -->");
        expect(text).not.toContain("<loc>");
    });

    it('/sitemaps/earthquakes-1.xml should return an empty set if no events have enhanced data', async () => {
        const now = Date.now();
        const mockDbResults = {
            results: [
                 {
                    id: "ev_no_data_1", magnitude: 4.4, place: "Almost Significant",
                    event_time: Math.floor(now / 1000),
                    geojson_feature: JSON.stringify({ properties: { updated: now } })
                },
                {
                    id: "ev_no_data_2", magnitude: 3.0, place: "Not even close",
                    event_time: Math.floor(now / 1000),
                    geojson_feature: JSON.stringify({ properties: { updated: now } })
                },
            ]
        };

        const request = new Request('http://localhost/sitemaps/earthquakes-1.xml');
        const context = createMockContext(request, {}, {}, mockDbResults);
        const response = await onRequest(context);
        const text = await response.text();

        expect(response.status).toBe(200);
        // The comment should now reflect the new filtering criteria
        expect(text).toContain("<!-- No events with enhanced data for page 1 -->");
        const urlCount = (text.match(/<url>/g) || []).length;
        expect(urlCount).toBe(0);
    });

    it('/sitemaps/earthquakes-1.xml should skip events with missing id or place from D1', async () => {
        const now = Date.now();
        const adjustedMockEvents = {
            results: [
                 // Excluded: missing id
                 {
                    /* id missing */ magnitude: 5.5, place: "Valid Place",
                    event_time: Math.floor(now / 1000),
                    geojson_feature: JSON.stringify({ properties: { updated: now, products: { "moment-tensor": [{}] } } })
                },
                // Excluded: missing place
                {
                    id: "ev_no_place", magnitude: 4.2, /* place missing */
                    event_time: Math.floor(now / 1000),
                    geojson_feature: JSON.stringify({ properties: { updated: now, products: { "moment-tensor": [{}] } } })
                },
                 // Included: has all required fields and enhanced data
                 {
                    id: "ev_valid", magnitude: 6.0, place: "Proper Event",
                    event_time: Math.floor(now / 1000) - 3600,
                    geojson_feature: JSON.stringify({ properties: { updated: now - 10000, products: { "moment-tensor": [{}] } } })
                },
            ]
        };


        const request = new Request('http://localhost/sitemaps/earthquakes-1.xml'); // Corrected path
        const context = createMockContext(request, {}, {}, adjustedMockEvents);
        const response = await onRequest(context);
        const text = await response.text();

        expect(response.status).toBe(200);
        expect(context.env.DB.bind).toHaveBeenCalledWith(2.5, SITEMAP_PAGE_SIZE_FOR_TEST, 0);

        const expectedUrl = `https://earthquakeslive.com/quake/m6.0-proper-event-ev_valid`;
        expect(text).toContain(`<loc>${expectedUrl}</loc>`);
        const urlCount = (text.match(/<url>/g) || []).length;
        expect(urlCount).toBe(1); // Only the fully valid entry
    });

    it('/sitemaps/earthquakes-1.xml should skip events with invalid lastmodTimestamp after fallbacks', async () => {
        const mockEvents = {
            results: [
                // Excluded: No valid timestamp (event_time is null, updated is bad), even though it has enhanced data.
                {
                    id: "ev_invalid_time", magnitude: 5.0, place: "Invalid Time",
                    event_time: null,
                    geojson_feature: JSON.stringify({ properties: { updated: "bad-date-string", products: { "moment-tensor": [{}] } }})
                },
                // Included: Has enhanced data and a valid event_time to fall back to.
                {
                    id: "ev_valid_time", magnitude: 5.1, place: "Valid Time",
                    event_time: Math.floor(Date.now() / 1000) - 7200, // valid
                    geojson_feature: JSON.stringify({ properties: { updated: "another-bad-string", products: { "moment-tensor": [{}] } }})
                }
            ]
        };
        const request = new Request('http://localhost/sitemaps/earthquakes-1.xml'); // Corrected path
        const context = createMockContext(request, {}, {}, mockEvents);
        const response = await onRequest(context);
        const text = await response.text();

        expect(response.status).toBe(200);
        expect(context.env.DB.bind).toHaveBeenCalledWith(2.5, SITEMAP_PAGE_SIZE_FOR_TEST, 0);

        const expectedUrl = `https://earthquakeslive.com/quake/m5.1-valid-time-ev_valid_time`;
        expect(text).toContain(`<loc>${expectedUrl}</loc>`); // Only the one with valid event_time
        const urlCount = (text.match(/<url>/g) || []).length;
        expect(urlCount).toBe(1);
    });

    it('should correctly handle requests for page numbers in paginated sitemap', async () => {
        const requestPage2 = new Request('http://localhost/sitemaps/earthquakes-2.xml'); // Corrected path
        const contextPage2 = createMockContext(requestPage2); // Empty results for simplicity

        await onRequest(contextPage2);
        expect(contextPage2.env.DB.prepare).toHaveBeenCalled(); // Simplified check
        // Offset for page 2 = (2 - 1) * SITEMAP_PAGE_SIZE_FOR_TEST
        expect(contextPage2.env.DB.bind).toHaveBeenCalledWith(2.5, SITEMAP_PAGE_SIZE_FOR_TEST, SITEMAP_PAGE_SIZE_FOR_TEST);


        const requestInvalidPage = new Request('http://localhost/sitemaps/earthquakes-abc.xml'); // Corrected path
        const contextInvalidPage = createMockContext(requestInvalidPage);
        const responseInvalid = await onRequest(contextInvalidPage);
        expect(responseInvalid.status).toBe(404);

        const requestPageZero = new Request('http://localhost/sitemaps/earthquakes-0.xml'); // Corrected path
        const contextPageZero = createMockContext(requestPageZero);
        const responseZero = await onRequest(contextPageZero);
        expect(responseZero.status).toBe(400); // Invalid page number
    });
});
