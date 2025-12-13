import { vi, describe, it, expect, beforeEach } from 'vitest';
import worker from './process-cluster-definitions.js';

const createMockDbInstance = () => {
    const statement = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue({}),
      all: vi.fn().mockResolvedValue({ results: [] }),
    };
    return {
      prepare: vi.fn(() => statement),
    };
  };

const createMockEnv = () => ({
  DB: createMockDbInstance(),
  CLUSTER_KV: {
    put: vi.fn(),
  },
});

// Mock data reflecting the NEW query (columns directly)
const mockEarthquakeData = [
    { id: 'quake1', magnitude: 3.0, event_time: 1672531200000, longitude: -122.7, latitude: 38.8, depth: 5.0, place: 'Test Location' },
    { id: 'quake2', magnitude: 3.2, event_time: 1672531260000, longitude: -122.71, latitude: 38.81, depth: 5.5, place: 'Test Location' },
    { id: 'quake3', magnitude: 2.8, event_time: 1672531320000, longitude: -122.69, latitude: 38.79, depth: 4.8, place: 'Test Location' },
  ];

const mockCluster = {
    id: 'test-cluster',
    earthquakeIds: ['quake1', 'quake2', 'quake3'],
  };

describe('process-cluster-definitions scheduled worker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should fetch recent earthquakes, calculate clusters, and cache the results', async () => {
    const env = createMockEnv();
    const mockDb = env.DB;
    const mockKv = env.CLUSTER_KV;

    mockDb.prepare.mockImplementation((query) => {
        if (query.includes('FROM EarthquakeEvents')) {
          return {
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: mockEarthquakeData }),
          };
        }
        if (query.includes('FROM ClusterDefinitions')) {
            return {
                bind: vi.fn().mockReturnThis(),
                all: vi.fn().mockResolvedValue({ results: [mockCluster] }),
              };
        }
        const statement = {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(undefined),
            run: vi.fn().mockResolvedValue({}),
            all: vi.fn().mockResolvedValue({ results: [] }),
          };
        return statement;
      });

    await worker.scheduled(null, env, {});

    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('FROM EarthquakeEvents WHERE event_time > ?'));
    expect(mockKv.put).toHaveBeenCalledWith(
        'active_clusters',
        JSON.stringify([mockCluster]),
        { expirationTtl: 3600 }
      );
  });
});
