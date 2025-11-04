// @vitest-environment node

// functions/background/process-cluster-definitions.test.js

import {
  vi,
  describe,
  it,
  expect,
  beforeEach
} from 'vitest';
import worker from './process-cluster-definitions.js';
import {
  findActiveClustersOptimized
} from '../utils/spatialClusterUtils.js';

// Mock dependencies
vi.mock('../utils/spatialClusterUtils.js', () => ({
  findActiveClustersOptimized: vi.fn(),
}));

vi.mock('../utils/d1ClusterUtils.js', () => ({
  storeClusterDefinition: vi.fn(),
}));

describe('process-cluster-definitions worker', () => {
  let env;

  beforeEach(() => {
    vi.resetAllMocks();

    env = {
      DB: {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({
              results: [{
                geojson_feature: JSON.stringify({
                  id: 'test-quake-1',
                  properties: {
                    mag: 5
                  }
                })
              }]
            }),
          })),
          run: vi.fn().mockResolvedValue({}),
          first: vi.fn().mockResolvedValue(null),
        })),
      },
      CLUSTER_KV: {
        put: vi.fn(),
      },
    };
  });

  it('should fetch recent earthquakes, calculate clusters, and store definitions and cache', async () => {
    const mockClusters = [
      [{
        id: 'cluster-1-quake-1',
        properties: {
          mag: 5
        }
      }]
    ];
    findActiveClustersOptimized.mockReturnValue(mockClusters);

    await worker.scheduled(null, env, null);

    expect(env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT geojson_feature FROM EarthquakeEvents'));
    expect(findActiveClustersOptimized).toHaveBeenCalled();
    expect(env.CLUSTER_KV.put).toHaveBeenCalledWith('active_clusters', JSON.stringify(mockClusters), {
      expirationTtl: 3600
    });
  });

  it('should not process if no recent earthquakes are found', async () => {
    env.DB.prepare.mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({
        results: []
      }),
    });

    await worker.scheduled(null, env, null);

    expect(findActiveClustersOptimized).not.toHaveBeenCalled();
    expect(env.CLUSTER_KV.put).not.toHaveBeenCalled();
  });

  it('should handle errors during processing', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('Test error');
    env.DB.prepare.mockImplementation(() => {
      throw error;
    });

    await worker.scheduled(null, env, null);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled error'), error.message, expect.any(String));
    consoleErrorSpy.mockRestore();
  });
});