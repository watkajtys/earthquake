import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { registerClusterDefinition, fetchClusterDefinition, fetchActiveClusters } from './clusterApiService';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server'; // Corrected path



describe('clusterApiService', () => {
  let consoleErrorSpy;
  let consoleLogSpy;
  let consoleWarnSpy;

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  beforeEach(() => {
    // vi.resetAllMocks(); // Not needed as much with MSW, specific mocks can be cleared if necessary
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
    const mockServerCalculatedData = [{ clusterId: 'serverCluster', quakes: ['eq1', 'eq2'] }];

    it('should return data from the /api/get-clusters endpoint', async () => {
      server.use(
        http.get('/api/get-clusters', () => {
          return HttpResponse.json(mockServerCalculatedData, {
            status: 200,
            headers: { 'X-Cache-Status': 'Hit' }
          });
        })
      );

      const result = await fetchActiveClusters();
      expect(result).toEqual(mockServerCalculatedData);
      expect(consoleLogSpy).toHaveBeenCalledWith('Active clusters fetched from server. Cache-Status: Hit');
    });

    it('should return an empty array if the server responds with an error', async () => {
      server.use(
        http.get('/api/get-clusters', () => {
          return new HttpResponse('Internal Server Error', { status: 500 });
        })
      );

      const result = await fetchActiveClusters();
      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch active clusters from server. Status: 500. Body: Internal Server Error.');
    });

    it('should return an empty array on network error', async () => {
      server.use(
        http.get('/api/get-clusters', () => {
          return HttpResponse.error();
        })
      );

      const result = await fetchActiveClusters();
      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Network error while fetching active clusters:', expect.any(Error));
    });
  });
});
