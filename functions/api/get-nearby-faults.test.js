import { onRequestGet } from './get-nearby-faults';

describe('get-nearby-faults', () => {
  it('should return 400 for missing parameters', async () => {
    const request = new Request('http://localhost/api/get-nearby-faults');
    const env = {};
    const context = { request, env };
    const response = await onRequestGet(context);
    expect(response.status).toBe(400);
  });

  it('should return nearby faults', async () => {
    const mockGeoJson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Fault A' },
          geometry: { type: 'LineString', coordinates: [[-122.0, 37.0], [-122.1, 37.1]] },
        },
        {
          type: 'Feature',
          properties: { name: 'Fault B' },
          geometry: { type: 'LineString', coordinates: [[-100.0, 40.0], [-100.1, 40.1]] },
        },
      ],
    };

    const request = new Request('http://localhost/api/get-nearby-faults?latitude=37.0&longitude=-122.0&radius=100');
    const env = {
      ASSETS_BUCKET: {
        get: async (key) => {
          if (key === 'local_active_faults.json') {
            return {
              json: async () => mockGeoJson,
            };
          }
          return null;
        },
      },
    };
    const context = { request, env };
    const response = await onRequestGet(context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.features.length).toBe(1);
    expect(data.features[0].properties.name).toBe('Fault A');
  });

  it('should return empty array if no faults are nearby', async () => {
    const mockGeoJson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Fault A' },
          geometry: { type: 'LineString', coordinates: [[-122.0, 37.0], [-122.1, 37.1]] },
        },
      ],
    };

    const request = new Request('http://localhost/api/get-nearby-faults?latitude=0.0&longitude=0.0&radius=10');
    const env = {
      ASSETS_BUCKET: {
        get: async (key) => {
          if (key === 'local_active_faults.json') {
            return {
              json: async () => mockGeoJson,
            };
          }
          return null;
        },
      },
    };
    const context = { request, env };
    const response = await onRequestGet(context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.features.length).toBe(0);
  });
});