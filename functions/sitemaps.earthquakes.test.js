import { onRequest } from './[[catchall]]';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { MIN_SIGNIFICANT_MAGNITUDE } from '../src/utils/significanceUtils.js';

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


describe('Paginated Earthquake Sitemaps Handler (D1)', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockCache.match.mockReset();
        mockCache.put.mockReset();
    });

    it('/sitemaps/earthquakes-1.xml should return XML with only significant earthquakes that have 3+ advanced data products', async () => {
        const now = Date.now();
        // now is typically in ms.
        // If event_time in DB is Ms (as I found from production sample), then:
        const nowInMs = now;

        const mockDbResults = {
            results: [
                // 1. Significant by magnitude AND has 3+ advanced products. SHOULD BE IN SITEMAP.
                {
                    id: "ev_sig_mag_and_3_products",
                    magnitude: MIN_SIGNIFICANT_MAGNITUDE,
                    place: "Big Quake City",
                    event_time: nowInMs - 3600000,
                    has_shakemap: 1, has_moment_tensor: 1, has_finite_fault: 1,
                },
                // 2. Significant by geojson product, has 3+ advanced products. SHOULD BE IN SITEMAP.
                {
                    id: "ev_sig_product_and_3_products",
                    magnitude: 4.4,
                    place: "Faulty Towers",
                    event_time: nowInMs - 7200000,
                    has_losspager: 1, has_shakemap: 1, has_focal_mechanism: 1,
                },
                // 3. Not significant, but has 3+ products. SHOULD BE FILTERED by isEventSignificant.
                {
                    id: "ev_not_significant_but_3_products",
                    magnitude: 4.4,
                    place: "Quiet Corner",
                    event_time: nowInMs - 5000000,
                    has_shakemap: 1, has_losspager: 1, has_dyfi: 1, // Only 2 advanced products (shakemap, losspager). DYFI is not 'significant'.
                    // Wait, isEventSignificant checks for moment-tensor or focal-mechanism.
                    // This event has neither. So it returns false. Correct.
                    // The test expectation says it SHOULD BE FILTERED.
                },
                // 4. Significant by magnitude, but <3 advanced products. SHOULD BE FILTERED by DB query.
                {
                    id: "ev_sig_mag_too_few_products",
                    magnitude: MIN_SIGNIFICANT_MAGNITUDE,
                    place: "Lonely Outpost",
                    event_time: nowInMs - 8000000,
                    has_shakemap: 1, has_moment_tensor: 1,
                },
                // 5. Significant, has 3+ products but one is 'dyfi' (not advanced). SHOULD BE FILTERED by DB query.
                {
                    id: "ev_sig_mag_dyfi_not_advanced",
                    magnitude: MIN_SIGNIFICANT_MAGNITUDE,
                    place: "User Reported Ville",
                    event_time: nowInMs - 9000000,
                    has_shakemap: 1, has_moment_tensor: 1, has_dyfi: 1, // Only 2 advanced
                }
            ]
        };

        const request = new Request('http://localhost/sitemaps/earthquakes-1.xml');

        // Manually filter the mock results to simulate the DB query's `WHERE` clause.
        const filteredMockResults = {
            results: mockDbResults.results.filter(event => {
                const advancedProductCount =
                    (event.has_moment_tensor || 0) +
                    (event.has_focal_mechanism || 0) +
                    (event.has_finite_fault || 0) +
                    (event.has_shakemap || 0) +
                    (event.has_losspager || 0);
                return advancedProductCount >= 3;
            })
        };

        const context = createMockContext(request, {}, {}, filteredMockResults);
        const response = await onRequest(context);
        const text = await response.text();

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('application/xml');

        const expectedQuery = `SELECT id, magnitude, place, event_time, has_moment_tensor, has_focal_mechanism, has_finite_fault, has_shakemap, has_losspager
       FROM EarthquakeEvents
       WHERE id IS NOT NULL AND place IS NOT NULL AND magnitude >= ?
       AND (
         COALESCE(has_moment_tensor, 0) +
         COALESCE(has_focal_mechanism, 0) +
         COALESCE(has_finite_fault, 0) +
         COALESCE(has_shakemap, 0) +
         COALESCE(has_losspager, 0)
       ) >= 3
       ORDER BY event_time DESC LIMIT ? OFFSET ?`;

        const calledSql = context.env.DB.prepare.mock.calls[0][0];
        expect(calledSql.replace(/\s+/g, ' ')).toEqual(expectedQuery.replace(/\s+/g, ' '));
        expect(context.env.DB.bind).toHaveBeenCalledWith(2.5, SITEMAP_PAGE_SIZE_FOR_TEST, 0);

        expect(text).toContain('<urlset');

        const expectedUrl1 = `https://earthquakeslive.com/quake/m${MIN_SIGNIFICANT_MAGNITUDE.toFixed(1)}-big-quake-city-ev_sig_mag_and_3_products`;
        expect(text).toContain(`<loc>${expectedUrl1}</loc>`);

        const expectedUrl2 = `https://earthquakeslive.com/quake/m4.4-faulty-towers-ev_sig_product_and_3_products`;
        expect(text).toContain(`<loc>${expectedUrl2}</loc>`);

        // These should not be in the sitemap for various reasons
        expect(text).not.toContain("ev_not_significant_but_3_products"); // Filtered by isEventSignificant
        expect(text).not.toContain("ev_sig_mag_too_few_products");      // Filtered by DB query (count < 3)
        expect(text).not.toContain("ev_sig_mag_dyfi_not_advanced");     // Filtered by DB query (advanced count < 3)

        const urlCount = (text.match(/<url>/g) || []).length;
        expect(urlCount).toBe(2); // Only the 2 events that are both significant AND have 3+ advanced products
    });

    it('/sitemaps/earthquakes-1.xml should use event_time if geojson_feature or properties.updated is missing/invalid', async () => {
        const eventTime1 = Date.now() - 86400000;

        const mockDbResults = {
            results: [
                {
                    id: "ev_no_geojson", magnitude: 5.0, place: "No GeoJSON Here", event_time: eventTime1
                }
            ]
        };

        const request = new Request('http://localhost/sitemaps/earthquakes-1.xml');
        const context = createMockContext(request, {}, {}, mockDbResults);
        const response = await onRequest(context);
        const text = await response.text();

        expect(response.status).toBe(200);
        const expectedUrl1 = `https://earthquakeslive.com/quake/m5.0-no-geojson-here-ev_no_geojson`;
        expect(text).toContain(`<loc>${expectedUrl1}</loc>`);
        expect(text).toContain(`<lastmod>${new Date(eventTime1).toISOString()}</lastmod>`);
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

    it('/sitemaps/earthquakes-1.xml should return an empty set if no events are significant', async () => {
        const now = Date.now();
        const mockDbResults = {
            results: [
                 {
                    id: "ev_not_significant_1", magnitude: 4.4, place: "Almost Significant",
                    event_time: now,
                    has_shakemap: 1 // Not moment-tensor or focal-mechanism
                },
                {
                    id: "ev_not_significant_2", magnitude: 3.0, place: "Not even close",
                    event_time: now
                },
            ]
        };

        const request = new Request('http://localhost/sitemaps/earthquakes-1.xml');
        const context = createMockContext(request, {}, {}, mockDbResults);
        const response = await onRequest(context);
        const text = await response.text();

        expect(response.status).toBe(200);
        expect(text).toContain("<!-- No significant events for page 1 -->");
        const urlCount = (text.match(/<url>/g) || []).length;
        expect(urlCount).toBe(0);
    });

    it('/sitemaps/earthquakes-1.xml should skip events with missing id or place from D1', async () => {
        const now = Date.now();
        const adjustedMockEvents = {
            results: [
                 {
                    /* id missing */ magnitude: 5.5, place: "Valid Place",
                    event_time: now
                },
                {
                    id: "ev_no_place", magnitude: 4.2, /* place missing */
                    event_time: now
                },
                 {
                    id: "ev_valid", magnitude: 6.0, place: "Proper Event",
                    event_time: now - 3600000
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
                {
                    id: "ev_invalid_time", magnitude: 5.0, place: "Invalid Time",
                    event_time: null, // Invalid
                },
                {
                    id: "ev_valid_time", magnitude: 5.1, place: "Valid Time",
                    event_time: Date.now() - 7200000 // valid
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
