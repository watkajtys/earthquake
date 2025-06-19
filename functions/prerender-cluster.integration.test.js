import { onRequest, handlePrerenderCluster } from './[[catchall]]'; // onRequest for routing, handlePrerenderCluster for specific tests
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
      DB: mockDbInstance, // Ensure D1 mock is available
      CLUSTER_KV: { // Though not directly used by cluster prerender, part of standard context
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

// TODO: REVIEW_REDUNDANCY - This integration test suite for cluster prerendering
// overlaps significantly with the direct handler tests in
// `functions/routes/prerender/cluster-detail.test.js` (for `handlePrerenderCluster`).
// Consider slimming down this suite to focus on verifying the routing via
// `[[catchall]].js` (including slug parsing by the router) and basic
// success/error propagation, rather than re-testing all detailed handler logic
// (D1 interactions, USGS fetches for strongest quake, specific error cases)
// covered in the direct handler tests.
// --- Tests for Prerendering Cluster Details ---
describe('Prerendering Handler: /cluster/:id', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        // MSW will handle fetch lifecycle, server.resetHandlers() is in setupTests.js or called by vi.clearAllMocks()
    });

    // Test for old /cluster/:id format (may be removed if not supported)
    it('/cluster/some-cluster-id (old format) should return 404 because [[catchall]].js regex will not match', async () => {
        const clusterIdOldFormat = "test-cluster-d1-old"; // This does not match the new regex in [[catchall]].js
        const request = new Request(`http://localhost/cluster/${clusterIdOldFormat}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        context.env.DB.first.mockResolvedValueOnce(null); // If it somehow reaches handlePrerenderCluster

        const response = await onRequest(context); // Uses main router

        // This slug should ideally be caught by the router's regex if it's strict enough.
        // If the router regex is too permissive and passes it to handlePrerenderCluster,
        // then handlePrerenderCluster will try to query D1 with "test-cluster-d1-old" as slug.
        const text = await response.text();
        expect(response.status).toBe(404);

        // Check if it was "Invalid cluster URL format" (from router) or "Cluster not found" (from handler)
        if (text.includes("Invalid cluster URL format.")) {
            expect(context.env.DB.prepare).not.toHaveBeenCalled();
        } else {
            expect(text).toContain("Cluster not found");
            expect(context.env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("FROM ClusterDefinitions WHERE slug = ?"));
            expect(context.env.DB.bind).toHaveBeenCalledWith(clusterIdOldFormat);
        }
    });

    // These tests call handlePrerenderCluster directly, bypassing [[catchall]].js's initial regex.
    // They test the behavior of the handler assuming a valid slug (in terms of format for DB lookup) is passed.
    describe('handlePrerenderCluster direct invocation (Simulating route match)', () => {
        beforeEach(() => {
          vi.resetAllMocks(); // Ensures D1 and fetch mocks are clean for each sub-test
          // MSW will handle fetch lifecycle
        });

        const validSlugTestCase = {
          description: 'Valid slug for direct handler test',
          urlSlug: 'direct-15-quakes-near-southern-sumatra-m5.8-us7000mfp9',
          expectedStrongestQuakeId: 'us7000mfp9',
        };
        // Corrected expectedD1Query to include quakeCount
        const expectedD1Query = "SELECT id, slug, title, description, strongestQuakeId, locationName, maxMagnitude, earthquakeIds, startTime, endTime, quakeCount FROM ClusterDefinitions WHERE slug = ?";

        it(`should query D1 with slug and generate HTML for: ${validSlugTestCase.description}`, async () => {
          const { urlSlug, expectedStrongestQuakeId } = validSlugTestCase;
          const mockContext = createMockContext(new Request(`http://localhost/cluster/${urlSlug}`, { headers: { 'User-Agent': 'Googlebot' }}));

          const mockD1ClusterData = {
            slug: urlSlug,
            title: 'Test D1 Title: 15 Quakes near Southern Sumatra',
            description: 'Test D1 Description: A cluster of 15 quakes.',
            earthquakeIds: JSON.stringify(['id1', 'id2']),
            strongestQuakeId: expectedStrongestQuakeId,
            locationName: 'D1 Southern Sumatra, Indonesia',
            maxMagnitude: 5.8,
            quakeCount: 15, // Added quakeCount
            startTime: Date.now() - (2 * 60 * 60 * 1000),
            endTime: Date.now() - (1 * 60 * 60 * 1000),
          };
          mockContext.env.DB.first.mockResolvedValueOnce(mockD1ClusterData);
          // MSW for USGS 'us7000mfp9' should be active

          const response = await handlePrerenderCluster(mockContext, urlSlug);
          const html = await response.text();

          expect(response.status).toBe(200);
          expect(response.headers.get('Content-Type')).toContain('text/html');
          expect(mockContext.env.DB.prepare).toHaveBeenCalledWith(expectedD1Query.replace(/\s+/g, ' ').trim());
          expect(mockContext.env.DB.bind).toHaveBeenCalledWith(urlSlug);
          expect(html).toContain(`<link rel="canonical" href="https://earthquakeslive.com/cluster/${urlSlug}">`);
          expect(html).toContain(mockD1ClusterData.title);
          expect(html).toContain(mockD1ClusterData.description);
          expect(html).toContain(`"startDate":"${new Date(mockD1ClusterData.startTime).toISOString()}"`);
          expect(html).toContain(`"endDate":"${new Date(mockD1ClusterData.endTime).toISOString()}"`);
          expect(html).toContain(`Strongest quake in this cluster: <a href="https://earthquake.usgs.gov/earthquakes/eventpage/us7000mfp9">M 5.8 - Southern Sumatra, Indonesia</a>`);
        });

        it('should correctly prerender with minimal D1 data (relying on USGS for location/mag)', async () => {
          const urlSlug = 'direct-12-quakes-near-test-location-m5.5-usTestId123';
          const expectedStrongestQuakeId = 'usTestId123';
          const mockContext = createMockContext(new Request(`http://localhost/cluster/${urlSlug}`, { headers: { 'User-Agent': 'Googlebot' }}));

          const mockD1ClusterDataMinimal = {
            slug: urlSlug,
            earthquakeIds: JSON.stringify(['id1', 'id2', 'id3']),
            strongestQuakeId: expectedStrongestQuakeId,
            title: null,
            description: null,
            locationName: null,
            maxMagnitude: null,
            quakeCount: 12,
            startTime: Date.now() - (3 * 60 * 60 * 1000),
            endTime: Date.now() - (2 * 60 * 60 * 1000),
          };
          mockContext.env.DB.first.mockResolvedValueOnce(mockD1ClusterDataMinimal);
          // Ensure MSW is set for 'usTestId123' to provide { properties: { mag: 5.5, place: 'Test Region, Test Location' } }
          // (Note: The actual test setup for MSW is global or per-suite, this is a comment for clarity)

          const response = await handlePrerenderCluster(mockContext, urlSlug);
          const html = await response.text();

          expect(response.status).toBe(200);
          expect(mockContext.env.DB.bind).toHaveBeenCalledWith(urlSlug);
          // Adjusted expected title to match the implementation's direct use of USGS place
          expect(html).toContain('<title>12 Earthquakes Near Test Region, Test Location (up to M5.5)</title>');
          expect(html).toContain('<meta name="description" content="An overview of 12 recent seismic activities near Test Region, Test Location, with the strongest reaching M5.5.">');
          expect(html).toContain('Strongest quake in this cluster: <a href="https://earthquake.usgs.gov/earthquakes/eventpage/usTestId123">M 5.5 - Test Region, Test Location</a>');
        });

        const slugsNotFoundInD1 = [
          { description: 'Slug that would fail old regex (non-numeric count)', urlSlug: 'abc-quakes-near-location-m5.0-id1' },
          { description: 'Slug that would fail old regex (missing final ID part)', urlSlug: '10-quakes-near-location-m5.0-' },
        ];

        slugsNotFoundInD1.forEach(({ description, urlSlug }) => {
          it(`should return 404 for slug not found in D1 (${description}): ${urlSlug}`, async () => {
            const mockContext = createMockContext(new Request(`http://localhost/cluster/${urlSlug}`, { headers: { 'User-Agent': 'Googlebot' }}));
            mockContext.env.DB.first.mockResolvedValueOnce(null);

            const response = await handlePrerenderCluster(mockContext, urlSlug);
            const text = await response.text();

            expect(response.status).toBe(404);
            expect(text).toContain('Cluster not found');
            expect(mockContext.env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("FROM ClusterDefinitions WHERE slug = ?"));
            expect(mockContext.env.DB.bind).toHaveBeenCalledWith(urlSlug);
          });
        });
    });

    // These tests call onRequest from [[catchall]].js to test routing and full flow
    describe('[[catchall]].js routing and integration with handlePrerenderCluster', () => {
        it('should fall back to SPA/assets for slugs failing [[catchall]].js regex', async () => {
            const invalidForRouterSlug = "!@#completely-invalid-format"; // This slug should fail the router's regex
            const request = new Request(`http://localhost/cluster/${invalidForRouterSlug}`, { headers: { 'User-Agent': 'Googlebot' }});
            const context = createMockContext(request);

            const response = await onRequest(context);
            // [[catchall]].js calls env.ASSETS.fetch for non-matching, non-API routes.
            // The mock for env.ASSETS.fetch returns a 200 with "SPA fallback".
            // However, [[catchall]] calls context.next() which is mocked separately.
            expect(response.status).toBe(200);
            expect(await response.text()).toContain("Fallback to env.ASSETS.fetch for static assets");
            expect(context.env.DB.prepare).not.toHaveBeenCalled();
        });

        it('/cluster/some-cluster-id should handle D1 error during prerender', async () => {
            const urlSlug = "10-quakes-near-anywhere-m1.0-error123";
            const request = new Request(`http://localhost/cluster/${urlSlug}`, { headers: { 'User-Agent': 'Googlebot' }});
            const context = createMockContext(request);
            context.env.DB.prepare.mockImplementation(() => {
                throw new Error("D1 prepare error during test");
            });

            const response = await onRequest(context);
            expect(response.status).toBe(500);
            expect(await response.text()).toContain("Error prerendering cluster page");
        });

        it('/cluster/some-cluster-id should handle fetch error for strongest quake during prerender', async () => {
            const urlSlug = "10-quakes-near-fetcherror-m1.0-fetcherr1";
            const mockD1ClusterData = {
                slug: urlSlug,
                earthquakeIds: JSON.stringify(['q1']),
                strongestQuakeId: 'fetcherr1',
                title: 'Test Title',
                description: 'Test Description',
                locationName: 'Test Location',
                maxMagnitude: 1.0,
                quakeCount: 10,
                startTime: Date.now(),
                endTime: Date.now()
            };
            const request = new Request(`http://localhost/cluster/${urlSlug}`, { headers: { 'User-Agent': 'Googlebot' }});
            const context = createMockContext(request);
            context.env.DB.first.mockResolvedValueOnce(mockD1ClusterData);
            // MSW should be configured to make fetch for 'fetcherr1.geojson' fail

            const response = await onRequest(context);
            expect(response.status).toBe(200);
            expect(await response.text()).toContain("Further details about the most significant event in this cluster are currently unavailable.");
        });
    });

    it('/cluster/some-cluster-id should handle DB undefined for prerender', async () => {
        const urlSlug = "10-quakes-near-nodb-up-to-m1.0-nodb1";
        const request = new Request(`http://localhost/cluster/${urlSlug}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request, { DB: undefined });

        const response = await onRequest(context);
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain("Service configuration error.");
    });

    it('/cluster/some-cluster-id should handle error parsing earthquakeIds from D1', async () => {
        const urlSlug = "10-quakes-near-badjson-m1.0-badjson1"; // Slug that matches [[catchall]] pattern
        const mockClusterD1DataBadJson = {
            slug: urlSlug, // ensure slug is present
            earthquakeIds: "this is not json",
            strongestQuakeId: 'badjson1',
            title: 'Cluster with Bad JSON earthquakeIds',
            description: 'Test description for bad JSON.',
            locationName: 'Bad JSON Test Location',
            maxMagnitude: 1.0,
            quakeCount: 10,
            startTime: Date.now() - 3600000,
            endTime: Date.now(),
            // No updatedAt needed if not used by handler directly, but good practice for full mock
        };
        const request = new Request(`http://localhost/cluster/${urlSlug}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);

        // This test calls onRequest, so D1 interaction is via env.DB.first used by handlePrerenderCluster
        context.env.DB.first.mockResolvedValueOnce(mockClusterD1DataBadJson);
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // MSW mock for the USGS call, as handlePrerenderCluster will try to fetch it
        // Ensure this eventId 'badjson1' is handled by MSW or a specific server.use() here
        // For simplicity, assume it might fetch and fail or get some generic data that doesn't break things further.

        const response = await onRequest(context);
        expect(response.status).toBe(200); // Page should still render
        const text = await response.text();
        expect(text).toContain(mockClusterD1DataBadJson.title); // Check if page rendered with some D1 data
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining(`[prerender-cluster] Error parsing earthquakeIds for slug ${urlSlug}: Unexpected token`)
        );
        consoleErrorSpy.mockRestore();
    });
});
