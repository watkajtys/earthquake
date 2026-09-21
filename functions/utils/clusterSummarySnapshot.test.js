// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { publishClusterSummarySnapshot, readSummaryPointer, readSummaryJsonObject } from './clusterSummarySnapshot.js';
import { createMemorySummaryBucket } from './clusterSummarySnapshot.test-support.js';
import { createClusterSqliteFixture, clusterNow } from './clusterSqliteFixture.test-support.js';
import { SUMMARY_POINTER_KEY, SUMMARY_PAGE_SIZE, SUMMARY_MAX_AGE_MS, MAX_SUMMARY_ITEMS,
  generationManifestKey, generationPageKey, sha256Hex, validateSummaryManifest, validateSummaryPage } from '../../shared/clusterSummaryContract.js';

const ids = Array.from({ length: 20 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
let fixture;
let bucket;
let env;
let nextId;
const publish = options => publishClusterSummarySnapshot(env, { now: clusterNow, randomUUID: () => ids[nextId++], ...options });
function seed(id = 'cluster1', overrides = {}) {
  const row = { id, slug: id, title: 'Test cluster', locationName: 'Example', quakeCount: 3,
    maxMagnitude: 5, startTime: clusterNow - 1000, endTime: clusterNow, strongestQuakeId: 'quake1', ...overrides };
  fixture.database.prepare(`INSERT INTO ClusterDefinitions
    (id,slug,title,locationName,quakeCount,maxMagnitude,startTime,endTime,strongestQuakeId) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(...Object.values(row));
  return row;
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function currentObjects() {
  const pointer = bucket.readJson(SUMMARY_POINTER_KEY);
  const manifest = bucket.readJson(pointer.current.manifestKey);
  return { pointer, manifest, pages: manifest.pages.map(page => bucket.readJson(page.key)) };
}
beforeEach(() => {
  fixture = createClusterSqliteFixture(); bucket = createMemorySummaryBucket();
  env = { DB: fixture.db, GEOJSON_BUCKET: bucket }; nextId = 0;
});
afterEach(() => fixture.database.close());

describe('bounded scalar snapshot publisher with actual migrated SQL', () => {
  it('captures the pointer before one scalar SELECT and filters before paginating', async () => {
    for (let i = 0; i < 201; i++) seed(`low-${i}`, { maxMagnitude: 4.4 });
    seed('qualifying-z', { maxMagnitude: 5 }); seed('qualifying-a', { maxMagnitude: 6 });
    seed('old', { endTime: clusterNow - 31 * 86400_000, startTime: clusterNow - 32 * 86400_000 });
    fixture.hooks.beforeExecute = () => expect(bucket.calls).toEqual([{ method: 'get', key: SUMMARY_POINTER_KEY }]);
    expect(await publish()).toEqual({ published: true, generationId: ids[0], snapshotSequence: 1, totalCount: 2, pageCount: 1 });
    const { pointer, manifest, pages } = await currentObjects();
    expect(fixture.queries).toHaveLength(1);
    expect(fixture.queries[0].sql).not.toMatch(/earthquakeIds|version|SELECT\s+\*/iu);
    expect(fixture.queries[0].values).toEqual([clusterNow - 30 * 86400_000, 4.5, 20_001]);
    expect(pages[0].items.map(item => item.id)).toEqual(['qualifying-a', 'qualifying-z']);
    expect(validateSummaryManifest(manifest, pointer.current)).toBe(manifest);
    expect(validateSummaryPage(pages[0], manifest, 0)).toBe(pages[0]);
    expect(manifest.pages[0].sha256).toBe(await sha256Hex(JSON.stringify(pages[0])));
    expect(bucket.calls.at(-1)).toMatchObject({ method: 'put', key: SUMMARY_POINTER_KEY, options: { onlyIf: { etagDoesNotMatch: '*' } } });
    expect(JSON.stringify(pointer)).not.toContain('cursorSecret');
  });

  it('publishes a genuine empty observation as one valid empty page', async () => {
    expect(await publish()).toMatchObject({ published: true, totalCount: 0, pageCount: 1 });
    const { manifest, pages } = await currentObjects();
    expect(pages[0].items).toEqual([]);
    expect(manifest.pages[0].count).toBe(0);
    expect(validateSummaryManifest(manifest)).toBe(manifest);
  });

  it('stores immutable 200-item pages and correctly accounts for the remainder', async () => {
    for (let i = 0; i < 401; i++) seed(`cluster-${String(i).padStart(4, '0')}`);
    expect(await publish()).toMatchObject({ totalCount: 401, pageCount: 3 });
    const { manifest, pages } = await currentObjects();
    expect(pages.map(page => page.items.length)).toEqual([SUMMARY_PAGE_SIZE, SUMMARY_PAGE_SIZE, 1]);
    expect(manifest.pages.map(page => page.count)).toEqual([200, 200, 1]);
    expect(new Set(pages.flatMap(page => page.items.map(item => item.id))).size).toBe(401);
    expect(bucket.calls.filter(call => call.method === 'put').every(call => call.options.onlyIf.etagDoesNotMatch === '*')).toBe(true);
  });

  it('retains at most twelve committed generations and expires older history', async () => {
    seed();
    for (let i = 0; i < 14; i++) await publish({ now: clusterNow + i * 1000 });
    const pointer = bucket.readJson(SUMMARY_POINTER_KEY);
    expect(pointer.current.snapshotSequence).toBe(14);
    expect(pointer.history).toHaveLength(11);
    expect(pointer.history.map(entry => entry.snapshotSequence)).toEqual([13,12,11,10,9,8,7,6,5,4,3]);
    await publish({ now: clusterNow + SUMMARY_MAX_AGE_MS + 20_000 });
    expect(bucket.readJson(SUMMARY_POINTER_KEY).history).toEqual([]);
    // No destructive GC: previously committed objects remain for later lifecycle work.
    expect(bucket.objects.has(generationManifestKey(ids[0]))).toBe(true);
  });

  it.each(['too-many', 'duplicate', 'oversized', 'malformed', 'query-failure'])('retains the pointer on %s projection failure', async failure => {
    seed(); await publish(); const before = bucket.objects.get(SUMMARY_POINTER_KEY);
    const writes = bucket.calls.filter(call => call.method === 'put').length;
    fixture.hooks.afterExecute = ({ result }) => {
      if (failure === 'too-many') return { success: true, results: Array(MAX_SUMMARY_ITEMS + 1).fill(result.results[0]) };
      if (failure === 'duplicate') return { success: true, results: [...result.results, ...result.results] };
      if (failure === 'oversized') result.results[0].title = '🌎'.repeat(1000);
      if (failure === 'malformed') result.results[0].quakeCount = -1;
      if (failure === 'query-failure') return { success: false, results: [] };
      return result;
    };
    await expect(publish()).rejects.toThrow();
    expect(bucket.objects.get(SUMMARY_POINTER_KEY)).toBe(before);
    expect(bucket.calls.filter(call => call.method === 'put')).toHaveLength(writes);
  });

  it.each(['exception', 'malformed', 'oversized'])('does not bootstrap over a %s pointer read', async failure => {
    if (failure === 'exception') bucket.hooks.beforeGet = () => { throw new Error('R2 unavailable'); };
    if (failure === 'malformed') bucket.seed(SUMMARY_POINTER_KEY, '{}');
    if (failure === 'oversized') bucket.seed(SUMMARY_POINTER_KEY, 'x'.repeat(65_537));
    await expect(publish()).rejects.toThrow();
    expect(fixture.queries).toHaveLength(0);
    expect(bucket.calls.some(call => call.method === 'put')).toBe(false);
  });

  it.each(['page', 'manifest', 'pointer'])('retains the prior committed pointer when %s write fails', async stage => {
    seed(); await publish(); const before = bucket.objects.get(SUMMARY_POINTER_KEY);
    bucket.hooks.beforePut = key => {
      if ((stage === 'page' && key.includes('/pages/')) || (stage === 'manifest' && key.endsWith('/manifest.json')) ||
          (stage === 'pointer' && key === SUMMARY_POINTER_KEY)) throw new Error('write failed');
    };
    await expect(publish()).rejects.toThrow('write failed');
    expect(bucket.objects.get(SUMMARY_POINTER_KEY)).toBe(before);
  });

  it('treats a lost pointer acknowledgement as an error, then retries from a fresh source observation', async () => {
    seed();
    bucket.hooks.afterPut = (key, result) => {
      if (key === SUMMARY_POINTER_KEY) throw new Error('acknowledgement lost');
      return result;
    };
    await expect(publish()).rejects.toThrow('acknowledgement lost');
    expect(bucket.readJson(SUMMARY_POINTER_KEY).current.generationId).toBe(ids[0]);
    delete bucket.hooks.afterPut;
    fixture.database.prepare('UPDATE ClusterDefinitions SET title = ?').run('Corrected title');
    expect(await publish()).toMatchObject({ published: true, snapshotSequence: 2 });
    const { pages } = await currentObjects(); expect(pages[0].items[0].title).toBe('Corrected title');
    expect(fixture.queries).toHaveLength(2);
  });

  it('rejects an immutable generation collision without overwriting its pages', async () => {
    seed(); await publish(); const before = bucket.objects.get(generationPageKey(ids[0], 0));
    await expect(publish({ randomUUID: () => ids[0] })).rejects.toThrow('did not confirm');
    expect(bucket.objects.get(generationPageKey(ids[0], 0))).toBe(before);
    expect(bucket.readJson(SUMMARY_POINTER_KEY).current.snapshotSequence).toBe(1);
  });

  it.each([undefined, {}, { etag: '' }])('rejects an unconfirmed R2 page result: %j', async acknowledgement => {
    seed(); await publish(); const before = bucket.objects.get(SUMMARY_POINTER_KEY);
    bucket.hooks.afterPut = (key, result) => key.includes('/pages/') ? acknowledgement : result;
    await expect(publish()).rejects.toThrow('did not confirm');
    expect(bucket.objects.get(SUMMARY_POINTER_KEY)).toBe(before);
  });

  it('fails closed before any staging writes when the snapshot sequence cannot increase safely', async () => {
    seed(); await publish();
    const pointer = bucket.readJson(SUMMARY_POINTER_KEY);
    pointer.current.snapshotSequence = Number.MAX_SAFE_INTEGER;
    bucket.seed(SUMMARY_POINTER_KEY, pointer);
    const before = bucket.objects.get(SUMMARY_POINTER_KEY);
    const writes = bucket.calls.filter(call => call.method === 'put').length;
    await expect(publish()).rejects.toThrow('snapshot sequence');
    expect(bucket.objects.get(SUMMARY_POINTER_KEY)).toBe(before);
    expect(bucket.calls.filter(call => call.method === 'put')).toHaveLength(writes);
  });

  it('rejects an invalid generation identifier without staging objects', async () => {
    seed();
    await expect(publish({ randomUUID: () => '../untrusted-path' })).rejects.toThrow('generation ID');
    expect(bucket.calls.some(call => call.method === 'put')).toBe(false);
  });
});

describe('publication compare-and-swap races', () => {
  it.each([false, true])('discards delayed stale observations without rebase (existing pointer=%s)', async existing => {
    seed(); if (existing) await publish();
    const oldGeneration = ids[nextId];
    const held = deferred(); const release = deferred();
    bucket.hooks.beforePut = async key => {
      if (key === generationPageKey(oldGeneration, 0)) { held.resolve(); await release.promise; }
    };
    const delayed = publish(); await held.promise;
    fixture.database.prepare('UPDATE ClusterDefinitions SET title = ?').run('Newer observation');
    const winner = await publish({ now: clusterNow + 1000 });
    release.resolve();
    expect(await delayed).toEqual({ published: false, reason: 'superseded' });
    const { pointer, pages } = await currentObjects();
    expect(pointer.current.generationId).toBe(winner.generationId);
    expect(pages[0].items[0].title).toBe('Newer observation');
    expect(pointer.history.some(entry => entry.generationId === oldGeneration)).toBe(false);
    expect(bucket.calls.filter(call => call.method === 'get' && call.key === SUMMARY_POINTER_KEY)).toHaveLength(existing ? 3 : 2);
    expect(fixture.queries).toHaveLength(existing ? 3 : 2);
  });
});

describe('bounded metadata reads', () => {
  it('enforces streamed bytes even when declared size is too small', async () => {
    bucket.seed('object', '"12345"');
    bucket.hooks.afterGet = (key, object) => ({ ...object, size: 2 });
    await expect(readSummaryJsonObject(bucket, 'object', 4)).rejects.toThrow('byte limit');
  });
  it('rejects invalid UTF-8 rather than normalizing corrupted metadata', async () => {
    bucket.seed('object', new Uint8Array([0xff]));
    await expect(readSummaryJsonObject(bucket, 'object', 4)).rejects.toThrow();
  });
  it('distinguishes a missing pointer from invalid contents', async () => {
    expect(await readSummaryPointer(bucket)).toEqual({ pointer: null, etag: null });
    bucket.seed(SUMMARY_POINTER_KEY, '{}');
    await expect(readSummaryPointer(bucket)).rejects.toThrow();
  });
});
