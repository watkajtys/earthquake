import scheduledFetcher from './scheduled-fetcher'; // Assuming default export
import { upsertEarthquakeFeaturesToD1 } from '../src/utils/d1Utils.js';

// Mock d1Utils
vi.mock('../src/utils/d1Utils.js', () => ({ // Changed from jest.mock to vi.mock
  upsertEarthquakeFeaturesToD1: vi.fn(), // Changed from jest.fn to vi.fn
}));

// Mock global fetch
global.fetch = vi.fn(); // Changed from jest.fn to vi.fn

// Mock console
global.console = {
  log: vi.fn(), // Changed from jest.fn to vi.fn
  error: vi.fn(), // Changed from jest.fn to vi.fn
  warn: vi.fn(), // Changed from jest.fn to vi.fn
};

describe('scheduled-fetcher', () => {
  let mockEnv;
  let mockCtx;

  beforeEach(() => {
    vi.clearAllMocks(); // Changed from jest.clearAllMocks to vi.clearAllMocks
    mockEnv = {
      DB: { // This DB mock is for the actual d1Utils if not deeply mocking it.
            // If d1Utils is mocked (as it is above), these DB mocks might not be directly hit by scheduled-fetcher's test
        prepare: vi.fn().mockReturnThis(),
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      },
    };
    mockCtx = {
      waitUntil: vi.fn(),
    };
    // Reset mock for upsertEarthquakeFeaturesToD1 for each test
    upsertEarthquakeFeaturesToD1.mockReset(); // Use mockReset for vi.fn mocks
    upsertEarthquakeFeaturesToD1.mockResolvedValue({ successCount: 1, errorCount: 0 });
  });

  it('should fetch data and call upsertEarthquakeFeaturesToD1 on success', async () => {
    const mockEvent = { scheduledTime: Date.now() };
    const mockFeatures = [{ id: 'test-quake-1', properties: {}, geometry: { coordinates: [1, 2, 3] } }];
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ features: mockFeatures }),
      text: async () => '' // For error cases
    });

    await scheduledFetcher.scheduled(mockEvent, mockEnv, mockCtx);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
      expect.any(Object)
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[scheduled-fetcher] Triggered at'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`[scheduled-fetcher] Fetched ${mockFeatures.length} earthquake features. Starting D1 upsert.`));

    // Check if the utility function was called
    expect(upsertEarthquakeFeaturesToD1).toHaveBeenCalledWith(mockEnv.DB, mockFeatures);

    // Check that ctx.waitUntil was called with the promise from the utility
    expect(mockCtx.waitUntil).toHaveBeenCalledTimes(1);
    // Check that the argument to waitUntil is a Promise (or the result of the catch block)
    // This is a bit tricky to assert directly on the promise itself without more complex async handling in the test
    // But we can infer it was called correctly if upsertEarthquakeFeaturesToD1 was called.
  });

  it('should log error if DB is not available', async () => {
    const mockEvent = { scheduledTime: Date.now() };
    mockEnv.DB = undefined;

    await scheduledFetcher.scheduled(mockEvent, mockEnv, mockCtx);

    expect(console.error).toHaveBeenCalledWith("[scheduled-fetcher] D1 Database (DB) binding not found.");
    expect(global.fetch).not.toHaveBeenCalled();
    expect(upsertEarthquakeFeaturesToD1).not.toHaveBeenCalled();
  });

  it('should log error and not upsert if fetch fails', async () => {
    const mockEvent = { scheduledTime: Date.now() };
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => ({}), // Should not be called
      text: async () => 'Internal Server Error'
    });

    await scheduledFetcher.scheduled(mockEvent, mockEnv, mockCtx);

    expect(console.error).toHaveBeenCalledWith("[scheduled-fetcher] Error fetching data from USGS: 500 Server Error - Internal Server Error");
    expect(upsertEarthquakeFeaturesToD1).not.toHaveBeenCalled();
    expect(mockCtx.waitUntil).not.toHaveBeenCalled();
  });

  it('should log and not upsert if no features are returned', async () => {
    const mockEvent = { scheduledTime: Date.now() };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ features: [] }),
      text: async () => ''
    });

    await scheduledFetcher.scheduled(mockEvent, mockEnv, mockCtx);

    expect(console.log).toHaveBeenCalledWith("[scheduled-fetcher] No earthquake features found in the response or data is invalid.");
    expect(upsertEarthquakeFeaturesToD1).not.toHaveBeenCalled();
    expect(mockCtx.waitUntil).not.toHaveBeenCalled();
  });

  // More tests:
  // - fetch throws an error
  // - upsertEarthquakeFeaturesToD1 throws an error (mock it to reject)
});
