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

describe('Earthquake Sitemap Handler (D1)', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockCache.match.mockReset();
        mockCache.put.mockReset();
    });

    it('/sitemap-earthquakes.xml should query D1 and return XML with valid data', async () => {
        const now = Date.now();
        const nowInSeconds = Math.floor(now / 1000);
        const mockEvents = {
            results: [
                {
                    id: "ev1",
                    magnitude: 5.5,
                    place: "10km N of Testville",
                    event_time: nowInSeconds - 3600, // 1 hour ago
                    geojson_feature: JSON.stringify({ properties: { updated: now } })
                },
                {
                    id: "ev2",
                    magnitude: 4.2,
                    place: "Somewhere Else",
                    event_time: nowInSeconds - 7200, // 2 hours ago
                    geojson_feature: JSON.stringify({ properties: { updated: now - 10000 } }) // slightly older update
                },
            ]
        };
        const request = new Request('http://localhost/sitemap-earthquakes.xml');
        const context = createMockContext(request, {}, {}, mockEvents);

        const response = await onRequest(context);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('application/xml');
        const text = await response.text();

        expect(context.env.DB.prepare).toHaveBeenCalledWith(
            "SELECT id, magnitude, place, event_time, geojson_feature FROM EarthquakeEvents WHERE id IS NOT NULL AND place IS NOT NULL"
        );
        expect(text).toContain('<urlset');

        const expectedUrl1 = `https://earthquakeslive.com/quake/m5.5-10km-n-of-testville-ev1`;
        expect(text).toContain(`<loc>${expectedUrl1}</loc>`);
        expect(text).toContain(`<lastmod>${new Date(now).toISOString()}</lastmod>`);

        const expectedUrl2 = `https://earthquakeslive.com/quake/m4.2-somewhere-else-ev2`;
        expect(text).toContain(`<loc>${expectedUrl2}</loc>`);
        expect(text).toContain(`<lastmod>${new Date(now - 10000).toISOString()}</lastmod>`);
    });

    it('/sitemap-earthquakes.xml should use event_time if geojson_feature or properties.updated is missing/invalid', async () => {
        const eventTime1 = Math.floor(Date.now() / 1000) - 86400; // 1 day ago in seconds
        const eventTime2 = Math.floor(Date.now() / 1000) - 172800; // 2 days ago in seconds

        const mockEvents = {
            results: [
                { // Missing geojson_feature
                    id: "ev_no_geojson", magnitude: 3.0, place: "No GeoJSON Here", event_time: eventTime1
                },
                { // geojson_feature present, but properties.updated is not a number
                    id: "ev_invalid_updated", magnitude: 3.1, place: "Invalid Updated", event_time: eventTime2,
                    geojson_feature: JSON.stringify({ properties: { updated: "not-a-timestamp" } })
                },
                 { // geojson_feature present, but no properties
                    id: "ev_no_properties", magnitude: 3.2, place: "No Properties", event_time: eventTime2 + 3600,
                    geojson_feature: JSON.stringify({})
                },

            ]
        };
        const request = new Request('http://localhost/sitemap-earthquakes.xml');
        const context = createMockContext(request, {}, {}, mockEvents);
        const response = await onRequest(context);
        const text = await response.text();

        expect(response.status).toBe(200);
        const expectedUrl1 = `https://earthquakeslive.com/quake/m3.0-no-geojson-here-ev_no_geojson`;
        expect(text).toContain(`<loc>${expectedUrl1}</loc>`);
        expect(text).toContain(`<lastmod>${new Date(eventTime1 * 1000).toISOString()}</lastmod>`);

        const expectedUrl2 = `https://earthquakeslive.com/quake/m3.1-invalid-updated-ev_invalid_updated`;
        expect(text).toContain(`<loc>${expectedUrl2}</loc>`);
        expect(text).toContain(`<lastmod>${new Date(eventTime2 * 1000).toISOString()}</lastmod>`);

        const expectedUrl3 = `https://earthquakeslive.com/quake/m3.2-no-properties-ev_no_properties`;
        expect(text).toContain(`<loc>${expectedUrl3}</loc>`);
        expect(text).toContain(`<lastmod>${new Date((eventTime2 + 3600) * 1000).toISOString()}</lastmod>`);
    });

    it('/sitemap-earthquakes.xml should handle D1 query error', async () => {
        const request = new Request('http://localhost/sitemap-earthquakes.xml');
        const context = createMockContext(request);
        // Simulate D1 error
        context.env.DB.prepare = vi.fn().mockReturnThis();
        context.env.DB.all = vi.fn().mockRejectedValue(new Error("D1 unavailable"));

        const response = await onRequest(context);
        expect(response.status).toBe(200);
        const text = await response.text();
        expect(text).toContain("<!-- Exception processing earthquake data from D1: D1 unavailable -->");
    });

    it('/sitemap-earthquakes.xml should handle D1 not configured', async () => {
        const request = new Request('http://localhost/sitemap-earthquakes.xml');
        // Pass an empty env to simulate DB not being configured
        const context = createMockContext(request, { DB: undefined });

        const response = await onRequest(context);
        expect(response.status).toBe(200);
        const text = await response.text();
        expect(text).toContain("<!-- D1 Database not available -->");
    });

    it('/sitemap-earthquakes.xml should handle empty results from D1', async () => {
        const request = new Request('http://localhost/sitemap-earthquakes.xml');
        // createMockContext defaults to empty results, so no need to pass mockDbResults
        const context = createMockContext(request);

        const response = await onRequest(context);
        expect(response.status).toBe(200);
        const text = await response.text();
        expect(text).not.toContain("<loc>");
        expect(text).toBe(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`);
    });

    it('/sitemap-earthquakes.xml should skip events with missing id or place from D1', async () => {
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


        const request = new Request('http://localhost/sitemap-earthquakes.xml');
        const context = createMockContext(request, {}, {}, adjustedMockEvents);
        const response = await onRequest(context);
        const text = await response.text();

        expect(response.status).toBe(200);
        const expectedUrl = `https://earthquakeslive.com/quake/m6.0-proper-event-ev_valid`;
        expect(text).toContain(`<loc>${expectedUrl}</loc>`);
        const urlCount = (text.match(/<url>/g) || []).length;
        expect(urlCount).toBe(1); // Only the fully valid entry
    });

    it('/sitemap-earthquakes.xml should skip events with invalid lastmodTimestamp after fallbacks', async () => {
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
        const request = new Request('http://localhost/sitemap-earthquakes.xml');
        const context = createMockContext(request, {}, {}, mockEvents);
        const response = await onRequest(context);
        const text = await response.text();

        expect(response.status).toBe(200);
        const expectedUrl = `https://earthquakeslive.com/quake/m3.1-valid-time-ev_valid_time`;
        expect(text).toContain(`<loc>${expectedUrl}</loc>`); // Only the one with valid event_time
        const urlCount = (text.match(/<url>/g) || []).length;
        expect(urlCount).toBe(1);
    });

});
