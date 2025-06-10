import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerClusterDefinition, fetchClusterDefinition, fetchActiveClusters } from './clusterApiService';

// Mock global fetch
global.fetch = vi.fn();

describe('clusterApiService', () => {
  let consoleErrorSpy;
  let consoleLogSpy;

  beforeEach(() => {
    vi.resetAllMocks(); // Resets fetch and spies
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
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
        text: async () => 'Created', // or json: async () => ({ message: 'Created' })
      });

      const result = await registerClusterDefinition(validClusterData);
      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith('/api/cluster-definition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validClusterData),
      });
      expect(consoleLogSpy).toHaveBeenCalledWith(`Cluster definition for ${validClusterData.clusterId} registered successfully.`);
    });

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
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Failed to register cluster definition for ${validClusterData.clusterId}. Status: ${status}`,
        JSON.stringify(errorResponse)
      );
    });

    it('should return false and log error on failed registration (non-JSON error, e.g. 500)', async () => {
      const errorText = "Internal Server Error";
      const status = 500;
      fetch.mockResolvedValueOnce({
        ok: false,
        status: status,
        text: async () => errorText,
      });

      const result = await registerClusterDefinition(validClusterData);
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Failed to register cluster definition for ${validClusterData.clusterId}. Status: ${status}`,
        errorText
      );
    });

    it('should return false and log error on network error', async () => {
      const networkError = new Error('Network failure');
      fetch.mockRejectedValueOnce(networkError);

      const result = await registerClusterDefinition(validClusterData);
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Network error while registering cluster definition for ${validClusterData.clusterId}:`,
        networkError
      );
    });

    it('should return false and log error for invalid clusterData (null)', async () => {
      const result = await registerClusterDefinition(null);
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "registerClusterDefinition: Invalid clusterData provided.", null
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should return false and log error for invalid clusterData (missing fields)', async () => {
      const invalidData = { clusterId: '1' };
      const result = await registerClusterDefinition(invalidData);
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "registerClusterDefinition: Invalid clusterData provided.", invalidData
      );
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
      expect(fetch).toHaveBeenCalledWith(`/api/cluster-definition?id=${encodeURIComponent(clusterId)}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      expect(consoleLogSpy).toHaveBeenCalledWith(`Cluster definition for ${clusterId} fetched successfully.`);
    });

    it('should return null if cluster not found (404)', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      });

      const result = await fetchClusterDefinition(clusterId);
      expect(result).toBeNull();
      expect(consoleLogSpy).toHaveBeenCalledWith(`Cluster definition for ${clusterId} not found (404).`);
    });

    it('should throw error and log on other server errors (e.g., 500)', async () => {
      const errorText = 'Internal Server Error';
      const status = 500;
      fetch.mockResolvedValueOnce({
        ok: false,
        status: status,
        text: async () => errorText,
      });

      await expect(fetchClusterDefinition(clusterId)).rejects.toThrow(
        `Failed to fetch cluster definition. Status: ${status}`
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Failed to fetch cluster definition for ${clusterId}. Status: ${status}`,
        errorText
      );
    });

    it('should re-throw error and log on network error', async () => {
      const networkError = new Error('Network failure');
      fetch.mockRejectedValueOnce(networkError);

      await expect(fetchClusterDefinition(clusterId)).rejects.toThrow(networkError);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Network error while fetching cluster definition for ${clusterId}:`,
        networkError
      );
    });

    it('should throw error if response.json() fails', async () => {
      const parseError = new Error('Invalid JSON');
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => { throw parseError; },
      });

      await expect(fetchClusterDefinition(clusterId)).rejects.toThrow(parseError);
      expect(consoleErrorSpy).toHaveBeenCalledWith( // This log happens from the catch block in the SUT
        `Network error while fetching cluster definition for ${clusterId}:`,
        parseError
      );
    });

    it('should throw error and log for invalid clusterId (null)', async () => {
      await expect(fetchClusterDefinition(null)).rejects.toThrow("Invalid clusterId");
      expect(consoleErrorSpy).toHaveBeenCalledWith("fetchClusterDefinition: Invalid clusterId provided.");
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should throw error and log for invalid clusterId (empty string)', async () => {
      await expect(fetchClusterDefinition('')).rejects.toThrow("Invalid clusterId");
      expect(consoleErrorSpy).toHaveBeenCalledWith("fetchClusterDefinition: Invalid clusterId provided.");
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('fetchActiveClusters', () => {
    const mockEarthquakes = [
      { id: 'eq1', properties: { time: Date.now(), mag: 3 }, geometry: { coordinates: [10, 10] } },
      { id: 'eq2', properties: { time: Date.now() + 1000, mag: 4 }, geometry: { coordinates: [10.1, 10.1] } },
    ];
    const mockMaxDistanceKm = 100;
    const mockMinQuakes = 2;
    const mockMaxTimeDifferenceMs = 86400000; // 1 day
    const mockClusterResponse = [
      [mockEarthquakes[0], mockEarthquakes[1]]
    ];

    const validPayload = {
      earthquakes: mockEarthquakes,
      maxDistanceKm: mockMaxDistanceKm,
      minQuakes: mockMinQuakes,
      maxTimeDifferenceMs: mockMaxTimeDifferenceMs,
    };

    it('should return cluster data on successful fetch (200)', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockClusterResponse,
      });

      const result = await fetchActiveClusters(
        mockEarthquakes,
        mockMaxDistanceKm,
        mockMinQuakes,
        mockMaxTimeDifferenceMs
      );

      expect(result).toEqual(mockClusterResponse);
      expect(fetch).toHaveBeenCalledWith('/api/calculate-clusters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(validPayload),
      });
    });

    it('should throw error and log on API error (e.g., 400)', async () => {
      const errorText = 'Bad Request - API Error';
      const status = 400;
      fetch.mockResolvedValueOnce({
        ok: false,
        status: status,
        text: async () => errorText,
      });

      await expect(
        fetchActiveClusters(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes, mockMaxTimeDifferenceMs)
      ).rejects.toThrow(`Failed to fetch active clusters. Status: ${status}`);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Failed to fetch active clusters. Status: ${status}`,
        errorText
      );
    });

    it('should re-throw error and log on network error', async () => {
      const networkError = new Error('Network connection lost');
      fetch.mockRejectedValueOnce(networkError);

      await expect(
        fetchActiveClusters(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes, mockMaxTimeDifferenceMs)
      ).rejects.toThrow(networkError);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Network error while fetching active clusters:',
        networkError
      );
    });

    it('should throw error if response.json() fails after ok:true', async () => {
      const parseError = new Error('Invalid API JSON response');
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => { throw parseError; },
      });

      await expect(
        fetchActiveClusters(mockEarthquakes, mockMaxDistanceKm, mockMinQuakes, mockMaxTimeDifferenceMs)
      ).rejects.toThrow(parseError);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Network error while fetching active clusters:`, // This is the console log from the catch block in SUT
        parseError
      );
    });

    // Input validation tests
    const invalidInputTestCases = [
      {
        name: 'earthquakes not an array',
        args: ["not-an-array", mockMaxDistanceKm, mockMinQuakes, mockMaxTimeDifferenceMs],
        error: 'Invalid earthquakes array',
      },
      {
        name: 'earthquakes empty array',
        args: [[], mockMaxDistanceKm, mockMinQuakes, mockMaxTimeDifferenceMs],
        error: 'Invalid earthquakes array',
      },
      {
        name: 'maxDistanceKm not a number',
        args: [mockEarthquakes, "abc", mockMinQuakes, mockMaxTimeDifferenceMs],
        error: 'Invalid maxDistanceKm',
      },
      {
        name: 'maxDistanceKm zero',
        args: [mockEarthquakes, 0, mockMinQuakes, mockMaxTimeDifferenceMs],
        error: 'Invalid maxDistanceKm',
      },
      {
        name: 'maxDistanceKm negative',
        args: [mockEarthquakes, -10, mockMinQuakes, mockMaxTimeDifferenceMs],
        error: 'Invalid maxDistanceKm',
      },
      {
        name: 'minQuakes not a number',
        args: [mockEarthquakes, mockMaxDistanceKm, "abc", mockMaxTimeDifferenceMs],
        error: 'Invalid minQuakes',
      },
      {
        name: 'minQuakes zero',
        args: [mockEarthquakes, mockMaxDistanceKm, 0, mockMaxTimeDifferenceMs],
        error: 'Invalid minQuakes',
      },
      {
        name: 'minQuakes negative',
        args: [mockEarthquakes, mockMaxDistanceKm, -2, mockMaxTimeDifferenceMs],
        error: 'Invalid minQuakes',
      },
      {
        name: 'maxTimeDifferenceMs not a number',
        args: [mockEarthquakes, mockMaxDistanceKm, mockMinQuakes, "abc"],
        error: 'Invalid maxTimeDifferenceMs',
      },
      {
        name: 'maxTimeDifferenceMs zero',
        args: [mockEarthquakes, mockMaxDistanceKm, mockMinQuakes, 0],
        error: 'Invalid maxTimeDifferenceMs',
      },
      {
        name: 'maxTimeDifferenceMs negative',
        args: [mockEarthquakes, mockMaxDistanceKm, mockMinQuakes, -1000],
        error: 'Invalid maxTimeDifferenceMs',
      },
    ];

    invalidInputTestCases.forEach(({ name, args, error }) => {
      it(`should throw error for invalid input: ${name}`, async () => {
        // @ts-ignore
        await expect(fetchActiveClusters(...args)).rejects.toThrow(error);
        expect(consoleErrorSpy).toHaveBeenCalledWith(`fetchActiveClusters: ${error} provided.`);
        expect(fetch).not.toHaveBeenCalled();
      });
    });
  });
});
