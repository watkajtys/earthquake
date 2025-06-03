import { fetchDataCb } from './fetchUtils';

import { vi } from 'vitest';

describe('fetchDataCb', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // TODO: Add tests here
  it('should fetch and sanitize earthquake data correctly', async () => {
    const mockData = {
      features: [
        {
          type: 'Feature',
          properties: {
            mag: 5.5,
            place: 'Test Place 1',
            time: 1678886400000,
            updated: 1678886400000,
            tz: null,
            url: 'test_url_1',
            detail: 'test_detail_1',
            felt: null,
            cdi: null,
            mmi: null,
            alert: null,
            status: 'reviewed',
            tsunami: 0,
            sig: 400,
            net: 'us',
            code: '1234',
            ids: ',us1234,',
            sources: ',us,',
            types: ',origin,phase-data,',
            nst: null,
            dmin: null,
            rms: null,
            gap: null,
            magType: 'ml',
            type: 'earthquake', // Relevant type
            title: 'M 5.5 - Test Place 1',
          },
          geometry: {
            type: 'Point',
            coordinates: [-122.23, 37.87, 2.5],
          },
          id: 'us1234',
        },
        {
          type: 'Feature',
          properties: {
            mag: 'not a number', // Invalid mag
            place: 'Test Place 2',
            time: 1678886500000,
            updated: 1678886500000,
            type: 'explosion', // Irrelevant type
            title: 'Explosion - Test Place 2',
          },
          geometry: null, // Missing geometry
          id: 'us5678',
        },
        {
          type: 'Feature',
          properties: {
            mag: 4.0,
            place: 'Test Place 3',
            time: 1678886600000,
            updated: 1678886600000,
            type: 'earthquake', // Relevant type
            title: 'M 4.0 - Test Place 3',
            // Missing detail property
          },
          geometry: {
            type: 'Point',
            coordinates: [-122.25, 37.89, 5.0],
          },
          id: 'us9012',
        },
      ],
    };

    mockFetch.mockResolvedValue({
      ok: true,
      headers: {
        get: (header) => {
          if (header === 'content-type') {
            return 'application/json';
          }
          return null;
        },
      },
      json: async () => mockData,
    });

    const result = await fetchDataCb('test_url');

    expect(result.features).toHaveLength(2); // Only earthquake types

    // Check first earthquake
    expect(result.features[0].properties.mag).toBe(5.5);
    expect(result.features[0].properties.detail).toBe('test_detail_1');
    expect(result.features[0].geometry).toEqual({
      type: 'Point',
      coordinates: [-122.23, 37.87, 2.5],
    });

    // Check second earthquake (missing detail, should have default)
    expect(result.features[1].properties.mag).toBe(4.0);
    expect(result.features[1].properties.detail).toBe(mockData.features[2].properties.url); // Default detail
    expect(result.features[1].geometry).toEqual({
      type: 'Point',
      coordinates: [-122.25, 37.89, 5.0],
    });
    expect(result.metadata.error).toBeUndefined();
  });

  it('should handle HTTP errors', async () => {
    const errorStatus = 500;
    const errorStatusText = 'Server Error';
    const errorBodyText = 'Detailed error message from server';
    mockFetch.mockResolvedValue({
      ok: false,
      status: errorStatus,
      statusText: errorStatusText,
      headers: { get: () => 'text/plain' }, // Mock headers object
      text: async () => errorBodyText, // Mock text() method for error body
    });

    const result = await fetchDataCb('test_url_http_error');

    expect(result.features).toEqual([]);
    expect(result.metadata.error).toBe(true);
    expect(result.metadata.errorMessage).toBe(`HTTP error! status: ${errorStatus} ${errorStatusText}. ${errorBodyText}`);
  });

  it('should handle non-JSON responses', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: {
        get: (header) => {
          if (header === 'content-type') {
            return 'text/html'; // Not application/json
          }
          return null;
        },
      },
      json: async () => ({}), // Should not be called
    });

    const result = await fetchDataCb('test_url_non_json');

    expect(result.features).toEqual([]);
    expect(result.metadata.error).toBe(true);
    expect(result.metadata.errorMessage).toBe('Expected JSON but received text/html');
  });

  it('should handle fetch throwing an error (e.g. network error)', async () => {
    const networkErrorMessage = 'Network request failed';
    mockFetch.mockRejectedValue(new Error(networkErrorMessage));

    const result = await fetchDataCb('test_url_network_error');

    expect(result.features).toEqual([]);
    expect(result.metadata.error).toBe(true);
    expect(result.metadata.errorMessage).toBe(networkErrorMessage);
  });

  it('should handle empty features array from API', async () => {
    const mockData = {
      features: [],
    };

    mockFetch.mockResolvedValue({
      ok: true,
      headers: {
        get: (header) => {
          if (header === 'content-type') {
            return 'application/json';
          }
          return null;
        },
      },
      json: async () => mockData,
    });

    const result = await fetchDataCb('test_url_empty_features');

    expect(result.features).toEqual([]);
    expect(result.metadata.error).toBeUndefined();
  });

  it('should handle features with missing/invalid properties correctly', async () => {
    const mockData = {
      features: [
        { // Feature with missing properties.mag and properties.url (for detail)
          type: 'Feature',
          properties: {
            place: 'Test Place Missing Props',
            time: 1678886700000,
            updated: 1678886700000,
            type: 'earthquake',
            title: 'M ? - Test Place Missing Props',
          },
          geometry: {
            type: 'Point',
            coordinates: [-122.20, 37.80, 1.0],
          },
          id: 'usmissing',
        },
        { // Feature with null geometry
          type: 'Feature',
          properties: {
            mag: 3.0,
            place: 'Test Place Null Geom',
            time: 1678886800000,
            updated: 1678886800000,
            type: 'earthquake',
            title: 'M 3.0 - Test Place Null Geom',
            url: 'test_url_null_geom',
            detail: 'test_detail_null_geom',
          },
          geometry: null,
          id: 'usnullgeom',
        }
      ],
    };

    mockFetch.mockResolvedValue({
      ok: true,
      headers: {
        get: (header) => {
          if (header === 'content-type') {
            return 'application/json';
          }
          return null;
        },
      },
      json: async () => mockData,
    });

    const result = await fetchDataCb('test_url_missing_props');

    expect(result.features).toHaveLength(2);
    expect(result.metadata.error).toBeUndefined();

    // Check feature with missing mag and detail
    // Mag becomes null, detail becomes undefined (as url is also missing)
    expect(result.features[0].properties.mag).toBeNull();
    expect(result.features[0].properties.detail).toBeUndefined();
    expect(result.features[0].geometry).toEqual({
      type: 'Point',
      coordinates: [-122.20, 37.80, 1.0],
    });

    // Check feature with null geometry (should use default from implementation)
    expect(result.features[1].properties.mag).toBe(3.0);
    expect(result.features[1].properties.detail).toBe('test_detail_null_geom');
    expect(result.features[1].geometry).toEqual({ type: "Point", coordinates: [null, null, null] });
  });
});
