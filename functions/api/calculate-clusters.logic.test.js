import { describe, it, expect, vi } from 'vitest';
import worker from '../../src/worker.js';

const quake = (id, magnitude, latitude, longitude) => ({
  id,
  properties: { mag: magnitude, time: 1_700_000_000_000 },
  geometry: { type: 'Point', coordinates: [longitude, latitude, 10] },
});

const requestClusters = payload => worker.fetch(new Request('https://example.com/api/calculate-clusters', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
  body: JSON.stringify(payload),
}), {}, { waitUntil: vi.fn() });

describe('POST /api/calculate-clusters through the deployed Worker handler', () => {
  it.each([null, {}, { earthquakes: 'invalid' }])('rejects a payload without an earthquake array: %j', async payload => {
    const response = await requestClusters(payload);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ status: 'error', message: expect.any(String) });
  });

  it('rejects malformed JSON', async () => {
    const response = await worker.fetch(new Request('https://example.com/api/calculate-clusters', {
      method: 'POST', headers: { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json' }, body: '{',
    }), {}, { waitUntil: vi.fn() });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('Invalid JSON body');
  });

  it('returns the API response and caching headers for an empty array', async () => {
    const response = await requestClusters({ earthquakes: [] });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('X-Cache-Hit')).toBe('false');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ clusters: [], cacheHit: 'false' });
  });

  it('applies the default distance and minimum of three earthquakes', async () => {
    const earthquakes = [quake('q1', 5, 34, -118), quake('q2', 4, 34.1, -118), quake('q3', 3, 34.2, -118)];
    const response = await requestClusters({ earthquakes });
    expect((await response.json()).clusters).toEqual([earthquakes]);
    const tooSmall = await requestClusters({ earthquakes: earthquakes.slice(0, 2) });
    expect((await tooSmall.json()).clusters).toEqual([]);
  });

  it('honors supplied distance and minimum count', async () => {
    const q1 = quake('q1', 5, 34, -118);
    const q2 = quake('q2', 4, 34.01, -118.01);
    const q3 = quake('q3', 3, 34.2, -118.2);
    const response = await requestClusters({ earthquakes: [q1, q2, q3], maxDistanceKm: 2, minQuakes: 2 });
    expect((await response.json()).clusters).toEqual([[q1, q2]]);
  });

  it('keeps separated clusters disjoint and omits isolated events', async () => {
    const a1 = quake('a1', 5, 34, -118);
    const a2 = quake('a2', 4, 34.01, -118.01);
    const b1 = quake('b1', 6, 37.7, -122.4);
    const b2 = quake('b2', 3, 37.71, -122.41);
    const isolated = quake('noise', 7, 0, 0);
    const response = await requestClusters({ earthquakes: [a1, b2, isolated, a2, b1], maxDistanceKm: 30, minQuakes: 2 });
    const { clusters } = await response.json();
    expect(clusters).toEqual([[b1, b2], [a1, a2]]);
    expect(new Set(clusters.flat().map(event => event.id)).size).toBe(4);
  });
});
