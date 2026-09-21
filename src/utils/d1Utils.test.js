import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { upsertEarthquakeFeaturesToD1 } from './d1Utils.js';

const migrations = readdirSync(resolve('migrations'))
  .filter(name => name.endsWith('.sql'))
  .sort()
  .map(name => readFileSync(resolve('migrations', name), 'utf8'));
const now = Date.UTC(2026, 8, 21);
const makeFeature = (id = 'quake1') => ({
  type: 'Feature',
  id,
  properties: {
    time: now - 60 * 60 * 1000,
    updated: now,
    mag: 5.1,
    place: 'Test location',
    detail: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${id}.geojson`,
  },
  geometry: { type: 'Point', coordinates: [-118, 34, 10] },
});
const expectedOutcome = (overrides = {}) => ({
  successCount: 0, errorCount: 0, complete: true,
  persistedIds: [], unchangedIds: [], failedIds: [], rejectedIds: [],
  ...overrides,
});

describe('earthquake persistence against the migrated D1 schema', () => {
  let database;
  let db;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    database = new DatabaseSync(':memory:');
    migrations.forEach(sql => database.exec(sql));
    db = {
      prepare: vi.fn(sql => {
        const statement = database.prepare(sql);
        return {
          bind(...values) {
            if (values.length > 100) throw new Error('D1 bound parameter limit exceeded');
            return { run: () => ({ success: true, meta: statement.run(...values) }) };
          },
        };
      }),
      batch: vi.fn(async operations => {
        // D1 batches are transactional. Exercise the actual SQL with that
        // boundary rather than mocking successful calls without result metadata.
        database.exec('BEGIN');
        try {
          const results = operations.map(operation => operation.run());
          database.exec('COMMIT');
          return results;
        } catch (error) {
          database.exec('ROLLBACK');
          throw error;
        }
      }),
    };
  });

  afterEach(() => {
    database.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const rows = () => database.prepare('SELECT * FROM EarthquakeEvents ORDER BY id').all();

  it('persists valid summaries, including explicit null and zero scientific values', async () => {
    const feature = makeFeature();
    feature.properties.mag = null;
    feature.properties.place = null;
    feature.geometry.coordinates = [0, 0, 0];
    feature.properties.time = 0;

    expect(await upsertEarthquakeFeaturesToD1(db, [feature])).toEqual(expectedOutcome({
      successCount: 1, persistedIds: ['quake1'],
    }));
    expect(rows()[0]).toMatchObject({
      id: 'quake1', event_time: 0, magnitude: null, place: null,
      longitude: 0, latitude: 0, depth: 0,
      retrieved_at: now, next_detail_fetch_attempt: now + 45 * 60 * 1000,
    });
  });

  it('distinguishes an identical summary from a changed row without rewriting retrieval/retry times', async () => {
    const feature = makeFeature();
    await upsertEarthquakeFeaturesToD1(db, [feature]);
    const original = rows()[0];
    vi.setSystemTime(now + 60 * 1000);

    expect(await upsertEarthquakeFeaturesToD1(db, [feature])).toEqual(expectedOutcome({
      successCount: 1, unchangedIds: ['quake1'],
    }));
    expect(rows()[0]).toEqual(original);
  });

  it.each([
    ['event_time', feature => { feature.properties.time += 1; }, now - 60 * 60 * 1000 + 1],
    ['longitude', feature => { feature.geometry.coordinates[0] = -117.8; }, -117.8],
    ['latitude', feature => { feature.geometry.coordinates[1] = 34.2; }, 34.2],
    ['depth', feature => { feature.geometry.coordinates[2] = 22; }, 22],
    ['magnitude', feature => { feature.properties.mag = 0; }, 0],
    ['place', feature => { feature.properties.place = 'Revised location'; }, 'Revised location'],
    ['usgs_detail_url', feature => { feature.properties.detail = 'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=quake1&format=geojson'; }, 'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=quake1&format=geojson'],
  ])('persists a correction to %s when other source fields do not change', async (column, revise, expected) => {
    const feature = makeFeature();
    await upsertEarthquakeFeaturesToD1(db, [feature]);
    revise(feature);
    vi.setSystemTime(now + 1000);

    expect(await upsertEarthquakeFeaturesToD1(db, [feature])).toEqual(expectedOutcome({
      successCount: 1, persistedIds: ['quake1'],
    }));
    expect(rows()[0][column]).toBe(expected);
    expect(rows()[0].retrieved_at).toBe(now + 1000);
    expect(rows()[0].next_detail_fetch_attempt).toBe(now + 45 * 60 * 1000);
  });

  it('applies null transitions and then recognizes unchanged nulls', async () => {
    const feature = makeFeature();
    await upsertEarthquakeFeaturesToD1(db, [feature]);
    feature.properties.mag = null;
    feature.properties.place = null;
    expect((await upsertEarthquakeFeaturesToD1(db, [feature])).persistedIds).toEqual(['quake1']);
    expect(rows()[0]).toMatchObject({ magnitude: null, place: null });
    expect((await upsertEarthquakeFeaturesToD1(db, [feature])).unchangedIds).toEqual(['quake1']);
    feature.properties.mag = -0.5;
    feature.properties.place = 'Revised location';
    expect((await upsertEarthquakeFeaturesToD1(db, [feature])).persistedIds).toEqual(['quake1']);
    expect(rows()[0]).toMatchObject({ magnitude: -0.5, place: 'Revised location' });
  });

  it('derives the detail URL when it is absent', async () => {
    const feature = makeFeature();
    delete feature.properties.detail;
    await upsertEarthquakeFeaturesToD1(db, [feature]);
    expect(rows()[0].usgs_detail_url).toBe('https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/quake1.geojson');
  });

  it('reports the failed first 90 features separately from a successful last feature and recovers on retry', async () => {
    const features = Array.from({ length: 91 }, (_, i) => makeFeature(`quake${i}`));
    db.batch.mockRejectedValueOnce(new Error('Transient D1 outage'));

    expect(await upsertEarthquakeFeaturesToD1(db, features)).toEqual(expectedOutcome({
      successCount: 1, errorCount: 90, complete: false,
      persistedIds: ['quake90'], failedIds: features.slice(0, 90).map(feature => feature.id),
    }));
    expect(rows().map(row => row.id)).toEqual(['quake90']);
    expect(db.batch.mock.calls.map(([operations]) => operations.length)).toEqual([90, 1]);

    expect(await upsertEarthquakeFeaturesToD1(db, features)).toEqual(expectedOutcome({
      successCount: 91,
      persistedIds: features.slice(0, 90).map(feature => feature.id), unchangedIds: ['quake90'],
    }));
    expect(rows()).toHaveLength(91);
  });

  it.each([
    ['missing results', []],
    ['unsuccessful result', [{ success: false, meta: { changes: 0 } }]],
    ['missing changes', [{ success: true, meta: {} }]],
    ['negative changes', [{ success: true, meta: { changes: -1 } }]],
  ])('does not claim persistence for %s', async (_label, result) => {
    db.batch.mockResolvedValueOnce(result);
    expect(await upsertEarthquakeFeaturesToD1(db, [makeFeature()])).toEqual(expectedOutcome({
      errorCount: 1, complete: false, failedIds: ['quake1'],
    }));
  });

  it('safely retries a committed batch whose persistence result was lost', async () => {
    const executeBatch = db.batch.getMockImplementation();
    db.batch.mockImplementationOnce(async operations => {
      await executeBatch(operations);
      return [];
    });

    expect(await upsertEarthquakeFeaturesToD1(db, [makeFeature()])).toEqual(expectedOutcome({
      errorCount: 1, complete: false, failedIds: ['quake1'],
    }));
    expect(rows()).toHaveLength(1);
    expect(await upsertEarthquakeFeaturesToD1(db, [makeFeature()])).toEqual(expectedOutcome({
      successCount: 1, unchangedIds: ['quake1'],
    }));
    expect(rows()).toHaveLength(1);
  });

  it('does not checkpoint rejected features even if other features persist', async () => {
    const invalidTime = makeFeature('invalid-time');
    invalidTime.properties.time = null;
    const invalidCoordinate = makeFeature('invalid-coordinate');
    invalidCoordinate.geometry.coordinates[2] = Infinity;
    const result = await upsertEarthquakeFeaturesToD1(db, [
      makeFeature('valid'), { id: 'missing-properties' }, invalidTime, invalidCoordinate, null,
    ]);

    expect(result).toEqual(expectedOutcome({
      successCount: 1, errorCount: 4, complete: false, persistedIds: ['valid'],
      rejectedIds: ['missing-properties', 'invalid-time', 'invalid-coordinate', null],
    }));
    expect(rows().map(row => row.id)).toEqual(['valid']);
  });

  it('reports a missing binding and preparation errors as failed valid features', async () => {
    const expected = expectedOutcome({ errorCount: 1, complete: false, failedIds: ['quake1'] });
    expect(await upsertEarthquakeFeaturesToD1(null, [makeFeature()])).toEqual(expected);
    db.prepare.mockImplementationOnce(() => { throw new Error('D1 unavailable'); });
    expect(await upsertEarthquakeFeaturesToD1(db, [makeFeature()])).toEqual(expected);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('accepts a validated empty list but rejects a non-array input', async () => {
    expect(await upsertEarthquakeFeaturesToD1(db, [])).toEqual(expectedOutcome());
    expect(await upsertEarthquakeFeaturesToD1(db, null)).toEqual(expectedOutcome({
      errorCount: 1, complete: false, rejectedIds: [null],
    }));
    expect(db.prepare).not.toHaveBeenCalled();
  });
});
