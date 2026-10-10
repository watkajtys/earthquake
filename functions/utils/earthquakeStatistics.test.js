// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readEarthquakeStatistics } from './earthquakeStatistics.js';

let database, db;
beforeEach(() => {
  database = new DatabaseSync(':memory:');
  for (const name of readdirSync('migrations').filter(name => name.endsWith('.sql')).sort()) {
    database.exec(readFileSync(resolve('migrations', name), 'utf8'));
  }
  db = { prepare: sql => ({ first: async () => database.prepare(sql).get() }) };
});
afterEach(() => { database.close(); vi.restoreAllMocks(); });

describe('authoritative D1 earthquake statistics', () => {
  it('observes an empty database without fabricated counts', async () => {
    expect(await readEarthquakeStatistics(db, { now: () => 100 })).toEqual({
      total_earthquakes: 0, fetched: 0, with_shakemap: 0, with_moment_tensor: 0,
      source: 'd1-earthquake-events', consistency: 'snapshot', queryStartedAtMs: 100, queryCompletedAtMs: 100,
    });
  });
  it('reads committed flags repeatedly without incrementing duplicate detail observations', async () => {
    database.exec(`INSERT INTO EarthquakeEvents (id, detail_fetched, has_shakemap, has_moment_tensor)
      VALUES ('detail', 1, 1, 0), ('summary', 0, 0, 1), ('unknown', NULL, NULL, NULL)`);
    const first = await readEarthquakeStatistics(db, { now: () => 100 });
    expect(first).toMatchObject({ total_earthquakes: 3, fetched: 1, with_shakemap: 1, with_moment_tensor: 1 });
    database.exec("UPDATE EarthquakeEvents SET detail_fetched = 1, has_shakemap = 1 WHERE id = 'detail'");
    expect(await readEarthquakeStatistics(db, { now: () => 100 })).toEqual(first);
  });
  it('requests the primary observation and records its interval without using an unconstrained replica', async () => {
    const session = { prepare: vi.fn(db.prepare) };
    const binding = { withSession: vi.fn(() => session), prepare: vi.fn(() => { throw new Error('unconstrained replica'); }) };
    const now = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(150);
    expect(await readEarthquakeStatistics(binding, { now })).toMatchObject({ queryStartedAtMs: 100, queryCompletedAtMs: 150 });
    expect(binding.withSession).toHaveBeenCalledExactlyOnceWith('first-primary');
    expect(binding.prepare).not.toHaveBeenCalled();
    expect(session.prepare).toHaveBeenCalledOnce();
  });
  it('preserves a failed database read rather than returning zero or retrying generic errors', async () => {
    const error = new Error('query unavailable');
    const first = vi.fn().mockRejectedValue(error);
    await expect(readEarthquakeStatistics({ prepare: () => ({ first }) })).rejects.toBe(error);
    expect(first).toHaveBeenCalledOnce();
  });
});
