import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import consumer from './geojson-archive.js';
import { persistEarthquakeDetail } from '../utils/earthquakeDetailPersistence.js';
import { createMemorySummaryBucket } from '../utils/clusterSummarySnapshot.test-support.js';

const now = Date.UTC(2026, 8, 23);
const migrations = readdirSync(resolve('migrations')).filter(name => name.endsWith('.sql')).sort()
  .map(name => readFileSync(resolve('migrations', name), 'utf8'));
const feature = (updated, { place = 'Current place', products = { 'moment-tensor': [{}] } } = {}) => ({
  type: 'Feature', id: 'quake1',
  properties: { time: now - 2 * 60 * 60 * 1000, updated, mag: 4.5, place, products },
  geometry: { type: 'Point', coordinates: [-118, 34, 10] },
});
const message = detail => ({ body: { id: 'quake1', geojson: detail }, ack: vi.fn(), retry: vi.fn() });

describe('revisioned detail archive and legacy queue delivery', () => {
  let sqlite;
  let env;
  let bucket;
  const row = () => sqlite.prepare('SELECT * FROM EarthquakeEvents WHERE id = ?').get('quake1');
  const job = revision => sqlite.prepare(`SELECT * FROM EarthquakeDetailJobs
    WHERE event_id = ? AND target_revision_ms = ?`).get('quake1', revision);
  const deliver = async detail => {
    const item = message(detail);
    await consumer.queue({ messages: [item] }, env);
    return item;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sqlite = new DatabaseSync(':memory:');
    migrations.forEach(sql => sqlite.exec(sql));
    const prepare = sql => ({ bind: (...values) => ({
      first: async () => sqlite.prepare(sql).get(...values),
      all: async () => ({ success: true, results: sqlite.prepare(sql).all(...values) }),
      run: async () => ({ success: true, meta: sqlite.prepare(sql).run(...values) }),
    }) });
    const batch = vi.fn(async statements => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const [index, statement] of statements.entries()) {
          results.push(index === statements.length - 1 ? await statement.all() : await statement.run());
        }
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    });
    bucket = createMemorySummaryBucket();
    env = { DB: { prepare, batch }, GEOJSON_BUCKET: bucket };
  });
  afterEach(() => { sqlite.close(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it.each(['newer first', 'older first'])('fences reverse-order legacy messages: %s', async order => {
    const older = feature(now, { place: 'Old place', products: {} });
    const newer = feature(now + 1000);
    const first = await deliver(order === 'newer first' ? newer : older);
    const second = await deliver(order === 'newer first' ? older : newer);
    expect(first.ack).toHaveBeenCalledOnce();
    expect(second.ack).toHaveBeenCalledOnce();
    expect(first.retry).not.toHaveBeenCalled();
    expect(second.retry).not.toHaveBeenCalled();
    expect(row()).toMatchObject({ source_updated_at_ms: now + 1000, detail_archive_revision_ms: now + 1000,
      detail_metadata_revision_ms: now + 1000, place: 'Current place', has_moment_tensor: 1, detail_fetched: 1 });
    expect(bucket.readJson(row().detail_archive_key)).toEqual(newer);
    expect([...bucket.objects.keys()].every(key => key.startsWith('details/v1/quake1/'))).toBe(true);
    expect(bucket.objects.has('quake1.json')).toBe(false);
  });

  it('rejects a missing legacy source revision without fabricating one', async () => {
    const invalid = feature(now);
    delete invalid.properties.updated;
    const item = await deliver(invalid);
    expect(item.ack).toHaveBeenCalledOnce();
    expect(item.retry).not.toHaveBeenCalled();
    expect(row()).toBeUndefined();
    expect(bucket.objects.size).toBe(0);
  });

  it('acknowledges an equal-revision conflict without replacing the committed flags or archive', async () => {
    const current = feature(now);
    expect((await deliver(current)).ack).toHaveBeenCalledOnce();
    const key = row().detail_archive_key;
    const conflict = await deliver(feature(now, { place: 'Conflicting place', products: {} }));
    expect(conflict.ack).toHaveBeenCalledOnce();
    expect(conflict.retry).not.toHaveBeenCalled();
    expect(row()).toMatchObject({ place: 'Current place', has_moment_tensor: 1, detail_archive_key: key });
    expect(bucket.objects.size).toBe(1);
  });

  it('does not silently overwrite different bytes at a committed content key', async () => {
    const detail = feature(now);
    expect((await deliver(detail)).ack).toHaveBeenCalledOnce();
    const key = row().detail_archive_key;
    const original = JSON.stringify(detail);
    bucket.seed(key, 'x'.repeat(original.length));
    const duplicate = await deliver(detail);
    expect(duplicate.retry).toHaveBeenCalledOnce();
    expect(duplicate.ack).not.toHaveBeenCalled();
    expect(row().detail_archive_key).toBe(key);
    expect(await (await bucket.get(key)).text()).toBe('x'.repeat(original.length));
  });

  it('keeps a durable pending job after R2 failure and completes a later delivery', async () => {
    const detail = feature(now);
    bucket.hooks.beforePut = () => { throw new Error('R2 outage'); };
    const first = await deliver(detail);
    expect(first.retry).toHaveBeenCalledOnce();
    expect(row()).toMatchObject({ detail_fetched: 0, detail_archive_key: null });
    expect(job(now)).toMatchObject({ status: 'pending', attempts: 1, next_attempt_at_ms: now + 60 * 60 * 1000 });
    const duplicate = await deliver(detail);
    expect(duplicate.ack).toHaveBeenCalledOnce();
    expect(duplicate.retry).not.toHaveBeenCalled();
    expect(bucket.calls.filter(call => call.method === 'put')).toHaveLength(1);
    delete bucket.hooks.beforePut;
    vi.setSystemTime(now + 60 * 60 * 1000);
    expect((await deliver(detail)).ack).toHaveBeenCalledOnce();
    expect(job(now).status).toBe('completed');
  });

  it('acknowledges a duplicate delivery while the durable job is leased', async () => {
    const detail = feature(now);
    let duplicate;
    bucket.hooks.beforePut = async () => {
      delete bucket.hooks.beforePut;
      duplicate = await deliver(detail);
    };
    const first = await deliver(detail);
    expect(first.ack).toHaveBeenCalledOnce();
    expect(duplicate.ack).toHaveBeenCalledOnce();
    expect(duplicate.retry).not.toHaveBeenCalled();
    expect(bucket.calls.filter(call => call.method === 'put')).toHaveLength(1);
    expect(job(now).status).toBe('completed');
  });

  it('rolls back pointer publication when the D1 batch fails after R2 succeeds', async () => {
    const detail = feature(now);
    env.DB.batch.mockImplementationOnce(async statements => {
      sqlite.exec('BEGIN');
      await statements[0].run();
      sqlite.exec('ROLLBACK');
      throw new Error('D1 failed after pointer statement');
    });
    const first = await deliver(detail);
    expect(first.retry).toHaveBeenCalledOnce();
    expect(row()).toMatchObject({ detail_fetched: 0, detail_archive_key: null });
    expect(bucket.objects.has(job(now).archive_key)).toBe(true);
    expect(job(now).status).toBe('pending');
    vi.setSystemTime(now + 60 * 60 * 1000);
    expect((await deliver(detail)).ack).toHaveBeenCalledOnce();
    expect(row().detail_archive_key).toBe(job(now).archive_key);
  });

  it('cannot publish after losing a lease; an expired lease can recover', async () => {
    const detail = feature(now);
    bucket.hooks.beforePut = () => {
      sqlite.prepare(`UPDATE EarthquakeDetailJobs SET lease_token = 'another-worker'
        WHERE event_id = 'quake1'`).run();
      delete bucket.hooks.beforePut;
    };
    await expect(persistEarthquakeDetail({ env, detailData: detail })).rejects.toThrow('lease was lost');
    expect(row()).toMatchObject({ detail_fetched: 0, detail_archive_key: null });
    expect(job(now)).toMatchObject({ status: 'leased', lease_token: 'another-worker' });
    vi.setSystemTime(now + 10 * 60 * 1000 + 1);
    await persistEarthquakeDetail({ env, detailData: detail });
    expect(job(now).status).toBe('completed');
    expect(row().detail_archive_revision_ms).toBe(now);
  });

  it('lets validated detail establish a legacy source revision, but not regress a newer pointer', async () => {
    const current = feature(now + 1000);
    sqlite.prepare(`INSERT INTO EarthquakeEvents (id, event_time, latitude, longitude, depth,
      magnitude, place, usgs_detail_url, source_updated_at_ms, detail_archive_key,
      detail_archive_revision_ms, detail_metadata_revision_ms, detail_fetched, has_moment_tensor)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 1, 1)`)
      .run('quake1', current.properties.time, 34, -118, 10, 4.5, current.properties.place,
        'https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/quake1.geojson',
        'details/v1/quake1/newer/committed.json', now + 1000, now + 1000);
    await expect(persistEarthquakeDetail({ env, detailData: feature(now, { place: 'Old place', products: {} }) }))
      .rejects.toMatchObject({ code: 'STALE_DETAIL_REVISION' });
    expect(row()).toMatchObject({ source_updated_at_ms: null, place: 'Current place',
      detail_archive_revision_ms: now + 1000, has_moment_tensor: 1 });
    expect(job(now)).toBeUndefined();

    sqlite.exec('DELETE FROM EarthquakeDetailJobs; DELETE FROM EarthquakeEvents;');
    await persistEarthquakeDetail({ env, detailData: current });
    expect(row()).toMatchObject({ source_updated_at_ms: now + 1000, detail_archive_revision_ms: now + 1000 });
  });
});
