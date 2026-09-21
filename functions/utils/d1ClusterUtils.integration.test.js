import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storeClusterDefinition } from './d1ClusterUtils.js';
import { clusterInput, clusterNow, createClusterSqliteFixture } from './clusterSqliteFixture.test-support.js';

let fixture;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(clusterNow);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fixture = createClusterSqliteFixture();
});
afterEach(() => { fixture.database.close(); vi.useRealTimers(); vi.restoreAllMocks(); });
const readRows = () => fixture.database.prepare('SELECT * FROM ClusterDefinitions ORDER BY id').all();
const write = overrides => storeClusterDefinition(fixture.db, clusterInput(overrides));

describe('cluster writes against migrations and both production timestamp triggers', () => {
  it('initializes new rows and returns bounded canonical identity without mutating input', async () => {
    const input = Object.freeze(clusterInput({ version: 'corrupt-caller-value', createdAt: null }));
    expect(await storeClusterDefinition(fixture.db, input)).toEqual({
      success: true, id: input.id, slug: input.slug, stableKey: input.stableKey, createdAt: clusterNow,
    });
    expect(readRows()[0]).toMatchObject({
      ...input, earthquakeIds: JSON.stringify(input.earthquakeIds), version: '1',
      createdAt: clusterNow, updatedAt: clusterNow,
    });
    expect(fixture.queries).toHaveLength(1);
    expect(fixture.queries[0].sql).not.toMatch(/INSERT OR REPLACE|SELECT.*version|RETURNING.*version/i);
  });

  it.each([null, '', '1', '1.0', `1.0${'1'.repeat(20_000)}`])(
    'preserves historical version bytes and creation metadata across repeated updates (case %#)', async version => {
      await write();
      fixture.database.prepare('UPDATE ClusterDefinitions SET version = ?, createdAt = ? WHERE id = ?')
        .run(version, '2021-01-02 03:04:05', 'candidate-id');
      const before = fixture.database.prepare('SELECT hex(CAST(version AS BLOB)) AS bytes, typeof(version) AS type FROM ClusterDefinitions').get();
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(clusterNow + i * 60_000);
        const result = await write({ id: `loser-${i}`, slug: `proposed-${i}`, maxMagnitude: 6, version: 999, createdAt: 99 });
        expect(result).toEqual({ success: true, id: 'candidate-id', slug: 'candidate-slug', stableKey: clusterInput().stableKey, createdAt: '2021-01-02 03:04:05' });
      }
      expect(readRows()).toHaveLength(1);
      expect(readRows()[0]).toMatchObject({ maxMagnitude: 6, version, createdAt: '2021-01-02 03:04:05' });
      expect(fixture.database.prepare('SELECT hex(CAST(version AS BLOB)) AS bytes, typeof(version) AS type FROM ClusterDefinitions').get()).toEqual(before);
    });

  it('retains unknown historical creation time rather than inventing one on update', async () => {
    await write();
    fixture.database.exec('UPDATE ClusterDefinitions SET createdAt = NULL');
    expect(await write({ id: 'another-candidate' })).toMatchObject({ success: true, id: 'candidate-id', createdAt: null });
    expect(readRows()[0].createdAt).toBeNull();
  });

  it.each([false, true])('keeps the first stable-key identity during competing writes (reverse=%s)', async reverse => {
    const inputs = [clusterInput({ id: 'first', slug: 'first-slug' }), clusterInput({ id: 'second', slug: 'second-slug', maxMagnitude: 6 })];
    if (reverse) inputs.reverse();
    const results = await Promise.all(inputs.map(input => storeClusterDefinition(fixture.db, input)));
    results.forEach(result => expect(result).toMatchObject({ success: true, id: inputs[0].id, slug: inputs[0].slug, createdAt: clusterNow }));
    expect(readRows()).toHaveLength(1);
    expect(readRows()[0].maxMagnitude).toBe(inputs[1].maxMagnitude);
  });

  it('updates the existing row without deleting dependent rows', async () => {
    await write();
    fixture.database.exec(`CREATE TABLE ClusterBookmark (cluster_id TEXT REFERENCES ClusterDefinitions(id) ON DELETE CASCADE);
      INSERT INTO ClusterBookmark VALUES ('candidate-id');`);
    expect(await write({ id: 'racing-id', slug: 'racing-slug' })).toMatchObject({ success: true, id: 'candidate-id' });
    expect(fixture.database.prepare('SELECT cluster_id FROM ClusterBookmark').all()).toEqual([{ cluster_id: 'candidate-id' }]);
  });

  it('accepts the canonical id and slug on subsequent updates', async () => {
    await write();
    expect(await write({ maxMagnitude: 7 })).toMatchObject({ success: true, id: 'candidate-id', slug: 'candidate-slug' });
    expect(readRows()[0].maxMagnitude).toBe(7);
  });

  it.each([
    { id: 'other-id', slug: 'unclaimed-slug' },
    { id: 'unclaimed-id', slug: 'other-slug' },
    { id: 'other-id', slug: 'other-slug' },
  ])('rejects a competing unrelated identity even when stableKey matches: %j', async conflict => {
    await write();
    await write({ id: 'other-id', slug: 'other-slug', stableKey: 'other-key' });
    const before = readRows();
    expect(await write({ ...conflict, maxMagnitude: 9 })).toMatchObject({ success: false, error: expect.stringContaining('possible id or slug conflict') });
    expect(readRows()).toEqual(before);
  });

  it.each([
    { id: 'candidate-id', slug: 'new-slug' },
    { id: 'new-id', slug: 'candidate-slug' },
  ])('does not replace an unrelated stableKey on unique collision: %j', async conflict => {
    await write();
    const before = readRows();
    expect(await write({ ...conflict, stableKey: 'different-key', maxMagnitude: 9 })).toMatchObject({ success: false });
    expect(readRows()).toEqual(before);
  });

  it('allows a new legacy null-stableKey row but fails visible id/slug collisions', async () => {
    expect(await write({ stableKey: undefined })).toMatchObject({ success: true, stableKey: null });
    const before = readRows();
    expect(await write({ stableKey: null })).toMatchObject({ success: false });
    expect(await write({ id: 'different-id', stableKey: null })).toMatchObject({ success: false });
    expect(readRows()).toEqual(before);
  });

  it('makes a lost acknowledgement retry safe without replacing the winning identity', async () => {
    fixture.hooks.afterExecute = () => { throw new Error('acknowledgement lost'); };
    expect(await write()).toMatchObject({ success: false });
    delete fixture.hooks.afterExecute;
    expect(await write({ id: 'retry-id', slug: 'retry-slug' })).toMatchObject({ success: true, id: 'candidate-id', slug: 'candidate-slug' });
    expect(readRows()).toHaveLength(1);
  });

  it('works on a clean migration install without the extra production trigger', async () => {
    fixture.database.close(); fixture = createClusterSqliteFixture({ withProductionTriggers: false });
    expect(await write()).toMatchObject({ success: true });
    expect(await write({ id: 'next-id', slug: 'next-slug' })).toMatchObject({ success: true, id: 'candidate-id' });
  });

  it('fails visibly if the stableKey uniqueness prerequisite is missing', async () => {
    fixture.database.exec('DROP INDEX uidx_clusterdefinitions_stablekey');
    expect(await write()).toMatchObject({ success: false });
    expect(readRows()).toEqual([]);
  });
});

describe('strict D1 persistence acknowledgement', () => {
  it.each([undefined, {}, { success: false }, { success: true }, { success: true, results: [] },
    { success: true, results: [{ id: 'candidate-id', slug: 'candidate-slug', stableKey: 'wrong' }] },
    { success: true, results: [{}, {}] }])('rejects a missing or invalid canonical result: %j', async acknowledgement => {
    fixture.hooks.afterExecute = () => acknowledgement;
    expect(await write()).toMatchObject({ success: false });
  });

  it('reports a database exception without claiming persistence', async () => {
    fixture.hooks.beforeExecute = () => { throw new Error('D1 unavailable'); };
    expect(await write()).toEqual({ success: false, error: 'Failed to store cluster definition: D1 unavailable' });
    expect(readRows()).toEqual([]);
  });
});
