// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveClusterDefinition } from '../functions/utils/clusterResolver.js';

const migrationName = '0018_add_cluster_anchor_lookup_index.sql';
const indexName = 'idx_clusterdefinitions_anchor_updated_id_legacy';
const migrationsDirectory = resolve('migrations');
const migration = readFileSync(resolve(migrationsDirectory, migrationName), 'utf8');

function fixture(productionClusterDrift) {
  const sql = new DatabaseSync(':memory:');
  for (const name of readdirSync(migrationsDirectory).filter(name => name.endsWith('.sql') && name < migrationName).sort()) {
    sql.exec(readFileSync(resolve(migrationsDirectory, name), 'utf8'));
  }
  if (productionClusterDrift) {
    // Verified September 21 cluster-table drift: 0005 is recorded remotely but
    // its indexes are absent, and both historical timestamp triggers coexist.
    sql.exec(`DROP INDEX idx_ClusterDefinitions_strongestQuakeId;
      DROP INDEX idx_ClusterDefinitions_updatedAt;
      CREATE TRIGGER update_cluster_definitions_updated_at
      AFTER UPDATE ON ClusterDefinitions FOR EACH ROW BEGIN
        UPDATE ClusterDefinitions SET updatedAt = unixepoch() WHERE id = OLD.id;
      END;`);
  }
  sql.exec('BEGIN');
  const event = sql.prepare('INSERT INTO EarthquakeEvents(id,event_time,latitude,longitude,magnitude) VALUES(?,1,0,0,5)');
  for (let index = 0; index < 100; index++) event.run(`anchor-${index}`);
  event.run('mixed');
  event.run('event1');
  event.run('event2');
  const insert = sql.prepare(`INSERT INTO ClusterDefinitions
    (id, slug, stableKey, strongestQuakeId, updatedAt, createdAt, earthquakeIds, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (let index = 0; index < 5000; index++) {
    insert.run(`cluster-${index}`, `slug-${index}`, `stable-${index}`, `anchor-${index % 100}`,
      index % 2 ? '2025-01-01 00:00:00' : 1760000000000 + index,
      index % 3 ? null : 1700000000000, '["event1","event2"]', '1.011111');
  }
  insert.run('tie-b', 'tie-b', 'stable-b', 'anchor-1', '2030-01-01 00:00:00', null, '[]', 'legacy-version');
  insert.run('tie-a', 'tie-a', 'stable-a', 'anchor-1', '2030-01-01 00:00:00', null, '[]', 'legacy-version');
  insert.run('null-anchor', 'null-anchor', null, null, null, null, '[]', '1');
  sql.exec('COMMIT');
  const queries = [];
  const db = { prepare(query) {
    queries.push(query);
    return { bind: (...values) => ({ first: async () => sql.prepare(query).get(...values) ?? null }) };
  } };
  return { sql, db, queries };
}

function snapshot(sql) {
  return {
    rows: createHash('sha256').update(JSON.stringify(sql.prepare('SELECT * FROM ClusterDefinitions ORDER BY id').all())).digest('hex'),
    triggers: sql.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all(),
    changes: sql.prepare('SELECT total_changes() AS n').get().n,
  };
}

describe.each([false, true])('0018 additive cluster lookup index (production cluster drift=%s)', productionClusterDrift => {
  it('indexes the actual resolver hit/miss, preserves exact selections and leaves rows/triggers untouched', async () => {
    const { sql, db, queries } = fixture(productionClusterDrift);
    try {
      const selectors = [
        { kind: 'id', value: 'anchor-1' },
        { kind: 'id', value: 'nonexistent-anchor' },
        { kind: 'clusterId', value: 'cluster-10' },
        { kind: 'slug', value: 'slug-10' },
      ];
      const before = await Promise.all(selectors.map(selector => resolveClusterDefinition(db, selector)));
      expect(before[0].id).toBe('tie-a');
      expect(before[1]).toBeNull();
      const anchorQuery = queries.find(query => query.includes('WHERE strongestQuakeId = ?'));
      const plan = value => sql.prepare(`EXPLAIN QUERY PLAN ${anchorQuery}`).all(value).map(row => row.detail);
      expect(plan('anchor-1').some(detail => detail.includes('TEMP B-TREE'))).toBe(true);
      if (productionClusterDrift) expect(plan('nonexistent-anchor')).toContain('SCAN ClusterDefinitions');
      const original = snapshot(sql);

      sql.exec(migration);

      for (const value of ['anchor-1', 'nonexistent-anchor']) {
        const details = plan(value);
        expect(details.some(detail => detail.includes('SEARCH ClusterDefinitions USING INDEX') && detail.includes('(strongestQuakeId=?)'))).toBe(true);
        // Normalizing mixed timestamp types still sorts this bounded anchor
        // group; the anchor predicate remains indexed, including on a miss.
        expect(details).toContain('USE TEMP B-TREE FOR ORDER BY');
        if (productionClusterDrift) expect(details.some(detail => detail.includes(indexName))).toBe(true);
      }
      expect(await Promise.all(selectors.map(selector => resolveClusterDefinition(db, selector)))).toEqual(before);
      expect(snapshot(sql)).toEqual(original);
      const columns = sql.prepare(`PRAGMA index_xinfo('${indexName}')`).all().filter(column => column.key === 1);
      expect(columns.map(({ name, desc }) => ({ name, desc }))).toEqual([
        { name: 'strongestQuakeId', desc: 0 }, { name: 'updatedAt', desc: 1 }, { name: 'id', desc: 0 },
      ]);
      // A retry is harmless, and no redundant standalone timestamp index is added.
      sql.exec(migration);
      expect(snapshot(sql)).toEqual(original);
      const lookup = sql.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?").all(indexName);
      expect(lookup).toHaveLength(1);
    } finally { sql.close(); }
  });

  it('orders mixed timestamp types by instant before and after adding the index', async () => {
    const { sql, db } = fixture(productionClusterDrift);
    try {
      // The numeric millisecond timestamp is newer than the UTC text timestamp.
      sql.prepare('INSERT INTO ClusterDefinitions(id,slug,strongestQuakeId,updatedAt) VALUES(?,?,?,?)').run('older-text', 'older-text', 'mixed', '2020-01-01 00:00:00');
      sql.prepare('INSERT INTO ClusterDefinitions(id,slug,strongestQuakeId,updatedAt) VALUES(?,?,?,?)').run('newer-number', 'newer-number', 'mixed', 1789960000000);
      expect((await resolveClusterDefinition(db, { kind: 'id', value: 'mixed' })).id).toBe('newer-number');
      sql.exec(migration);
      expect((await resolveClusterDefinition(db, { kind: 'id', value: 'mixed' })).id).toBe('newer-number');
    } finally { sql.close(); }
  });
});
