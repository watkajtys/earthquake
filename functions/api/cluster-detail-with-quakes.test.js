import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestGet } from './cluster-detail-with-quakes.js';

const migrationsDirectory = resolve('migrations');
const migrations = readdirSync(migrationsDirectory)
  .filter(name => name.endsWith('.sql'))
  .sort()
  .map(name => readFileSync(`${migrationsDirectory}/${name}`, 'utf8'));

describe('cluster details against the migrated D1 schema', () => {
  let database;
  let env;
  let eventQuerySizes;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    migrations.forEach(sql => database.exec(sql));
    eventQuerySizes = [];
    // A small D1 adapter executes the actual endpoint SQL against SQLite.
    env = {
      DB: {
        prepare(sql) {
          const statement = database.prepare(sql);
          return {
            bind(...values) {
              // SQLite supports more parameters than D1; enforce the platform
              // limit here so a single oversized IN query fails this test.
              if (values.length > 100) throw new Error('D1 bound parameter limit exceeded');
              if (sql.includes('FROM EarthquakeEvents')) eventQuerySizes.push(values.length);
              return {
                first: async () => statement.get(...values) ?? null,
                all: async () => ({ results: statement.all(...values) }),
              };
            },
          };
        },
      },
    };
    database.prepare(`INSERT INTO EarthquakeEvents
      (id, magnitude, place, event_time, longitude, latitude, depth, usgs_detail_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('eq1', 0, 'Test location', 0, 0, 0, 0, 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/eq1.geojson');
    database.prepare(`INSERT INTO ClusterDefinitions
      (id, slug, strongestQuakeId, earthquakeIds, title, description, quakeCount, maxMagnitude, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('cluster1', 'test-cluster-eq1', 'eq1', JSON.stringify(['eq1', 'eq1', 'missing']),
        'Cluster title', 'Cluster description', 2, 0, 'v1');
  });

  afterEach(() => database.close());

  const requestFor = id => new Request(`https://example.com/api/cluster-detail-with-quakes${id ? `?id=${id}` : ''}`);

  it('returns GeoJSON summaries and cluster metadata after geojson_feature is dropped', async () => {
    expect(database.prepare('PRAGMA table_info(EarthquakeEvents)').all().map(row => row.name))
      .not.toContain('geojson_feature');

    const response = await onRequestGet({ request: requestFor('eq1'), env });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=300');
    const result = await response.json();
    expect(result).toMatchObject({
      id: 'cluster1', slug: 'test-cluster-eq1', strongestQuakeId: 'eq1',
      title: 'Cluster title', description: 'Cluster description',
      earthquakeIds: ['eq1', 'eq1', 'missing'], quakeCount: 2, maxMagnitude: 0, version: 'v1',
    });
    // Duplicated IDs produce one feature; absent archived rows do not break the response.
    expect(result.quakes).toEqual([{
      type: 'Feature', id: 'eq1',
      geometry: { type: 'Point', coordinates: [0, 0, 0] },
      properties: {
        mag: 0, place: 'Test location', time: 0,
        detail: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/eq1.geojson',
        url: 'https://earthquake.usgs.gov/earthquakes/eventpage/eq1',
      },
    }]);
  });

  it('supports the canonical cluster ID fallback', async () => {
    const response = await onRequestGet({ request: requestFor('cluster1'), env });
    expect(response.status).toBe(200);
    expect((await response.json()).quakes.map(quake => quake.id)).toEqual(['eq1']);
  });

  it('loads all 158 events within the D1 parameter limit and deduplicates across batches', async () => {
    const insert = database.prepare(`INSERT INTO EarthquakeEvents
      (id, magnitude, place, event_time, longitude, latitude, depth)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const eventIds = ['eq1'];
    for (let i = 2; i <= 158; i++) {
      eventIds.push(`eq${i}`);
      insert.run(`eq${i}`, 3, 'Cluster location', 1_700_000_000_000 + i, -118, 34, 10);
    }
    const storedIds = [...eventIds, 'eq1', 'eq100', 'eq158'];
    database.prepare('UPDATE ClusterDefinitions SET earthquakeIds = ?, quakeCount = ? WHERE id = ?')
      .run(JSON.stringify(storedIds), 158, 'cluster1');

    const response = await onRequestGet({ request: requestFor('eq1'), env });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(eventQuerySizes).toEqual([100, 58]);
    expect(result.earthquakeIds).toEqual(storedIds);
    expect(result.quakeCount).toBe(158);
    expect(result.quakes).toHaveLength(158);
    expect(new Set(result.quakes.map(quake => quake.id))).toEqual(new Set(eventIds));
  });

  it('returns an empty quake list for a definition without event IDs', async () => {
    database.exec("UPDATE ClusterDefinitions SET earthquakeIds = '[]' WHERE id = 'cluster1'");
    const response = await onRequestGet({ request: requestFor('eq1'), env });
    expect(response.status).toBe(200);
    expect((await response.json()).quakes).toEqual([]);
  });

  it('retains the missing-input and missing-cluster statuses', async () => {
    expect((await onRequestGet({ request: requestFor(), env })).status).toBe(400);
    expect((await onRequestGet({ request: requestFor('unknown'), env })).status).toBe(404);
  });

  it('reports malformed stored event IDs', async () => {
    database.exec("UPDATE ClusterDefinitions SET earthquakeIds = 'invalid' WHERE id = 'cluster1'");
    const response = await onRequestGet({ request: requestFor('eq1'), env });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Invalid earthquakeIds format in cluster definition eq1.' });
  });
});
