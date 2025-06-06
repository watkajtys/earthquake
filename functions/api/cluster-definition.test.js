import { onRequest } from './cluster-definition'; // Assuming default export or named export
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Helper to create mock context
const createMockContext = (request, env = {}) => {
  return {
    request,
    env: {
      CLUSTER_KV: {
        get: vi.fn(),
        put: vi.fn(),
      },
      ...env,
    },
    // waitUntil and other properties can be added if needed by the function
  };
};

describe('Cluster Definition API (/api/cluster-definition)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('POST requests', () => {
    const validClusterData = {
      clusterId: 'testCluster123',
      earthquakeIds: ['eq1', 'eq2', 'eq3'],
      strongestQuakeId: 'eq2',
    };

    it('should store valid cluster definition and return 201', async () => {
      const request = new Request('http://localhost/api/cluster-definition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validClusterData),
      });
      const context = createMockContext(request);
      context.env.CLUSTER_KV.put.mockResolvedValueOnce(undefined);

      const response = await onRequest(context);
      expect(response.status).toBe(201);
      const responseText = await response.text();
      expect(responseText).toBe(`Cluster definition for ${validClusterData.clusterId} registered successfully.`);

      const expectedStoredValue = JSON.stringify({
        earthquakeIds: validClusterData.earthquakeIds,
        strongestQuakeId: validClusterData.strongestQuakeId,
      });
      expect(context.env.CLUSTER_KV.put).toHaveBeenCalledWith(validClusterData.clusterId, expectedStoredValue);
    });

    it('should return 400 for invalid JSON payload', async () => {
      const request = new Request('http://localhost/api/cluster-definition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid json',
      });
      const context = createMockContext(request);
      const response = await onRequest(context);
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Invalid JSON payload.');
    });

    it('should return 400 if clusterId is missing', async () => {
      const { clusterId, ...data } = validClusterData; // Create data without clusterId
      const request = new Request('http://localhost/api/cluster-definition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const context = createMockContext(request);
      const response = await onRequest(context);
      expect(response.status).toBe(400);
      expect(await response.text()).toContain('Missing required fields');
    });

    it('should return 400 if earthquakeIds is not an array', async () => {
      const invalidData = { ...validClusterData, earthquakeIds: "not-an-array" };
      const request = new Request('http://localhost/api/cluster-definition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData),
      });
      const context = createMockContext(request);
      const response = await onRequest(context);
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Invalid cluster data: earthquakeIds must be an array.');
    });

    it('should return 400 if clusterId is not a string', async () => {
      const invalidData = { ...validClusterData, clusterId: 123 };
      const request = new Request('http://localhost/api/cluster-definition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData),
      });
      const context = createMockContext(request);
      const response = await onRequest(context);
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Invalid cluster data: clusterId and strongestQuakeId must be strings.');
    });

    it('should return 500 if KV put fails', async () => {
      const request = new Request('http://localhost/api/cluster-definition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validClusterData),
      });
      const context = createMockContext(request);
      const error = new Error("KV put failed");
      context.env.CLUSTER_KV.put.mockRejectedValueOnce(error);

      const response = await onRequest(context);
      expect(response.status).toBe(500);
      expect(await response.text()).toBe('Failed to process request: ' + error.message);
    });
  });

  describe('GET requests', () => {
    const clusterId = 'testClusterGet123';
    const storedData = {
      earthquakeIds: ['eqA', 'eqB'],
      strongestQuakeId: 'eqA',
    };
    const storedDataString = JSON.stringify(storedData);

    it('should retrieve and return cluster definition if found', async () => {
      const request = new Request(`http://localhost/api/cluster-definition?id=${clusterId}`, { method: 'GET' });
      const context = createMockContext(request);
      context.env.CLUSTER_KV.get.mockResolvedValueOnce(storedDataString);

      const response = await onRequest(context);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(await response.json()).toEqual(storedData);
      expect(context.env.CLUSTER_KV.get).toHaveBeenCalledWith(clusterId);
    });

    it('should return 400 if clusterId query parameter is missing', async () => {
      const request = new Request('http://localhost/api/cluster-definition', { method: 'GET' });
      const context = createMockContext(request);
      const response = await onRequest(context);
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Missing clusterId query parameter.');
    });

    it('should return 404 if cluster definition is not found', async () => {
      const request = new Request(`http://localhost/api/cluster-definition?id=nonexistent${clusterId}`, { method: 'GET' });
      const context = createMockContext(request);
      context.env.CLUSTER_KV.get.mockResolvedValueOnce(null);

      const response = await onRequest(context);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(`Cluster definition for nonexistent${clusterId} not found.`);
    });

    it('should return 500 if KV get fails', async () => {
      const request = new Request(`http://localhost/api/cluster-definition?id=${clusterId}`, { method: 'GET' });
      const context = createMockContext(request);
      const error = new Error("KV get failed");
      context.env.CLUSTER_KV.get.mockRejectedValueOnce(error);

      const response = await onRequest(context);
      expect(response.status).toBe(500);
      expect(await response.text()).toBe('Failed to process request: ' + error.message);
    });
  });

  describe('Other HTTP methods', () => {
    it('should return 405 for PUT request', async () => {
      const request = new Request('http://localhost/api/cluster-definition', { method: 'PUT' });
      const context = createMockContext(request);
      const response = await onRequest(context);
      expect(response.status).toBe(405);
      expect(await response.text()).toBe('Method PUT Not Allowed');
      expect(response.headers.get('Allow')).toBe('POST, GET');
    });

    it('should return 405 for DELETE request', async () => {
      const request = new Request('http://localhost/api/cluster-definition', { method: 'DELETE' });
      const context = createMockContext(request);
      const response = await onRequest(context);
      expect(response.status).toBe(405);
      expect(await response.text()).toBe('Method DELETE Not Allowed');
      expect(response.headers.get('Allow')).toBe('POST, GET');
    });
  });
});
