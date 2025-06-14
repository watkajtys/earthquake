import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleQuakeDetailPrerender } from './quake-detail.js';
// escapeXml is imported by quake-detail.js, assuming it's available and simple.
// If it caused issues, it would be mocked like:
// vi.mock('../../utils/xml-utils.js', () => ({ escapeXml: (str) => str.replace(/&/g, '&amp;') }));

// Mock global fetch
global.fetch = vi.fn();

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
    fetch.mockReset();
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
      fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockData)));
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
      expect(html).toContain(`<a href="${mockData.properties.url}">More details on USGS</a>`);
    });

    it('should render correctly and generate title when properties.title is missing', async () => {
      const eventId = 'usTest2';
      const mockData = JSON.parse(JSON.stringify(baseMockGeoJson));
      delete mockData.properties.title;
      mockData.id = eventId;

      fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockData)));
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
      fetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
      const context = createMockContext();
      const response = await handleQuakeDetailPrerender(context, eventId);

      expect(response.status).toBe(404);
      expect(response.headers.get('Content-Type')).toBe('text/plain;charset=UTF-8');
      expect(await response.text()).toBe('Earthquake data not found');
      expect(consoleErrorSpy).toHaveBeenCalledWith(`USGS fetch failed for quake prerender ${eventId}: 404 `); // Adjusted
    });

    it('should return 500 if USGS fetch returns 500 server error', async () => {
      const eventId = 'usTest500';
      fetch.mockResolvedValueOnce(new Response('Server Error', { status: 500 }));
      const context = createMockContext();
      const response = await handleQuakeDetailPrerender(context, eventId);

      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).toBe('text/plain;charset=UTF-8');
      expect(await response.text()).toBe('Error prerendering earthquake page: USGS upstream error 500');
      expect(consoleErrorSpy).toHaveBeenCalledWith(`USGS fetch failed for quake prerender ${eventId}: 500 `);
    });

    it('should return 500 if USGS fetch has network error', async () => {
      const eventId = 'usTestNetFail';
      const networkError = new Error('Network Failure');
      fetch.mockRejectedValueOnce(networkError);
      const context = createMockContext();
      const response = await handleQuakeDetailPrerender(context, eventId);

      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).toBe('text/plain;charset=UTF-8');
      expect(await response.text()).toBe('Error prerendering earthquake page');
      expect(consoleErrorSpy).toHaveBeenCalledWith(`Generic error in handleQuakeDetailPrerender for eventId "${eventId}":`, networkError); // Adjusted
    });
  });

  it('should return 500 if USGS response is 200 OK but not JSON', async () => {
    const eventId = 'usTestHtml';
    fetch.mockResolvedValueOnce(new Response('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
    const context = createMockContext();
    const response = await handleQuakeDetailPrerender(context, eventId);

    expect(response.status).toBe(500);
    expect(response.headers.get('Content-Type')).toBe('text/plain;charset=UTF-8');
    expect(await response.text()).toBe('Error prerendering earthquake page');
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Failed to parse JSON for quake prerender ${eventId}: Unexpected token < in JSON at position 0`); // Adjusted
  });

  describe('Invalid/Incomplete Data from USGS', () => {
    it('should return 500 if properties is null', async () => {
      const eventId = 'usTestNoProps';
      const mockData = { ...baseMockGeoJson, properties: null };
      fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockData)));
      const context = createMockContext();
      const response = await handleQuakeDetailPrerender(context, eventId);

      expect(response.status).toBe(500);
      expect(await response.text()).toBe('Invalid earthquake data');
      expect(consoleErrorSpy).toHaveBeenCalledWith(`Invalid earthquake data structure for prerender ${eventId} (missing top-level keys):`, mockData); // Adjusted
    });

    it('should return 500 if geometry is null', async () => {
      const eventId = 'usTestNoGeom';
      const mockData = { ...baseMockGeoJson, geometry: null };
      fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockData)));
      const context = createMockContext();
      const response = await handleQuakeDetailPrerender(context, eventId);

      expect(response.status).toBe(500);
      expect(await response.text()).toBe('Invalid earthquake data');
      expect(consoleErrorSpy).toHaveBeenCalledWith(`Invalid earthquake data structure for prerender ${eventId} (missing top-level keys):`, mockData); // Adjusted
    });

    const essentialFields = ['mag', 'time', 'place', 'url', 'detail'];
    essentialFields.forEach(field => {
      it(`should return 500 if properties.${field} is missing`, async () => {
        const eventId = `usTestMissing_${field}`;
        const mockData = JSON.parse(JSON.stringify(baseMockGeoJson));
        delete mockData.properties[field];
        if (field === 'detail') delete mockData.properties.url;
        if (field === 'url') delete mockData.properties.detail;


        fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockData)));
        const context = createMockContext();
        const response = await handleQuakeDetailPrerender(context, eventId);

        expect(response.status).toBe(500);
        expect(await response.text()).toBe('Invalid earthquake data (missing fields).');
        expect(consoleErrorSpy).toHaveBeenCalledWith(`Incomplete earthquake data fields for prerender ${eventId}:`, mockData.properties, mockData.geometry); // Adjusted
      });
    });

    it('should succeed if properties.detail is missing but properties.url is present', async () => {
      const eventId = 'usTestMissingDetailHasUrl';
      const mockData = JSON.parse(JSON.stringify(baseMockGeoJson));
      delete mockData.properties.detail;
      mockData.properties.url = "https://some.usgs.gov/event/page";
      mockData.id = eventId;
      fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockData)));
      const context = createMockContext();
      const response = await handleQuakeDetailPrerender(context, eventId);
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain(`<a href="${mockData.properties.url}">More details on USGS</a>`);
    });

    it('should succeed if properties.url is missing but properties.detail is present', async () => {
      const eventId = 'usTestMissingUrlHasDetail';
      const mockData = JSON.parse(JSON.stringify(baseMockGeoJson));
      delete mockData.properties.url;
      // Use raw ampersand here, as it will be escaped by the HTML generation
      mockData.properties.detail = `https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=${eventId}&format=geojson`;
      mockData.id = eventId;
      fetch.mockResolvedValueOnce(new Response(JSON.stringify(mockData)));
      const context = createMockContext();
      const response = await handleQuakeDetailPrerender(context, eventId);
      expect(response.status).toBe(200);
      const html = await response.text();
      const expectedHref = mockData.properties.detail.replace(/&/g, '&amp;');
      expect(html).toContain(`<a href="${expectedHref}">More details on USGS</a>`);
    });

  });
});
