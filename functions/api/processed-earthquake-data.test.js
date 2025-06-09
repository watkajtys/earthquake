import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'; // Or 'jest'
import { onRequestGet, onRequest } from './processed-earthquake-data.js';

// Mock environment variables and bindings
const mockEnv = {
  PROCESSED_DATA_KV: {
    get: vi.fn(),
  },
  DB: {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    first: vi.fn(),
  },
};

// Helper to create a mock Request object
const mockRequest = (urlSearch = "") => ({
  url: `http://localhost/api/processed-earthquake-data${urlSearch ? '?' : ''}${urlSearch}`,
  method: "GET",
});

// Store original console methods
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;


describe('API Endpoint: processed-earthquake-data', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockEnv.PROCESSED_DATA_KV.get.mockResolvedValue(null); // Default KV miss
    // Ensure DB mock chain is correctly reset for each test if not using vi.resetAllMocks() to also reset implementations
    mockEnv.DB.prepare.mockReturnValue({ bind: mockEnv.DB.bind.mockReturnValue({ first: mockEnv.DB.first }) });
    mockEnv.DB.first.mockResolvedValue(null); // Default D1 miss

    // Suppress console output during tests by default, can be enabled per test if needed
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
  });

  afterEach(() => {
    // Restore console output functions
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  });

  it('should return data from KV if available', async () => {
    const mockData = { earthquakes: [{ id: 'kv_quake' }], dataFetchTime: Date.now() };
    const mockDataString = JSON.stringify(mockData);
    mockEnv.PROCESSED_DATA_KV.get.mockResolvedValue(mockDataString);

    const request = mockRequest("maxPeriod=7d");
    const response = await onRequestGet({ request, env: mockEnv });
    const responseBody = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('X-Cache-Status')).toBe('hit-kv');
    expect(responseBody).toEqual(mockData);
    expect(mockEnv.PROCESSED_DATA_KV.get).toHaveBeenCalledWith('latest_processed_data_v1_7d');
    expect(mockEnv.DB.first).not.toHaveBeenCalled();
  });

  it('should fall back to D1 if KV misses and D1 has fresh data', async () => {
    const mockD1Data = { earthquakes: [{ id: 'd1_quake' }], dataFetchTime: Date.now() };
    const mockD1DataString = JSON.stringify(mockD1Data);
    const freshTimestamp = Math.floor(Date.now() / 1000) - 100; // 100 seconds ago
    mockEnv.DB.first.mockResolvedValue({ data: mockD1DataString, timestamp: freshTimestamp });

    const request = mockRequest("maxPeriod=30d");
    const response = await onRequestGet({ request, env: mockEnv });
    const responseBody = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Cache-Status')).toBe('hit-d1');
    expect(responseBody).toEqual(mockD1Data);
    expect(mockEnv.PROCESSED_DATA_KV.get).toHaveBeenCalledWith('latest_processed_data_v1_30d');
    expect(mockEnv.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT data, timestamp FROM processed_data WHERE period = ?1'));
    expect(mockEnv.DB.bind).toHaveBeenCalledWith('latest_processed_data_v1_30d');
    expect(mockEnv.DB.first).toHaveBeenCalled();
  });

  it('should return 503 if KV misses and D1 data is stale', async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 600; // 600 seconds ago (D1_CACHE_TTL_SECONDS is 300 in API)
    mockEnv.DB.first.mockResolvedValue({ data: '{}', timestamp: staleTimestamp });

    const request = mockRequest("maxPeriod=24h");
    const response = await onRequestGet({ request, env: mockEnv });
    const responseBody = await response.json();

    expect(response.status).toBe(503);
    expect(responseBody.status).toBe('error');
    expect(responseBody.message).toContain('Processed data for period 24h not yet available');
    expect(mockEnv.PROCESSED_DATA_KV.get).toHaveBeenCalledWith('latest_processed_data_v1_24h');
    expect(mockEnv.DB.first).toHaveBeenCalled();
  });

  it('should return 503 if KV misses and D1 also misses', async () => {
    // Mocks already default to KV and D1 miss in beforeEach
    const request = mockRequest("maxPeriod=7d");
    const response = await onRequestGet({ request, env: mockEnv });
    const responseBody = await response.json();

    expect(response.status).toBe(503);
    expect(responseBody.status).toBe('error');
  });

  it('should default to "30d" if maxPeriod is not specified or invalid', async () => {
     // Restore console for this specific test if you want to check its output, or keep it mocked
     // console.log = originalConsoleLog;

     await onRequestGet({ request: mockRequest(), env: mockEnv }); // No maxPeriod
     expect(mockEnv.PROCESSED_DATA_KV.get).toHaveBeenCalledWith('latest_processed_data_v1_30d');

     vi.clearAllMocks(); // Clear for next call, or ensure mocks are reset if using a more specific reset
     mockEnv.DB.prepare.mockReturnValue({ bind: mockEnv.DB.bind.mockReturnValue({ first: mockEnv.DB.first }) }); // Re-chain for DB

     await onRequestGet({ request: mockRequest("maxPeriod=invalid"), env: mockEnv }); // Invalid maxPeriod
     expect(mockEnv.PROCESSED_DATA_KV.get).toHaveBeenCalledWith('latest_processed_data_v1_30d');
  });

  it('onRequest should route GET requests to onRequestGet', async () => {
     const request = mockRequest();
     const response = await onRequest({ request, env: mockEnv }); // onRequest calls onRequestGet
     expect(response.status).toBe(503); // Because default mocks mean data not found via onRequestGet
  });

  it('onRequest should return 405 for non-GET requests', async () => {
     const request = { ...mockRequest(), method: 'POST' };
     const response = await onRequest({ request, env: mockEnv });
     const responseBody = await response.json();
     expect(response.status).toBe(405);
     expect(responseBody.status).toBe('error');
     expect(responseBody.message).toContain('Method not allowed');
  });

  it('should attempt D1 if PROCESSED_DATA_KV binding is missing', async () => {
     const envWithoutKV = { DB: mockEnv.DB, PROCESSED_DATA_KV: undefined };
     // console.warn = originalConsoleWarn; // To check actual console warning

     await onRequestGet({ request: mockRequest("maxPeriod=7d"), env: envWithoutKV });

     expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('PROCESSED_DATA_KV binding not available'));
     expect(mockEnv.DB.first).toHaveBeenCalled();
  });

  it('should return 503 if both PROCESSED_DATA_KV and DB bindings are missing', async () => {
    const envWithoutAnyStorage = { PROCESSED_DATA_KV: undefined, DB: undefined };
    // console.warn = originalConsoleWarn; // To check actual console warnings

    const request = mockRequest("maxPeriod=7d");
    const response = await onRequestGet({ request, env: envWithoutAnyStorage });
    const responseBody = await response.json();

    expect(response.status).toBe(503);
    expect(responseBody.message).toContain('Processed data for period 7d not yet available');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('PROCESSED_DATA_KV binding not available'));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('D1 database binding (env.DB) not available'));
  });

  it('should handle KV get error gracefully and fall back to D1', async () => {
    mockEnv.PROCESSED_DATA_KV.get.mockRejectedValue(new Error("KV Network Error"));
    // console.error = originalConsoleError; // To check actual console error

    // D1 should still be called
    const mockD1Data = { earthquakes: [{ id: 'd1_fallback_quake' }] };
    const mockD1DataString = JSON.stringify(mockD1Data);
    const freshTimestamp = Math.floor(Date.now() / 1000) - 50;
    mockEnv.DB.first.mockResolvedValue({ data: mockD1DataString, timestamp: freshTimestamp });

    const request = mockRequest("maxPeriod=7d");
    const response = await onRequestGet({ request, env: mockEnv });
    const responseBody = await response.json();

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Error fetching from KV for period latest_processed_data_v1_7d: KV Network Error"), expect.any(Error));
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Cache-Status')).toBe('hit-d1');
    expect(responseBody).toEqual(mockD1Data);
    expect(mockEnv.DB.first).toHaveBeenCalled();
  });

  it('should handle D1 first error gracefully and return 503', async () => {
    mockEnv.DB.first.mockRejectedValue(new Error("D1 DB Error"));
    // console.error = originalConsoleError; // To check actual console error

    const request = mockRequest("maxPeriod=7d");
    const response = await onRequestGet({ request, env: mockEnv });
    const responseBody = await response.json();

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("D1 SELECT error for period latest_processed_data_v1_7d: D1 DB Error"), expect.any(Error));
    expect(response.status).toBe(503);
    expect(responseBody.message).toContain('Processed data for period 7d not yet available');
  });

});
