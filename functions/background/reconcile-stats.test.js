import { vi, describe, it, expect, beforeEach } from 'vitest';
import reconcileStats from './reconcile-stats.js';

describe('reconcile-stats', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      DB: {
        prepare: vi.fn().mockReturnThis(),
        first: vi.fn(),
      },
      USGS_LAST_RESPONSE_KV: {
        put: vi.fn(),
      },
    };
  });

  it('should fetch stats from D1 and update KV', async () => {
    const mockStats = {
      total_earthquakes: 100,
      fetched: 50,
      with_shakemap: 20,
      with_moment_tensor: 10,
    };
    mockEnv.DB.first.mockResolvedValue(mockStats);

    await reconcileStats.scheduled(null, mockEnv, null);

    expect(mockEnv.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT'));
    expect(mockEnv.USGS_LAST_RESPONSE_KV.put).toHaveBeenCalledWith(
      'earthquake_stats',
      JSON.stringify(mockStats)
    );
  });

  it('should log an error if DB is not configured', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockEnv.DB = undefined;

    await expect(reconcileStats.scheduled(null, mockEnv, null)).rejects.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[reconcile-stats] DB or USGS_LAST_RESPONSE_KV environment variables not set. Aborting.'
    );
    consoleErrorSpy.mockRestore();
  });

  it('should log an error if KV is not configured', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockEnv.USGS_LAST_RESPONSE_KV = undefined;

    await expect(reconcileStats.scheduled(null, mockEnv, null)).rejects.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[reconcile-stats] DB or USGS_LAST_RESPONSE_KV environment variables not set. Aborting.'
    );
    consoleErrorSpy.mockRestore();
  });

  it('should log an error if D1 query fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dbError = new Error('D1 query failed');
    mockEnv.DB.first.mockRejectedValue(dbError);

    await expect(reconcileStats.scheduled(null, mockEnv, null)).rejects.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `[reconcile-stats] Error during reconciliation: ${dbError.message}`
    );
    consoleErrorSpy.mockRestore();
  });
  it('does not publish a null or malformed statistics result', async () => {
    for (const result of [null, {}, { total_earthquakes: 1, fetched: 2, with_shakemap: 0, with_moment_tensor: 0 }]) {
      mockEnv.DB.first.mockResolvedValue(result);
      await expect(reconcileStats.scheduled(null, mockEnv, null)).rejects.toThrow('Invalid statistics');
    }
    expect(mockEnv.USGS_LAST_RESPONSE_KV.put).not.toHaveBeenCalled();
  });
  it('normalizes SQLite empty-table SUM values to zero', async () => {
    mockEnv.DB.first.mockResolvedValue({ total_earthquakes: 0, fetched: null, with_shakemap: null, with_moment_tensor: null });
    await reconcileStats.scheduled(null, mockEnv, null);
    expect(JSON.parse(mockEnv.USGS_LAST_RESPONSE_KV.put.mock.calls[0][1])).toEqual({ total_earthquakes: 0, fetched: 0, with_shakemap: 0, with_moment_tensor: 0 });
  });
  it('propagates a failed KV publication', async () => {
    mockEnv.DB.first.mockResolvedValue({ total_earthquakes: 1, fetched: 0, with_shakemap: 0, with_moment_tensor: 0 });
    const error = new Error('KV unavailable'); mockEnv.USGS_LAST_RESPONSE_KV.put.mockRejectedValue(error);
    await expect(reconcileStats.scheduled(null, mockEnv, null)).rejects.toBe(error);
  });

});
