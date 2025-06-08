import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { onRequestGet } from './processed-earthquake-data'; // Adjust if onRequest is the main export

// Mocking global fetch and Response constructor if not available
if (!global.fetch) {
  global.fetch = vi.fn();
}
if (!global.Response) {
  global.Response = vi.fn((body, init) => ({
    body,
    init,
    json: () => Promise.resolve(JSON.parse(body)),
    text: () => Promise.resolve(body),
    ok: init?.status === 200 || !init?.status, // Simplified ok
    status: init?.status || 200,
    headers: new Map(init?.headers), // Simple Map for headers
  }));
}
// Mock Request if needed, though usually available via miniflare env or vitest's JSDOM
if (!global.Request) {
    global.Request = vi.fn(url => ({ url: new URL(url) }));
}


// Mock data constants (can be expanded)
// MOCK_NOW is new Date('2023-01-15T12:00:00.000Z').getTime()
const MOCK_NOW_FOR_DATA = new Date('2023-01-15T12:00:00.000Z').getTime(); // Align with Date.now() mock

const MOCK_USGS_PROXY_RESPONSE_DAY = {
  metadata: { generated: MOCK_NOW_FOR_DATA },
  features: [{ id: 'fresh_day_1', properties: { time: MOCK_NOW_FOR_DATA - 3600000, mag: 3.0, alert: 'green', tsunami: 0 } }], // 1 hour ago from MOCK_NOW
};
const MOCK_USGS_PROXY_RESPONSE_WEEK = {
  metadata: { generated: MOCK_NOW_FOR_DATA },
  features: [
    { id: 'fresh_week_1', properties: { time: MOCK_NOW_FOR_DATA - (2 * 24 * 3600000), mag: 3.5, alert: 'green', tsunami: 0 } }, // 2 days ago
    { id: 'fresh_day_overlap', properties: { time: MOCK_NOW_FOR_DATA - 3600000, mag: 3.1, alert: 'green', tsunami: 0 } } // Ensure some overlap for filtering tests if needed
  ],
};
const MOCK_USGS_PROXY_RESPONSE_MONTH = {
  metadata: { generated: MOCK_NOW_FOR_DATA },
  features: [
    { id: 'fresh_month_1', properties: { time: MOCK_NOW_FOR_DATA - (15 * 24 * 3600000), mag: 4.0, alert: 'yellow', tsunami: 0 } }, // 15 days ago
    { id: 'fresh_week_overlap', properties: { time: MOCK_NOW_FOR_DATA - (2 * 24 * 3600000), mag: 3.6, alert: 'green', tsunami: 0 } }
  ],
};


describe('processed-earthquake-data with D1 integration', () => {
  let mockDb;
  let mockContext;
  let consoleLogSpy, consoleErrorSpy, consoleWarnSpy;
  let dateNowSpy;

  const MOCK_NOW = new Date('2023-01-15T12:00:00.000Z').getTime();
  const D1_CACHE_TTL_SECONDS = 300; // Same as in the main script

  // Helper to construct mock fetch responses for the USGS proxy
  const mockUsgsProxyFetch = (data = MOCK_USGS_PROXY_RESPONSE_DAY) => {
    return vi.fn().mockImplementation(async (url) => {
        const apiUrl = new URL(url).searchParams.get('apiUrl');
        let responseData;
        if (apiUrl.includes('all_day.geojson')) {
            responseData = MOCK_USGS_PROXY_RESPONSE_DAY;
        } else if (apiUrl.includes('all_week.geojson')) {
            responseData = MOCK_USGS_PROXY_RESPONSE_WEEK;
        } else if (apiUrl.includes('all_month.geojson')) {
            responseData = MOCK_USGS_PROXY_RESPONSE_MONTH;
        } else {
            responseData = { features: [] }; // Default empty
        }
        return Promise.resolve(new Response(JSON.stringify(responseData), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });
  };


  beforeEach(() => {
    vi.clearAllMocks(); // Clears mock usage data, but not the mocks themselves if created with vi.fn() outside beforeEach

    // Reset global fetch for each test to ensure clean state
    global.fetch = mockUsgsProxyFetch();

    mockDb = {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }), // Default success for D1 writes
    };

    mockContext = {
      // Ensure request is a new Request object for each test if its properties are modified
      request: new Request('http://localhost/api/processed-earthquake-data?maxPeriod=30d'),
      env: {
        DB: mockDb,
        // CLUSTER_KV: {} // Mock if it were used directly in this function
      },
      waitUntil: vi.fn(promise => promise), // Simple pass-through
    };

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(MOCK_NOW);
  });

  afterEach(() => {
    // Restore all spied objects. This also clears the mock implementation.
    vi.restoreAllMocks();
  });

  test('should return cached data on D1 hit (valid timestamp)', async () => {
    const cachedJson = { metadata: {}, features: [{ id: 'cached1', properties: { time: MOCK_NOW - 100000, mag: 2.5 } }] }; // Example processed data
    const cachedDataString = JSON.stringify(cachedJson);
    // Timestamp is 2 minutes ago (120 seconds), well within 300s TTL
    const validTimestamp = Math.floor(MOCK_NOW / 1000) - 120;

    mockDb.first.mockResolvedValue({ data: cachedDataString, timestamp: validTimestamp });

    const response = await onRequestGet(mockContext);
    const responseData = await response.json();

    expect(response.headers.get('X-Cache-Status')).toBe('hit-d1');
    expect(responseData).toEqual(cachedJson);
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT data, timestamp FROM processed_data WHERE period = ?1'));
    expect(mockDb.bind).toHaveBeenCalledWith('latest_processed_data_v1_30d');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[processed-earthquake-data-worker] D1 Cache hit for processed data (period: 30d).'));
  });

  test('should fetch fresh data on D1 cache miss (no data)', async () => {
    mockDb.first.mockResolvedValue(null); // No data in D1

    const response = await onRequestGet(mockContext);
    const responseData = await response.json();

    expect(response.headers.get('X-Cache-Status')).toBe('miss-d1');
    expect(responseData.earthquakesLast24Hours[0].id).toContain('fresh_day_1'); // Check if it's from mock fetch
    expect(global.fetch).toHaveBeenCalledTimes(3); // Day, Week, Month for 30d period
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT data, timestamp FROM processed_data WHERE period = ?1'));
    expect(mockDb.bind).toHaveBeenCalledWith('latest_processed_data_v1_30d');

    // Verify D1 write
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE INTO processed_data (period, data, timestamp) VALUES (?1, ?2, ?3)'));
    expect(mockDb.bind).toHaveBeenCalledWith('latest_processed_data_v1_30d', expect.any(String), Math.floor(MOCK_NOW / 1000));
    expect(mockDb.run).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[processed-earthquake-data-worker] D1 Cache miss for period: 30d.'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully stored processed data in D1 for period: latest_processed_data_v1_30d'));
  });

  test('should fetch fresh data on D1 cache hit (expired/stale data)', async () => {
    const cachedJson = { features: [{ id: 'stale_cached' }] };
    const cachedDataString = JSON.stringify(cachedJson);
    // Timestamp is 6 minutes ago (360 seconds), outside 300s TTL
    const expiredTimestamp = Math.floor(MOCK_NOW / 1000) - (D1_CACHE_TTL_SECONDS + 60);

    mockDb.first.mockResolvedValue({ data: cachedDataString, timestamp: expiredTimestamp });

    const response = await onRequestGet(mockContext);
    const responseData = await response.json();

    expect(response.headers.get('X-Cache-Status')).toBe('miss-d1');
    expect(responseData.earthquakesLast24Hours[0].id).toContain('fresh_day_1');
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT data, timestamp FROM processed_data'));
    expect(mockDb.bind).toHaveBeenCalledWith('latest_processed_data_v1_30d');

    // Verify D1 write (update)
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE INTO processed_data'));
    expect(mockDb.bind).toHaveBeenCalledWith('latest_processed_data_v1_30d', expect.any(String), Math.floor(MOCK_NOW / 1000));
    expect(mockDb.run).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[processed-earthquake-data-worker] D1 Cache stale for period: 30d. Fetching fresh data.'));
  });

  test('should fetch fresh data and log error if D1 SELECT fails', async () => {
    const dbError = new Error('D1 SELECT failed');
    mockDb.first.mockRejectedValue(dbError);

    const response = await onRequestGet(mockContext);
    const responseData = await response.json();

    expect(response.headers.get('X-Cache-Status')).toBe('miss-d1');
    expect(responseData.earthquakesLast24Hours[0].id).toContain('fresh_day_1');
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[processed-earthquake-data-worker] D1 SELECT error for period latest_processed_data_v1_30d: D1 SELECT failed'), dbError);

    // Should still try to write the fresh data to D1
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE INTO processed_data'));
    expect(mockDb.run).toHaveBeenCalled();
  });

  test('should fetch fresh data and log error if D1 INSERT/REPLACE fails', async () => {
    mockDb.first.mockResolvedValue(null); // Cache miss
    const dbWriteError = new Error('D1 INSERT failed');
    mockDb.run.mockRejectedValue(dbWriteError); // Simulate D1 write failure

    // Modify context.waitUntil to actually await the promise for this test to catch the error
    // This is a bit more involved as waitUntil is fire-and-forget in the original code.
    // For testing the log, we can spy on the .catch() of the promise passed to waitUntil.
    // However, the current mock `waitUntil: vi.fn(promise => promise)` will make the promise resolve/reject immediately.
    // Let's ensure our mockDb.run().catch() is called.

    const response = await onRequestGet(mockContext); // The request itself should succeed
    const responseData = await response.json();

    expect(response.headers.get('X-Cache-Status')).toBe('miss-d1');
    expect(responseData.earthquakesLast24Hours[0].id).toContain('fresh_day_1');
    expect(global.fetch).toHaveBeenCalledTimes(3);

    // Ensure the D1 write was attempted
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE INTO processed_data'));
    expect(mockDb.run).toHaveBeenCalled();

    // Wait for the async operation within waitUntil to complete if necessary
    // This depends on how waitUntil is handled. With vi.fn(p => p), it's immediate.
    // We need to ensure the .catch part of the waitUntil call in the main script has executed.
    // A more robust way might be to have waitUntil store the promise, then await it here.
    // For now, let's assume the logging happens as part of the async flow.
    // This part of the test might need adjustment based on actual behavior of waitUntil promise chain.
    // await new Promise(process.nextTick); // allow microtasks to run

    expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('D1 INSERT/REPLACE error for period latest_processed_data_v1_30d: D1 INSERT failed'),
        dbWriteError
    );
  });

  test('should use default period "30d" and query D1 accordingly if maxPeriod is invalid', async () => {
    mockContext.request = new Request('http://localhost/api/processed-earthquake-data?maxPeriod=invalid');
    mockDb.first.mockResolvedValue(null); // Cache miss

    await onRequestGet(mockContext);

    expect(global.fetch).toHaveBeenCalledTimes(3); // Fetches for 30d
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT data, timestamp FROM processed_data WHERE period = ?1'));
    expect(mockDb.bind).toHaveBeenCalledWith('latest_processed_data_v1_30d'); // Defaulted to 30d key

    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE INTO processed_data'));
    expect(mockDb.bind).toHaveBeenCalledWith('latest_processed_data_v1_30d', expect.any(String), Math.floor(MOCK_NOW / 1000));
  });

  test('should fetch fresh data and log warning if D1 binding (env.DB) is not available', async () => {
    mockContext.env.DB = undefined; // Simulate D1 not bound

    const response = await onRequestGet(mockContext);
    const responseData = await response.json();

    expect(response.headers.get('X-Cache-Status')).toBe('miss-d1'); // Should be miss-d1 as D1 operations are skipped
    expect(responseData.earthquakesLast24Hours[0].id).toContain('fresh_day_1');
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(mockDb.prepare).not.toHaveBeenCalled(); // D1 methods should not be called
    expect(mockDb.run).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('[processed-earthquake-data-worker] D1 database binding (env.DB) not available. Data will not be cached in D1. Performance may be affected.'));
  });

  test('should correctly use "24h" period for D1 keys and fetch calls', async () => {
    mockContext.request = new Request('http://localhost/api/processed-earthquake-data?maxPeriod=24h');
    mockDb.first.mockResolvedValue(null); // Cache miss

    await onRequestGet(mockContext);

    expect(global.fetch).toHaveBeenCalledTimes(3); // Day, Week, Month are always fetched as per current logic, then filtered
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT data, timestamp FROM processed_data WHERE period = ?1'));
    expect(mockDb.bind).toHaveBeenCalledWith('latest_processed_data_v1_24h');

    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE INTO processed_data'));
    expect(mockDb.bind).toHaveBeenCalledWith('latest_processed_data_v1_24h', expect.any(String), Math.floor(MOCK_NOW / 1000));
  });

  test('should correctly use "7d" period for D1 keys and fetch calls', async () => {
    mockContext.request = new Request('http://localhost/api/processed-earthquake-data?maxPeriod=7d');
    mockDb.first.mockResolvedValue(null); // Cache miss

    await onRequestGet(mockContext);

    expect(global.fetch).toHaveBeenCalledTimes(3); // Day, Week, Month
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT data, timestamp FROM processed_data WHERE period = ?1'));
    expect(mockDb.bind).toHaveBeenCalledWith('latest_processed_data_v1_7d');

    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE INTO processed_data'));
    expect(mockDb.bind).toHaveBeenCalledWith('latest_processed_data_v1_7d', expect.any(String), Math.floor(MOCK_NOW / 1000));
  });

});
