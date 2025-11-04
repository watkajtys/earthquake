// functions/api/get-clusters.integration.test.js
import { onRequestGet } from './get-clusters';

describe('get-clusters Integration Test', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      CLUSTER_KV: {
        get: vi.fn(),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return cached clusters when they exist in the KV store', async () => {
    const mockClusters = [{ id: 'cluster1', name: 'Test Cluster' }];
    mockEnv.CLUSTER_KV.get.mockResolvedValue(mockClusters);

    const context = { env: mockEnv };
    const response = await onRequestGet(context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('X-Cache-Status')).toBe('Hit');
    expect(data).toEqual(mockClusters);
    expect(mockEnv.CLUSTER_KV.get).toHaveBeenCalledWith('active_clusters', 'json');
  });

  it('should return an empty array when no clusters are in the KV store', async () => {
    mockEnv.CLUSTER_KV.get.mockResolvedValue(null);

    const context = { env: mockEnv };
    const response = await onRequestGet(context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('X-Cache-Status')).toBe('Miss');
    expect(data).toEqual([]);
    expect(mockEnv.CLUSTER_KV.get).toHaveBeenCalledWith('active_clusters', 'json');
  });

  it('should return a 500 error when the KV store throws an exception', async () => {
    const errorMessage = 'KV store is unavailable';
    mockEnv.CLUSTER_KV.get.mockRejectedValue(new Error(errorMessage));

    const context = { env: mockEnv };
    const response = await onRequestGet(context);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(data).toEqual({ error: 'Internal Server Error' });
    expect(mockEnv.CLUSTER_KV.get).toHaveBeenCalledWith('active_clusters', 'json');
  });
});
