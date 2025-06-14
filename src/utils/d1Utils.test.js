import { upsertEarthquakeFeaturesToD1 } from './d1Utils';

// Mock console
global.console = {
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
};

describe('d1Utils - upsertEarthquakeFeaturesToD1', () => {
  let mockDb;
  let mockStmt;

  beforeEach(() => {
    vi.clearAllMocks(); // Use vi for vitest
    mockStmt = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1, last_row_id: 1 } }), // Simulate successful run
    };
    mockDb = {
      prepare: vi.fn().mockReturnValue(mockStmt),
    };
  });

  it('should successfully upsert valid features', async () => {
    const mockFeatures = [
      {
        id: 'quake1',
        properties: { time: 1678886400000, mag: 5.5, place: 'Location A', detail: 'url_a' },
        geometry: { coordinates: [10, 20, 5] }
      },
      {
        id: 'quake2',
        properties: { time: 1678887400000, mag: 4.3, place: 'Location B', detail: 'url_b' },
        geometry: { coordinates: [12, 22, 8] }
      },
    ];

    const result = await upsertEarthquakeFeaturesToD1(mockDb, mockFeatures);

    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO EarthquakeEvents'));
    expect(mockStmt.bind).toHaveBeenCalledTimes(mockFeatures.length);
    expect(mockStmt.run).toHaveBeenCalledTimes(mockFeatures.length);

    // Check first feature binding
    expect(mockStmt.bind).toHaveBeenNthCalledWith(1,
      'quake1', 1678886400000, 20, 10, 5, 5.5, 'Location A', 'url_a', JSON.stringify(mockFeatures[0]), expect.any(Number)
    );
    // Check second feature binding
    expect(mockStmt.bind).toHaveBeenNthCalledWith(2,
      'quake2', 1678887400000, 22, 12, 8, 4.3, 'Location B', 'url_b', JSON.stringify(mockFeatures[1]), expect.any(Number)
    );

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`[d1Utils-upsert] Starting D1 upsert for ${mockFeatures.length} features.`));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`[d1Utils-upsert] D1 upsert processing complete. Success: ${mockFeatures.length}, Errors: 0`));
    expect(result).toEqual({ successCount: mockFeatures.length, errorCount: 0 });
  });

  it('should return zero counts and log if no features are provided', async () => {
    const result = await upsertEarthquakeFeaturesToD1(mockDb, []);
    expect(console.log).toHaveBeenCalledWith("[d1Utils-upsert] No features provided to upsert.");
    expect(result).toEqual({ successCount: 0, errorCount: 0 });
    expect(mockDb.prepare).not.toHaveBeenCalled();
  });

  it('should log error and return error count if DB is not provided', async () => {
    const features = [{ id: 'q1' }]; // Dummy features
    const result = await upsertEarthquakeFeaturesToD1(null, features);
    expect(console.error).toHaveBeenCalledWith("[d1Utils-upsert] D1 Database (DB) binding not provided.");
    expect(result).toEqual({ successCount: 0, errorCount: features.length });
  });

  it('should skip features with missing critical data and log warnings', async () => {
    const validFeature = {
      id: 'valid1',
      properties: { time: 1678886400000, mag: 5.5, place: 'Valid Place', detail: 'valid_url' },
      geometry: { coordinates: [10, 20, 5] }
    };
    const invalidFeature1 = { id: 'invalid1' }; // Missing properties and geometry
    const invalidFeature2 = {
      id: 'invalid2',
      properties: { time: null, mag: 2.0, place: 'Incomplete Place', detail: 'incomplete_url'}, // null time
      geometry: { coordinates: [1,2,3]}
    };


    const features = [validFeature, invalidFeature1, invalidFeature2];
    const result = await upsertEarthquakeFeaturesToD1(mockDb, features);

    expect(mockDb.prepare).toHaveBeenCalledTimes(1); // Called once for the batch
    expect(mockStmt.bind).toHaveBeenCalledTimes(1); // Only called for the valid feature
    expect(mockStmt.bind).toHaveBeenCalledWith(
      'valid1', 1678886400000, 20, 10, 5, 5.5, 'Valid Place', 'valid_url', JSON.stringify(validFeature), expect.any(Number)
    );
    expect(mockStmt.run).toHaveBeenCalledTimes(1);

    expect(console.warn).toHaveBeenCalledWith("[d1Utils-upsert] Skipping feature due to missing critical data:", "invalid1");
    expect(console.warn).toHaveBeenCalledWith("[d1Utils-upsert] Skipping feature invalid2 due to null value in one of the required fields.");
    expect(result).toEqual({ successCount: 1, errorCount: 2 });
  });

  it('should handle D1 run errors for a feature and continue processing others', async () => {
    const features = [
      { id: 'q1', properties: { time: 1, mag: 1, place: 'P1', detail: 'u1' }, geometry: { coordinates: [1,1,1] } },
      { id: 'q2-error', properties: { time: 2, mag: 2, place: 'P2-error', detail: 'u2' }, geometry: { coordinates: [2,2,2] } },
      { id: 'q3', properties: { time: 3, mag: 3, place: 'P3', detail: 'u3' }, geometry: { coordinates: [3,3,3] } }
    ];

    mockStmt.run
      .mockResolvedValueOnce({ success: true }) // q1
      .mockRejectedValueOnce(new Error('D1 execute error for q2')) // q2-error
      .mockResolvedValueOnce({ success: true }); // q3

    const result = await upsertEarthquakeFeaturesToD1(mockDb, features);

    expect(mockStmt.bind).toHaveBeenCalledTimes(features.length);
    expect(mockStmt.run).toHaveBeenCalledTimes(features.length); // Each feature's run is awaited individually now
    expect(console.error).toHaveBeenCalledWith("[d1Utils-upsert] Error upserting feature q2-error: D1 execute error for q2", expect.any(Error));
    expect(result).toEqual({ successCount: 2, errorCount: 1 });
  });

  // More tests:
  // - Defaulting usgs_detail_url if feature.properties.detail is missing
});
