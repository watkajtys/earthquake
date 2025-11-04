// functions/api/get-clusters.test.js

import {
  vi,
  describe,
  it,
  expect,
  beforeEach
} from 'vitest';
import {
  onRequestGet
} from './get-clusters.js';

describe('get-clusters API endpoint', () => {
  let context;

  beforeEach(() => {
    context = {
      env: {
        CLUSTER_KV: {
          get: vi.fn(),
        },
      },
    };
  });

  it('should return cached clusters when they exist', async () => {
    const mockClusters = [{
      id: 'cluster-1'
    }];
    context.env.CLUSTER_KV.get.mockResolvedValue(mockClusters);

    const response = await onRequestGet(context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('X-Cache-Status')).toBe('Hit');
    expect(body).toEqual(mockClusters);
  });

  it('should return an empty array when no clusters are cached', async () => {
    context.env.CLUSTER_KV.get.mockResolvedValue(null);

    const response = await onRequestGet(context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('X-Cache-Status')).toBe('Miss');
    expect(body).toEqual([]);
  });

  it('should return a 500 error if there is a problem fetching from KV', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('KV is down');
    context.env.CLUSTER_KV.get.mockRejectedValue(error);

    const response = await onRequestGet(context);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Internal Server Error');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching clusters from KV:', error.message, expect.any(String));
    consoleErrorSpy.mockRestore();
  });
});