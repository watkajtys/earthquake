import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerClusterDefinition, fetchClusterDefinition, fetchActiveClusters } from './clusterApiService';

// Mock global fetch
global.fetch = vi.fn();

// Mock for Headers constructor, as it's used by fetchActiveClusters
global.Headers = vi.fn(init => ({
  get: vi.fn(headerName => {
    if (headerName === 'X-Cache-Hit' && init && init['X-Cache-Hit']) {
      return init['X-Cache-Hit'];
    }
    return null;
  }),
  // Add other methods if needed by your tests or code
}));


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

  beforeEach(() => {
    vi.resetAllMocks(); // Resets fetch, spies, and mocked module functions
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Reset Headers mock if it accumulates state across tests (though current mock is simple)
    global.Headers = vi.fn(init => ({
      get: vi.fn(headerName => {
        if (headerName === 'X-Cache-Hit' && init && init['X-Cache-Hit']) {
          return init['X-Cache-Hit'];
        }
        return null;
      }),
    }));
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('registerClusterDefinition', () => {
    const validClusterData = {
      clusterId: 'testCluster123',
      earthquakeIds: ['eq1', 'eq2'],
      strongestQuakeId: 'eq1',
    };

    it('should return true on successful registration (201)', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => 'Created',
      });

      const result = await registerClusterDefinition(validClusterData);
      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith('/api/cluster-definition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validClusterData),
      });
    });

    // ... other tests for registerClusterDefinition remain unchanged
    it('should return false and log error on failed registration (e.g., 400)', async () => {
      const errorResponse = { message: 'Bad request' };
      const status = 400;
      fetch.mockResolvedValueOnce({
        ok: false,
        status: status,
        text: async () => JSON.stringify(errorResponse),
      });
      const result = await registerClusterDefinition(validClusterData);
      expect(result).toBe(false);
    });
    it('should return false and log error on network error', async () => {
      const networkError = new Error('Network failure');
      fetch.mockRejectedValueOnce(networkError);
      const result = await registerClusterDefinition(validClusterData);
      expect(result).toBe(false);
    });
     it('should return false and log error for invalid clusterData (null)', async () => {
      const result = await registerClusterDefinition(null);
      expect(result).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    });

  });

  describe('fetchClusterDefinition', () => {
    const clusterId = 'cluster1';
    const mockClusterDef = { earthquakeIds: ['eq1', 'eq2'], strongestQuakeId: 'eq1' };

    it('should return cluster definition on successful fetch (200)', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockClusterDef,
      });
      const result = await fetchClusterDefinition(clusterId);
      expect(result).toEqual(mockClusterDef);
    });
    // ... other tests for fetchClusterDefinition remain unchanged
    it('should return null if cluster not found (404)', async () => {
      fetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'Not Found',});
      const result = await fetchClusterDefinition(clusterId);
      expect(result).toBeNull();
    });
    it('should throw error and log on other server errors (e.g., 500)', async () => {
      const status = 500;
      fetch.mockResolvedValueOnce({ ok: false, status: status, text: async () => "Error",});
      await expect(fetchClusterDefinition(clusterId)).rejects.toThrow();
    });
    it('should re-throw error and log on network error', async () => {
      const networkError = new Error('Network failure');
      fetch.mockRejectedValueOnce(networkError);
      await expect(fetchClusterDefinition(clusterId)).rejects.toThrow(networkError);
    });
    it('should throw error if response.json() fails', async () => {
      const parseError = new Error('Invalid JSON');
      fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw parseError; }});
      await expect(fetchClusterDefinition(clusterId)).rejects.toThrow(parseError);
    });
    it('should throw error and log for invalid clusterId (null)', async () => {
      await expect(fetchClusterDefinition(null)).rejects.toThrow("Invalid clusterId");
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('fetchActiveClusters', () => {
    const mockEarthquakes = [{ id: 'eq1', geometry: { coordinates: [1,2] }, properties: { time: 123, mag: 5 } }];
    const mockMaxDistanceKm = 100;
    const mockMinQuakes = 2;
    const mockServerCalculatedData = [{ clusterId: 'serverCluster', quakes: ['eq1', 'eq2'] }];
    const mockLocalCalculatedData = [{ clusterId: 'localCluster', quakes: ['eq1', 'eq3'] }];

    it('should return server data and not call local fallback if server responds OK and X-Cache-Hit is true', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'X-Cache-Hit': 'true' }),
        json: async () => mockServerCalculatedData,
      });

      const result = await fetchActiveClusters(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes);

      expect(result).toEqual(mockServerCalculatedData);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(localFindActiveClusters).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith('Active clusters fetched successfully from server cache.');
    });

    it('should call local fallback if server responds OK but X-Cache-Hit is false', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'X-Cache-Hit': 'false' }),
        json: async () => mockServerCalculatedData, // Server still sends data, but we ignore it per logic
      });
      localFindActiveClusters.mockReturnValueOnce(mockLocalCalculatedData);

      const result = await fetchActiveClusters(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes);

      expect(result).toEqual(mockLocalCalculatedData);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(localFindActiveClusters).toHaveBeenCalledWith(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Server cache miss or stale data (X-Cache-Hit: false). Falling back to local calculation.');
      expect(consoleLogSpy).toHaveBeenCalledWith('Initiating client-side cluster calculation.');
      expect(consoleLogSpy).toHaveBeenCalledWith('Client-side cluster calculation successful.');
    });

    it('should call local fallback if server responds OK but X-Cache-Hit is missing', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(), // No X-Cache-Hit header
        json: async () => mockServerCalculatedData,
      });
      localFindActiveClusters.mockReturnValueOnce(mockLocalCalculatedData);

      const result = await fetchActiveClusters(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes);
      expect(result).toEqual(mockLocalCalculatedData);
      expect(localFindActiveClusters).toHaveBeenCalledWith(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Server cache miss or stale data (X-Cache-Hit: null). Falling back to local calculation.');
    });


    it('should call local fallback if server responds with an error (e.g., 500)', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
        headers: new Headers(),
      });
      localFindActiveClusters.mockReturnValueOnce(mockLocalCalculatedData);

      const result = await fetchActiveClusters(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes);

      expect(result).toEqual(mockLocalCalculatedData);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(localFindActiveClusters).toHaveBeenCalledWith(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch active clusters from server. Status: 500. Body: Internal Server Error. Falling back to local calculation.');
    });

    it('should call local fallback if fetch throws a network error', async () => {
      const networkError = new Error("Network failure");
      fetch.mockRejectedValueOnce(networkError);
      localFindActiveClusters.mockReturnValueOnce(mockLocalCalculatedData);

      const result = await fetchActiveClusters(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes);

      expect(result).toEqual(mockLocalCalculatedData);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(localFindActiveClusters).toHaveBeenCalledWith(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Network error while fetching active clusters. Falling back to local calculation:', networkError);
    });

    it('should re-throw error if local fallback also fails', async () => {
      const networkError = new Error("Network failure");
      const localError = new Error("Local calculation failed");
      fetch.mockRejectedValueOnce(networkError);
      localFindActiveClusters.mockImplementationOnce(() => {
        throw localError;
      });

      await expect(fetchActiveClusters(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes))
        .rejects.toThrow(localError);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(localFindActiveClusters).toHaveBeenCalledWith(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Network error while fetching active clusters. Falling back to local calculation:', networkError);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Client-side cluster calculation also failed:', localError);
    });

    // Test input validation of fetchActiveClusters itself
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
