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
      bind: vi.fn().mockReturnThis(), // bind still returns the statement for chaining
      // run is no longer called directly on the statement from the loop in upsertEarthquakeFeaturesToD1
    };
    mockDb = {
      prepare: vi.fn().mockReturnValue(mockStmt),
      batch: vi.fn().mockResolvedValue([]), // Default successful batch execution
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
    // expect(mockStmt.run).toHaveBeenCalledTimes(mockFeatures.length); // run is no longer called per feature
    expect(mockDb.batch).toHaveBeenCalledTimes(1); // batch is called once with all operations

    // Check that db.batch was called with an array of operations, and verify the first one
    const batchOperations = mockDb.batch.mock.calls[0][0];
    expect(Array.isArray(batchOperations)).toBe(true);
    expect(batchOperations.length).toBe(mockFeatures.length);

    // Check first feature binding (the mockStmt.bind calls are still valid as they prepare operations for batch)
    // No direct way to check Nth call on the statement object passed to batch easily without more complex mocking.
    // The fact that bind was called correctly N times and batch was called with N operations is a good indicator.
    // We can still check the arguments of the bind calls on the mockStmt directly as before.
    expect(mockStmt.bind).toHaveBeenNthCalledWith(1,
      'quake1', 1678886400000, 20, 10, 5, 5.5, 'Location A', 'url_a', JSON.stringify(mockFeatures[0]), expect.any(Number)
    );
    expect(mockStmt.bind).toHaveBeenNthCalledWith(2,
      'quake2', 1678887400000, 22, 12, 8, 4.3, 'Location B', 'url_b', JSON.stringify(mockFeatures[1]), expect.any(Number)
    );

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`[d1Utils-upsert] Starting D1 upsert for ${mockFeatures.length} features.`));
    // The success log message changed slightly with batching
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`[d1Utils-upsert] Batch upsert successful for ${mockFeatures.length} operations.`));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`[d1Utils-upsert] D1 upsert processing complete. Attempted: ${mockFeatures.length}, Success: ${mockFeatures.length}, Errors: 0`));
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
    // expect(mockStmt.run).toHaveBeenCalledTimes(1); // run is no longer called per feature
    expect(mockDb.batch).toHaveBeenCalledTimes(1); // batch is called once with the valid operations
    const batchOpsInvalid = mockDb.batch.mock.calls[0][0];
    expect(batchOpsInvalid.length).toBe(1); // Only one valid operation

    expect(console.warn).toHaveBeenCalledWith("[d1Utils-upsert] Skipping feature due to missing critical data:", "invalid1");
    expect(console.warn).toHaveBeenCalledWith("[d1Utils-upsert] Skipping feature invalid2 due to null value in one of the required fields.");
    expect(result).toEqual({ successCount: 1, errorCount: 2 });
  });

  it('should handle D1 batch errors and count all batched operations as errors', async () => {
    const features = [
      { id: 'q1', properties: { time: 1, mag: 1, place: 'P1', detail: 'u1' }, geometry: { coordinates: [1,1,1] } },
      { id: 'q2-error', properties: { time: 2, mag: 2, place: 'P2-error', detail: 'u2' }, geometry: { coordinates: [2,2,2] } },
      { id: 'q3', properties: { time: 3, mag: 3, place: 'P3', detail: 'u3' }, geometry: { coordinates: [3,3,3] } }
    ];

    // Simulate the batch operation failing
    const batchError = new Error('D1 batch execute error');
    mockDb.batch.mockRejectedValueOnce(batchError);

    const result = await upsertEarthquakeFeaturesToD1(mockDb, features);

    expect(mockStmt.bind).toHaveBeenCalledTimes(features.length); // bind is still called for all valid features
    expect(mockDb.batch).toHaveBeenCalledTimes(1); // batch is attempted once
    const batchOperations = mockDb.batch.mock.calls[0][0];
    expect(batchOperations.length).toBe(features.length); // All features were prepared for batching

    expect(console.error).toHaveBeenCalledWith(`[d1Utils-upsert] Error during batch D1 upsert: ${batchError.message}`, batchError);
    // If batch fails, all operations in it are counted as errors.
    // successCount remains 0 (or its initial value if there were prior successful batches, not applicable here).
    // errorCount becomes the number of operations attempted in the failed batch.
    expect(result).toEqual({ successCount: 0, errorCount: features.length });
  });

  // More tests:
  // - Defaulting usgs_detail_url if feature.properties.detail is missing
});
