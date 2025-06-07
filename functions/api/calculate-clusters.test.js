// functions/api/calculate-clusters.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestPost } from './calculate-clusters';

// Sample valid earthquake data
const sampleEarthquakes = [
  { id: 'eq1', properties: { mag: 5.0, time: 1678886400000 }, geometry: { coordinates: [-122.0, 37.0] } },
  { id: 'eq2', properties: { mag: 4.5, time: 1678886500000 }, geometry: { coordinates: [-122.1, 37.1] } }, // ~15km away
  { id: 'eq3', properties: { mag: 6.0, time: 1678886600000 }, geometry: { coordinates: [-125.0, 39.0] } }, // Far away
  { id: 'eq4', properties: { mag: null, time: 1678886700000 }, geometry: { coordinates: [-122.05, 37.05] } }, // Near eq1 & eq2, null mag
];

const mockKvStore = {
  get: vi.fn(),
  put: vi.fn(),
};

describe('onRequestPost - /api/calculate-clusters', () => {
  let context;

  beforeEach(() => {
    vi.resetAllMocks();
    context = {
      request: {
        json: vi.fn(),
        headers: new Headers({ 'Content-Type': 'application/json' }), // Usually Content-Type is checked
      },
      env: {
        CLUSTER_KV: mockKvStore,
      },
      waitUntil: vi.fn(), // onRequestPost uses context.waitUntil for KV.put
    };
  });

  describe('Valid Requests', () => {
    it('should process a valid request, calculate clusters (cache miss), and store in KV', async () => {
      context.request.json.mockResolvedValue({
        earthquakes: sampleEarthquakes,
        maxDistanceKm: 20,
        minQuakes: 2,
      });
      mockKvStore.get.mockResolvedValue(null); // Cache miss

      const response = await onRequestPost(context);
      const responseBody = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('X-Cache-Hit')).toBe('false');
      expect(mockKvStore.get).toHaveBeenCalledTimes(1);
      expect(mockKvStore.put).toHaveBeenCalledTimes(1);

      // Basic check for cluster formation (eq1, eq2, eq4 should cluster)
      // eq3 is too far. mag sorting means eq1 is processed first.
      expect(responseBody).toBeInstanceOf(Array);
      expect(responseBody.length).toBe(1); // Expecting one cluster
      const cluster = responseBody[0];
      const clusterIds = cluster.map(q => q.id).sort();
      expect(clusterIds).toEqual(['eq1', 'eq2', 'eq4'].sort());
    });

    it('should return cached data if available (cache hit)', async () => {
      const cachedClusterData = JSON.stringify([{ id: 'cached_cluster' }]);
      context.request.json.mockResolvedValue({ // Request body still needed for cache key generation
        earthquakes: sampleEarthquakes,
        maxDistanceKm: 20,
        minQuakes: 2,
      });
      mockKvStore.get.mockResolvedValue(cachedClusterData);

      const response = await onRequestPost(context);
      const responseBody = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get('X-Cache-Hit')).toBe('true');
      expect(responseBody).toEqual(JSON.parse(cachedClusterData));
      expect(mockKvStore.get).toHaveBeenCalledTimes(1);
      expect(mockKvStore.put).not.toHaveBeenCalled();
      // How to check findActiveClusters was not called?
      // We can't directly spy on findActiveClusters as it's not exported and called internally.
      // However, if KV.put is not called, and cache is hit, it implies findActiveClusters was skipped.
    });
  });

  describe('Input Validation Failures', () => {
    const baseValidPayload = {
      earthquakes: sampleEarthquakes,
      maxDistanceKm: 20,
      minQuakes: 2,
    };

    it('should return 400 if earthquakes is not an array', async () => {
      context.request.json.mockResolvedValue({ ...baseValidPayload, earthquakes: 'not-an-array' });
      const response = await onRequestPost(context);
      const responseBody = await response.json();
      expect(response.status).toBe(400);
      expect(responseBody.error).toBe('Invalid or empty earthquakes array');
    });

    it('should return 400 if earthquakes is an empty array', async () => {
      context.request.json.mockResolvedValue({ ...baseValidPayload, earthquakes: [] });
      const response = await onRequestPost(context);
      const responseBody = await response.json();
      expect(response.status).toBe(400);
      expect(responseBody.error).toBe('Invalid or empty earthquakes array');
    });

    it('should return 400 if maxDistanceKm is not a number', async () => {
      context.request.json.mockResolvedValue({ ...baseValidPayload, maxDistanceKm: 'not-a-number' });
      const response = await onRequestPost(context);
      const responseBody = await response.json();
      expect(response.status).toBe(400);
      expect(responseBody.error).toBe('Invalid maxDistanceKm');
    });

    it('should return 400 if maxDistanceKm is zero', async () => {
      context.request.json.mockResolvedValue({ ...baseValidPayload, maxDistanceKm: 0 });
      const response = await onRequestPost(context);
      const responseBody = await response.json();
      expect(response.status).toBe(400);
      expect(responseBody.error).toBe('Invalid maxDistanceKm');
    });

    it('should return 400 if minQuakes is not a number', async () => {
      context.request.json.mockResolvedValue({ ...baseValidPayload, minQuakes: 'not-a-number' });
      const response = await onRequestPost(context);
      const responseBody = await response.json();
      expect(response.status).toBe(400);
      expect(responseBody.error).toBe('Invalid minQuakes');
    });

    it('should return 400 if minQuakes is zero', async () => {
      context.request.json.mockResolvedValue({ ...baseValidPayload, minQuakes: 0 });
      const response = await onRequestPost(context);
      const responseBody = await response.json();
      expect(response.status).toBe(400);
      expect(responseBody.error).toBe('Invalid minQuakes');
    });

    // Detailed earthquake object validation tests
    const createInvalidPayload = (index, invalidQuake) => {
      const quakes = [...sampleEarthquakes];
      quakes[index] = invalidQuake;
      return { ...baseValidPayload, earthquakes: quakes };
    };

    it('should return 400 if an earthquake element is not an object', async () => {
      context.request.json.mockResolvedValue(createInvalidPayload(0, "not-an-object"));
      const response = await onRequestPost(context);
      const responseBody = await response.json();
      expect(response.status).toBe(400);
      expect(responseBody.error).toBe('Invalid earthquake element at index 0: not an object');
    });

    it('should return 400 if an earthquake element has missing id', async () => {
      const quake = { ...sampleEarthquakes[0] };
      delete quake.id;
      context.request.json.mockResolvedValue(createInvalidPayload(0, quake));
      const response = await onRequestPost(context);
      const responseBody = await response.json();
      expect(response.status).toBe(400);
      expect(responseBody.error).toBe('Invalid earthquake element at index 0: missing or invalid id');
    });

    it('should return 400 if an earthquake element id is not string/number', async () => {
      context.request.json.mockResolvedValue(createInvalidPayload(0, { ...sampleEarthquakes[0], id: {} }));
      const response = await onRequestPost(context);
      const responseBody = await response.json();
      expect(response.status).toBe(400);
      expect(responseBody.error).toBe('Invalid earthquake element at index 0: missing or invalid id');
    });

    it('should return 400 if an earthquake element has missing properties', async () => {
      const quake = { ...sampleEarthquakes[0] };
      delete quake.properties;
      context.request.json.mockResolvedValue(createInvalidPayload(0, quake));
      const response = await onRequestPost(context);
      const responseBody = await response.json();
      expect(response.status).toBe(400);
      expect(responseBody.error).toContain('missing or invalid properties');
    });

    it('should return 400 if an earthquake element properties is not an object', async () => {
      context.request.json.mockResolvedValue(createInvalidPayload(0, { ...sampleEarthquakes[0], properties: "not-an-object" }));
      const response = await onRequestPost(context);
      const responseBody = await response.json();
      expect(response.status).toBe(400);
      expect(responseBody.error).toContain('missing or invalid properties');
    });

    it('should return 400 if an earthquake properties.mag is not number or null', async () => {
      context.request.json.mockResolvedValue(createInvalidPayload(0, { ...sampleEarthquakes[0], properties: { mag: "string" } }));
      const response = await onRequestPost(context);
      const responseBody = await response.json();
      expect(response.status).toBe(400);
      expect(responseBody.error).toContain('missing or invalid properties.mag');
    });

    // Note: properties.mag can be null, which is valid. This is tested by sampleEarthquakes[3] in valid requests.

    it('should return 400 if an earthquake element has missing geometry', async () => {
      const quake = { ...sampleEarthquakes[0] };
      delete quake.geometry;
      context.request.json.mockResolvedValue(createInvalidPayload(0, quake));
      const response = await onRequestPost(context);
      const responseBody = await response.json();
      expect(response.status).toBe(400);
      expect(responseBody.error).toContain('missing or invalid geometry');
    });

    it('should return 400 if an earthquake element geometry is not an object', async () => {
      context.request.json.mockResolvedValue(createInvalidPayload(0, { ...sampleEarthquakes[0], geometry: "not-an-object" }));
      const response = await onRequestPost(context);
      const responseBody = await response.json();
      expect(response.status).toBe(400);
      expect(responseBody.error).toContain('missing or invalid geometry');
    });

    it('should return 400 if an earthquake geometry.coordinates is missing', async () => {
      context.request.json.mockResolvedValue(createInvalidPayload(0, { ...sampleEarthquakes[0], geometry: {} }));
      const response = await onRequestPost(context);
      const responseBody = await response.json();
      expect(response.status).toBe(400);
      expect(responseBody.error).toContain('missing or invalid geometry.coordinates');
    });

    it('should return 400 if an earthquake geometry.coordinates is not an array of two numbers (case 1: not array)', async () => {
      context.request.json.mockResolvedValue(createInvalidPayload(0, { ...sampleEarthquakes[0], geometry: { coordinates: "123,456" } }));
      const response = await onRequestPost(context);
      const responseBody = await response.json();
      expect(response.status).toBe(400);
      expect(responseBody.error).toContain('missing or invalid geometry.coordinates');
    });

    it('should return 400 if an earthquake geometry.coordinates is not an array of two numbers (case 2: wrong length)', async () => {
      context.request.json.mockResolvedValue(createInvalidPayload(0, { ...sampleEarthquakes[0], geometry: { coordinates: [1,2,3] } }));
      const response = await onRequestPost(context);
      const responseBody = await response.json();
      expect(response.status).toBe(400);
      expect(responseBody.error).toContain('missing or invalid geometry.coordinates');
    });

    it('should return 400 if an earthquake geometry.coordinates is not an array of two numbers (case 3: wrong type in array)', async () => {
      context.request.json.mockResolvedValue(createInvalidPayload(0, { ...sampleEarthquakes[0], geometry: { coordinates: [1, "string"] } }));
      const response = await onRequestPost(context);
      const responseBody = await response.json();
      expect(response.status).toBe(400);
      expect(responseBody.error).toContain('missing or invalid geometry.coordinates');
    });
  });

  describe('KV Store Errors', () => {
    const validPayload = {
      earthquakes: sampleEarthquakes,
      maxDistanceKm: 20,
      minQuakes: 2,
    };

    it('should compute and attempt to store in KV if KV.get fails, then return 200', async () => {
      context.request.json.mockResolvedValue(validPayload);
      mockKvStore.get.mockRejectedValue(new Error('KV GET failed'));
      mockKvStore.put.mockResolvedValue(undefined); // Assume put succeeds or we'd have another test

      const response = await onRequestPost(context);
      const responseBody = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get('X-Cache-Hit')).toBe('false');
      expect(mockKvStore.get).toHaveBeenCalledTimes(1);
      expect(mockKvStore.put).toHaveBeenCalledTimes(1); // Crucially, put was still attempted
      expect(responseBody.length).toBe(1); // Check that computation happened
    });

    it('should compute and return 200 if KV.put fails', async () => {
      context.request.json.mockResolvedValue(validPayload);
      mockKvStore.get.mockResolvedValue(null); // Cache miss
      mockKvStore.put.mockRejectedValue(new Error('KV PUT failed'));

      const response = await onRequestPost(context);
      const responseBody = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get('X-Cache-Hit')).toBe('false');
      expect(mockKvStore.get).toHaveBeenCalledTimes(1);
      expect(mockKvStore.put).toHaveBeenCalledTimes(1);
      expect(responseBody.length).toBe(1); // Check that computation happened and data returned
    });
  });

  describe('Payload Errors', () => {
    it('should return 400 if JSON payload is invalid', async () => {
      context.request.json.mockRejectedValue(new SyntaxError('Unexpected token in JSON'));

      const response = await onRequestPost(context);
      const responseBody = await response.json();

      expect(response.status).toBe(400);
      expect(responseBody.error).toBe('Invalid JSON payload');
      expect(responseBody.details).toContain('Unexpected token in JSON');
    });
  });
});
