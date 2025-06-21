import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handlePrerenderCluster } from './cluster-detail.js';
import { server } from '../../../src/mocks/server.js'; // MSW server
import { http, HttpResponse } from 'msw';       // MSW http utilities

// Mock D1 database interaction
const mockD1First = vi.fn();
const mockD1Bind = vi.fn(() => ({ first: mockD1First }));
const mockD1Prepare = vi.fn(() => ({ bind: mockD1Bind }));

// escapeXml is imported by cluster-detail.js. Assuming direct import works.
// vi.mock('../../utils/xml-utils.js', () => ({ escapeXml: (str) => str.replace(/&/g, '&amp;') }));

const createMockContext = (requestProps = {}, envProps = {}) => {
  return {
    request: { url: 'http://localhost/cluster/test-slug', ...requestProps }, // URL not directly used by handler
    env: {
      DB: { prepare: mockD1Prepare }, // Default mock DB
      ...envProps
    },
    // waitUntil: vi.fn(), // Not used by this handler
  };
};

describe('handlePrerenderCluster', () => {
  let consoleErrorSpy;
  const baseTime = Date.now();

  beforeEach(() => {
    vi.clearAllMocks();
    mockD1First.mockReset();
    mockD1Bind.mockClear();
    mockD1Prepare.mockClear();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  const validSlug1 = '10-quakes-near-someplace-m5-us123'; // Simplified slug for testing
  const eventId1 = 'us123';

  const validSlug2 = '12-quakes-near-fallback-place-m4.5-us456';
  const eventId2 = 'us456';

  const expectedD1Query = "SELECT id, slug, title, description, strongestQuakeId, locationName, maxMagnitude, earthquakeIds, startTime, endTime, quakeCount FROM ClusterDefinitions WHERE slug = ?";

  it('1. Successful Render (Full D1 data, Full USGS data)', async () => {
    const d1ResponseData = {
      id: 'd1-cluster-id-1',
      slug: validSlug1,
      title: 'D1 Custom Title for Someplace Cluster',
      description: 'D1 Custom Description of this cluster.',
      strongestQuakeId: eventId1,
      locationName: 'D1 Location Name',
      maxMagnitude: 5.0,
      earthquakeIds: JSON.stringify(['id1', 'id2']), // Not used for dates anymore
      startTime: baseTime - 3600000, // 1 hour ago
      endTime: baseTime,
      // No updatedAt in new schema directly, but can be added to mock if needed by a test implicitly
    };
    mockD1First.mockResolvedValueOnce(d1ResponseData);

    // USGS mock remains the same
    const usgsResponseData = {
      properties: {
        mag: 5.0,
        place: 'USGS Detailed Place',
        title: 'M 5.0 - USGS Detailed Place',
        url: `http://usgs.gov/event/${eventId1}`
      },
      id: eventId1,
      geometry: { type: 'Point', coordinates: [0,0]}
    };
    // MSW setup for this specific USGS call if not globally handled
    server.use(
      http.get(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${eventId1}.geojson`, () => {
        return HttpResponse.json(usgsResponseData);
      })
    );

    const context = createMockContext();
    const response = await handlePrerenderCluster(context, validSlug1);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html');
    expect(mockD1Prepare).toHaveBeenCalledWith(expectedD1Query.replace(/\s+/g, ' ').trim());
    expect(mockD1Bind).toHaveBeenCalledWith(validSlug1);

    expect(html).toContain(`<title>D1 Custom Title for Someplace Cluster</title>`);
    expect(html).toContain(`<meta name="description" content="D1 Custom Description of this cluster.">`);
    expect(html).toContain(`<link rel="canonical" href="https://earthquakeslive.com/cluster/${validSlug1}">`);
    expect(html).toContain(`<h1>D1 Custom Title for Someplace Cluster</h1>`);
    expect(html).toContain(`<a href="http://usgs.gov/event/us123">M 5.0 - USGS Detailed Place</a>`);
    expect(html).toContain(`"startDate":"${new Date(d1ResponseData.startTime).toISOString()}"`);
    expect(html).toContain(`"endDate":"${new Date(d1ResponseData.endTime).toISOString()}"`);
  });

  it('2. Successful Render (Minimal D1 data, Full USGS data - fallbacks used)', async () => {
    const d1ResponseData = {
      id: 'd1-cluster-id-2',
      slug: validSlug2,
      strongestQuakeId: eventId2,
      earthquakeIds: JSON.stringify(['id2', 'id3']),
      title: null, // Will use generated title
      description: null, // Will use generated description
      locationName: null, // Will use USGS location
      maxMagnitude: null, // Will use USGS magnitude
      quakeCount: 12, // Added quakeCount
      startTime: baseTime - 7200000,
      endTime: baseTime - 3600000,
    };
    mockD1First.mockResolvedValueOnce(d1ResponseData);

    const usgsResponseData = {
      properties: {
        mag: 4.5,
        place: 'USGS Fallback Region Name', // More specific than just "Details"
        title: 'M 4.5 - USGS Fallback Region Details',
        url: `http://usgs.gov/event/${eventId2}`
      },
      id: eventId2,
      geometry: { type: 'Point', coordinates: [0,0]}
    };
     server.use(
      http.get(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${eventId2}.geojson`, () => {
        return HttpResponse.json(usgsResponseData);
      })
    );

    const context = createMockContext();
    const response = await handlePrerenderCluster(context, validSlug2);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html');
    expect(mockD1Bind).toHaveBeenCalledWith(validSlug2);

    const expectedLocation = 'USGS Fallback Region Name'; // From USGS
    const expectedMag = '4.5'; // From USGS
    // Updated expected title and description based on new implementation logic
    const expectedTitle = `12 Earthquakes Near ${expectedLocation} (up to M${expectedMag})`;
    expect(html).toContain(`<title>${expectedTitle}</title>`);
    const expectedDesc = `An overview of 12 recent seismic activities near ${expectedLocation}, with the strongest reaching M${expectedMag}.`;
    expect(html).toContain(`<meta name="description" content="${expectedDesc}">`);
    expect(html).toContain(`<h1>${expectedTitle}</h1>`);
    expect(html).toContain(`<a href="http://usgs.gov/event/us456">M 4.5 - USGS Fallback Region Details</a>`);
  });

  it('3. Invalid Slug Format - handlePrerenderCluster itself does not validate slug format anymore, relies on D1 not finding it', async () => {
    const invalidSlug = 'this-is-not-a-valid-slug-format';
    mockD1First.mockResolvedValueOnce(null); // D1 returns null for this slug
    const context = createMockContext();
    const response = await handlePrerenderCluster(context, invalidSlug);

    expect(response.status).toBe(404); // Now expects 404 because D1 won't find it
    expect(response.headers.get('Content-Type')).toBe('text/plain;charset=UTF-8');
    expect(await response.text()).toBe('Cluster not found'); // Message from D1 not found
    expect(mockD1Prepare).toHaveBeenCalledWith(expectedD1Query.replace(/\s+/g, ' ').trim());
    expect(mockD1Bind).toHaveBeenCalledWith(invalidSlug);
  });

  it('4. DB Not Configured (env.DB missing)', async () => {
    const context = createMockContext({}, { DB: undefined });
    const response = await handlePrerenderCluster(context, validSlug1);

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('Service configuration error.');
    expect(consoleErrorSpy).toHaveBeenCalledWith("Database not configured for prerender cluster");
  });

  it('5. Cluster Not Found in D1 (d1Response is null)', async () => {
    mockD1First.mockResolvedValueOnce(null);
    const context = createMockContext();
    const response = await handlePrerenderCluster(context, validSlug1); // Use validSlug1

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Cluster not found');
    expect(mockD1Prepare).toHaveBeenCalled();
    expect(mockD1Bind).toHaveBeenCalledWith(validSlug1); // Should be called with the slug
    // Check console.warn was called with the correct message
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await handlePrerenderCluster(createMockContext(), validSlug1); // Call again to trigger log with spy
    expect(consoleWarnSpy).toHaveBeenCalledWith(`Cluster details not found in D1 for slug: ${validSlug1}`);
    consoleWarnSpy.mockRestore();
  });

  it('6. D1 Query Error', async () => {
    const d1Error = new Error('D1 execute error');
    mockD1First.mockRejectedValueOnce(d1Error);
    const context = createMockContext();
    const response = await handlePrerenderCluster(context, validSlug1);

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('Error prerendering cluster page');
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Database error in handlePrerenderCluster for slug "${validSlug1}":`, d1Error);
  });

  it('7. USGS Fetch Fails for Strongest Quake (e.g., network error)', async () => {
    const d1ResponseData = {
      slug: validSlug1,
      strongestQuakeId: eventId1,
      earthquakeIds: '[]',
      title: 'Test',
      description: 'Test',
      startTime: baseTime,
      endTime: baseTime
    };
    mockD1First.mockResolvedValueOnce(d1ResponseData);

    server.use(
      http.get(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${eventId1}.geojson`, () => {
        return HttpResponse.error(); // Simulates network error
      })
    );

    const context = createMockContext();
    const response = await handlePrerenderCluster(context, validSlug1);
    const html = await response.text();

    expect(response.status).toBe(200); // Page still renders with fallback
    expect(html).toContain('Further details about the most significant event in this cluster are currently unavailable.');
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Exception fetching strongest quake ${eventId1}: Failed to fetch`);
  });

  it('8. USGS Data for Strongest Quake Incomplete (missing place)', async () => {
    const d1ResponseData = {
      slug: validSlug1,
      strongestQuakeId: eventId1,
      earthquakeIds: '[]',
      title: 'Test',
      description: 'Test',
      startTime: baseTime,
      endTime: baseTime
    };
    mockD1First.mockResolvedValueOnce(d1ResponseData);

    server.use(
      http.get(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${eventId1}.geojson`, () => {
        return HttpResponse.json(
          { properties: { mag: 5.0 /* place missing */ }, id: eventId1, geometry: {type: 'Point', coordinates: [0,0]}}
        );
      })
    );

    const context = createMockContext();
    const response = await handlePrerenderCluster(context, validSlug1);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('Further details about the most significant event in this cluster are currently unavailable.');
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Essential place or mag missing for strongest quake ${eventId1}`);
  });

  it('9. Error Parsing earthquakeIds from D1 (should not cause 500 if not critical)', async () => {
    const d1ResponseData = {
      slug: validSlug1,
      strongestQuakeId: eventId1,
      earthquakeIds: "this is not valid json", // Invalid JSON
      title: 'Test Title Invalid QuakeIDs',
      description: 'Test Description Invalid QuakeIDs',
      locationName: 'Location Invalid QuakeIDs',
      maxMagnitude: 5.2,
      startTime: baseTime,
      endTime: baseTime + 1000,
    };
    mockD1First.mockResolvedValueOnce(d1ResponseData);
    // Mock USGS call as it will still be attempted
    server.use(
      http.get(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${eventId1}.geojson`, () => {
        return HttpResponse.json({ properties: { mag: 5.2, place: 'Test Place', title: 'M 5.2 Test Place', url: 'http://example.com' }, id: eventId1, geometry: {type: 'Point', coordinates: [0,0]}});
      })
    );


    const context = createMockContext();
    const response = await handlePrerenderCluster(context, validSlug1);

    // The page should still render, error is logged but not fatal for prerender if earthquakeIds is only for optional features
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Test Title Invalid QuakeIDs');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `[prerender-cluster] Error parsing earthquakeIds for slug ${validSlug1}: Unexpected token 'h', "this is not"... is not valid JSON`
    );
  });
});
