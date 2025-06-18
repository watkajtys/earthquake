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
        // fetch.mockReset(); // MSW will handle fetch lifecycle
    });

    // Test for old /cluster/:id format (may be removed if not supported)
    it('/cluster/some-cluster-id (old format) should return 404 due to invalid format', async () => {
        const clusterIdOldFormat = "test-cluster-d1-old";
        const request = new Request(`http://localhost/cluster/${clusterIdOldFormat}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);

        const response = await onRequest(context); // Uses main router which calls handlePrerenderCluster

        expect(response.status).toBe(404);
        const text = await response.text();
        expect(text).toContain("Invalid cluster URL format.");
        expect(context.env.DB.prepare).not.toHaveBeenCalled();
    });

    describe('handlePrerenderCluster Slug Parsing and D1 Query (New URL Format)', () => {
        beforeEach(() => {
          vi.resetAllMocks(); // Ensures D1 and fetch mocks are clean for each sub-test
          // fetch.mockReset(); // MSW will handle fetch lifecycle
        });

        const validSlugTestCase = {
          description: 'Valid slug',
          urlSlug: '15-quakes-near-southern-sumatra-indonesia-up-to-m5.8-us7000mfp9',
          expectedStrongestQuakeId: 'us7000mfp9',
          expectedCount: '15', // Unused in this test file directly, but good for reference
          expectedD1QueryId: 'overview_cluster_us7000mfp9_15',
        };

        it(`should correctly parse slug, query D1, fetch USGS, and generate HTML for: ${validSlugTestCase.description}`, async () => {
          const { urlSlug, expectedD1QueryId, expectedStrongestQuakeId } = validSlugTestCase;
          // Pass a mock request for consistency, though handlePrerenderCluster might not use it directly
          const mockContext = createMockContext(new Request(`http://localhost/cluster/${urlSlug}`, { headers: { 'User-Agent': 'Googlebot' }}));

          const mockD1ClusterData = {
            earthquakeIds: JSON.stringify(['id1', 'id2']),
            strongestQuakeId: expectedStrongestQuakeId,
            updatedAt: new Date().toISOString(),
          };
          mockContext.env.DB.first.mockResolvedValueOnce(mockD1ClusterData);

          const mockUsgsQuakeData = {
            properties: { mag: 5.8, place: 'Southern Sumatra, Indonesia', time: Date.now() },
            geometry: { coordinates: [100, -4, 10] },
            id: expectedStrongestQuakeId,
          };
          // fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockUsgsQuakeData), { status: 200 }));

          // Directly test handlePrerenderCluster or use onRequest if routing is crucial
          const response = await handlePrerenderCluster(mockContext, urlSlug);
          const html = await response.text();

          expect(response.status).toBe(200);
          expect(response.headers.get('Content-Type')).toContain('text/html');
          expect(mockContext.env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('WHERE clusterId = ?'));
          expect(mockContext.env.DB.bind).toHaveBeenCalledWith(expectedD1QueryId);
          // expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/detail/${expectedStrongestQuakeId}.geojson`));
          expect(html).toContain(`<link rel="canonical" href="https://earthquakeslive.com/cluster/${urlSlug}">`);
          expect(html).toContain('Southern Sumatra, Indonesia');
          expect(html).toContain('15 Earthquakes Near');
          expect(html).toContain('M5.8');
          expect(html).toContain('Strongest quake in this cluster: <a href="https://earthquake.usgs.gov/earthquakes/eventpage/us7000mfp9">M 5.8 - Southern Sumatra, Indonesia</a>');
        });

        it('should correctly prerender with minimal D1 data, relying on slug and USGS fetch for details', async () => {
          const urlSlug = '12-quakes-near-test-location-up-to-m5.5-usTestId123';
          const expectedStrongestQuakeId = 'usTestId123';
          const expectedD1QueryId = 'overview_cluster_usTestId123_12';
          const mockContext = createMockContext(new Request(`http://localhost/cluster/${urlSlug}`, { headers: { 'User-Agent': 'Googlebot' }}));

          const mockD1ClusterDataMinimal = {
            earthquakeIds: JSON.stringify(['id1', 'id2', 'id3']),
            strongestQuakeId: expectedStrongestQuakeId,
            title: null,
            description: null,
            locationName: null,
            maxMagnitude: null,
            updatedAt: new Date().toISOString(),
          };
          mockContext.env.DB.first.mockResolvedValueOnce(mockD1ClusterDataMinimal);

          const mockUsgsQuakeData = {
            properties: { mag: 5.5, place: 'Test Region, Test Location', time: Date.now() },
            geometry: { coordinates: [10, 20, 30] },
            id: expectedStrongestQuakeId
          };
          // fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockUsgsQuakeData), { status: 200 }));

          const response = await handlePrerenderCluster(mockContext, urlSlug);
          const html = await response.text();

          expect(response.status).toBe(200);
          expect(mockContext.env.DB.bind).toHaveBeenCalledWith(expectedD1QueryId);
          expect(html).toContain('<title>12 Earthquakes Near Test Location (up to M5.5)</title>');
          expect(html).toContain('<meta name="description" content="An overview of 12 recent seismic activities near Test Location, with the strongest reaching M5.5.">');
          expect(html).toContain('Strongest quake in this cluster: <a href="https://earthquake.usgs.gov/earthquakes/eventpage/usTestId123">M 5.5 - Test Region, Test Location</a>');
        });


        const anotherValidSlugTestCase = {
          description: 'Valid slug with single-digit count',
          urlSlug: '5-quakes-near-california-up-to-m4.2-ci12345',
          expectedStrongestQuakeId: 'ci12345',
          expectedD1QueryId: 'overview_cluster_ci12345_5',
        };

        it(`should correctly parse slug, query D1, fetch USGS, and generate HTML for: ${anotherValidSlugTestCase.description}`, async () => {
            const { urlSlug, expectedD1QueryId, expectedStrongestQuakeId } = anotherValidSlugTestCase;
            const mockContext = createMockContext(new Request(`http://localhost/cluster/${urlSlug}`, { headers: { 'User-Agent': 'Googlebot' }}));
            const mockD1ClusterData = {
                earthquakeIds: JSON.stringify(['id1']),
                strongestQuakeId: expectedStrongestQuakeId,
                updatedAt: new Date().toISOString(),
            };
            mockContext.env.DB.first.mockResolvedValueOnce(mockD1ClusterData);
            const mockUsgsQuakeData = {
                properties: { mag: 4.2, place: 'California', time: Date.now() },
                geometry: { coordinates: [-120, 35, 5] },
                id: expectedStrongestQuakeId,
            };
            // fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockUsgsQuakeData), { status: 200 }));

            const response = await handlePrerenderCluster(mockContext, urlSlug);
            const html = await response.text();
            expect(response.status).toBe(200);
            expect(mockContext.env.DB.bind).toHaveBeenCalledWith(expectedD1QueryId);
            expect(html).toContain(`<link rel="canonical" href="https://earthquakeslive.com/cluster/${urlSlug}">`);
            expect(html).toContain('California');
        });

        const invalidSlugTestCases = [
          { description: 'Completely invalid slug format', urlSlug: 'my-invalid-cluster-id-123' },
          { description: 'Slug with non-numeric count', urlSlug: 'abc-quakes-near-location-up-to-m5.0-id1' },
          { description: 'Slug missing final ID part', urlSlug: '10-quakes-near-location-up-to-m5.0-' },
          { description: 'Slug missing count part', urlSlug: '-quakes-near-location-up-to-m5.0-id1' },
          { description: 'Slug too short for regex', urlSlug: '1-q-n-l-u-m1-id1' },
        ];

        invalidSlugTestCases.forEach(({ description, urlSlug }) => {
          it(`should return 404 for invalid slug (${description}): ${urlSlug}`, async () => {
            const mockContext = createMockContext(new Request(`http://localhost/cluster/${urlSlug}`, { headers: { 'User-Agent': 'Googlebot' }}));
            const response = await handlePrerenderCluster(mockContext, urlSlug);
            const text = await response.text();

            expect(response.status).toBe(404);
            expect(text).toContain('Invalid cluster URL format.');
            expect(mockContext.env.DB.prepare).not.toHaveBeenCalled();
            // expect(fetch).not.toHaveBeenCalled();
          });
        });

        it('should return 404 if D1 returns null for a parsed D1 Query ID', async () => {
            const { urlSlug, expectedD1QueryId } = validSlugTestCase;
            const mockContext = createMockContext(new Request(`http://localhost/cluster/${urlSlug}`, { headers: { 'User-Agent': 'Googlebot' }}));
            mockContext.env.DB.first.mockResolvedValueOnce(null);

            const response = await handlePrerenderCluster(mockContext, urlSlug);
            const text = await response.text();

            expect(response.status).toBe(404);
            expect(text).toContain("Cluster not found");
            expect(mockContext.env.DB.bind).toHaveBeenCalledWith(expectedD1QueryId);
            // expect(fetch).not.toHaveBeenCalled();
        });
    });

    it('/cluster/some-cluster-id should handle D1 error during prerender', async () => {
        const urlSlug = "10-quakes-near-anywhere-up-to-m1.0-error123";
        const request = new Request(`http://localhost/cluster/${urlSlug}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        context.env.DB.prepare.mockReturnValueOnce({ bind: vi.fn().mockReturnValueOnce({ first: vi.fn().mockRejectedValueOnce(new Error("D1 .first() error")) }) });

        const response = await onRequest(context);
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain("Error prerendering cluster page");
    });

    it('/cluster/some-cluster-id should handle fetch error for strongest quake during prerender', async () => {
        const urlSlug = "10-quakes-near-fetcherror-up-to-m1.0-fetcherr1";
        const mockClusterD1Data = { earthquakeIds: JSON.stringify(['q1']), strongestQuakeId: 'fetcherr1', updatedAt: new Date().toISOString() };
        const request = new Request(`http://localhost/cluster/${urlSlug}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);
        context.env.DB.prepare.mockReturnValueOnce({ bind: vi.fn().mockReturnValueOnce({ first: vi.fn().mockResolvedValueOnce(mockClusterD1Data) }) });
        // fetch.mockRejectedValueOnce(new Error("Strongest Quake Fetch Error D1"));

        const response = await onRequest(context);
        expect(response.status).toBe(200); // Graceful degradation, serves page with warning
        const text = await response.text();
        expect(text).toContain("Further details about the most significant event in this cluster are currently unavailable.");
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
        const urlSlug = "10-quakes-near-badjson-up-to-m1.0-badjson1";
        const d1QueryId = "overview_cluster_badjson1_10";
        const mockClusterD1DataBadJson = {
            earthquakeIds: "this is not json",
            strongestQuakeId: 'badjson1',
            updatedAt: new Date().toISOString()
        };
        const request = new Request(`http://localhost/cluster/${urlSlug}`, { headers: { 'User-Agent': 'Googlebot' }});
        const context = createMockContext(request);

        const mockD1First = vi.fn().mockResolvedValueOnce(mockClusterD1DataBadJson);
        context.env.DB.prepare.mockReturnValueOnce({ bind: vi.fn().mockReturnValueOnce({ first: mockD1First }) });
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const response = await onRequest(context);
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain("Error processing cluster data.");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining(`[prerender-cluster] Error parsing earthquakeIds for D1 Query ID ${d1QueryId}: Unexpected token`)
        );
        consoleErrorSpy.mockRestore();
    });
});
