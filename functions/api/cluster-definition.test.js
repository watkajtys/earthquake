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
    const baseTime = Date.now();
    const validClusterData = {
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
    };

    it('should store valid cluster definition in D1 and return 201', async () => {
      const request = new Request('http://localhost/api/cluster-definition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validClusterData),
      });
      const context = createMockContext(request);
      // Simulate storeClusterDefinition success (which is called by the endpoint)
      // The endpoint itself doesn't directly call mockDB.run for INSERT anymore.
      // We are testing the endpoint's validation and response based on storeClusterDefinition's mocked behavior.
      // For this test, we assume storeClusterDefinition works (tested elsewhere or implicitly via this if not mocked).
      // The MSW handler for POST /api/cluster-definition already provides a 201 for valid body.
      // This unit test should verify the endpoint correctly calls storeClusterDefinition.
      // However, since storeClusterDefinition is imported and used directly, we'd need to mock it
      // if we want to isolate the onRequest handler logic. For now, let's assume it passes data correctly.
      // The endpoint itself creates the SQL and binds params.

      mockDB.run.mockResolvedValueOnce({ success: true }); // Mock D1 run success from within the endpoint

      const response = await onRequest(context);
      expect(response.status).toBe(201);
      const responseText = await response.text();
      // The response text changed in the implementation to be more generic
      expect(responseText).toBe(`Cluster definition for ${validClusterData.id} registered/updated successfully.`);

      // Adjusted to match the exact string format from the implementation, including leading/trailing spaces if any from the template literal.
      // To avoid whitespace issues with template literals in tests, construct the string line by line or use .trim() carefully.
      // The actual query in cluster-definition.js is a multi-line template literal.
      // The key is the exact string value passed to env.DB.prepare().
      const expectedSqlParts = [
        'INSERT OR REPLACE INTO ClusterDefinitions',
        '(id, slug, strongestQuakeId, earthquakeIds, title, description, locationName,',
        'maxMagnitude, meanMagnitude, minMagnitude, depthRange, centroidLat, centroidLon,',
        'radiusKm, startTime, endTime, durationHours, quakeCount, significanceScore, version)',
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ];
      // This reconstruction attempts to match the likely formatting after JS template literal processing
      // where common leading whitespace on subsequent lines is removed.
      // The implementation string is:
      // `INSERT OR REPLACE INTO ClusterDefinitions
      //    (id, slug, ...)
      //    VALUES (?, ...)`
      // The `         ` (9 spaces) on the (id, slug...) line and VALUES line is the common indent.
      // So, effectively these lines start with no indent relative to the content block.
      // The most reliable way is often to see the exact string from a console.log in the implementation if issues persist.
      // Based on the last diff: `+        (id, slug...` (8 spaces), it implies the internal processing
      // or the way the string is captured results in that specific indentation.
      // Let's try to match the actual implementation more directly.
      // Using a normalized string comparison to avoid whitespace issues.
      const expectedSqlBase = `
        INSERT OR REPLACE INTO ClusterDefinitions
         (id, slug, strongestQuakeId, earthquakeIds, title, description, locationName,
          maxMagnitude, meanMagnitude, minMagnitude, depthRange, centroidLat, centroidLon,
          radiusKm, startTime, endTime, durationHours, quakeCount, significanceScore, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const normalizeSql = (sql) => sql.replace(/\s+/g, ' ').trim();
      const expectedNormalizedSql = normalizeSql(expectedSqlBase);

      // Check if prepare was called, then check the argument with normalized comparison
      expect(mockDB.prepare).toHaveBeenCalled();
      const actualSqlReceived = mockDB.prepare.mock.calls[0][0];
      expect(normalizeSql(actualSqlReceived)).toBe(expectedNormalizedSql);

      expect(mockDB.bind).toHaveBeenCalledWith(
        validClusterData.id,
        validClusterData.slug,
        validClusterData.strongestQuakeId,
        JSON.stringify(validClusterData.earthquakeIds),
        validClusterData.title,
        validClusterData.description,
        validClusterData.locationName,
        validClusterData.maxMagnitude,
        validClusterData.meanMagnitude,
        validClusterData.minMagnitude,
        validClusterData.depthRange,
        validClusterData.centroidLat,
        validClusterData.centroidLon,
        validClusterData.radiusKm,
        validClusterData.startTime,
        validClusterData.endTime,
        validClusterData.durationHours,
        validClusterData.quakeCount,
        validClusterData.significanceScore,
        validClusterData.version
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
      const error = new Error("D1 run failed");
      mockDB.run.mockRejectedValueOnce(error); // D1 run fails

      const response = await onRequest(context);
      expect(response.status).toBe(500);
      expect(await response.text()).toBe('Failed to store cluster definition: ' + error.message);
    });
  });

  describe('GET requests', () => {
    const clusterId = 'testClusterGet123';
    const now = Date.now();
    // This represents the raw row from D1
    const dbRow = {
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
    // This represents the final API response after parsing earthquakeIds
    const expectedResponseData = {
      ...dbRow,
      earthquakeIds: ['eqA', 'eqB'], // Parsed to an array
    };

    it('should retrieve and return cluster definition from D1 if found', async () => {
      const request = new Request(`http://localhost/api/cluster-definition?id=${clusterId}`, { method: 'GET' });
      const context = createMockContext(request);
      mockDB.first.mockResolvedValueOnce(dbRow);

      const response = await onRequest(context);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(await response.json()).toEqual(expectedResponseData);

      const expectedQuery = `SELECT id, slug, strongestQuakeId, earthquakeIds, title, description, locationName,
                maxMagnitude, meanMagnitude, minMagnitude, depthRange, centroidLat, centroidLon,
                radiusKm, startTime, endTime, durationHours, quakeCount, significanceScore,
                version, createdAt, updatedAt
         FROM ClusterDefinitions WHERE id = ?`;
      expect(mockDB.prepare).toHaveBeenCalledWith(expectedQuery);
      expect(mockDB.bind).toHaveBeenCalledWith(clusterId);
      expect(mockDB.first).toHaveBeenCalledTimes(1);
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
      mockDB.first.mockResolvedValueOnce(null); // D1 returns null if not found

      const response = await onRequest(context);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(`Cluster definition for id nonexistent${clusterId} not found.`);
    });

    it('should return 500 if D1 select fails', async () => {
      const request = new Request(`http://localhost/api/cluster-definition?id=${clusterId}`, { method: 'GET' });
      const context = createMockContext(request);
      const error = new Error("D1 select failed");
      mockDB.first.mockRejectedValueOnce(error);

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
