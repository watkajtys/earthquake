import { onRequest } from './cluster-definition';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the d1ClusterUtils module
vi.mock('../utils/d1ClusterUtils.js', () => ({
  storeClusterDefinition: vi.fn(),
}));
// Import the mocked function AFTER vi.mock has been called
import { storeClusterDefinition } from '../utils/d1ClusterUtils.js';


// Helper to create mock context
// No longer need to mock individual DB methods here if storeClusterDefinition is mocked
const mockDBInstance = {
  // We might still need a placeholder DB object if other parts of the code expect env.DB to exist
  // but its methods (prepare, bind, run, first) won't be called by the POST handler directly.
  // For GET requests, these will still be used.
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  first: vi.fn(),
  run: vi.fn(), // Keep for GET if needed, or if other tests in this file use it.
};


const createMockContext = (request, env = {}) => {
  // Reset specific D1 method mocks if they are used by GET requests in this file
  mockDBInstance.prepare.mockReset().mockReturnThis();
  mockDBInstance.bind.mockReset().mockReturnThis();
  mockDBInstance.first.mockReset();
  // storeClusterDefinition is reset in beforeEach of the describe block

  return {
    request,
    env: {
      DB: mockDBInstance,
      ...env,
    },
  };
};

describe('Cluster Definition API (/api/cluster-definition)', () => {
  beforeEach(() => {
    vi.resetAllMocks(); // Resets all mocks, including storeClusterDefinition
    // If storeClusterDefinition needs specific default behavior for all tests, set it here.
    // e.g., storeClusterDefinition.mockResolvedValue({ success: true, id: 'default-mock-id' });
  });

  describe('POST requests', () => {
    let baseTime; // Will be set in beforeEach of this describe block
    let validClusterData;

    beforeEach(() => {
      baseTime = Date.now(); // Ensure consistent time for each test run
      // Define validClusterData here to use the fresh baseTime
      validClusterData = {
        id: 'testClusterPost123',
        slug: 'test-cluster-post-123',
        strongestQuakeId: 'eq2',
        earthquakeIds: ['eq1', 'eq2', 'eq3'],
        title: 'Test Cluster Title',
        description: 'A test cluster description.',
        locationName: 'Test Location',
        maxMagnitude: 5.5,
        meanMagnitude: 4.5,
        minMagnitude: 3.5,
        depthRange: '5-15km',
        centroidLat: 34.0522,
        centroidLon: -118.2437,
        radiusKm: 50,
        startTime: baseTime - 3600000, // 1 hour ago
        endTime: baseTime,
        durationHours: 1.0,
        quakeCount: 3,
        significanceScore: 100,
        version: 1,
        // No createdAt, updatedAt here, storeClusterDefinition adds updatedAt
      };
       // Reset specific mocks for POST requests if necessary, or rely on global beforeEach
      storeClusterDefinition.mockReset();
    });


    it('should store valid cluster definition and return 201', async () => {
      const request = new Request('http://localhost/api/cluster-definition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validClusterData),
      });
      const context = createMockContext(request);

      // Mock the behavior of the imported storeClusterDefinition utility
      storeClusterDefinition.mockResolvedValueOnce({ success: true, id: validClusterData.id });

      const response = await onRequest(context);
      expect(response.status).toBe(201);
      const responseText = await response.text();
      expect(responseText).toBe(`Cluster definition for ${validClusterData.id} registered/updated successfully.`);

      // Verify that storeClusterDefinition was called correctly
      // The actual validClusterData passed to storeClusterDefinition will have 'updatedAt' added by the utility itself,
      // but the endpoint calls it with the original payload.
      // The endpoint itself does not add `updatedAt` before calling `storeClusterDefinition`.
      // `storeClusterDefinition` adds `updatedAt` internally.
      // So, we expect the endpoint to call `storeClusterDefinition` with the payload as it received it (after its own validation).
      expect(storeClusterDefinition).toHaveBeenCalledWith(context.env.DB, validClusterData);
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
      const { id: _id, ...data } = validClusterData; // Create data without id
      const request = new Request('http://localhost/api/cluster-definition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const context = createMockContext(request);
      const response = await onRequest(context);
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Invalid cluster data provided. Missing required field: id.');
    });

    it('should return 400 if earthquakeIds is not an array', async () => {
      const invalidData = { ...validClusterData, earthquakeIds: "not-an-array" }; // id is present
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

    it('should return 400 if id is not a string', async () => {
      const invalidData = { ...validClusterData, id: 123 };
      const request = new Request('http://localhost/api/cluster-definition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData),
      });
      const context = createMockContext(request);
      const response = await onRequest(context);
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Invalid cluster data: id must be a string.');
    });

    it('should return 500 if D1 run fails (simulating storeClusterDefinition failure)', async () => {
      const request = new Request('http://localhost/api/cluster-definition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validClusterData),
      });
      const context = createMockContext(request);
      const storeError = new Error("Simulated D1 storage failure from utility");
      // Mock storeClusterDefinition to simulate a failure from the utility
      storeClusterDefinition.mockResolvedValueOnce({ success: false, error: storeError.message });

      const response = await onRequest(context);
      expect(response.status).toBe(500);
      // The endpoint returns the error message directly from the storeResult.error
      expect(await response.text()).toBe(storeError.message);
      expect(storeClusterDefinition).toHaveBeenCalledWith(context.env.DB, validClusterData);
    });
  });

  describe('GET requests', () => {
    const clusterId = 'testClusterGet123';
    let now; // Define now inside beforeEach for consistency per test
    // This represents the raw row from D1
    let dbRow;
    let expectedResponseData;

    beforeEach(() => {
      now = Date.now(); // Set 'now' for each test in this block
      dbRow = {
        id: clusterId,
        slug: `test-cluster-${clusterId}`,
        strongestQuakeId: 'eqA',
        earthquakeIds: JSON.stringify(['eqA', 'eqB']), // Stored as JSON string in DB
        title: 'Test Cluster for GET',
        description: 'Description for test cluster GET.',
        locationName: 'Test Location GET',
        maxMagnitude: 6.1,
        meanMagnitude: 5.0,
        minMagnitude: 4.1,
        depthRange: '10-20km',
        centroidLat: 35.123,
        centroidLon: -119.456,
        radiusKm: 25,
        startTime: now - 7200000, // 2 hours ago
        endTime: now - 3600000,   // 1 hour ago
        durationHours: 1.0,
        quakeCount: 2,
        significanceScore: 200,
        version: 2,
        createdAt: new Date(now - 10800000).toISOString(), // 3 hours ago
        updatedAt: new Date(now - 3600000).toISOString(),  // 1 hour ago
      };
      expectedResponseData = {
        ...dbRow,
        earthquakeIds: ['eqA', 'eqB'], // Parsed to an array
      };
    });

    it('should retrieve and return cluster definition from D1 if found', async () => {
      const request = new Request(`http://localhost/api/cluster-definition?id=${clusterId}`, { method: 'GET' });
      const context = createMockContext(request);
      mockDBInstance.first.mockResolvedValueOnce(dbRow); // Use mockDBInstance

      const response = await onRequest(context);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(await response.json()).toEqual(expectedResponseData);

      const expectedQuery = `SELECT id, stableKey, slug, strongestQuakeId, earthquakeIds, title, description, locationName,
                maxMagnitude, meanMagnitude, minMagnitude, depthRange, centroidLat, centroidLon,
                radiusKm, startTime, endTime, durationHours, quakeCount, significanceScore,
                version, createdAt, updatedAt
         FROM ClusterDefinitions WHERE id = ?`;
      expect(mockDBInstance.prepare).toHaveBeenCalledWith(expectedQuery); // Use mockDBInstance
      expect(mockDBInstance.bind).toHaveBeenCalledWith(clusterId);     // Use mockDBInstance
      expect(mockDBInstance.first).toHaveBeenCalledTimes(1);    // Use mockDBInstance
    });

    it('should return 400 if id query parameter is missing', async () => {
      const request = new Request('http://localhost/api/cluster-definition', { method: 'GET' });
      const context = createMockContext(request);
      const response = await onRequest(context);
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Missing id query parameter.');
    });

    it('should return 404 if cluster definition is not found', async () => {
      const request = new Request(`http://localhost/api/cluster-definition?id=nonexistent${clusterId}`, { method: 'GET' });
      const context = createMockContext(request);
      mockDBInstance.first.mockResolvedValueOnce(null); // Use mockDBInstance

      const response = await onRequest(context);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(`Cluster definition for id nonexistent${clusterId} not found.`);
    });

    it('should return 500 if D1 select fails', async () => {
      const request = new Request(`http://localhost/api/cluster-definition?id=${clusterId}`, { method: 'GET' });
      const context = createMockContext(request);
      const error = new Error("D1 select failed");
      mockDBInstance.first.mockRejectedValueOnce(error); // Use mockDBInstance

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
