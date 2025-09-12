import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processAndStoreSignificantClusters } from './process-clusters.js';
import * as spatialClusterUtils from '../utils/spatialClusterUtils.js';
import * as d1ClusterUtils from '../utils/d1ClusterUtils.js';
import { CLUSTER_MIN_QUAKES, DEFINED_CLUSTER_MIN_MAGNITUDE } from '../../src/constants/appConstants.js';

// Mock dependencies
vi.mock('../utils/spatialClusterUtils.js');
vi.mock('../utils/d1ClusterUtils.js');

describe('processAndStoreSignificantClusters', () => {
  let env;
  let mockDb;

  beforeEach(() => {
    // Mock the global fetch
    global.fetch = vi.fn();

    // Mock D1 database binding
    mockDb = {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      run: vi.fn(),
    };
    env = { DB: mockDb };

    // Reset mocks before each test
    vi.clearAllMocks();

    // Mock console to prevent logging during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should abort if DB is not configured', async () => {
    await processAndStoreSignificantClusters({}); // No DB in env
    expect(console.error).toHaveBeenCalledWith("BACKGROUND_PROCESS: D1 Database (DB) binding not found. Aborting.");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should handle failure when fetching earthquake data', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));
    await processAndStoreSignificantClusters(env);
    expect(console.error).toHaveBeenCalledWith("BACKGROUND_PROCESS: Failed to fetch earthquake data.", expect.any(Error));
  });

  it('should exit gracefully if no earthquakes are fetched', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });
    await processAndStoreSignificantClusters(env);
    expect(console.log).toHaveBeenCalledWith("BACKGROUND_PROCESS: No earthquakes to process. Exiting.");
    expect(spatialClusterUtils.findActiveClustersOptimized).not.toHaveBeenCalled();
  });

  // --- Mocks for happy path tests ---
  const mockEarthquakes = [
    { id: 'q1', properties: { mag: 5.5, time: 1000, place: '10km N of Testville' }, geometry: { coordinates: [-122, 38, 5] } },
    { id: 'q2', properties: { mag: 4.5, time: 2000, place: '12km N of Testville' }, geometry: { coordinates: [-122.1, 38.1, 6] } },
    { id: 'q3', properties: { mag: 3.5, time: 3000, place: '8km N of Testville' }, geometry: { coordinates: [-121.9, 37.9, 4] } },
  ];

  const mockCluster = [
    mockEarthquakes[0],
    mockEarthquakes[1],
    mockEarthquakes[2],
  ];

  it('should create a new cluster definition if none exists', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ features: mockEarthquakes }) });
    spatialClusterUtils.findActiveClustersOptimized.mockReturnValue([mockCluster]);
    mockDb.first.mockResolvedValue(undefined); // No existing definition
    d1ClusterUtils.storeClusterDefinition.mockResolvedValue({ success: true });

    await processAndStoreSignificantClusters(env);

    expect(spatialClusterUtils.findActiveClustersOptimized).toHaveBeenCalled();
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT id, slug, version FROM ClusterDefinitions WHERE stableKey = ?'));
    expect(mockDb.first).toHaveBeenCalled();
    expect(d1ClusterUtils.storeClusterDefinition).toHaveBeenCalled();
    expect(mockDb.run).not.toHaveBeenCalled(); // Should not call UPDATE
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Finished. Found 1 significant clusters. Processed (stored/updated): 1, Errors: 0.'));
  });

  it('should update an existing cluster definition if one is found', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ features: mockEarthquakes }) });
    spatialClusterUtils.findActiveClustersOptimized.mockReturnValue([mockCluster]);
    mockDb.first.mockResolvedValue({ id: 'existing-uuid', slug: 'existing-slug', version: 1 }); // Existing definition
    mockDb.run.mockResolvedValue({ success: true });

    await processAndStoreSignificantClusters(env);

    expect(mockDb.first).toHaveBeenCalled();
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE ClusterDefinitions'));
    expect(mockDb.run).toHaveBeenCalled();
    expect(d1ClusterUtils.storeClusterDefinition).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Finished. Found 1 significant clusters. Processed (stored/updated): 1, Errors: 0.'));
  });

  it('should not process clusters that are not significant', async () => {
    const nonSignificantCluster = [
      { id: 'q1', properties: { mag: 1.0, time: 1000, place: 'Test' }, geometry: { coordinates: [0,0,0] } },
      { id: 'q2', properties: { mag: 1.1, time: 2000, place: 'Test' }, geometry: { coordinates: [0,0,0] } },
    ]; // Only 2 quakes, below CLUSTER_MIN_QUAKES
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ features: mockEarthquakes }) });
    spatialClusterUtils.findActiveClustersOptimized.mockReturnValue([nonSignificantCluster]);

    await processAndStoreSignificantClusters(env);

    expect(mockDb.prepare).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Finished. Found 0 significant clusters. Processed (stored/updated): 0, Errors: 0.'));
  });

  it('should handle errors when checking for existing definitions in D1', async () => {
    const testError = new Error('D1 select failed');
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ features: mockEarthquakes }) });
    spatialClusterUtils.findActiveClustersOptimized.mockReturnValue([mockCluster]);
    mockDb.first.mockRejectedValue(testError);

    await processAndStoreSignificantClusters(env);

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Exception while processing cluster with stableKey'), testError.stack);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Finished. Found 1 significant clusters. Processed (stored/updated): 0, Errors: 1.'));
  });

  it('should handle errors when updating an existing definition in D1', async () => {
    const testError = new Error('D1 update failed');
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ features: mockEarthquakes }) });
    spatialClusterUtils.findActiveClustersOptimized.mockReturnValue([mockCluster]);
    mockDb.first.mockResolvedValue({ id: 'existing-uuid', slug: 'existing-slug', version: 1 });
    mockDb.run.mockRejectedValue(testError);

    await processAndStoreSignificantClusters(env);

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Exception while processing cluster with stableKey'), testError.stack);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Finished. Found 1 significant clusters. Processed (stored/updated): 0, Errors: 1.'));
  });

  it('should handle errors when storing a new definition', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ features: mockEarthquakes }) });
    spatialClusterUtils.findActiveClustersOptimized.mockReturnValue([mockCluster]);
    mockDb.first.mockResolvedValue(undefined);
    d1ClusterUtils.storeClusterDefinition.mockResolvedValue({ success: false, error: 'D1 insert failed' });

    await processAndStoreSignificantClusters(env);

    expect(d1ClusterUtils.storeClusterDefinition).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to store new definition for cluster'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Finished. Found 1 significant clusters. Processed (stored/updated): 0, Errors: 1.'));
  });
});
