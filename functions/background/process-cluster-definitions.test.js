import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import worker from './process-cluster-definitions.js';
import { processAndStoreSignificantClusters } from './process-clusters.js';
import * as spatial from '../utils/spatialClusterUtils.js';
import { storeClusterDefinition } from '../utils/d1ClusterUtils.js';
import { clusterInput, clusterNow, createClusterSqliteFixture } from '../utils/clusterSqliteFixture.test-support.js';

let fixture;
let env;
let cache;
const definitions = () => fixture.database.prepare('SELECT * FROM ClusterDefinitions ORDER BY id').all();
const published = () => JSON.parse(cache.get('active_clusters'));
const isWrite = sql => sql.includes('INSERT INTO ClusterDefinitions');
const isSnapshot = sql => sql.includes('FROM ClusterDefinitions') && sql.includes('ORDER BY significanceScore');
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(clusterNow);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fixture = createClusterSqliteFixture();
  cache = new Map([['active_clusters', '[{"id":"last-good"}]']]);
  env = { DB: fixture.db, CLUSTER_KV: { put: vi.fn(async (key, value) => { cache.set(key, value); }) } };
});
afterEach(() => {
  fixture.database.close(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function expectLastGood() {
  expect(env.CLUSTER_KV.put).not.toHaveBeenCalled();
  expect(published()).toEqual([{ id: 'last-good' }]);
  expect(console.log).not.toHaveBeenCalledWith('process-cluster-definitions: Cron job finished successfully.');
}

describe('actual scheduled cluster persistence and publication', () => {
  it('creates a valid definition and publishes its stored canonical identity', async () => {
    await worker.scheduled(null, env, {});
    const [row] = definitions();
    expect(row).toMatchObject({ createdAt: clusterNow, version: '1', quakeCount: 4, maxMagnitude: 5 });
    expect(published()).toHaveLength(1);
    expect(published()[0]).toMatchObject({ id: row.id, slug: row.slug, version: '1' });
    expect(env.CLUSTER_KV.put).toHaveBeenCalledWith('active_clusters', expect.any(String), { expirationTtl: 3600 });
  });

  it('retains historical bytes and identity across repeated cron cycles with both real triggers', async () => {
    await worker.scheduled(null, env, {});
    const original = definitions()[0];
    const version = `1.0${'1'.repeat(20_000)}`;
    fixture.database.prepare('UPDATE ClusterDefinitions SET version = ?, createdAt = ? WHERE id = ?')
      .run(version, null, original.id);
    const beforeBytes = fixture.database.prepare('SELECT hex(CAST(version AS BLOB)) AS bytes FROM ClusterDefinitions').get();
    fixture.queries.length = 0;
    for (let i = 1; i <= 5; i++) {
      vi.setSystemTime(clusterNow + i * 600_000);
      await worker.scheduled(null, env, {});
      expect(definitions()).toHaveLength(1);
      expect(definitions()[0]).toMatchObject({ id: original.id, slug: original.slug, createdAt: null, version });
      expect(published()[0]).toMatchObject({ id: original.id, slug: original.slug, version });
    }
    expect(fixture.database.prepare('SELECT hex(CAST(version AS BLOB)) AS bytes FROM ClusterDefinitions').get()).toEqual(beforeBytes);
    // The unchanged legacy snapshot still includes version. Writer requests and
    // returned identity do not transfer or concatenate it at all.
    expect(fixture.queries.filter(q => isWrite(q.sql))).toHaveLength(5);
    expect(fixture.queries.some(q => q.method === 'first')).toBe(false);
    fixture.queries.filter(q => isWrite(q.sql)).forEach(q => {
      expect(q.values).not.toContain(version);
      expect(q.sql).not.toMatch(/RETURNING.*version|version\s*=/i);
    });
  });

  it('uses a concurrent stable-key winner in both logs and the published snapshot', async () => {
    fixture.hooks.beforeExecute = async ({ sql, values }) => {
      if (!isWrite(sql)) return;
      delete fixture.hooks.beforeExecute;
      await storeClusterDefinition(fixture.db, clusterInput({
        stableKey: values[1], id: 'canonical-race-winner', slug: 'retained-canonical-slug',
      }));
    };
    await worker.scheduled(null, env, {});
    expect(definitions()).toHaveLength(1);
    expect(published()[0]).toMatchObject({ id: 'canonical-race-winner', slug: 'retained-canonical-slug', quakeCount: 4 });
    expect(console.log).toHaveBeenCalledWith('storeClusterDefinitions: Stored definition canonical-race-winner (retained-canonical-slug).');
  });

  it('keeps the old KV snapshot when a generated slug belongs to an unrelated cluster', async () => {
    fixture.hooks.beforeExecute = async ({ sql, values }) => {
      if (!isWrite(sql)) return;
      delete fixture.hooks.beforeExecute;
      await storeClusterDefinition(fixture.db, clusterInput({ id: 'unrelated', stableKey: 'unrelated-key', slug: values[2] }));
    };
    await expect(worker.scheduled(null, env, {})).rejects.toThrow('Cluster persistence failed');
    expectLastGood();
    expect(definitions()).toHaveLength(1);
    expect(definitions()[0].id).toBe('unrelated');
  });

  it('never publishes a partial run when the second cluster write fails', async () => {
    const insert = fixture.database.prepare(`INSERT INTO EarthquakeEvents
      (id, magnitude, event_time, latitude, longitude, depth, place) VALUES (?, 4, ?, 0, 0, 10, 'Elsewhere')`);
    for (let i = 5; i < 8; i++) insert.run(`quake${i}`, clusterNow - i * 1000);
    let writeCount = 0;
    fixture.hooks.beforeExecute = ({ sql }) => {
      if (isWrite(sql) && ++writeCount === 2) throw new Error('second write failed');
    };
    await expect(worker.scheduled(null, env, {})).rejects.toThrow('Cluster persistence failed for 1 definitions');
    expect(definitions()).toHaveLength(1);
    expect(fixture.queries.some(q => isSnapshot(q.sql))).toBe(false);
    expectLastGood();
  });
});

describe('scheduled publication failure boundaries', () => {
  it('preserves the old snapshot and propagates a spatial-budget failure', async () => {
    const error = Object.assign(new Error('Budget exceeded'), { code: 'SPATIAL_BUDGET_EXCEEDED' });
    vi.spyOn(spatial, 'findActiveClustersOptimized').mockImplementationOnce(() => { throw error; });
    await expect(worker.scheduled(null, env, {})).rejects.toBe(error);
    expect(definitions()).toEqual([]); expectLastGood();
  });

  it.each(['unconfirmed', 'rejected'])('retains KV after a %s database write', async failure => {
    if (failure === 'rejected') fixture.hooks.beforeExecute = ({ sql }) => { if (isWrite(sql)) throw new Error('D1 unavailable'); };
    else fixture.hooks.afterExecute = ({ sql, result }) => isWrite(sql) ? { success: false } : result;
    await expect(worker.scheduled(null, env, {})).rejects.toThrow('Cluster persistence failed');
    expect(fixture.queries.some(q => isSnapshot(q.sql))).toBe(false);
    expectLastGood();
  });

  it.each(['source', 'snapshot'])('does not turn an unsuccessful %s query into empty data', async query => {
    fixture.hooks.afterExecute = ({ sql, result }) =>
      (query === 'source' ? sql.includes('FROM EarthquakeEvents') : isSnapshot(sql))
        ? { success: false, results: [] } : result;
    await expect(worker.scheduled(null, env, {})).rejects.toThrow('query failed');
    expectLastGood();
  });

  it('rejects a KV publication failure without reporting successful completion', async () => {
    const error = new Error('KV unavailable'); env.CLUSTER_KV.put.mockRejectedValue(error);
    await expect(worker.scheduled(null, env, {})).rejects.toBe(error);
    expect(published()).toEqual([{ id: 'last-good' }]);
    expect(console.log).not.toHaveBeenCalledWith('process-cluster-definitions: Cron job finished successfully.');
  });
});

describe('inactive legacy background caller compatibility', () => {
  function mockLegacyFeed() {
    const features = fixture.database.prepare('SELECT * FROM EarthquakeEvents').all().map(row => ({
      id: row.id, geometry: { coordinates: [row.longitude, row.latitude, row.depth] },
      properties: { mag: row.magnitude, time: row.event_time, place: row.place },
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features }) }));
  }

  it('cannot append legacy version bytes if reused after the active scheduled writer', async () => {
    await worker.scheduled(null, env, {});
    const original = definitions()[0];
    const version = '1.0111111111111111111111';
    fixture.database.prepare('UPDATE ClusterDefinitions SET version = ?').run(version);
    mockLegacyFeed();
    await processAndStoreSignificantClusters(env);
    await processAndStoreSignificantClusters(env);
    expect(definitions()).toHaveLength(1);
    expect(definitions()[0]).toMatchObject({ id: original.id, slug: original.slug, createdAt: original.createdAt, version });
  });

  it('propagates an unconfirmed legacy update', async () => {
    await worker.scheduled(null, env, {});
    mockLegacyFeed();
    fixture.hooks.afterExecute = ({ method, result }) => method === 'run' ? { success: false } : result;
    await expect(processAndStoreSignificantClusters(env)).rejects.toThrow('Cluster persistence failed');
  });
});
