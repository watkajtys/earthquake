import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processAndStoreSignificantClusters } from './process-clusters';
import * as d1ClusterUtils from '../utils/d1ClusterUtils';
import * as spatialClusterUtils from '../utils/spatialClusterUtils';
import { CLUSTER_MIN_QUAKES, DEFINED_CLUSTER_MIN_MAGNITUDE } from '../../src/constants/appConstants';

// Mock the global fetch
vi.spyOn(global, 'fetch');

// Mock d1ClusterUtils
vi.mock('../utils/d1ClusterUtils', () => ({
  storeClusterDefinition: vi.fn(),
}));

// Mock spatialClusterUtils
vi.mock('../utils/spatialClusterUtils', () => ({
    findActiveClustersOptimized: vi.fn(),
}));

describe('processAndStoreSignificantClusters', () => {
  let mockEnv;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEnv = {
      DB: {
        prepare: vi.fn(),
      },
    };
  });

  it('should do nothing if fetching earthquakes fails', async () => {
    fetch.mockImplementation(() => Promise.resolve({
      ok: false,
      status: 500,
      statusText: 'Server Error',
    }));

    await processAndStoreSignificantClusters(mockEnv);

    expect(mockEnv.DB.prepare).not.toHaveBeenCalled();
  });

  it('should create a new cluster definition when a significant cluster is found', async () => {
    const mockEarthquakes = {
      features: [
        {
          id: 'test-quake-1',
          properties: { mag: DEFINED_CLUSTER_MIN_MAGNITUDE + 0.1, place: 'Test Location 1', time: Date.now() },
          geometry: { coordinates: [10, 20, 30] },
        },
        {
          id: 'test-quake-2',
          properties: { mag: DEFINED_CLUSTER_MIN_MAGNITUDE - 0.5, place: 'Test Location 2', time: Date.now() },
          geometry: { coordinates: [10.1, 20.1, 30.1] },
        },
      ],
    };

    const mockCluster = Array(CLUSTER_MIN_QUAKES).fill(null).map((_, i) => ({
        id: `test-quake-${i}`,
        properties: { mag: DEFINED_CLUSTER_MIN_MAGNITUDE + (i * 0.1), place: `Test Location ${i}`, time: Date.now() },
        geometry: { coordinates: [10, 20, 30] },
    }));

    fetch.mockImplementation(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockEarthquakes),
    }));

    spatialClusterUtils.findActiveClustersOptimized.mockReturnValue([mockCluster]);
    d1ClusterUtils.storeClusterDefinition.mockResolvedValue({ success: true });

    // Mock the DB query to indicate the cluster does not exist
    mockEnv.DB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
    });

    await processAndStoreSignificantClusters(mockEnv);

    expect(spatialClusterUtils.findActiveClustersOptimized).toHaveBeenCalled();
    expect(d1ClusterUtils.storeClusterDefinition).toHaveBeenCalled();
  });

  it('should update an existing cluster definition when a significant cluster is found', async () => {
    const mockEarthquakes = {
        features: [
          {
            id: 'test-quake-1',
            properties: { mag: DEFINED_CLUSTER_MIN_MAGNITUDE + 0.1, place: 'Test Location 1', time: Date.now() },
            geometry: { coordinates: [10, 20, 30] },
          },
        ],
      };

      const mockCluster = Array(CLUSTER_MIN_QUAKES).fill(null).map((_, i) => ({
        id: `test-quake-${i}`,
        properties: { mag: DEFINED_CLUSTER_MIN_MAGNITUDE + (i * 0.1), place: `Test Location ${i}`, time: Date.now() },
        geometry: { coordinates: [10, 20, 30] },
    }));

    fetch.mockImplementation(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockEarthquakes),
    }));

    spatialClusterUtils.findActiveClustersOptimized.mockReturnValue([mockCluster]);

    // Mock the DB query to indicate the cluster exists
    const existingDefinition = { id: 'existing-cluster-id', slug: 'existing-slug', version: 1 };
    const selectStatement = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(existingDefinition),
    };
    const updateStatement = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({}),
    };

    mockEnv.DB.prepare
        .mockImplementationOnce(() => selectStatement)
        .mockImplementationOnce(() => updateStatement);

    await processAndStoreSignificantClusters(mockEnv);

    expect(spatialClusterUtils.findActiveClustersOptimized).toHaveBeenCalled();
    expect(mockEnv.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE ClusterDefinitions'));
    expect(d1ClusterUtils.storeClusterDefinition).not.toHaveBeenCalled();
  });

  it('should handle errors during cluster processing', async () => {
    const mockEarthquakes = {
        features: [
          {
            id: 'test-quake-1',
            properties: { mag: DEFINED_CLUSTER_MIN_MAGNITUDE + 0.1, place: 'Test Location 1', time: Date.now() },
            geometry: { coordinates: [10, 20, 30] },
          },
        ],
      };

      const mockCluster = Array(CLUSTER_MIN_QUAKES).fill(null).map((_, i) => ({
        id: `test-quake-${i}`,
        properties: { mag: DEFINED_CLUSTER_MIN_MAGNITUDE + (i * 0.1), place: `Test Location ${i}`, time: Date.now() },
        geometry: { coordinates: [10, 20, 30] },
    }));

    fetch.mockImplementation(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockEarthquakes),
    }));

    spatialClusterUtils.findActiveClustersOptimized.mockReturnValue([mockCluster]);

    // Mock the DB query to throw an error
    mockEnv.DB.prepare.mockImplementation(() => {
        throw new Error('Database error');
    });

    // Mock console.error
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await processAndStoreSignificantClusters(mockEnv);

    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
