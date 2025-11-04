import { vi, describe, it, expect, beforeEach } from 'vitest';
import { updateStatsInKV } from './kv-stats-updater.js';

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
    mockKvNamespace.getWithMetadata.mockResolvedValue({ value: null, cas: null });
    mockKvNamespace.put.mockResolvedValue(undefined);


    await updateStatsInKV(mockContext, 'USGS_LAST_RESPONSE_KV', 'test_stats', { count: 1 });

    expect(mockKvNamespace.put).toHaveBeenCalledWith(
      'test_stats',
      JSON.stringify({ count: 1 }),
      { cas: undefined }
    );
  });

  it('should correctly increment existing stats', async () => {
    mockKvNamespace.getWithMetadata.mockResolvedValue({
      value: { count: 10, anotherStat: 5 },
      cas: 'mock-cas-123',
    });
    mockKvNamespace.put.mockResolvedValue(undefined);


    await updateStatsInKV(mockContext, 'USGS_LAST_RESPONSE_KV', 'test_stats', { count: 2, newStat: 1 });

    expect(mockKvNamespace.put).toHaveBeenCalledWith(
      'test_stats',
      JSON.stringify({ count: 12, anotherStat: 5, newStat: 1 }),
      { cas: 'mock-cas-123' }
    );
  });

  it('should retry on conflict and eventually succeed', async () => {
    // First call fails, second succeeds
    mockKvNamespace.getWithMetadata
      .mockResolvedValueOnce({ value: { count: 1 }, cas: 'cas-1' })
      .mockResolvedValueOnce({ value: { count: 2 }, cas: 'cas-2' });

    mockKvNamespace.put
        .mockRejectedValueOnce(new Error('CAS mismatch')) // Simulate CAS failure
        .mockResolvedValueOnce(undefined); // Simulate success on retry


    await updateStatsInKV(mockContext, 'USGS_LAST_RESPONSE_KV', 'test_stats', { count: 1 });

    expect(mockKvNamespace.getWithMetadata).toHaveBeenCalledTimes(2);
    expect(mockKvNamespace.put).toHaveBeenCalledTimes(2);
    expect(mockKvNamespace.put).toHaveBeenCalledWith(
      'test_stats',
      JSON.stringify({ count: 2 }),
      { cas: 'cas-1' }
    );
    expect(mockKvNamespace.put).toHaveBeenLastCalledWith(
      'test_stats',
      JSON.stringify({ count: 3 }),
      { cas: 'cas-2' }
    );
  });

  it('should throw an error after all retries fail', async () => {
    mockKvNamespace.getWithMetadata.mockResolvedValue({ value: { count: 1 }, cas: 'cas-1' });
    mockKvNamespace.put.mockRejectedValue(new Error('CAS mismatch'));

    await expect(
      updateStatsInKV(mockContext, 'USGS_LAST_RESPONSE_KV', 'test_stats', { count: 1 }, 3)
    ).rejects.toThrow(`Failed to update KV stats for key 'test_stats' after 3 attempts.`);

    expect(mockKvNamespace.getWithMetadata).toHaveBeenCalledTimes(3);
    expect(mockKvNamespace.put).toHaveBeenCalledTimes(3);
  });
});
