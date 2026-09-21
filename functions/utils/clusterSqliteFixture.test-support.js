import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const migrations = readdirSync(resolve('migrations'))
  .filter(name => name.endsWith('.sql')).sort()
  .map(name => readFileSync(resolve('migrations', name), 'utf8'));

// Sanitized exact cluster triggers from the 2026-09-21 read-only production
// preflight. Migration 0010 supplies the formatted-time trigger; production
// also retains this older seconds trigger. Tests need no ignored audit files.
const productionTrigger = `CREATE TRIGGER update_cluster_definitions_updated_at
  AFTER UPDATE ON ClusterDefinitions FOR EACH ROW
  BEGIN UPDATE ClusterDefinitions SET updatedAt = unixepoch() WHERE id = OLD.id; END`;

export const clusterNow = Date.UTC(2026, 8, 21);
export const clusterInput = (overrides = {}) => ({
  id: 'candidate-id', stableKey: 'v1_example_100_34.0--118.0', slug: 'candidate-slug',
  strongestQuakeId: 'quake1', earthquakeIds: ['quake1', 'quake2', 'quake3'],
  title: 'Example cluster', description: 'Three events', locationName: 'Example',
  maxMagnitude: 5, meanMagnitude: 4, minMagnitude: 3, depthRange: '5.0-15.0km',
  centroidLat: 34, centroidLon: -118, radiusKm: 50,
  startTime: clusterNow - 60_000, endTime: clusterNow - 1000,
  durationHours: 1, quakeCount: 3, significanceScore: 10,
  ...overrides,
});

export function createClusterSqliteFixture({ withProductionTriggers = true } = {}) {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON; PRAGMA recursive_triggers = OFF;');
  migrations.forEach(sql => database.exec(sql));
  if (withProductionTriggers) database.exec(productionTrigger);
  const queries = [];
  const hooks = {};
  const db = {
    prepare(sql) {
      const statement = database.prepare(sql);
      let values = [];
      const execute = async method => {
        queries.push({ sql, values, method });
        await hooks.beforeExecute?.({ sql, values, method });
        let result;
        if (method === 'first') result = statement.get(...values) ?? null;
        else if (method === 'all') result = { success: true, results: statement.all(...values) };
        else result = { success: true, meta: statement.run(...values) };
        return hooks.afterExecute ? hooks.afterExecute({ sql, values, method, result }) : result;
      };
      const prepared = {
        bind(...parameters) {
          if (parameters.length > 100) throw new Error('Too many D1 parameters');
          values = parameters;
          return prepared;
        },
        all: () => execute('all'), first: () => execute('first'), run: () => execute('run'),
      };
      return prepared;
    },
  };
  const insert = database.prepare(`INSERT INTO EarthquakeEvents
    (id, magnitude, event_time, longitude, latitude, depth, place) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  ['quake1', 'quake2', 'quake3', 'quake4'].forEach((id, i) =>
    insert.run(id, 5 - i * 0.1, clusterNow - 60_000 + i * 1000, -118, 34, 10, 'Example'));
  return { database, db, queries, hooks };
}
