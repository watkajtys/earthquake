import { onRequest } from './cluster-definition'; // Assuming default export or named export
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Helper to create mock context
const mockDB = {
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  run: vi.fn(),
  first: vi.fn(),
};

const createMockContext = (request, env = {}) => {
  // Reset mocks for DB methods that might be chained
  mockDB.prepare = vi.fn().mockReturnThis();
  mockDB.bind = vi.fn().mockReturnThis();
  mockDB.run = vi.fn();
  mockDB.first = vi.fn();

  return {
    request,
    env: {
      DB: mockDB, // Use the mockDB for D1 interactions
      // CLUSTER_KV: { // Keep CLUSTER_KV if other parts of tests still use it, or remove
      //   get: vi.fn(),
      //   put: vi.fn(),
      // },
      ...env, // Allow overriding DB or adding other env vars
    },
    // waitUntil and other properties can be added if needed by the function
  };
};

describe('Cluster Definition API (/api/cluster-definition)', () => {
  beforeEach(() => {
    // vi.resetAllMocks(); // This might be too broad if mockDB setup is complex.
    // Instead, specific mocks are reset in createMockContext or per test.
  });

  describe('POST requests', () => {
    const validClusterData = {
      clusterId: 'testCluster123',
      earthquakeIds: ['eq1', 'eq2', 'eq3'],
      strongestQuakeId: 'eq2',
    };

    it('should store valid cluster definition in D1 and return 201', async () => {
      const request = new Request('http://localhost/api/cluster-definition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validClusterData),
      });
      const context = createMockContext(request);
      mockDB.run.mockResolvedValueOnce({ success: true }); // Mock D1 run success

      const response = await onRequest(context);
      expect(response.status).toBe(201);
      const responseText = await response.text();
      expect(responseText).toBe(`Cluster definition for ${validClusterData.clusterId} registered/updated successfully in D1.`);

      expect(mockDB.prepare).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO ClusterDefinitions (clusterId, earthquakeIds, strongestQuakeId, updatedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
      );
      expect(mockDB.bind).toHaveBeenCalledWith(
        validClusterData.clusterId,
        JSON.stringify(validClusterData.earthquakeIds),
        validClusterData.strongestQuakeId
      );
      expect(mockDB.run).toHaveBeenCalledTimes(1);
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
      const error = new Error("D1 insert failed");
      // mockDB.prepare.mockReturnThis(); // ensure chaining works before error
      // mockDB.bind.mockReturnThis();
      mockDB.run.mockRejectedValueOnce(error);


      const response = await onRequest(context);
      expect(response.status).toBe(500);
      expect(await response.text()).toBe('Failed to process D1 request: ' + error.message);
    });
  });

  describe('GET requests', () => {
    const clusterId = 'testClusterGet123';
    const dbRow = {
      clusterId: clusterId,
      earthquakeIds: JSON.stringify(['eqA', 'eqB']), // D1 returns earthquakeIds as JSON string
      strongestQuakeId: 'eqA',
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
    };
    const expectedResponseData = {
      ...dbRow,
      earthquakeIds: ['eqA', 'eqB'], // Handler parses this to an array
    };

    it('should retrieve and return cluster definition from D1 if found', async () => {
      const request = new Request(`http://localhost/api/cluster-definition?id=${clusterId}`, { method: 'GET' });
      const context = createMockContext(request);
      mockDB.first.mockResolvedValueOnce(dbRow);

      const response = await onRequest(context);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(await response.json()).toEqual(expectedResponseData);

      expect(mockDB.prepare).toHaveBeenCalledWith(
        'SELECT clusterId, earthquakeIds, strongestQuakeId, createdAt, updatedAt FROM ClusterDefinitions WHERE clusterId = ?'
      );
      expect(mockDB.bind).toHaveBeenCalledWith(clusterId);
      expect(mockDB.first).toHaveBeenCalledTimes(1);
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
      mockDB.first.mockResolvedValueOnce(null); // D1 returns null if not found

      const response = await onRequest(context);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(`Cluster definition for nonexistent${clusterId} not found in D1.`);
    });

    it('should return 500 if D1 select fails', async () => {
      const request = new Request(`http://localhost/api/cluster-definition?id=${clusterId}`, { method: 'GET' });
      const context = createMockContext(request);
      const error = new Error("D1 select failed");
      // mockDB.prepare.mockReturnThis();
      // mockDB.bind.mockReturnThis();
      mockDB.first.mockRejectedValueOnce(error);


      const response = await onRequest(context);
      expect(response.status).toBe(500);
      expect(await response.text()).toBe('Failed to process D1 request: ' + error.message);
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
