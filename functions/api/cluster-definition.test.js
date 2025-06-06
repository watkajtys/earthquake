import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
// The function to test is not exported directly from its own file,
// but is part of usgs-proxy.js. We need to call `onRequest` and route to it.
// Or, if possible, refactor usgs-proxy.js to export handleClusterDefinitionRequest for easier testing.
// For now, we will test it via onRequest by setting the correct pathname.
import { onRequest } from './usgs-proxy'; // Assuming this is the entry point

// Mock Cloudflare Workers globals
global.fetch = vi.fn();

const mockCache = {
  match: vi.fn(),
  put: vi.fn().mockResolvedValue(undefined),
};
global.caches = {
  default: mockCache,
};

// Simplified Request and Response mocks for these tests
global.Request = vi.fn().mockImplementation((urlOrRequest, options) => {
  if (typeof urlOrRequest === 'string') {
    const url = new URL(urlOrRequest);
    return {
      url: urlOrRequest,
      method: options?.method || 'GET',
      headers: new Headers(options?.headers || {}),
      json: options?.body ? vi.fn().mockResolvedValue(JSON.parse(options.body)) : vi.fn().mockResolvedValue({}),
      text: options?.body ? vi.fn().mockResolvedValue(options.body) : vi.fn().mockResolvedValue(''),
      clone: vi.fn().mockReturnThis(),
      searchParams: url.searchParams, // For GET requests with query params
      ...options
    };
  }
  // If urlOrRequest is an object (e.g. another Request)
  const url = new URL(urlOrRequest.url);
  return {
    ...urlOrRequest,
    headers: new Headers(urlOrRequest.headers || {}),
    json: urlOrRequest.body ? vi.fn().mockResolvedValue(JSON.parse(urlOrRequest.body)) : vi.fn().mockResolvedValue({}),
    text: urlOrRequest.body ? vi.fn().mockResolvedValue(urlOrRequest.body) : vi.fn().mockResolvedValue(''),
    clone: vi.fn().mockReturnThis(),
    searchParams: url.searchParams,
  };
});


global.Response = vi.fn().mockImplementation((body, init) => {
  let currentBody = body;
  const response = {
    ok: init?.status ? (init.status >= 200 && init.status < 300) : true,
    status: init?.status || 200,
    statusText: init?.statusText || 'OK',
    headers: new Headers(init?.headers || {}),
    clone: vi.fn(() => {
      const clonedResponse = { ...response, body: currentBody };
      clonedResponse.json = vi.fn(async () => JSON.parse(currentBody));
      clonedResponse.text = vi.fn(async () => String(currentBody));
      return clonedResponse;
    }),
    json: vi.fn(async () => {
      try {
        return JSON.parse(currentBody);
      } catch (e) {
        // Handle cases where body might not be JSON or is null/undefined
        if (typeof currentBody === 'string') throw e; // rethrow if it was a string and failed
        return currentBody; // return as is if not a string (e.g. already an object from test setup)
      }
    }),
    text: vi.fn(async () => String(currentBody)),
  };
  return response;
});


// Mock KV store
const mockKvStore = {
  put: vi.fn(),
  get: vi.fn(),
};

let mockContext;

describe('handleClusterDefinitionRequest', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      // request will be set per test, ensuring headers are correctly mocked
      env: {
        CLUSTER_KV: mockKvStore,
      },
      waitUntil: vi.fn((promise) => Promise.resolve(promise)),
    };

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  // Helper to create a mock request for POST
  const createPostRequest = (body, headers = { 'Content-Type': 'application/json', 'User-Agent': 'test-agent' }) => {
    const url = 'http://localhost/api/cluster-definition';
    return {
      url,
      method: 'POST',
      headers: new Headers(headers), // Ensure this is a Headers object
      json: async () => JSON.parse(body),
      text: async () => body,
      clone: vi.fn().mockReturnThis(),
      searchParams: new URL(url).searchParams,
    };
  };

  // Helper to create a mock request for GET
  const createGetRequest = (queryParams = '', headers = { 'User-Agent': 'test-agent' }) => {
    const url = `http://localhost/api/cluster-definition${queryParams}`;
    return {
      url,
      method: 'GET',
      headers: new Headers(headers), // Ensure this is a Headers object
      clone: vi.fn().mockReturnThis(),
      json: async () => ({}), // GET typically doesn't have a body to parse
      text: async () => '',
      searchParams: new URL(url).searchParams,
    };
  };

  describe('POST requests', () => {
    const validClusterData = {
      clusterId: "testCluster123",
      earthquakeIds: ["id1", "id2", "id3"],
      strongestQuakeId: "id2"
    };

    it('should create a cluster successfully and return 201', async () => {
      mockContext.request = createPostRequest(JSON.stringify(validClusterData));
      mockKvStore.put.mockResolvedValue(undefined);

      const response = await onRequest(mockContext);
      const responseBody = await response.json();

      expect(response.status).toBe(201);
      expect(responseBody.status).toBe('success');
      expect(responseBody.message).toBe('Cluster definition stored.');
      expect(mockKvStore.put).toHaveBeenCalledTimes(1);
      // Optional: Check what was put into KV - first arg is key, second is value
      const putArgs = mockKvStore.put.mock.calls[0];
      expect(putArgs[0]).toBe(validClusterData.clusterId);
      const storedValue = JSON.parse(putArgs[1]);
      expect(storedValue.earthquakeIds).toEqual(validClusterData.earthquakeIds);
      expect(storedValue.strongestQuakeId).toBe(validClusterData.strongestQuakeId);
      expect(storedValue.updatedAt).toBeDefined();
      // Optional: Check TTL (third arg to put)
      // Default TTL is 6 hours (21600 seconds)
      expect(putArgs[2]).toEqual({ expirationTtl: 21600 });
    });

    it('should use CLUSTER_DEFINITION_TTL_SECONDS from env if valid', async () => {
        mockContext.env.CLUSTER_DEFINITION_TTL_SECONDS = "3600"; // 1 hour
        mockContext.request = createPostRequest(JSON.stringify(validClusterData));
        mockKvStore.put.mockResolvedValue(undefined);
        await onRequest(mockContext);
        const putArgs = mockKvStore.put.mock.calls[0];
        expect(putArgs[2]).toEqual({ expirationTtl: 3600 });
        expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should use default TTL and warn if CLUSTER_DEFINITION_TTL_SECONDS is invalid', async () => {
        mockContext.env.CLUSTER_DEFINITION_TTL_SECONDS = "invalid";
        mockContext.request = createPostRequest(JSON.stringify(validClusterData));
        mockKvStore.put.mockResolvedValue(undefined);
        await onRequest(mockContext);
        const putArgs = mockKvStore.put.mock.calls[0];
        expect(putArgs[2]).toEqual({ expirationTtl: 21600 }); // Default
        expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid CLUSTER_DEFINITION_TTL_SECONDS value: "invalid". Using default: 21600s.');
    });


    const invalidPostTestCases = [
      { name: 'missing clusterId', data: { earthquakeIds: ["id1"], strongestQuakeId: "id1" }, expectedMsg: "Missing or invalid parameters for POST" },
      { name: 'missing earthquakeIds', data: { clusterId: "c1", strongestQuakeId: "id1" }, expectedMsg: "Missing or invalid parameters for POST" },
      { name: 'missing strongestQuakeId', data: { clusterId: "c1", earthquakeIds: ["id1"] }, expectedMsg: "Missing or invalid parameters for POST" },
      { name: 'earthquakeIds not an array', data: { clusterId: "c1", earthquakeIds: "not-an-array", strongestQuakeId: "id1" }, expectedMsg: "Missing or invalid parameters for POST" },
      { name: 'earthquakeIds is empty array', data: { clusterId: "c1", earthquakeIds: [], strongestQuakeId: "id1" }, expectedMsg: "Missing or invalid parameters for POST" },
      // clusterId and strongestQuakeId type checks are not explicitly in the code, but usually implied by usage or schema.
      // The current code doesn't strictly check for string types for these, but it's good practice.
      // If the function were stricter, these tests would be more relevant:
      // { name: 'clusterId not a string', data: { clusterId: 123, earthquakeIds: ["id1"], strongestQuakeId: "id1" }, expectedMsg: "Missing or invalid parameters for POST" },
    ];

    invalidPostTestCases.forEach(tc => {
      it(`should return 400 for invalid data: ${tc.name}`, async () => {
        mockContext.request = createPostRequest(JSON.stringify(tc.data));
        const response = await onRequest(mockContext);
        const responseBody = await response.json();

        expect(response.status).toBe(400);
        expect(responseBody.status).toBe('error');
        expect(responseBody.message).toBe(tc.expectedMsg);
        expect(mockKvStore.put).not.toHaveBeenCalled();
      });
    });

    it('should return 400 for invalid JSON payload', async () => {
      const invalidJsonBody = '{"bad JSON",,,}';
      mockContext.request = { // Directly create the request object for this specific case
        url: 'http://localhost/api/cluster-definition',
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json', 'User-Agent': 'test-agent' }),
        json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token , in JSON at position 11")), // Simulate request.json() throwing
        text: async () => invalidJsonBody,
        clone: vi.fn().mockReturnThis(),
        searchParams: new URL('http://localhost/api/cluster-definition').searchParams,
      };

      const response = await onRequest(mockContext);
      const responseBody = await response.json();

      expect(response.status).toBe(500); // Or 400 depending on how error is caught. The current code catches as 500.
      expect(responseBody.status).toBe('error');
      // The message includes the error from JSON.parse:
      expect(responseBody.message).toContain("Error processing request: Unexpected token");
      expect(mockKvStore.put).not.toHaveBeenCalled();
    });

    it('should return 500 if env.CLUSTER_KV is not configured', async () => {
        mockContext.env.CLUSTER_KV = undefined; // Simulate KV not configured
        mockContext.request = createPostRequest(JSON.stringify(validClusterData));
        const response = await onRequest(mockContext);
        const responseBody = await response.json();

        expect(response.status).toBe(500);
        expect(responseBody.status).toBe('error');
        expect(responseBody.message).toBe('KV store not configured');
    });


    it('should return 500 if CLUSTER_KV.put throws an error', async () => {
      mockContext.request = createPostRequest(JSON.stringify(validClusterData));
      const putError = new Error("KV Put Failed");
      mockKvStore.put.mockRejectedValue(putError);

      const response = await onRequest(mockContext);
      const responseBody = await response.json();

      expect(response.status).toBe(500);
      expect(responseBody.status).toBe('error');
      expect(responseBody.message).toBe('Error processing request: KV Put Failed');
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error processing POST for cluster definition:", putError);
    });
  });

  describe('GET requests', () => {
    const clusterId = "testClusterGet123";
    const storedValue = {
      earthquakeIds: ["idA", "idB"],
      strongestQuakeId: "idA",
      updatedAt: new Date().toISOString()
    };

    it('should retrieve a cluster successfully and return 200', async () => {
      mockContext.request = createGetRequest(`?id=${clusterId}`);
      mockKvStore.get.mockResolvedValue(JSON.stringify(storedValue));

      const response = await onRequest(mockContext);
      const responseBody = await response.json();

      expect(response.status).toBe(200);
      expect(responseBody).toEqual(storedValue);
      expect(mockKvStore.get).toHaveBeenCalledTimes(1);
      expect(mockKvStore.get).toHaveBeenCalledWith(clusterId);
    });

    it('should return 404 if cluster not found (KV.get returns null)', async () => {
      mockContext.request = createGetRequest(`?id=${clusterId}`);
      mockKvStore.get.mockResolvedValue(null);

      const response = await onRequest(mockContext);
      const responseBody = await response.json();

      expect(response.status).toBe(404);
      expect(responseBody.status).toBe('error');
      expect(responseBody.message).toBe('Cluster definition not found.');
      expect(mockKvStore.get).toHaveBeenCalledWith(clusterId);
    });

    it('should return 400 if "id" query parameter is missing', async () => {
      mockContext.request = createGetRequest(); // No id query param
      const response = await onRequest(mockContext);
      const responseBody = await response.json();

      expect(response.status).toBe(400);
      expect(responseBody.status).toBe('error');
      expect(responseBody.message).toBe("Missing 'id' query parameter for GET");
      expect(mockKvStore.get).not.toHaveBeenCalled();
    });

    it('should return 500 if env.CLUSTER_KV is not configured', async () => {
        mockContext.env.CLUSTER_KV = undefined; // Simulate KV not configured
        mockContext.request = createGetRequest(`?id=${clusterId}`);
        const response = await onRequest(mockContext);
        const responseBody = await response.json();

        expect(response.status).toBe(500);
        expect(responseBody.status).toBe('error');
        expect(responseBody.message).toBe('KV store not configured');
    });


    it('should return 500 if CLUSTER_KV.get throws an error', async () => {
      mockContext.request = createGetRequest(`?id=${clusterId}`);
      const getError = new Error("KV Get Failed");
      mockKvStore.get.mockRejectedValue(getError);

      const response = await onRequest(mockContext);
      const responseBody = await response.json();

      expect(response.status).toBe(500);
      expect(responseBody.status).toBe('error');
      expect(responseBody.message).toBe('Error processing request: KV Get Failed');
      expect(mockKvStore.get).toHaveBeenCalledWith(clusterId);
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error processing GET for cluster definition:", getError);
    });
  });

  describe('Other HTTP methods', () => {
    ['PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'].forEach(method => {
      it(`should return 405 for ${method} requests`, async () => {
        const url = 'http://localhost/api/cluster-definition';
        mockContext.request = { // Manually create for these methods
            url,
            method,
            headers: new Headers({ 'User-Agent': 'test-agent'}),
            clone: vi.fn().mockReturnThis(),
            json: async () => ({}),
            text: async () => '',
            searchParams: new URL(url).searchParams,
        };
        const response = await onRequest(mockContext);
        const responseBody = await response.json();

        expect(response.status).toBe(405);
        expect(responseBody.status).toBe('error');
        expect(responseBody.message).toBe('Method not allowed');
        expect(mockKvStore.put).not.toHaveBeenCalled();
        expect(mockKvStore.get).not.toHaveBeenCalled();
      });
    });
  });
});
