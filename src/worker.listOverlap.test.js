// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';
import { handleTrustedUsgsIngestion } from '../functions/background/ingest-usgs-feed.js';
import { publishEarthquakeFeeds } from '../functions/background/publish-earthquake-feeds.js';

vi.mock('../functions/background/ingest-usgs-feed.js', () => ({ handleTrustedUsgsIngestion: vi.fn() }));
vi.mock('../functions/background/publish-earthquake-feeds.js', () => ({ publishEarthquakeFeeds: vi.fn() }));

const now = Date.UTC(2026, 8, 23, 10);
const quake = (updated, place) => ({
  type: 'Feature', id: 'overlap-quake',
  properties: { updated, time: now - 1000, mag: 5.2, place, alert: 'yellow', felt: 9,
    detail: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/overlap-quake.geojson' },
  geometry: { type: 'Point', coordinates: [-118, 35, 8] },
});

function makeCasBucket() {
  const objects = new Map(['day', 'week', 'month'].map(period =>
    [`list-${period}.json`, { etag: `initial-${period}`, rows: [] }]));
  let sequence = 0;
  const bucket = {
    objects,
    casLosses: 0,
    beforePut: null,
    get: vi.fn(async key => {
      const current = objects.get(key);
      return current ? { etag: current.etag, json: async () => structuredClone(current.rows) } : null;
    }),
    put: vi.fn(async (key, body, options) => {
      if (bucket.beforePut) await bucket.beforePut(key);
      const current = objects.get(key);
      if (options.onlyIf.etagMatches !== undefined && options.onlyIf.etagMatches !== current?.etag) {
        bucket.casLosses++;
        return null;
      }
      if (options.onlyIf.etagDoesNotMatch === '*' && current) {
        bucket.casLosses++;
        return null;
      }
      const next = { etag: `write-${++sequence}`, rows: JSON.parse(body) };
      objects.set(key, next);
      return { etag: next.etag };
    }),
  };
  return bucket;
}

async function runFiveMinuteSchedule(env) {
  const tasks = [];
  const context = { waitUntil(promise) { tasks.push(Promise.resolve(promise)); } };
  await worker.scheduled({ cron: '*/5 * * * *', scheduledTime: Date.now() }, env, context);
  expect(tasks).toHaveLength(1);
  await Promise.all(tasks);
}

describe('exported Worker and real R2 list writer under overlapping ingestion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    publishEarthquakeFeeds.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('keeps the newer event in every public array when an older scheduled list write finishes last', async () => {
    const old = quake(now - 5000, 'Older location');
    const latest = quake(now - 1000, 'Corrected location');
    handleTrustedUsgsIngestion
      .mockResolvedValueOnce(Response.json({ newOrUpdatedFeatures: [old] }))
      .mockResolvedValueOnce(Response.json({ newOrUpdatedFeatures: [latest] }));
    const bucket = makeCasBucket();
    const env = { DB: {}, GEOJSON_BUCKET: bucket };
    let releaseOld;
    const oldPaused = new Promise(resolve => { releaseOld = resolve; });
    let oldReached;
    const oldAtPut = new Promise(resolve => { oldReached = resolve; });
    let held = false;
    bucket.beforePut = async key => {
      if (key === 'list-day.json' && !held) {
        held = true;
        oldReached();
        await oldPaused;
      }
    };

    const olderSchedule = runFiveMinuteSchedule(env);
    await oldAtPut;
    await runFiveMinuteSchedule(env);
    releaseOld();
    await olderSchedule;

    expect(handleTrustedUsgsIngestion).toHaveBeenCalledTimes(2);
    expect(bucket.casLosses).toBeGreaterThan(0);
    for (const period of ['day', 'week', 'month']) {
      const rows = bucket.objects.get(`list-${period}.json`).rows;
      expect(Array.isArray(rows)).toBe(true);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: 'overlap-quake', magnitude: 5.2,
        place: 'Corrected location', event_time: now - 1000,
        properties: { updated: now - 1000, alert: 'yellow', felt: 9 } });
    }
  });
});
