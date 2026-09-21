import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleGenerateLists } from './generate-lists.js';

const now = Date.UTC(2026, 8, 21);
const day = 24 * 60 * 60 * 1000;
const feature = (id, ageDays = 0, properties = {}) => ({
  type: 'Feature', id,
  geometry: { type: 'Point', coordinates: [-118, 35, 8] },
  properties: {
    mag: 6.3, place: 'Test location', time: now - ageDays * day,
    alert: 'yellow', tsunami: 1, felt: 456, sig: 987,
    detail: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${id}.geojson`,
    url: `https://earthquake.usgs.gov/earthquakes/eventpage/${id}`,
    title: 'M 6.3 - Test location', magType: 'mw', updated: now,
    ...properties,
  },
});

describe('cached earthquake list summary metadata', () => {
  let env;
  let written;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    written = new Map();
    env = {
      GEOJSON_BUCKET: {
        get: vi.fn().mockResolvedValue({ json: async () => [] }),
        put: vi.fn(async (key, value) => { written.set(key, JSON.parse(value)); }),
      },
    };
  });

  afterEach(() => vi.useRealTimers());

  it('preserves complete upstream properties while keeping existing fields and time windows', async () => {
    const events = [feature('daily', 0.1), feature('weekly', 3), feature('monthly', 20)];

    await handleGenerateLists({ env, newFeatures: events });

    expect(written.get('list-day.json').map(row => row.id)).toEqual(['daily']);
    expect(written.get('list-week.json').map(row => row.id)).toEqual(['daily', 'weekly']);
    expect(written.get('list-month.json').map(row => row.id)).toEqual(['daily', 'weekly', 'monthly']);
    for (const rows of written.values()) {
      for (const row of rows) {
        const input = events.find(event => event.id === row.id);
        expect(row).toEqual({
          id: input.id, magnitude: 6.3, place: 'Test location', event_time: input.properties.time,
          latitude: 35, longitude: -118, depth: 8, properties: input.properties,
          summary_updated_at: now,
        });
      }
    }
    expect(env.GEOJSON_BUCKET.put).toHaveBeenCalledTimes(3);
  });

  it('upgrades refreshed sparse rows without dropping explicit nulls and zero values', async () => {
    const oldRow = { id: 'updated', magnitude: 6.2, event_time: now - 1000 };
    env.GEOJSON_BUCKET.get.mockResolvedValue({ json: async () => [oldRow] });
    const refreshed = feature('updated', 0, { alert: null, tsunami: 0, felt: null, sig: 0 });

    await handleGenerateLists({ env, newFeatures: [refreshed] });

    for (const rows of written.values()) {
      expect(rows).toHaveLength(1);
      expect(rows[0].properties).toEqual(refreshed.properties);
      expect(rows[0].magnitude).toBe(6.3);
      expect(rows[0].summary_updated_at).toBe(now);
    }
  });

  it('retains timestamps for untouched summaries and refreshes only incoming events', async () => {
    const originalTimestamp = now - 60 * 60 * 1000;
    const existing = ['untouched', 'refreshed'].map((id) => ({
      id, magnitude: 6.3, place: 'Test location', event_time: now - 1000,
      latitude: 35, longitude: -118, depth: 8,
      properties: feature(id).properties, summary_updated_at: originalTimestamp,
    }));
    env.GEOJSON_BUCKET.get.mockResolvedValue({ json: async () => existing });

    await handleGenerateLists({ env, newFeatures: [feature('refreshed')] });

    for (const rows of written.values()) {
      expect(rows.find(row => row.id === 'untouched')).toEqual(existing[0]);
      expect(rows.find(row => row.id === 'refreshed').summary_updated_at).toBe(now);
    }
  });

  it('leaves D1 bootstrap rows detectably sparse until their own upstream refresh', async () => {
    const bootstrap = { id: 'bootstrap', magnitude: 4, place: 'Older event', event_time: now - 1000, latitude: 1, longitude: 2, depth: 3 };
    const all = vi.fn().mockResolvedValue({ results: [bootstrap] });
    const bind = vi.fn().mockReturnValue({ all });
    env.DB = { prepare: vi.fn().mockReturnValue({ bind }) };
    env.GEOJSON_BUCKET.get.mockResolvedValue(null);

    await handleGenerateLists({ env, newFeatures: [feature('fresh')] });

    expect(env.DB.prepare).toHaveBeenCalledTimes(3);
    for (const rows of written.values()) {
      const oldRow = rows.find(row => row.id === 'bootstrap');
      expect(oldRow).toEqual(bootstrap);
      expect(oldRow).not.toHaveProperty('properties');
      expect(oldRow).not.toHaveProperty('summary_updated_at');
      expect(rows.find(row => row.id === 'fresh').properties).toMatchObject({
        alert: 'yellow', tsunami: 1, felt: 456, sig: 987,
      });
    }
  });
});
