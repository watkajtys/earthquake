import { vi, describe, it, expect, beforeEach } from 'vitest';
import { updateStatsInKV } from './kv-stats-updater.js';

// These mocked arithmetic/error tests provide no concurrent-write guarantee.
// Workers KV returns value + metadata and does not support conditional CAS puts.
describe('kv-stats-updater', () => {
  let mockContext;
  let mockKvNamespace;

  beforeEach(() => {
    mockKvNamespace = {
      getWithMetadata: vi.fn(),
      put: vi.fn(),
    };

    mockContext = {
      env: {
        USGS_LAST_RESPONSE_KV: mockKvNamespace,
      },
      ctx: {
        waitUntil: vi.fn(),
      },
    };
  });

  it('should initialize and update stats if key does not exist', async () => {
    mockKvNamespace.getWithMetadata.mockResolvedValue({ value: null, metadata: null });
    mockKvNamespace.put.mockResolvedValue(undefined);


    await updateStatsInKV(mockContext, 'USGS_LAST_RESPONSE_KV', 'test_stats', { count: 1 });

    expect(mockKvNamespace.put).toHaveBeenCalledWith(
      'test_stats',
      JSON.stringify({ count: 1 }),
      expect.any(Object)
    );
  });

  it('should correctly increment existing stats', async () => {
    mockKvNamespace.getWithMetadata.mockResolvedValue({
      value: { count: 10, anotherStat: 5 },
      metadata: null,
    });
    mockKvNamespace.put.mockResolvedValue(undefined);


    await updateStatsInKV(mockContext, 'USGS_LAST_RESPONSE_KV', 'test_stats', { count: 2, newStat: 1 });

    expect(mockKvNamespace.put).toHaveBeenCalledWith(
      'test_stats',
      JSON.stringify({ count: 12, anotherStat: 5, newStat: 1 }),
      expect.any(Object)
    );
  });

  it('should retry a generic write failure and eventually succeed', async () => {
    // First call fails, second succeeds
    mockKvNamespace.getWithMetadata
      .mockResolvedValueOnce({ value: { count: 1 }, metadata: null })
      .mockResolvedValueOnce({ value: { count: 2 }, metadata: null });

    mockKvNamespace.put
        .mockRejectedValueOnce(new Error('KV write failed')) // Simulate a generic binding failure
        .mockResolvedValueOnce(undefined); // Simulate success on retry


    await updateStatsInKV(mockContext, 'USGS_LAST_RESPONSE_KV', 'test_stats', { count: 1 });

    expect(mockKvNamespace.getWithMetadata).toHaveBeenCalledTimes(2);
    expect(mockKvNamespace.put).toHaveBeenCalledTimes(2);
    expect(mockKvNamespace.put).toHaveBeenCalledWith(
      'test_stats',
      JSON.stringify({ count: 2 }),
      expect.any(Object)
    );
    expect(mockKvNamespace.put).toHaveBeenLastCalledWith(
      'test_stats',
      JSON.stringify({ count: 3 }),
      expect.any(Object)
    );
  });

  it('should throw an error after all retries fail', async () => {
    mockKvNamespace.getWithMetadata.mockResolvedValue({ value: { count: 1 }, metadata: null });
    mockKvNamespace.put.mockRejectedValue(new Error('KV write failed'));

    await expect(
      updateStatsInKV(mockContext, 'USGS_LAST_RESPONSE_KV', 'test_stats', { count: 1 }, 3)
    ).rejects.toThrow(`Failed to update KV stats for key 'test_stats' after 3 attempts.`);

    expect(mockKvNamespace.getWithMetadata).toHaveBeenCalledTimes(3);
    expect(mockKvNamespace.put).toHaveBeenCalledTimes(3);
  });
});
