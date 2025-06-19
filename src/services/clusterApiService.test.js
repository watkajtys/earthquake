import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { registerClusterDefinition, fetchClusterDefinition, fetchActiveClusters } from './clusterApiService';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server'; // Corrected path

// Mock the local cluster calculation utility
vi.mock('../utils/clusterUtils.js', () => ({
  findActiveClusters: vi.fn(),
}));
// After mocking, we can import the aliased function to access the mock
import { findActiveClusters as localFindActiveClusters } from '../utils/clusterUtils.js';


describe('clusterApiService', () => {
  let consoleErrorSpy;
  let consoleLogSpy;
  let consoleWarnSpy;

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  beforeEach(() => {
    // vi.resetAllMocks(); // Not needed as much with MSW, specific mocks can be cleared if necessary
    localFindActiveClusters.mockClear(); // Clear this specific mock
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    // vi.resetAllMocks(); // Ensure mocks are clean state for next test if any global mocks were used.
  });

  describe('registerClusterDefinition', () => {
    const validClusterData = {
      clusterId: 'testCluster123',
      earthquakeIds: ['eq1', 'eq2'],
      strongestQuakeId: 'eq1',
    };

    it('should return true on successful registration (201)', async () => {
      server.use(
        http.post('/api/cluster-definition', async ({ request }) => {
          const body = await request.json();
          expect(body).toEqual(validClusterData);
          return new HttpResponse('Created', { status: 201 });
        })
      );
      const result = await registerClusterDefinition(validClusterData);
      expect(result).toBe(true);
    });

    it('should return false and log error on failed registration (e.g., 400)', async () => {
      server.use(
        http.post('/api/cluster-definition', () => {
          return HttpResponse.json({ message: 'Bad request' }, { status: 400 });
        })
      );
      const result = await registerClusterDefinition(validClusterData);
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should return false and log error on network error', async () => {
      server.use(
        http.post('/api/cluster-definition', () => {
          return HttpResponse.networkError('Network failure');
        })
      );
      const result = await registerClusterDefinition(validClusterData);
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should return false and log error for invalid clusterData (null)', async () => {
      const result = await registerClusterDefinition(null);
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith("registerClusterDefinition: Invalid clusterData provided.", null);
    });
  });

  describe('fetchClusterDefinition', () => {
    const clusterId = 'cluster1';
    const mockClusterDef = { earthquakeIds: ['eq1', 'eq2'], strongestQuakeId: 'eq1' };

    it('should return cluster definition on successful fetch (200)', async () => {
      server.use(
        http.get('/api/cluster-definition', ({ request }) => {
          const url = new URL(request.url);
          expect(url.searchParams.get('id')).toBe(clusterId);
          return HttpResponse.json(mockClusterDef, { status: 200 });
        })
      );
      const result = await fetchClusterDefinition(clusterId);
      expect(result).toEqual(mockClusterDef);
    });

    it('should return null if cluster not found (404)', async () => {
      server.use(
        http.get('/api/cluster-definition', () => {
          return new HttpResponse('Not Found', { status: 404 });
        })
      );
      const result = await fetchClusterDefinition(clusterId);
      expect(result).toBeNull();
    });

    it('should throw error and log on other server errors (e.g., 500)', async () => {
      server.use(
        http.get('/api/cluster-definition', () => {
          return new HttpResponse('Error', { status: 500 });
        })
      );
      await expect(fetchClusterDefinition(clusterId)).rejects.toThrow('Failed to fetch cluster definition. Status: 500');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should re-throw error and log on network error', async () => {
      server.use(
        http.get('/api/cluster-definition', () => {
          // Simulate a specific server error status for network-like failures
          return new HttpResponse(null, { status: 503, statusText: 'Service Unavailable' });
        })
      );
       // The service formats this as "Failed to fetch cluster definition. Status: 503"
       await expect(fetchClusterDefinition(clusterId)).rejects.toThrow('Failed to fetch cluster definition. Status: 503');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should throw error if response.json() fails', async () => {
      server.use(
        http.get('/api/cluster-definition', () => {
          return new HttpResponse('Invalid JSON', { status: 200, headers: { 'Content-Type': 'application/json' } });
        })
      );
        await expect(fetchClusterDefinition(clusterId)).rejects.toThrow(/^Unexpected token '?I'?|JSON.parse|Invalid JSON/); // Matches common JSON errors
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should throw error and log for invalid clusterId (null)', async () => {
      await expect(fetchClusterDefinition(null)).rejects.toThrow("Invalid clusterId");
      expect(consoleErrorSpy).toHaveBeenCalledWith("fetchClusterDefinition: Invalid clusterId provided.");
    });
  });

  describe('fetchActiveClusters', () => {
    const mockEarthquakes = [{ id: 'eq1', geometry: { coordinates: [1,2] }, properties: { time: 123, mag: 5 } }];
    const mockMaxDistanceKm = 100;
    const mockMinQuakes = 2;
    const mockServerCalculatedData = [{ clusterId: 'serverCluster', quakes: ['eq1', 'eq2'] }];
    const mockLocalCalculatedData = [{ clusterId: 'localCluster', quakes: ['eq1', 'eq3'] }];

    it('should return server data and not call local fallback if server responds OK and X-Cache-Hit is true', async () => {
      server.use(
        http.post('/api/calculate-clusters', async ({request}) => {
          return HttpResponse.json(mockServerCalculatedData, { // Body is the array of clusters
            status: 200,
            headers: { 'X-Cache-Hit': 'true' } // X-Cache-Hit header indicates cache status
          });
        })
      );
      const result = await fetchActiveClusters(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes);
      expect(result).toEqual(mockServerCalculatedData);
      expect(localFindActiveClusters).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith('Active clusters fetched from server (parsed as direct array). Cache-Hit: true');
    });

    it('should call local fallback if server responds OK but X-Cache-Hit is false', async () => {
      server.use(
        http.post('/api/calculate-clusters', () => {
          // Simulate server returning data that would be valid if cacheHit was true, but isn't.
          // The service will parse it, see cacheHit is false, warn, and then proceed to local.
          return HttpResponse.json(mockServerCalculatedData, {
            status: 200,
            headers: { 'X-Cache-Hit': 'false' }
          });
        })
      );
      localFindActiveClusters.mockReturnValueOnce(mockLocalCalculatedData);
      const result = await fetchActiveClusters(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes);
      expect(result).toEqual(mockLocalCalculatedData);
      expect(localFindActiveClusters).toHaveBeenCalledWith(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Server data received (Cache-Hit: false), but policy is to fall back to local calculation for non-cache-hits or when X-Cache-Hit is not explicitly \'true\'.');
      expect(consoleLogSpy).toHaveBeenCalledWith('Initiating client-side cluster calculation using localFindActiveClusters.');
      expect(consoleLogSpy).toHaveBeenCalledWith('Client-side cluster calculation successful.');
    });

    it('should call local fallback if server responds OK but X-Cache-Hit is missing', async () => {
      server.use(
        http.post('/api/calculate-clusters', () => {
          // Simulate server returning data that would be valid, but no X-Cache-Hit header.
          return HttpResponse.json(mockServerCalculatedData, {
            status: 200,
            headers: { /* No X-Cache-Hit header */ }
          });
        })
      );
      localFindActiveClusters.mockReturnValueOnce(mockLocalCalculatedData);
      const result = await fetchActiveClusters(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes);
      expect(result).toEqual(mockLocalCalculatedData);
      expect(localFindActiveClusters).toHaveBeenCalledWith(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Server data received (Cache-Hit: null), but policy is to fall back to local calculation for non-cache-hits or when X-Cache-Hit is not explicitly \'true\'.');
    });

    it('should call local fallback if server responds with an error (e.g., 500)', async () => {
      server.use(
        http.post('/api/calculate-clusters', () => {
          return new HttpResponse('Internal Server Error', { status: 500 });
        })
      );
      localFindActiveClusters.mockReturnValueOnce(mockLocalCalculatedData);
      const result = await fetchActiveClusters(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes);
      expect(result).toEqual(mockLocalCalculatedData);
      expect(localFindActiveClusters).toHaveBeenCalledWith(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch active clusters from server. Status: 500. Body: Internal Server Error. Falling back to local calculation.');
    });

    it('should call local fallback if fetch throws a network error', async () => {
      server.use(
        http.post('/api/calculate-clusters', () => {
          return new HttpResponse(null, { status: 503, statusText: 'Service Down' });
        })
      );
      localFindActiveClusters.mockReturnValueOnce(mockLocalCalculatedData);
      const result = await fetchActiveClusters(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes);
      expect(result).toEqual(mockLocalCalculatedData);
      expect(localFindActiveClusters).toHaveBeenCalledWith(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch active clusters from server. Status: 503. Body: . Falling back to local calculation.');
    });

    it('should re-throw error if local fallback also fails', async () => {
      const localError = new Error("Local calculation failed");
      server.use(
        http.post('/api/calculate-clusters', () => {
          return new HttpResponse(null, { status: 503, statusText: 'Service Down' });
        })
      );
      localFindActiveClusters.mockImplementationOnce(() => {
        throw localError;
      });
      await expect(fetchActiveClusters(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes))
        .rejects.toThrow(localError);
      expect(localFindActiveClusters).toHaveBeenCalledWith(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch active clusters from server. Status: 503. Body: . Falling back to local calculation.');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Client-side cluster calculation also failed:', localError);
    });

    it('should throw error for invalid earthquakes array', async () => {
        await expect(fetchActiveClusters("not-an-array", mockMaxDistanceKm, mockMinQuakes))
            .rejects.toThrow("Invalid earthquakes array");
        expect(consoleErrorSpy).toHaveBeenCalledWith("fetchActiveClusters: Invalid earthquakes array provided.");
    });

    it('should throw error for invalid maxDistanceKm', async () => {
        await expect(fetchActiveClusters(mockEarthquakes, "invalid", mockMinQuakes))
            .rejects.toThrow("Invalid maxDistanceKm");
        expect(consoleErrorSpy).toHaveBeenCalledWith("fetchActiveClusters: Invalid maxDistanceKm provided.");
    });

    it('should throw error for invalid minQuakes', async () => {
        await expect(fetchActiveClusters(mockEarthquakes, mockMaxDistanceKm, "invalid"))
            .rejects.toThrow("Invalid minQuakes");
        expect(consoleErrorSpy).toHaveBeenCalledWith("fetchActiveClusters: Invalid minQuakes provided.");
    });

  });
});
