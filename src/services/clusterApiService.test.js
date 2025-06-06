import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerClusterDefinition, fetchClusterDefinition } from './clusterApiService';

// Mock global fetch
global.fetch = vi.fn();

// Spy on console methods
let consoleErrorSpy;
let consoleLogSpy;

describe('clusterApiService', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // Clear all mocks before each test
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('registerClusterDefinition', () => {
    const validClusterData = {
      clusterId: "testCluster123",
      earthquakeIds: ["id1", "id2"],
      strongestQuakeId: "id1",
    };

    it('should successfully register a cluster definition', async () => {
      fetch.mockResolvedValueOnce({
        status: 201,
        text: async () => 'Created', // Mock .text() as it might be called
      });

      const result = await registerClusterDefinition(validClusterData);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith('/api/cluster-definition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validClusterData),
      });
      expect(result).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalledWith(`Cluster definition for ${validClusterData.clusterId} registered successfully.`);
    });

    it('should return false if registration fails (server-side error)', async () => {
      const errorResponseBody = 'Server error';
      fetch.mockResolvedValueOnce({
        status: 500,
        text: async () => errorResponseBody,
      });

      const result = await registerClusterDefinition(validClusterData);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith('/api/cluster-definition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validClusterData),
      });
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Failed to register cluster definition for ${validClusterData.clusterId}. Status: 500`,
        errorResponseBody
      );
    });

    it('should return false on network error', async () => {
      const networkError = new Error('Network failure');
      fetch.mockRejectedValueOnce(networkError);

      const result = await registerClusterDefinition(validClusterData);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Network error while registering cluster definition for ${validClusterData.clusterId}:`,
        networkError
      );
    });

    const invalidTestData = [
      null,
      {},
      { earthquakeIds: [], strongestQuakeId: "id" },
      { clusterId: "cid", strongestQuakeId: "id" },
      { clusterId: "cid", earthquakeIds: [] },
    ];

    invalidTestData.forEach((data, index) => {
      it(`should return false and not call fetch for invalid clusterData (case ${index + 1})`, async () => {
        const result = await registerClusterDefinition(data);
        expect(result).toBe(false);
        expect(fetch).not.toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalledWith("registerClusterDefinition: Invalid clusterData provided.", data);
      });
    });
  });

  describe('fetchClusterDefinition', () => {
    const clusterId = 'testClusterGet123';
    const mockClusterData = {
      earthquakeIds: ["idA", "idB"],
      strongestQuakeId: "idA",
    };

    it('should fetch cluster definition successfully', async () => {
      fetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockClusterData,
        text: async () => JSON.stringify(mockClusterData), // For error cases if .text() is called
      });

      const result = await fetchClusterDefinition(clusterId);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(`/api/cluster-definition?id=${encodeURIComponent(clusterId)}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      expect(result).toEqual(mockClusterData);
      expect(consoleLogSpy).toHaveBeenCalledWith(`Cluster definition for ${clusterId} fetched successfully.`);
    });

    it('should return null if cluster not found (404)', async () => {
      fetch.mockResolvedValueOnce({
        status: 404,
        text: async () => 'Not Found',
      });

      const result = await fetchClusterDefinition(clusterId);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
      expect(consoleLogSpy).toHaveBeenCalledWith(`Cluster definition for ${clusterId} not found (404).`);
    });

    it('should throw an error if fetch fails (server-side error, not 200 or 404)', async () => {
      const errorStatus = 500;
      const errorResponseBody = 'Internal Server Error';
      fetch.mockResolvedValueOnce({
        status: errorStatus,
        text: async () => errorResponseBody,
      });

      await expect(fetchClusterDefinition(clusterId)).rejects.toThrow(
        `Failed to fetch cluster definition. Status: ${errorStatus}`
      );

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Failed to fetch cluster definition for ${clusterId}. Status: ${errorStatus}`,
        errorResponseBody
      );
    });

    it('should throw an error on network failure', async () => {
      const networkError = new Error('Network problem');
      fetch.mockRejectedValueOnce(networkError);

      await expect(fetchClusterDefinition(clusterId)).rejects.toThrow(networkError);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Network error while fetching cluster definition for ${clusterId}:`,
        networkError
      );
    });

    it('should throw an error if response is not valid JSON', async () => {
      fetch.mockResolvedValueOnce({
        status: 200,
        json: async () => { throw new SyntaxError("Unexpected token N in JSON at position 0"); },
        text: async () => 'Not valid JSON',
      });

      // The error will be caught by the catch block in fetchClusterDefinition
      // and then re-thrown.
      await expect(fetchClusterDefinition(clusterId)).rejects.toThrow(SyntaxError);

      expect(fetch).toHaveBeenCalledTimes(1);
      // The console.error in the catch block will be called.
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Network error while fetching cluster definition for ${clusterId}:`,
        expect.any(SyntaxError) // Check that it's a SyntaxError
      );
    });

    const invalidClusterIds = [null, undefined, ""];
    invalidClusterIds.forEach((invalidId) => {
      it(`should throw an error and not call fetch for invalid clusterId: "${invalidId}"`, async () => {
        await expect(fetchClusterDefinition(invalidId)).rejects.toThrow("Invalid clusterId");
        expect(fetch).not.toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalledWith("fetchClusterDefinition: Invalid clusterId provided.");
      });
    });
  });
});
