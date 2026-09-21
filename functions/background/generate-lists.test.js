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

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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
    const all = vi.fn().mockResolvedValue({ success: true, results: [bootstrap] });
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

  it('retains every existing list when R2 reading fails, even if D1 is also unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    env.GEOJSON_BUCKET.get.mockRejectedValue(new Error('R2 unavailable'));
    const all = vi.fn().mockRejectedValue(new Error('D1 unavailable'));
    env.DB = { prepare: vi.fn().mockReturnValue({ bind: () => ({ all }) }) };

    await expect(handleGenerateLists({ env, newFeatures: [feature('fresh')] }))
      .rejects.toThrow('R2 unavailable');
    expect(env.GEOJSON_BUCKET.put).not.toHaveBeenCalled();
    // A failed read does not establish that the object is missing.
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });

  it('does not replace day/week when the later month bootstrap fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    env.GEOJSON_BUCKET.get.mockImplementation(async key => key === 'list-month.json'
      ? null : { json: async () => [{ id: 'existing', event_time: now - 1000 }] });
    const all = vi.fn().mockRejectedValue(new Error('D1 unavailable'));
    env.DB = { prepare: vi.fn().mockReturnValue({ bind: () => ({ all }) }) };

    await expect(handleGenerateLists({ env, newFeatures: [feature('fresh')] }))
      .rejects.toThrow('D1 unavailable');
    expect(env.GEOJSON_BUCKET.get).toHaveBeenCalledTimes(3);
    expect(all).toHaveBeenCalledTimes(1);
    expect(env.GEOJSON_BUCKET.put).not.toHaveBeenCalled();
  });

  it('requires a successful D1 read before creating a missing list', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    env.GEOJSON_BUCKET.get.mockResolvedValue(null);

    await expect(handleGenerateLists({ env, newFeatures: [feature('fresh')] }))
      .rejects.toThrow('DB binding is missing');
    expect(env.GEOJSON_BUCKET.put).not.toHaveBeenCalled();
  });

  it.each([
    ['unsuccessful D1 response', { success: false, results: [] }],
    ['unconfirmed D1 response', { results: [] }],
    ['missing D1 results', {}],
  ])('does not treat %s as an empty list', async (_label, response) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    env.GEOJSON_BUCKET.get.mockResolvedValue(null);
    env.DB = { prepare: () => ({ bind: () => ({ all: async () => response }) }) };

    await expect(handleGenerateLists({ env, newFeatures: [feature('fresh')] }))
      .rejects.toThrow('D1 bootstrap did not return a successful list');
    expect(env.GEOJSON_BUCKET.put).not.toHaveBeenCalled();
  });

  it('accepts a confirmed empty D1 bootstrap result', async () => {
    env.GEOJSON_BUCKET.get.mockResolvedValue(null);
    env.DB = { prepare: () => ({ bind: () => ({ all: async () => ({ success: true, results: [] }) }) }) };

    await handleGenerateLists({ env, newFeatures: [feature('fresh')] });

    expect(env.GEOJSON_BUCKET.put).toHaveBeenCalledTimes(3);
    for (const rows of written.values()) expect(rows.map(row => row.id)).toEqual(['fresh']);
  });

  it('preserves existing lists on malformed R2 JSON instead of bootstrapping over it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    env.GEOJSON_BUCKET.get.mockResolvedValue({ json: async () => { throw new SyntaxError('Invalid JSON'); } });
    env.DB = { prepare: vi.fn() };

    await expect(handleGenerateLists({ env, newFeatures: [feature('fresh')] }))
      .rejects.toThrow('Invalid JSON');
    expect(env.GEOJSON_BUCKET.put).not.toHaveBeenCalled();
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });

  it.each([
    ['non-array', { events: [] }],
    ['invalid row', [{ id: 'bad', event_time: null }]],
  ])('does not publish over a %s snapshot', async (_label, snapshot) => {
    env.GEOJSON_BUCKET.get.mockResolvedValue({ json: async () => snapshot });

    await expect(handleGenerateLists({ env, newFeatures: [feature('fresh')] }))
      .rejects.toThrow('Invalid cached earthquake list');
    expect(env.GEOJSON_BUCKET.put).not.toHaveBeenCalled();
  });
});
