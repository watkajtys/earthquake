import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleQuakeDetailPrerender } from './quake-detail.js';
import { server } from '../../../src/mocks/server.js'; // MSW server
import { http, HttpResponse } from 'msw';       // MSW http utilities
// escapeXml is imported by quake-detail.js, assuming it's available and simple.
// If it caused issues, it would be mocked like:
// vi.mock('../../utils/xml-utils.js', () => ({ escapeXml: (str) => str.replace(/&/g, '&amp;') }));

const createMockContext = (requestProps = {}, envProps = {}) => {
  return {
    request: { url: 'http://localhost/quake/testEventId', ...requestProps }, // URL isn't directly used by handler
    env: { ...envProps },
    // waitUntil is not used by this handler
  };
};

describe('handleQuakeDetailPrerender', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    // MSW will handle fetch lifecycle, server.resetHandlers() is in setupTests.js or called by vi.clearAllMocks()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  const baseMockGeoJson = {
    id: 'us7000kufc',
    properties: {
      mag: 5.8,
      place: '22 km ESE of Párga, Greece',
      time: 1672531200000, // Example: Jan 1, 2023 00:00:00 GMT
      updated: 1672531500000,
      tz: null,
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000kufc',
      detail: 'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=us7000kufc&format=geojson',
      felt: null,
      cdi: null,
      mmi: null,
      alert: 'green',
      status: 'reviewed',
      tsunami: 0,
      sig: 518,
      net: 'us',
      code: '7000kufc',
      ids: ',us7000kufc,',
      sources: ',us,',
      types: ',origin,phase-data,',
      nst: null,
      dmin: 0.719,
      rms: 0.78,
      gap: 60,
      magType: 'mww',
      type: 'earthquake',
      // title will be tested with and without
    },
    geometry: {
      type: 'Point',
      coordinates: [20.6428, 39.2009, 10],
    },
  };

  describe('Successful Render', () => {
    it('should render correctly when properties.title is provided', async () => {
      const eventId = 'usTest1';
      const mockData = {
        ...baseMockGeoJson,
        id: eventId,
        properties: {
          ...baseMockGeoJson.properties,
          title: 'M 5.8 - Párga, Greece Region', // Pre-existing title
        },
      };
      const context = createMockContext();

      const response = await handleQuakeDetailPrerender(context, eventId);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/html');
      expect(html).toContain('<title>M 5.8 - Párga, Greece Region</title>');
      const descriptionContent = `Details for earthquake usTest1: M 5.8 - Párga, Greece Region. Magnitude 5.8, Occurred on Sun, 01 Jan 2023 00:00:00 GMT. Coordinates: 39.2009, 20.6428. Depth: 10 km.`;
      expect(html).toContain(`<meta name="description" content="${descriptionContent}">`);
      expect(html).toContain(`<link rel="canonical" href="https://earthquakeslive.com/quake/${eventId}">`);
      expect(html).toContain('<h1>M 5.8 - Párga, Greece Region</h1>');
      // Check for parts of the detailed paragraph instead of exact substring matches for each item
      expect(html).toContain("Details for earthquake usTest1");
      expect(html).toContain("Magnitude 5.8");
      expect(html).toContain("Occurred on Sun, 01 Jan 2023 00:00:00 GMT");
      expect(html).toContain(`<a href="https://earthquake.usgs.gov/earthquakes/eventpage/${eventId}">More details on USGS</a>`);
    });

    it('should render correctly and generate title when properties.title is missing', async () => {
      const eventId = 'usTest2';
      const mockData = JSON.parse(JSON.stringify(baseMockGeoJson));
      delete mockData.properties.title;
      mockData.id = eventId;

      const context = createMockContext();

      const response = await handleQuakeDetailPrerender(context, eventId);
      const html = await response.text();

      const expectedGeneratedTitle = `M ${mockData.properties.mag} Earthquake - ${mockData.properties.place}`;

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/html');
      expect(html).toContain(`<title>${expectedGeneratedTitle}</title>`);
      const descriptionContent = `Details for earthquake usTest2: ${expectedGeneratedTitle}. Magnitude ${mockData.properties.mag}, Occurred on Sun, 01 Jan 2023 00:00:00 GMT. Coordinates: 39.2009, 20.6428. Depth: 10 km.`;
      expect(html).toContain(`<meta name="description" content="${descriptionContent}">`);
      expect(html).toContain(`<h1>${expectedGeneratedTitle}</h1>`);
    });
  });

  describe('USGS Fetch Failures', () => {
    it('should return 404 if USGS fetch returns 404', async () => {
      const eventId = 'usTest404';
      server.use(
        http.get('https://earthquake.usgs.gov/fdsnws/event/1/query', ({ request }) => {
          if (new URL(request.url).searchParams.get('eventid') === eventId) {
            return new HttpResponse('Not Found', { status: 404 });
          }
        })
      );
      const context = createMockContext();
      const response = await handleQuakeDetailPrerender(context, eventId);

      expect(response.status).toBe(404);
      expect(response.headers.get('Content-Type')).toBe('text/plain;charset=UTF-8');
      expect(await response.text()).toBe('Earthquake data not found');
      expect(consoleErrorSpy).toHaveBeenCalledWith(`USGS fetch failed for quake prerender ${eventId}: 404 Not Found`);
    });

    it('should return 500 if USGS fetch returns 500 server error', async () => {
      const eventId = 'usTest500';
      server.use(
        http.get('https://earthquake.usgs.gov/fdsnws/event/1/query', ({ request }) => {
          if (new URL(request.url).searchParams.get('eventid') === eventId) {
            return new HttpResponse('Server Error', { status: 500 });
          }
        })
      );
      const context = createMockContext();
      const response = await handleQuakeDetailPrerender(context, eventId);

      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).toBe('text/plain;charset=UTF-8');
      expect(await response.text()).toBe('Error prerendering earthquake page: USGS upstream error 500');
      expect(consoleErrorSpy).toHaveBeenCalledWith(`USGS fetch failed for quake prerender ${eventId}: 500 Internal Server Error`);
    });

    it('should return 500 if USGS fetch has network error', async () => {
      const eventId = 'usTestNetFail';
      server.use(
        http.get('https://earthquake.usgs.gov/fdsnws/event/1/query', ({ request }) => {
          if (new URL(request.url).searchParams.get('eventid') === eventId) {
            return HttpResponse.error();
          }
        })
      );
      const context = createMockContext();
      const response = await handleQuakeDetailPrerender(context, eventId);

      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).toBe('text/plain;charset=UTF-8');
      expect(await response.text()).toBe('Error prerendering earthquake page');
      expect(consoleErrorSpy).toHaveBeenCalledWith(`Generic error in handleQuakeDetailPrerender for eventId "${eventId}":`, expect.objectContaining({ message: 'Failed to fetch' }));
    });
  });

  it('should return 500 if USGS response is 200 OK but not JSON', async () => {
    const eventId = 'usTestHtml';
    server.use(
      http.get('https://earthquake.usgs.gov/fdsnws/event/1/query', ({ request }) => {
        if (new URL(request.url).searchParams.get('eventid') === eventId) {
          return new HttpResponse('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
        }
      })
    );
    const context = createMockContext();
    const response = await handleQuakeDetailPrerender(context, eventId);

    expect(response.status).toBe(500);
    expect(response.headers.get('Content-Type')).toBe('text/plain;charset=UTF-8');
    expect(await response.text()).toBe('Error prerendering earthquake page');
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Failed to parse JSON for quake prerender ${eventId}: Unexpected token '<', "<html></html>" is not valid JSON`);
  });

  describe('Invalid/Incomplete Data from USGS', () => {
    it('should return 500 if properties is null', async () => {
      const eventId = 'usTestNoProps';
      server.use(
        http.get('https://earthquake.usgs.gov/fdsnws/event/1/query', ({ request }) => {
          if (new URL(request.url).searchParams.get('eventid') === eventId) {
            return HttpResponse.json({ ...baseMockGeoJson, id: eventId, properties: null });
          }
        })
      );
      const context = createMockContext();
      const response = await handleQuakeDetailPrerender(context, eventId);

      expect(response.status).toBe(500);
      expect(await response.text()).toBe('Invalid earthquake data');
      expect(consoleErrorSpy).toHaveBeenCalledWith(`Invalid earthquake data structure for prerender ${eventId} (missing top-level keys):`, { ...baseMockGeoJson, id: eventId, properties: null });
    });

    it('should return 500 if geometry is null', async () => {
      const eventId = 'usTestNoGeom';
      server.use(
        http.get('https://earthquake.usgs.gov/fdsnws/event/1/query', ({ request }) => {
          if (new URL(request.url).searchParams.get('eventid') === eventId) {
            return HttpResponse.json({ ...baseMockGeoJson, id: eventId, geometry: null });
          }
        })
      );
      const context = createMockContext();
      const response = await handleQuakeDetailPrerender(context, eventId);

      expect(response.status).toBe(500);
      expect(await response.text()).toBe('Invalid earthquake data');
      expect(consoleErrorSpy).toHaveBeenCalledWith(`Invalid earthquake data structure for prerender ${eventId} (missing top-level keys):`, { ...baseMockGeoJson, id: eventId, geometry: null });
    });

    const essentialFields = ['mag', 'time', 'place', 'url', 'detail'];
    essentialFields.forEach(field => {
      it(`should return 500 if properties.${field} is missing`, async () => {
        const currentEventId = `usTestMissing_${field}`;
        const tempData = JSON.parse(JSON.stringify(baseMockGeoJson));
        delete tempData.properties[field];
        if (field === 'detail') delete tempData.properties.url; // Match test logic for this specific case
        if (field === 'url') delete tempData.properties.detail; // Match test logic for this specific case
        tempData.id = currentEventId;

        server.use(
          http.get('https://earthquake.usgs.gov/fdsnws/event/1/query', ({ request }) => {
            if (new URL(request.url).searchParams.get('eventid') === currentEventId) {
              return HttpResponse.json(tempData);
            }
          })
        );
        const context = createMockContext();
        const response = await handleQuakeDetailPrerender(context, currentEventId);

        expect(response.status).toBe(500);
        expect(await response.text()).toBe('Invalid earthquake data (missing fields).');
        expect(consoleErrorSpy).toHaveBeenCalledWith(`Incomplete earthquake data fields for prerender ${currentEventId}:`, tempData.properties, tempData.geometry);
      });
    });

    it('should succeed if properties.detail is missing but properties.url is present', async () => {
      const eventId = 'usTestMissingDetailHasUrl';
      // This test relies on the default MSW handler for usTestMissingDetailHasUrl
      const context = createMockContext();
      const response = await handleQuakeDetailPrerender(context, eventId);
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain(`<a href="https://some.usgs.gov/event/page">More details on USGS</a>`);
    });

    it('should succeed if properties.url is missing but properties.detail is present', async () => {
      const eventId = 'usTestMissingUrlHasDetail';
      // This test relies on the default MSW handler for usTestMissingUrlHasDetail
      const context = createMockContext();
      const response = await handleQuakeDetailPrerender(context, eventId);
      expect(response.status).toBe(200);
      const html = await response.text();
      const expectedHref = `https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=${eventId}&amp;format=geojson`;
      expect(html).toContain(`<a href="${expectedHref}">More details on USGS</a>`);
    });

  });
});
