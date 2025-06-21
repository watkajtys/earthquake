// src/mocks/handlers.js
import { http, HttpResponse } from 'msw';

const d1ApiBasePath = '/api/get-earthquakes';

export const handlers = [
  http.get(`${d1ApiBasePath}`, ({ request }) => {
    const url = new URL(request.url);
    const timeWindow = url.searchParams.get('timeWindow');
    const now = Date.now();
    console.log(`[MSW] Intercepted D1 API call for timeWindow: ${timeWindow}`);

    if (timeWindow === 'day') {
      return HttpResponse.json( // Return features array directly
        [{ id: 'msw-d1-day-generic', properties: { place: 'MSW D1 Day', mag: 1.0, time: now, code: 'msw_day1' }, geometry: {} }],
        { status: 200, headers: { 'X-Data-Source': 'D1' } }
      );
    }
    if (timeWindow === 'week') {
      return HttpResponse.json( // Return features array directly
        [{ id: 'msw-d1-week-generic', properties: { place: 'MSW D1 Week', mag: 1.1, time: now - (2 * 24 * 3600 * 1000), code: 'msw_wk1' }, geometry: {} }],
        { status: 200, headers: { 'X-Data-Source': 'D1' } }
      );
    }
    if (timeWindow === 'month') {
      return HttpResponse.json( // Return features array directly
        [{ id: 'msw-d1-month-generic', properties: { place: 'MSW D1 Month', mag: 1.2, time: now - (15 * 24 * 3600 * 1000), code: 'msw_mo1' }, geometry: {} }],
        { status: 200, headers: { 'X-Data-Source': 'D1' } }
      );
    }
    // Fallback for unhandled timeWindows or other GETs to this base path
    console.error(`[MSW] Unhandled D1 timeWindow in generic handler: ${timeWindow}`);
    return HttpResponse.json({ error: `Unhandled D1 timeWindow: ${timeWindow}` }, { status: 400 });
  }),

  // USGS API Handlers
  http.get('https://earthquake.usgs.gov/fdsnws/event/1/query', ({ request }) => {
    const url = new URL(request.url);
    const eventId = url.searchParams.get('eventid');
    const format = url.searchParams.get('format');

    // Specific handlers for sitemaps.clusters.test.js
    if (format === 'geojson') {
      if (eventId === 'cluster1') {
        console.log(`[MSW] Matched sitemaps.clusters.test.js: eventid=cluster1`);
        return HttpResponse.json({ properties: { place: "Test Place", mag: 5.0 } }, { status: 200 });
      }
      if (eventId === 'us7000mfp9') {
        console.log(`[MSW] Matched sitemaps.clusters.test.js: eventid=us7000mfp9`);
        // This will be overridden by server.use() in the specific test for failure cases
        return HttpResponse.json({ properties: { place: "Southern Sumatra, Indonesia", mag: 5.8 } }, { status: 200 });
      }
      if (eventId === 'ci12345') {
        console.log(`[MSW] Matched sitemaps.clusters.test.js: eventid=ci12345`);
        return HttpResponse.json({ properties: { place: "California", mag: 4.2 } }, { status: 200 });
      }
      if (eventId === 'usMissingPlace') {
        console.log(`[MSW] Matched sitemaps.clusters.test.js: eventid=usMissingPlace`);
        return HttpResponse.json({ properties: { mag: 5.0 } }, { status: 200 });
      }
      if (eventId === 'usMissingMag') {
        console.log(`[MSW] Matched sitemaps.clusters.test.js: eventid=usMissingMag`);
        return HttpResponse.json({ properties: { place: "Some Place" } }, { status: 200 });
      }
      if (eventId === 'validEntry1') {
        console.log(`[MSW] Matched sitemaps.clusters.test.js: eventid=validEntry1`);
        return HttpResponse.json({ properties: { place: "Valid Place", mag: 5.0 } }, { status: 200 });
      }
      if (eventId === 'validEntry2') {
        console.log(`[MSW] Matched sitemaps.clusters.test.js: eventid=validEntry2`);
        return HttpResponse.json({ properties: { place: "Another Valid Place", mag: 4.0 } }, { status: 200 });
      }
      if (eventId === 'usgs_fetch_error_test') { // Specific for a test that needs a general USGS error for an ID
        console.log(`[MSW] Matched sitemaps.clusters.test.js: eventid=usgs_fetch_error_test`);
        return new HttpResponse("USGS Error", { status: 500 });
      }
    }

    // Existing handlers for other tests (make sure they don't conflict or are more specific)
    // Handlers for prerender-quake.integration.test.js
    if (eventId === 'usgs_event_abc123') {
      return HttpResponse.json(
        {
          properties: {
            mag: 5,
            place: "Test Place",
            time: Date.now(),
            detail: "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=usgs_event_abc123",
            title: "M 5.0 - Test Place"
          },
          geometry: { coordinates: [0,0,10] },
          id: "usgs_event_abc123"
        },
        { status: 200 }
      );
    }
    if (eventId === 'q_error') {
      return HttpResponse.error(); // Simulates network error
    }
    if (eventId === 'q_non_json') {
      return new HttpResponse("Not JSON", { status: 200 });
    }
    if (eventId === 'q_invalid_struct') {
      return HttpResponse.json({ properties: null }, { status: 200 });
    }
    if (eventId === 'q_404') {
      return new HttpResponse("Not Found", { status: 404 });
    }

    // Handler for usgs_event_jsonld_test (from prerender-quake.integration.test.js)
    if (eventId === 'usgs_event_jsonld_test') {
      const eventTime = new Date(Date.UTC(2025, 5, 20, 17, 49, 14)).getTime();
      return HttpResponse.json(
        {
          properties: {
            mag: 5.1,
            place: "36 km SW of Semnan, Iran",
            time: eventTime,
            detail: `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=usgs_event_jsonld_test`,
            title: `M 5.1 - 36 km SW of Semnan, Iran`,
            url: `https://earthquake.usgs.gov/earthquakes/eventpage/usgs_event_jsonld_test`
          },
          geometry: { coordinates: [53.0699, 35.3758, 10] },
          id: "usgs_event_jsonld_test"
        },
        { status: 200 }
      );
    }

    // Handlers for quake-detail.test.js
    const baseMockProperties = {
      mag: 5.8, place: '22 km ESE of Párga, Greece', time: 1672531200000, updated: 1672531500000, tz: null, // Adjusted time and place
      felt: null, cdi: null, mmi: 7.4, alert: 'green', status: 'reviewed', tsunami: 0, sig: 500,
      net: 'us', code: 'TestBase', ids: ',usTestBase,', sources: ',us,', types: ',origin,phase-data,',
      nst: null, dmin: 0.223, rms: 0.78, gap: 60, magType: 'mww', type: 'earthquake'
      // title, url, detail are often event-specific
    };
    const baseMockGeometry = { type: 'Point', coordinates: [20.6428, 39.2009, 10] }; // Adjusted latitude

    if (eventId === 'usTest1') { // Default success with title
      return HttpResponse.json({
        id: 'usTest1',
        properties: { ...baseMockProperties, title: 'M 5.8 - Párga, Greece Region', url: `https://earthquake.usgs.gov/earthquakes/eventpage/usTest1`, detail: `https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=usTest1&format=geojson` },
        geometry: baseMockGeometry
      }, { status: 200 });
    }
    if (eventId === 'usTest2') { // Default success, title missing
      const props = { ...baseMockProperties, url: `https://earthquake.usgs.gov/earthquakes/eventpage/usTest2`, detail: `https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=usTest2&format=geojson` };
      delete props.title; // Ensure title is not present
      return HttpResponse.json({
        id: 'usTest2',
        properties: props,
        geometry: baseMockGeometry
      }, { status: 200 });
    }
    if (eventId === 'usTestMissingDetailHasUrl') {
      const props = { ...baseMockProperties, title: 'M 5.8 - Missing Detail Test', url: 'https://some.usgs.gov/event/page' };
      // detail is intentionally undefined
      return HttpResponse.json({
        id: 'usTestMissingDetailHasUrl',
        properties: props,
        geometry: baseMockGeometry
      }, { status: 200 });
    }
    if (eventId === 'usTestMissingUrlHasDetail') {
      const props = { ...baseMockProperties, title: 'M 5.8 - Missing URL Test', detail: `https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=usTestMissingUrlHasDetail&format=geojson` };
      // url is intentionally undefined
      return HttpResponse.json({
        id: 'usTestMissingUrlHasDetail',
        properties: props,
        geometry: baseMockGeometry
      }, { status: 200 });
    }

    // Fallback for unhandled eventids
    console.warn(`[MSW] Unhandled USGS eventId: ${eventId} in earthquake.usgs.gov fdsnws/event/1/query handler`);
    return new HttpResponse(`Unhandled eventId: ${eventId}`, { status: 404 });
  }),

  // Handlers for usgs-proxy.test.js
  http.get('https://default.example.com/api', () => {
    return HttpResponse.json({ data: 'default mock response' }, { status: 200 });
  }),
  http.get('https://external.api/data_with_features', () => {
    return HttpResponse.json({ features: [{id: 'feat1', properties: {}, geometry: {}}], message: 'Success!' }, { status: 200 });
  }),
  http.get('https://external.api/cached_data', () => {
    return HttpResponse.json({ message: 'cached data' }, { status: 200 });
  }),
  http.get('https://external.api/cache_test_dynamic', () => {
    return HttpResponse.json({ data: 'some data' }, { status: 200 });
  }),
  http.get('https://external.api/upstream_error', () => {
    return HttpResponse.json({ error: "Upstream Server Error" }, { status: 500 });
  }),
  http.get('https://external.api/network_failure', () => {
    return HttpResponse.error(); // Simulates network error
  }),
  http.get('https://external.api/d1_interaction', () => {
    // Default handler for d1_interaction. Specific tests will override this using server.use().
    return HttpResponse.json({ features: [{ id: 'default_d1_feat', type: 'Feature' }] }, { status: 200 });
  }),
  http.get('https://external.api/cache_put_fail', () => {
    return HttpResponse.json({ data: "important data" }, { status: 200 });
  }),
  http.get('https://external.api/html_response', () => {
    return new HttpResponse("<html><body>Not JSON</body></html>", {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }),

  // Handlers for usgs-proxy.integration.test.js (example.com URLs)
  http.get('http://example.com/earthquakes', () => {
    return HttpResponse.json({ data: 'live earthquake data' }, { status: 200 });
  }),
  http.get('http://example.com/earthquakes_multiple_features', () => {
    return HttpResponse.json(
      {
        features: [
          { id: 'feat1', properties: {}, geometry: { coordinates: [1,2,3] }},
          { id: 'feat2', properties: {}, geometry: { coordinates: [4,5,6] }}
        ]
      },
      { status: 200 }
    );
  }),
  http.get('http://example.com/earthquakes_cached', () => {
    return HttpResponse.json({ data: 'cached earthquake data' }, { status: 200 });
  }),
  http.get('http://example.com/earthquakes_fetch_error', () => {
    return HttpResponse.error(); // Test will check if "Failed to fetch" is handled
  }),
  http.get('http://example.com/earthquakes_html_error', () => {
    return new HttpResponse("<html><body>Error from USGS</body></html>", {
      status: 503,
      headers: { 'Content-Type': 'text/html' },
    });
  }),
  http.get('http://example.com/earthquakes_invalid_ttl', () => {
    return HttpResponse.json({ data: 'ok' }, { status: 200 });
  }),
  http.get('http://example.com/earthquakes_cache_put_fail', () => {
    return HttpResponse.json({ data: 'ok' }, { status: 200 });
  }),

  // Handlers for prerender-cluster.integration.test.js (USGS GeoJSON detail feeds)
  http.get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/us7000mfp9.geojson', () => {
    return HttpResponse.json(
      {
        properties: { mag: 5.8, place: 'Southern Sumatra, Indonesia', time: Date.now(), url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000mfp9' },
        geometry: { coordinates: [100, -4, 10] },
        id: 'us7000mfp9'
      },
      { status: 200 }
    );
  }),
  http.get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/usTestId123.geojson', () => {
    return HttpResponse.json(
      {
        properties: { mag: 5.5, place: 'Test Region, Test Location', time: Date.now(), url: 'https://earthquake.usgs.gov/earthquakes/eventpage/usTestId123' },
        geometry: { coordinates: [10, 20, 30] },
        id: 'usTestId123'
      },
      { status: 200 }
    );
  }),
  http.get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/ci12345.geojson', () => {
    return HttpResponse.json(
      {
        properties: { mag: 4.2, place: 'California', time: Date.now(), url: 'https://earthquake.usgs.gov/earthquakes/eventpage/ci12345' },
        geometry: { coordinates: [-120, 35, 5] },
        id: 'ci12345'
      },
      { status: 200 }
    );
  }),
  http.get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/fetcherr1.geojson', () => {
    return HttpResponse.error(); // Simulates network error
  }),
  http.get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/us123.geojson', () => {
    return HttpResponse.json(
      {
        properties: { mag: 5.0, place: 'USGS Detailed Place', title: 'M 5.0 - USGS Detailed Place', url: 'http://usgs.gov/event/us123' },
        id: 'us123',
        geometry: { type: 'Point', coordinates: [0,0]}
      },
      { status: 200 }
    );
  }),
  http.get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/us456.geojson', () => {
    return HttpResponse.json(
      {
        properties: { mag: 4.5, place: 'USGS Fallback Region Details', title: 'M 4.5 - USGS Fallback Region Details', url: 'http://usgs.gov/event/us456' },
        id: 'us456',
        geometry: { type: 'Point', coordinates: [0,0]}
      },
      { status: 200 }
    );
  }),

  // Default handlers for sitemaps.earthquakes.test.js
  http.get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson', () => {
    return HttpResponse.json(
      {
        features: [
          {
            properties: { mag: 3.0, place: "Default MSW Test Place", time: Date.now(), updated: Date.now(), detail: "default_msw_event_detail_url_1" },
            id: "msw_ev1"
          }
        ]
      },
      { status: 200 }
    );
  }),
  http.get('https://example.com/custom/feed.geojson', () => {
    return HttpResponse.json(
      {
        features: [
          {
            properties: { mag: 2.0, place: "Custom MSW Feed Place", time: Date.now(), updated: Date.now(), detail: "custom_msw_event_detail_url_1" },
            id: "msw_custom_ev1"
          }
        ]
      },
      { status: 200 }
    );
  }),

  // Default handlers for clusterApiService.js (used in ClusterDetailModalWrapper.test.jsx)
  http.get('/api/cluster-definition', ({ request }) => {
    // const url = new URL(request.url);
    // const clusterId = url.searchParams.get('id');
    // console.log(`[MSW] GET /api/cluster-definition called for id: ${clusterId} (defaulting to 404)`);
    return new HttpResponse(null, { status: 404 }); // Default to not found
  }),
  http.post('/api/calculate-clusters', async ({ request }) => {
    // const body = await request.json();
    // console.log('[MSW] POST /api/calculate-clusters called with body:', body);
    return HttpResponse.json({ clusters: [], cacheHit: 'false' }, { // Default to empty clusters object, cache miss
      status: 200
      // headers: { 'X-Cache-Hit': 'false' } // cacheHit is in the body now
    });
  }),

  // New handler for POST /api/cluster-definition (comprehensive schema)
  http.post('/api/cluster-definition', async ({ request }) => {
    const requestBody = await request.json();
    // Basic check for a few mandatory fields
    if (
      requestBody &&
      requestBody.id &&
      requestBody.slug &&
      Array.isArray(requestBody.earthquakeIds) && // Check if it's an array
      requestBody.strongestQuakeId &&
      typeof requestBody.maxMagnitude === 'number' &&
      typeof requestBody.startTime === 'number' &&
      typeof requestBody.endTime === 'number' &&
      typeof requestBody.quakeCount === 'number'
    ) {
      console.log('[MSW] POST /api/cluster-definition - Valid request for ID:', requestBody.id);
      return HttpResponse.json({ message: `Cluster ${requestBody.id} definition processed.` }, { status: 201 });
    } else {
      console.log('[MSW] POST /api/cluster-definition - Invalid/incomplete request body:', requestBody);
      return HttpResponse.json({ error: 'Missing or invalid required fields for cluster definition.' }, { status: 400 });
    }
  }),

  // New handler for GET /api/cluster-detail-with-quakes
  http.get('/api/cluster-detail-with-quakes', ({ request }) => {
    const url = new URL(request.url);
    const clusterId = url.searchParams.get('id');
    console.log(`[MSW] GET /api/cluster-detail-with-quakes for id: ${clusterId}`);

    const mockDetailedCluster1Data = {
      id: 'test-cluster-id-1',
      slug: '3-quakes-near-test-valley-m5.2-testc1',
      title: 'Test Cluster 1 Title - 3 Quakes in Test Valley',
      description: 'A significant test cluster of 3 earthquakes occurred in Test Valley.',
      strongestQuakeId: 'mock-quake-1a',
      earthquakeIds: ['mock-quake-1a', 'mock-quake-1b', 'mock-quake-1c'], // Array of strings
      locationName: 'Test Valley, NV',
      maxMagnitude: 5.2,
      meanMagnitude: 4.8,
      minMagnitude: 4.5,
      depthRange: "5.0-10.0km",
      centroidLat: 36.0,
      centroidLon: -118.0,
      radiusKm: 15.0,
      startTime: Date.now() - (2 * 3600000), // 2 hours ago
      endTime: Date.now() - 300000, // 5 minutes ago
      durationHours: 1.91, // approx
      quakeCount: 3,
      significanceScore: 2.5,
      version: 1,
      createdAt: new Date(Date.now() - (3 * 3600000)).toISOString(), // 3 hours ago
      updatedAt: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
      quakes: [ // Full GeoJSON objects
        {
          type: 'Feature',
          properties: { mag: 5.2, place: '10km N of Test Valley, NV', time: Date.now() - 300000, code: 'mock_quake_1a', updated: Date.now() - 200000, url: 'http://example.com/quake/1a', detail: 'http://example.com/quake/1a.geojson', felt: 10, cdi: 4.0, mmi: 5.1, alert: 'green', status: 'reviewed', tsunami: 0, sig: 400, net: 'testnet', sources: ',test,', types: ',origin,phase-data,', nst: 50, dmin: 0.1, rms: 0.5, gap: 90, magType: 'ml', title: 'M 5.2 - 10km N of Test Valley, NV' },
          geometry: { type: 'Point', coordinates: [-118.0, 36.1, 8.0] },
          id: 'mock-quake-1a'
        },
        {
          type: 'Feature',
          properties: { mag: 4.5, place: '12km NW of Test Valley, NV', time: Date.now() - 3600000, code: 'mock_quake_1b', updated: Date.now() - 3500000, url: 'http://example.com/quake/1b', detail: 'http://example.com/quake/1b.geojson', felt: 2, cdi: 2.0, mmi: 3.0, alert: null, status: 'reviewed', tsunami: 0, sig: 300, net: 'testnet', sources: ',test,', types: ',origin,phase-data,', nst: 40, dmin: 0.15, rms: 0.6, gap: 100, magType: 'ml', title: 'M 4.5 - 12km NW of Test Valley, NV' },
          geometry: { type: 'Point', coordinates: [-118.1, 36.05, 5.0] },
          id: 'mock-quake-1b'
        },
        {
          type: 'Feature',
          properties: { mag: 4.7, place: '8km S of Test Valley, NV', time: Date.now() - (2 * 3600000), code: 'mock_quake_1c', updated: Date.now() - (2*3600000 - 100000) , url: 'http://example.com/quake/1c', detail: 'http://example.com/quake/1c.geojson', felt: 5, cdi: 3.0, mmi: 4.0, alert: 'yellow', status: 'reviewed', tsunami: 0, sig: 350, net: 'testnet', sources: ',test,', types: ',origin,phase-data,', nst: 45, dmin: 0.05, rms: 0.4, gap: 80, magType: 'ml', title: 'M 4.7 - 8km S of Test Valley, NV' },
          geometry: { type: 'Point', coordinates: [-117.95, 35.9, 10.0] },
          id: 'mock-quake-1c'
        }
      ]
    };

    if (clusterId === 'test-cluster-id-1') {
      return HttpResponse.json(mockDetailedCluster1Data, { status: 200 });
    }
    if (clusterId === 'not-found-cluster-id') {
      return HttpResponse.json({ error: 'Cluster not found' }, { status: 404 });
    }
    // Default fallback if specific test IDs aren't matched in this handler
    return HttpResponse.json({ error: `Mock for cluster ID ${clusterId} not specifically handled in /api/cluster-detail-with-quakes.` }, { status: 404 });
  }),
];
