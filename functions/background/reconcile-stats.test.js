// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('aggregates migrated event rows before publishing statistics to KV', async () => {
    const database = new DatabaseSync(':memory:');
    try {
      const migrations = resolve('migrations');
      for (const name of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) {
        database.exec(readFileSync(resolve(migrations, name), 'utf8'));
      }
      const insert = database.prepare(`INSERT INTO EarthquakeEvents
        (id, detail_fetched, has_shakemap, has_moment_tensor) VALUES (?, ?, ?, ?)`);
      insert.run('unfetched', 0, 0, 0);
      insert.run('tensor', 1, 0, 1);
      insert.run('both-products', 1, 1, 1);
      insert.run('tensor-summary', 0, 0, 1);
      mockEnv.DB = { prepare: sql => ({ first: async () => database.prepare(sql).get() }) };

      await reconcileStats.scheduled(null, mockEnv, null);

      expect(mockEnv.USGS_LAST_RESPONSE_KV.put).toHaveBeenCalledExactlyOnceWith(
        'earthquake_stats',
        JSON.stringify({ total_earthquakes: 4, fetched: 2, with_shakemap: 1, with_moment_tensor: 3 }),
      );
    } finally {
      database.close();
    }
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
