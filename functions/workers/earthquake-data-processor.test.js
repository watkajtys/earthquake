import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'; // Or 'jest'
import worker from './earthquake-data-processor.js'; // Assuming default export

// Mock environment variables and bindings
const mockEnv = {
  PROCESSED_DATA_KV: {
    put: vi.fn(),
  },
  DB: {
    prepare: vi.fn().mockReturnThis(), // Mock prepare to return 'this' (the DB mock itself)
    bind: vi.fn().mockReturnThis(),   // Mock bind to return 'this' (the statement mock)
    run: vi.fn(),
  },
  PROXY_BASE_URL: '/', // Default for tests, will be overridden in specific test
  // Mock any other env vars the worker might use
};

// Mock for ctx.waitUntil
const mockCtx = {
  waitUntil: vi.fn(promise => Promise.resolve(promise).catch(() => {})), // Simple mock that executes the promise and handles potential rejections
};

// Store original console.error
const originalConsoleError = console.error;

describe('Scheduled Worker: earthquake-data-processor', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Restore console.error to its original implementation
    console.error = originalConsoleError;

    // Reset global.fetch if it's a vi.fn mock, or define it if it's the first time
    if (global.fetch && typeof global.fetch.mockReset === 'function') {
      global.fetch.mockReset();
    } else {
      global.fetch = vi.fn();
    }

    mockEnv.PROCESSED_DATA_KV.put.mockResolvedValue(undefined);
    // Ensure DB mock chain works correctly
    mockEnv.DB.prepare.mockReturnValue({ bind: mockEnv.DB.bind });
    mockEnv.DB.bind.mockReturnValue({ run: mockEnv.DB.run });
    mockEnv.DB.run.mockResolvedValue({ success: true });

    // Default fetch mock to prevent actual network calls
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ metadata: { generated: Date.now() }, features: [] }), // Minimal valid response
      text: async () => "OK" // Added for fetchWithProxy error case if response.text() is called
    });
    mockEnv.PROXY_BASE_URL = '/'; // Reset to default for each test
  });

  afterEach(() => {
    // Restore console.error after all tests in a describe block or after each test if spied on locally
    console.error = originalConsoleError;
  });

  it('should attempt to fetch data for day, week, and month from USGS proxy', async () => {
    await worker.scheduled(null, mockEnv, mockCtx);
    expect(global.fetch).toHaveBeenCalledTimes(3); // Day, Week, Month
    // Check that the PROXY_BASE_URL (default '/') is used correctly to form the URL
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp("^(/|https://placeholder-worker-origin.com)/api/usgs-proxy\\?apiUrl=https%3A%2F%2Fearthquake.usgs.gov%2Fearthquakes%2Ffeed%2Fv1.0%2Fsummary%2Fall_day.geojson$")),
      undefined // fetch in worker doesn't pass second arg
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp("^(/|https://placeholder-worker-origin.com)/api/usgs-proxy\\?apiUrl=https%3A%2F%2Fearthquake.usgs.gov%2Fearthquakes%2Ffeed%2Fv1.0%2Fsummary%2Fall_week.geojson$")),
      undefined
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp("^(/|https://placeholder-worker-origin.com)/api/usgs-proxy\\?apiUrl=https%3A%2F%2Fearthquake.usgs.gov%2Fearthquakes%2Ffeed%2Fv1.0%2Fsummary%2Fall_month.geojson$")),
      undefined
    );
  });

  it('should process and store data for all periods (24h, 7d, 30d)', async () => {
    // Mock more specific fetch responses if needed to test processing outcomes
    // For this test, primarily check if KV.put and DB.run are called for each period.
    const periods = ['24h', '7d', '30d'];

    // Provide some basic features to ensure processing logic runs
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        metadata: { generated: Date.now() },
        features: [{id: 'test_quake', properties: {time: Date.now(), mag: 1.0, alert: null, tsunami: 0}}]
      }),
      text: async () => "OK"
    });

    await worker.scheduled(null, mockEnv, mockCtx);

    expect(mockEnv.PROCESSED_DATA_KV.put).toHaveBeenCalledTimes(periods.length);
    expect(mockEnv.DB.prepare).toHaveBeenCalledTimes(periods.length);
    expect(mockEnv.DB.run).toHaveBeenCalledTimes(periods.length);

    for (const period of periods) {
      const expectedKey = `latest_processed_data_v1_${period}`;
      expect(mockEnv.PROCESSED_DATA_KV.put).toHaveBeenCalledWith(expectedKey, expect.any(String));
      expect(mockEnv.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE INTO processed_data'));
      // Check that bind was called with the key
      expect(mockEnv.DB.bind).toHaveBeenCalledWith(expectedKey, expect.any(String), expect.any(Number));
    }
  });

  it('should handle fetch error for one of the USGS feeds gracefully (worker returns early)', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ metadata: { generated: Date.now() }, features: [{id: 'day_quake', properties: {time: Date.now(), mag: 1}}] }) }) // successful day
      .mockRejectedValueOnce(new Error("Network error for week")) // failed week
      .mockResolvedValueOnce({ ok: true, json: async () => ({ metadata: { generated: Date.now() }, features: [{id: 'month_quake', properties: {time: Date.now(), mag: 1}}] }) }); // successful month

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await worker.scheduled(null, mockEnv, mockCtx);

    // Worker's current logic catches error from Promise.all([fetches...]), logs, and then returns.
    expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[earthquake-data-processor-worker] Critical error during scheduled data processing: Failed to fetch USGS_WEEK via proxy"),
        expect.any(Error) // The error object itself
    );
    // Since the worker returns early after the fetch error, no KV or D1 operations should be called.
    expect(mockEnv.PROCESSED_DATA_KV.put).not.toHaveBeenCalled();
    expect(mockEnv.DB.run).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('should correctly use PROXY_BASE_URL from env when it is a full URL', async () => {
     mockEnv.PROXY_BASE_URL = 'https://custom.proxy.com'; // Note: no trailing slash
     await worker.scheduled(null, mockEnv, mockCtx);
     expect(global.fetch).toHaveBeenCalledTimes(3);
     expect(global.fetch).toHaveBeenCalledWith(
       "https://custom.proxy.com/api/usgs-proxy?apiUrl=https%3A%2F%2Fearthquake.usgs.gov%2Fearthquakes%2Ffeed%2Fv1.0%2Fsummary%2Fall_day.geojson",
       undefined
     );
  });

  it('should handle KV.put failure gracefully for a period', async () => {
    mockEnv.PROCESSED_DATA_KV.put
      .mockResolvedValueOnce(undefined) // 24h success
      .mockRejectedValueOnce(new Error("KV PUT failed for 7d")) // 7d fail
      .mockResolvedValueOnce(undefined); // 30d success

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await worker.scheduled(null, mockEnv, mockCtx);

    expect(mockEnv.PROCESSED_DATA_KV.put).toHaveBeenCalledTimes(3);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[earthquake-data-processor-worker] KV PUT error for period latest_processed_data_v1_7d: KV PUT failed for 7d",
      expect.any(Error)
    );
    // D1 operations should still be attempted for all periods
    expect(mockEnv.DB.run).toHaveBeenCalledTimes(3);
    consoleErrorSpy.mockRestore();
  });

  it('should handle DB.run failure gracefully for a period', async () => {
    // Mock prepare and bind to return the chained mock correctly for DB interaction
    const dbStatementMock = { run: vi.fn() };
    const dbPrepareMock = vi.fn(() => ({ bind: vi.fn(() => dbStatementMock) }));
    mockEnv.DB.prepare = dbPrepareMock;

    dbStatementMock.run
      .mockResolvedValueOnce({ success: true }) // 24h success
      .mockRejectedValueOnce(new Error("D1 RUN failed for 7d")) // 7d fail
      .mockResolvedValueOnce({ success: true }); // 30d success

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await worker.scheduled(null, mockEnv, mockCtx);

    expect(mockEnv.PROCESSED_DATA_KV.put).toHaveBeenCalledTimes(3); // KV puts should all be attempted
    expect(dbStatementMock.run).toHaveBeenCalledTimes(3);
    // The error is caught and logged by the ctx.waitUntil().catch()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[earthquake-data-processor-worker] D1 INSERT/REPLACE error for period latest_processed_data_v1_7d: D1 RUN failed for 7d",
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });

  it('should log a warning if PROCESSED_DATA_KV is not available', async () => {
    const tempEnv = { ...mockEnv, PROCESSED_DATA_KV: undefined };
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await worker.scheduled(null, tempEnv, mockCtx);

    expect(consoleWarnSpy).toHaveBeenCalledWith("[earthquake-data-processor-worker] PROCESSED_DATA_KV binding not available.");
    expect(mockEnv.DB.run).toHaveBeenCalledTimes(3); // D1 should still be attempted
    consoleWarnSpy.mockRestore();
  });

  it('should log a warning if DB is not available', async () => {
    const tempEnv = { ...mockEnv, DB: undefined };
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await worker.scheduled(null, tempEnv, mockCtx);

    expect(consoleWarnSpy).toHaveBeenCalledWith("[earthquake-data-processor-worker] D1 database binding (env.DB) not available.");
    expect(mockEnv.PROCESSED_DATA_KV.put).toHaveBeenCalledTimes(3); // KV should still be attempted
    consoleWarnSpy.mockRestore();
  });

  it('should proceed if daily data features are present but weekly or monthly are initially missing/invalid (worker returns early)', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ metadata: { generated: Date.now() }, features: [{id: 'day_quake', properties: {time: Date.now(), mag: 1}}] }) }) // Day data is fine
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: null }) }) // Week data invalid
      .mockResolvedValueOnce({ ok: true, json: async () => ({ metadata: { generated: Date.now() }, features: [{id: 'month_quake', properties: {time: Date.now(), mag: 1}}] }) }); // Month data is fine

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await worker.scheduled(null, mockEnv, mockCtx);

    // The worker checks each raw data type. If rawWeekData.features is not an array, it logs and returns.
    expect(consoleErrorSpy).toHaveBeenCalledWith("[earthquake-data-processor-worker] Invalid or missing features in weekly data. Processing halted.");
    expect(mockEnv.PROCESSED_DATA_KV.put).not.toHaveBeenCalled();
    expect(mockEnv.DB.run).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('should handle case where PROXY_BASE_URL is not set in env (uses placeholder and warns)', async () => {
    const tempEnv = { ...mockEnv, PROXY_BASE_URL: undefined }; // PROXY_BASE_URL is undefined
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await worker.scheduled(null, tempEnv, mockCtx);

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("PROXY_BASE_URL is not set and worker is trying to use relative path for proxy."));
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("https://placeholder-worker-origin.com/api/usgs-proxy?apiUrl="),
      undefined
    );
    consoleWarnSpy.mockRestore();
  });

});
