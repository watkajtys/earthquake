import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerClusterDefinition, fetchClusterDefinition } from './clusterApiService';

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
});
