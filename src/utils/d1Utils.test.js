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
    // Default run mock, can be overridden in specific tests
    mockStmt = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1, last_row_id: 1 } }),
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
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`[d1Utils-upsert] D1 upsert processing complete. Success: ${mockFeatures.length}, Errors: 0`)); // This assertion will be updated for tests where not all inserts lead to changes
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

    // Ensure default mock in beforeEach is flexible enough or override here if needed for specific sequences
    mockStmt.run
      .mockResolvedValueOnce({ success: true, meta: { changes: 1 } }) // q1
      .mockRejectedValueOnce(new Error('D1 execute error for q2')) // q2-error
      .mockResolvedValueOnce({ success: true, meta: { changes: 1 } }); // q3

    const result = await upsertEarthquakeFeaturesToD1(mockDb, features);

    expect(mockStmt.bind).toHaveBeenCalledTimes(features.length);
    expect(mockStmt.run).toHaveBeenCalledTimes(features.length); // Each feature's run is awaited individually now
    expect(console.error).toHaveBeenCalledWith("[d1Utils-upsert] Error upserting feature q2-error: D1 execute error for q2", expect.any(Error));
    expect(result).toEqual({ successCount: 2, errorCount: 1 });
  });

  // More tests:
  // - Defaulting usgs_detail_url if feature.properties.detail is missing
});

describe('d1Utils - upsertEarthquakeFeaturesToD1 - ON CONFLICT DO NOTHING', () => {
  let mockDb;
  let mockStmt;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStmt = {
      bind: vi.fn().mockReturnThis(),
      // Individual tests will mock run's resolved value
      run: vi.fn(),
    };
    mockDb = {
      prepare: vi.fn().mockReturnValue(mockStmt),
    };
  });

  it('should correctly count successes for new inserts and ignore existing ones (ON CONFLICT DO NOTHING)', async () => {
    const features = [
      { // New feature
        id: 'new_quake1',
        properties: { time: 1678886500000, mag: 5.0, place: 'New Location A', detail: 'new_url_a' },
        geometry: { coordinates: [100, 200, 50] }
      },
      { // Existing feature (should be ignored, changes: 0)
        id: 'existing_quake1',
        properties: { time: 1678887500000, mag: 4.0, place: 'Existing Location B', detail: 'existing_url_b' },
        geometry: { coordinates: [120, 220, 80] }
      },
      { // New feature
        id: 'new_quake2',
        properties: { time: 1678888500000, mag: 6.0, place: 'New Location C', detail: 'new_url_c' },
        geometry: { coordinates: [130, 230, 90] }
      },
      { // Existing feature (should be ignored, changes: 0)
        id: 'existing_quake2',
        properties: { time: 1678889500000, mag: 3.0, place: 'Existing Location D', detail: 'existing_url_d' },
        geometry: { coordinates: [140, 240, 100] }
      }
    ];

    // Mock run behavior: 1 for new, 0 for existing
    mockStmt.run
      .mockResolvedValueOnce({ success: true, meta: { changes: 1 } }) // new_quake1
      .mockResolvedValueOnce({ success: true, meta: { changes: 0 } }) // existing_quake1
      .mockResolvedValueOnce({ success: true, meta: { changes: 1 } }) // new_quake2
      .mockResolvedValueOnce({ success: true, meta: { changes: 0 } }); // existing_quake2

    const result = await upsertEarthquakeFeaturesToD1(mockDb, features);

    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT(id) DO NOTHING'));
    expect(mockStmt.bind).toHaveBeenCalledTimes(features.length);
    expect(mockStmt.run).toHaveBeenCalledTimes(features.length);

    // Verify bind calls for all features
    features.forEach((feature, index) => {
      expect(mockStmt.bind).toHaveBeenNthCalledWith(index + 1,
        feature.id,
        feature.properties.time,
        feature.geometry.coordinates[1],
        feature.geometry.coordinates[0],
        feature.geometry.coordinates[2],
        feature.properties.mag,
        feature.properties.place,
        feature.properties.detail,
        JSON.stringify(feature),
        expect.any(Number)
      );
    });

    // Verify successCount reflects only actual inserts (changes: 1)
    expect(result.successCount).toBe(2); // new_quake1, new_quake2
    expect(result.errorCount).toBe(0);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`[d1Utils-upsert] Starting D1 upsert for ${features.length} features.`));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[d1Utils-upsert] D1 upsert processing complete. Success: 2, Errors: 0'));
    expect(console.error).not.toHaveBeenCalled(); // No errors expected
    expect(console.warn).not.toHaveBeenCalled(); // No warnings for ignored conflicts
  });
});
