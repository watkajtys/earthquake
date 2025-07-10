import { onRequest } from './[[catchall]]';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { MIN_FEELABLE_MAGNITUDE } from '../routes/sitemaps/earthquakes-sitemap.js';
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

    // --- Tests for Sitemap Index ---
    it('/sitemaps/earthquakes-index.xml should return a sitemap index with correct pages for feelable earthquakes', async () => {
        // Simulate total 85000 feelable events -> 3 pages
        const mockCountResult = { total: 85000 };
        const mockLatestModResult = { latest_mod_ts: Date.now() };

        const request = new Request('http://localhost/sitemaps/earthquakes-index.xml');
        const context = createMockContext(request);

        const mockDbPrepare = vi.fn().mockImplementation((query) => {
            const upperQuery = query.toUpperCase();
            if (upperQuery.startsWith("SELECT COUNT(*)")) {
                expect(upperQuery).toContain("MAGNITUDE >= ?");
                return {
                    bind: vi.fn().mockImplementation((mag) => {
                        expect(mag).toBe(MIN_FEELABLE_MAGNITUDE);
                        return { first: vi.fn().mockResolvedValue(mockCountResult) };
                    })
                };
            }
            if (upperQuery.startsWith("SELECT MAX(CASE")) {
                expect(upperQuery).toContain("WHERE MAGNITUDE >= ?");
                return {
                    bind: vi.fn().mockImplementation((mag) => {
                        expect(mag).toBe(MIN_FEELABLE_MAGNITUDE);
                        return { first: vi.fn().mockResolvedValue(mockLatestModResult) };
                    })
                };
            }
            return { first: vi.fn(), all: vi.fn(), bind: vi.fn().mockReturnThis() };
        });
        context.env.DB.prepare = mockDbPrepare;


        const response = await onRequest(context);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('application/xml');
        const text = await response.text();

        expect(text).toContain('<sitemapindex');
        expect(text).toContain('<loc>https://earthquakeslive.com/sitemaps/earthquakes-1.xml</loc>');
        expect(text).toContain('<loc>https://earthquakeslive.com/sitemaps/earthquakes-2.xml</loc>');
        expect(text).toContain('<loc>https://earthquakeslive.com/sitemaps/earthquakes-3.xml</loc>');
        expect(text).not.toContain('<loc>https://earthquakeslive.com/sitemaps/earthquakes-4.xml</loc>');

        expect(text).toContain(`<lastmod>${new Date(mockLatestModResult.latest_mod_ts).toISOString()}</lastmod>`);
        expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringMatching(/^SELECT COUNT\(\*\) as total FROM EarthquakeEvents WHERE id IS NOT NULL AND place IS NOT NULL AND magnitude >= \?/i));
        expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringMatching(/^SELECT MAX\(CASE WHEN geojson_feature IS NOT NULL THEN JSON_EXTRACT\(geojson_feature, '\$\.properties\.updated'\) ELSE event_time \* 1000 END\) as latest_mod_ts FROM EarthquakeEvents WHERE magnitude >= \?/i));
    });

    it('/sitemaps/earthquakes-index.xml should handle zero feelable events correctly', async () => {
        const mockCountResult = { total: 0 };
        const request = new Request('http://localhost/sitemaps/earthquakes-index.xml');
        const context = createMockContext(request);
        context.env.DB.prepare = vi.fn().mockImplementation((query) => {
            if (query.toUpperCase().startsWith("SELECT COUNT(*)")) {
                 return {
                    bind: vi.fn().mockImplementation((mag) => {
                        expect(mag).toBe(MIN_FEELABLE_MAGNITUDE);
                        return { first: vi.fn().mockResolvedValue(mockCountResult) };
                    })
                };
            }
            return { first: vi.fn(), all: vi.fn(), bind: vi.fn().mockReturnThis() };
        });


        const response = await onRequest(context);
        expect(response.status).toBe(200);
        const text = await response.text();
        expect(text).toContain('<!-- No feelable earthquake events found -->');
        expect(text).not.toContain('<sitemap>');
    });


    // --- Tests for Paginated Sitemap Content ---
    it('/sitemaps/earthquakes-1.xml should query D1 and return XML with only feelable earthquakes', async () => {
        const now = Date.now();
        const nowInSeconds = Math.floor(now / 1000);
        const mockDbResults = { // This object simulates the raw data *before* it would be filtered by the SQL query in the actual code.
            results: [
                {
                    id: "ev_feelable_1", magnitude: 5.5, place: "10km N of Testville",
                    event_time: nowInSeconds - 3600, geojson_feature: JSON.stringify({ properties: { updated: now } })
                },
                {
                    id: "ev_too_small", magnitude: 1.2, place: "Tiny Town", // Below threshold
                    event_time: nowInSeconds - 5000, geojson_feature: JSON.stringify({ properties: { updated: now - 2000 } })
                },
                {
                    id: "ev_feelable_2", magnitude: 4.2, place: "Somewhere Else",
                    event_time: nowInSeconds - 7200, geojson_feature: JSON.stringify({ properties: { updated: now - 10000 } })
                },
                 {
                    id: "ev_on_threshold", magnitude: MIN_FEELABLE_MAGNITUDE, place: "Borderline Heights",
                    event_time: nowInSeconds - 8000, geojson_feature: JSON.stringify({ properties: { updated: now - 15000 } })
                }
            ]
        };
        // For the mock `all()` function, we provide data as if the SQL query has already done its job.
        // So, we filter `mockDbResults` here to simulate what the DB would return after the `WHERE magnitude >= ?` clause.
        const filteredMockResultsForDB = {
            results: mockDbResults.results.filter(e => e.magnitude >= MIN_FEELABLE_MAGNITUDE)
        };

        const request = new Request('http://localhost/sitemaps/earthquakes-1.xml');
        const context = createMockContext(request, {}, {}, filteredMockResultsForDB); // Use the pre-filtered data for the mock

        const response = await onRequest(context);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('application/xml');
        const text = await response.text();

        expect(context.env.DB.prepare).toHaveBeenCalledWith(
             expect.stringMatching(/SELECT id, magnitude, place, event_time, geojson_feature FROM EarthquakeEvents WHERE id IS NOT NULL AND place IS NOT NULL AND magnitude >= \? ORDER BY event_time DESC LIMIT \? OFFSET \?/i)
        );
        // Check bind parameters: magnitude threshold, limit, offset
        expect(context.env.DB.bind).toHaveBeenCalledWith(MIN_FEELABLE_MAGNITUDE, SITEMAP_PAGE_SIZE_FOR_TEST, 0);
        expect(text).toContain('<urlset');

        const expectedUrl1 = `https://earthquakeslive.com/quake/m5.5-10km-n-of-testville-ev_feelable_1`;
        expect(text).toContain(`<loc>${expectedUrl1}</loc>`);
        expect(text).toContain(`<lastmod>${new Date(now).toISOString()}</lastmod>`);

        const expectedUrl2 = `https://earthquakeslive.com/quake/m4.2-somewhere-else-ev_feelable_2`;
        expect(text).toContain(`<loc>${expectedUrl2}</loc>`);
        expect(text).toContain(`<lastmod>${new Date(now - 10000).toISOString()}</lastmod>`);

        const expectedUrl3 = `https://earthquakeslive.com/quake/m${MIN_FEELABLE_MAGNITUDE.toFixed(1)}-borderline-heights-ev_on_threshold`;
        expect(text).toContain(`<loc>${expectedUrl3}</loc>`);
        expect(text).toContain(`<lastmod>${new Date(now - 15000).toISOString()}</lastmod>`);

        expect(text).not.toContain("ev_too_small"); // Ensure the non-feelable one is not present
        const urlCount = (text.match(/<url>/g) || []).length;
        expect(urlCount).toBe(3); // Only the 3 feelable events
    });

    it('/sitemaps/earthquakes-1.xml should use event_time if geojson_feature or properties.updated is missing/invalid for feelable quakes', async () => {
        const eventTime1 = Math.floor(Date.now() / 1000) - 86400; // 1 day ago in seconds
        const eventTime2 = Math.floor(Date.now() / 1000) - 172800; // 2 days ago in seconds

        const rawMockEvents = { // Raw data before SQL filtering
            results: [
                {
                    id: "ev_no_geojson", magnitude: 3.0, place: "No GeoJSON Here", event_time: eventTime1
                },
                {
                    id: "ev_invalid_updated", magnitude: 3.1, place: "Invalid Updated", event_time: eventTime2,
                    geojson_feature: JSON.stringify({ properties: { updated: "not-a-timestamp" } })
                },
                 {
                    id: "ev_no_properties", magnitude: 3.2, place: "No Properties", event_time: eventTime2 + 3600,
                    geojson_feature: JSON.stringify({})
                },
                {
                    id: "ev_too_small_for_lastmod_test", magnitude: 1.0, place: "Tiny Place", event_time: eventTime2 + 7200,
                }
            ]
        };
        // Simulate DB filtering for the mock
        const filteredMockEventsForDB = {
            results: rawMockEvents.results.filter(e => e.magnitude >= MIN_FEELABLE_MAGNITUDE)
        };

        const request = new Request('http://localhost/sitemaps/earthquakes-1.xml');
        const context = createMockContext(request, {}, {}, filteredMockEventsForDB); // Use pre-filtered data
        const response = await onRequest(context);
        const text = await response.text();

        expect(response.status).toBe(200);
        expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringMatching(/WHERE id IS NOT NULL AND place IS NOT NULL AND magnitude >= \? ORDER BY event_time DESC LIMIT \? OFFSET \?/i));
        expect(context.env.DB.bind).toHaveBeenCalledWith(MIN_FEELABLE_MAGNITUDE, SITEMAP_PAGE_SIZE_FOR_TEST, 0);

        const expectedUrl1 = `https://earthquakeslive.com/quake/m3.0-no-geojson-here-ev_no_geojson`;
        expect(text).toContain(`<loc>${expectedUrl1}</loc>`);
        expect(text).toContain(`<lastmod>${new Date(eventTime1 * 1000).toISOString()}</lastmod>`);

        const expectedUrl2 = `https://earthquakeslive.com/quake/m3.1-invalid-updated-ev_invalid_updated`;
        expect(text).toContain(`<loc>${expectedUrl2}</loc>`);
        expect(text).toContain(`<lastmod>${new Date(eventTime2 * 1000).toISOString()}</lastmod>`);

        const expectedUrl3 = `https://earthquakeslive.com/quake/m3.2-no-properties-ev_no_properties`;
        expect(text).toContain(`<loc>${expectedUrl3}</loc>`);
        expect(text).toContain(`<lastmod>${new Date((eventTime2 + 3600) * 1000).toISOString()}</lastmod>`);

        expect(text).not.toContain("ev_too_small_for_lastmod_test"); // Ensure non-feelable is not present
        const urlCount = (text.match(/<url>/g) || []).length;
        expect(urlCount).toBe(3); // Only the 3 feelable events that also meet other criteria
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

    it('should handle D1 not configured for any earthquake sitemap request', async () => {
        // Test index first
        let request = new Request('http://localhost/earthquakes-sitemap-index.xml'); // Corrected path
        let context = createMockContext(request, { DB: undefined });
        let response = await onRequest(context);
        expect(response.status).toBe(500);
        let text = await response.text();
        expect(text).toContain("<message>Database not configured</message>");

        // Test a page
        request = new Request('http://localhost/earthquakes-sitemap-1.xml');
        context = createMockContext(request, { DB: undefined });
        response = await onRequest(context);
        expect(response.status).toBe(500);
        text = await response.text();
        expect(text).toContain("<message>Database not configured</message>");
    });

    it('/earthquakes-sitemap-1.xml should handle empty results from D1 for a page', async () => {
        const request = new Request('http://localhost/earthquakes-sitemap-1.xml');
        const context = createMockContext(request); // Defaults to empty results

        const response = await onRequest(context);
        expect(response.status).toBe(200);
        const text = await response.text();
        expect(text).toContain("<!-- No events for page 1 -->");
        expect(text).not.toContain("<loc>");
    });

    it('/earthquakes-sitemap-1.xml should skip events with missing id or place from D1', async () => {
        const now = Date.now();
        const mockEvents = {
            results: [
                {
                    /* id missing */ magnitude: 5.5, place: "Valid Place",
                    event_time: Math.floor(now / 1000),
                    geojson_feature: JSON.stringify({ properties: { updated: now } })
                },
                {
                    id: "ev_no_place", magnitude: 4.2, /* place missing */
                    event_time: Math.floor(now / 1000),
                    geojson_feature: JSON.stringify({ properties: { updated: now } })
                },
                 {
                    id: "ev_valid", magnitude: 6.0, place: "Proper Event",
                    event_time: Math.floor(now / 1000) - 3600,
                    geojson_feature: JSON.stringify({ properties: { updated: now - 10000 } })
                },
            ]
        };
        // The SQL query "WHERE id IS NOT NULL AND place IS NOT NULL" should prevent these,
        // but this test ensures the JS code would also handle it if somehow they got through.
        // However, the current DB query will filter these out. If we want to test JS robustness
        // for this, the mock for `all()` would need to return these despite the query.
        // For now, let's assume the DB query is effective.
        // To properly test this specific JS handling, we'd need to adjust the mock `all`
        // to return such data, bypassing the SQL filter logic for the test.

        // Adjusted mock to test JS resilience if DB somehow returned non-compliant rows
        const adjustedMockEvents = {
            results: [
                 {
                    /* id missing */ magnitude: 5.5, place: "Valid Place",
                    event_time: Math.floor(now / 1000),
                    geojson_feature: JSON.stringify({ properties: { updated: now } })
                },
                {
                    id: "ev_no_place", magnitude: 4.2, /* place missing */
                    event_time: Math.floor(now / 1000),
                    geojson_feature: JSON.stringify({ properties: { updated: now } })
                },
                 {
                    id: "ev_valid", magnitude: 6.0, place: "Proper Event",
                    event_time: Math.floor(now / 1000) - 3600,
                    geojson_feature: JSON.stringify({ properties: { updated: now - 10000 } })
                },
            ]
        };


        const request = new Request('http://localhost/earthquakes-sitemap-1.xml'); // Corrected path
        const context = createMockContext(request, {}, {}, adjustedMockEvents);
        const response = await onRequest(context);
        const text = await response.text();

        expect(response.status).toBe(200);
        expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringMatching(/LIMIT \? OFFSET \?/i));
        expect(context.env.DB.bind).toHaveBeenCalledWith(SITEMAP_PAGE_SIZE_FOR_TEST, 0);

        const expectedUrl = `https://earthquakeslive.com/quake/m6.0-proper-event-ev_valid`;
        expect(text).toContain(`<loc>${expectedUrl}</loc>`);
        const urlCount = (text.match(/<url>/g) || []).length;
        expect(urlCount).toBe(1); // Only the fully valid entry
    });

    it('/earthquakes-sitemap-1.xml should skip events with invalid lastmodTimestamp after fallbacks', async () => {
        const mockEvents = {
            results: [
                {
                    id: "ev_invalid_time", magnitude: 3.0, place: "Invalid Time",
                    // event_time will be used, but let's make it unparsable by new Date() after mult by 1000
                    // This is hard to achieve as new Date(non_numeric_string_or_object) results in Invalid Date
                    // and typeof non_numeric_string_or_object is not 'number'
                    // The code checks `typeof lastmodTimestamp === 'number'` and `isNaN(lastmodDate.getTime())`
                    // Let's test the case where event_time is null/undefined and geojson is also bad
                    event_time: null,
                    geojson_feature: JSON.stringify({ properties: { updated: "bad-date-string" }})
                },
                {
                    id: "ev_valid_time", magnitude: 3.1, place: "Valid Time",
                    event_time: Math.floor(Date.now() / 1000) - 7200, // valid
                    geojson_feature: JSON.stringify({ properties: { updated: "another-bad-string" }})
                }
            ]
        };
        const request = new Request('http://localhost/earthquakes-sitemap-1.xml'); // Corrected path
        const context = createMockContext(request, {}, {}, mockEvents);
        const response = await onRequest(context);
        const text = await response.text();

        expect(response.status).toBe(200);
        expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringMatching(/LIMIT \? OFFSET \?/i));
        expect(context.env.DB.bind).toHaveBeenCalledWith(SITEMAP_PAGE_SIZE_FOR_TEST, 0);

        const expectedUrl = `https://earthquakeslive.com/quake/m3.1-valid-time-ev_valid_time`;
        expect(text).toContain(`<loc>${expectedUrl}</loc>`); // Only the one with valid event_time
        const urlCount = (text.match(/<url>/g) || []).length;
        expect(urlCount).toBe(1);
    });

    it('should correctly handle requests for page numbers in paginated sitemap', async () => {
        const requestPage2 = new Request('http://localhost/earthquakes-sitemap-2.xml');
        const contextPage2 = createMockContext(requestPage2); // Empty results for simplicity

        await onRequest(contextPage2);
        expect(contextPage2.env.DB.prepare).toHaveBeenCalledWith(expect.stringMatching(/LIMIT \? OFFSET \?/i));
        // Offset for page 2 = (2 - 1) * SITEMAP_PAGE_SIZE_FOR_TEST
        expect(contextPage2.env.DB.bind).toHaveBeenCalledWith(SITEMAP_PAGE_SIZE_FOR_TEST, SITEMAP_PAGE_SIZE_FOR_TEST);

        const requestInvalidPage = new Request('http://localhost/earthquakes-sitemap-abc.xml');
        const contextInvalidPage = createMockContext(requestInvalidPage);
        const responseInvalid = await onRequest(contextInvalidPage);
        expect(responseInvalid.status).toBe(404);

        const requestPageZero = new Request('http://localhost/earthquakes-sitemap-0.xml');
        const contextPageZero = createMockContext(requestPageZero);
        const responseZero = await onRequest(contextPageZero);
        expect(responseZero.status).toBe(400); // Invalid page number
    });
});
