#!/usr/bin/env node
// Local handler calls backed by isolated workerd R2; no production/network source fetch.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { publishEarthquakeFeed } from '../functions/background/publish-earthquake-feeds.js';
import { onRequestGet } from '../functions/api/earthquake-feeds.js';
import { createPreviewFeedCollections } from './preview-feed-fixtures.mjs';

const directory = await mkdtemp(join(tmpdir(), 'earthquake-local-rehearsal-'));
let proxy;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const source = (time, mag = 3) => createPreviewFeedCollections([{
  type: 'Feature', id: 'preview-rehearsal', geometry: { type: 'Point', coordinates: [-117, 35, 8] },
  properties: { mag, place: 'SYNTHETIC LOCAL REHEARSAL', time: time - 3600000, updated: time - 1000, alert: null, felt: null, tsunami: 0, sig: 10 },
}], time);
const report = { mode: 'local Node handlers with isolated workerd R2; not production capacity', requests: 0, scenarios: [] };
try {
  const configPath = join(directory, 'wrangler.json');
  await writeFile(configPath, JSON.stringify({ name: 'earthquake-local-rehearsal', compatibility_date: '2024-06-05', r2_buckets: [{ binding: 'GEOJSON_BUCKET', bucket_name: 'earthquake-local-rehearsal', remote: false }] }));
  proxy = await getPlatformProxy({ configPath, remoteBindings: false, persist: { path: join(directory, 'state') } });
  const env = proxy.env;
  const bucket = env.GEOJSON_BUCKET;
  const wrap = get => ({ ...env, GEOJSON_BUCKET: { get, put: bucket.put.bind(bucket), head: bucket.head.bind(bucket) } });
  const read = async (bindings = env, period = 'day') => {
    report.requests++;
    assert.ok(report.requests <= 32, 'bounded request count');
    const start = performance.now();
    const response = await onRequestGet({ request: new Request(`http://local.invalid/api/earthquake-feeds?period=${period}`), env: bindings });
    const body = await response.json();
    return { status: response.status, latencyMs: Math.round(performance.now() - start), generation: response.headers.get('X-Feed-Generation'), stale: response.headers.get('X-Feed-Stale'), upstream: response.headers.get('X-Feed-Upstream-Generated-At'), body };
  };
  const initial = source(Date.now());
  for (const period of ['day', 'week', 'month']) await publishEarthquakeFeed(env, period, { timeoutMs: 2000, fetchFeed: async () => initial[period] });
  const samples = [];
  for (let batch = 0; batch < 5; batch++) samples.push(...await Promise.all(Array.from({ length: 4 }, (_, i) => read(env, ['day', 'week', 'month'][i % 3]))));
  for (const result of samples) { assert.equal(result.status, 200); assert.equal(result.stale, 'false'); assert.equal(Number(result.upstream), initial.day.metadata.generated); }
  const times = samples.map(result => result.latencyMs).sort((a, b) => a - b);
  report.scenarios.push({ name: 'burst', concurrency: 4, requests: samples.length, p50Ms: times[9], p95Ms: times[18], maxMs: times.at(-1), fresh: true, sourceAgeMs: Date.now() - Number(samples[0].upstream) });
  let attempts = 0;
  const transient = await read(wrap(async (...args) => { if (++attempts === 1) throw new Error('get: Internal Error (10001)'); return bucket.get(...args); }));
  assert.equal(transient.status, 200); assert.equal(transient.stale, 'false'); assert.ok(attempts >= 3);
  report.scenarios.push({ name: 'transient-storage-recovery', attempts, latencyMs: transient.latencyMs, status: transient.status });
  const slow = await read(wrap(async (...args) => { await delay(150); return bucket.get(...args); }));
  assert.equal(slow.status, 200); assert.equal(slow.upstream, samples[0].upstream);
  report.scenarios.push({ name: 'slow-storage', latencyMs: slow.latencyMs, unchangedSourceTime: true });
  const stalled = await read(wrap(() => new Promise(() => {})));
  assert.equal(stalled.status, 503); assert.ok(stalled.latencyMs < 12000);
  const recovered = await read();
  assert.equal(recovered.status, 200); assert.equal(recovered.upstream, samples[0].upstream);
  report.scenarios.push({ name: 'stalled-storage-and-recovery', timeoutMs: stalled.latencyMs, failedStatus: stalled.status, recoveredStatus: recovered.status, unchangedSourceTime: true });
  let entered, release;
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  const releasePromise = new Promise(resolve => { release = resolve; });
  await delay(5);
  const older = source(Date.now(), 4);
  const loserPromise = publishEarthquakeFeed(env, 'day', { timeoutMs: 2000, fetchFeed: async () => { entered(); await releasePromise; return older.day; } });
  await enteredPromise;
  await delay(5);
  const newer = source(Date.now(), 5);
  const winner = await publishEarthquakeFeed(env, 'day', { timeoutMs: 2000, fetchFeed: async () => newer.day });
  release();
  const loser = await loserPromise;
  assert.equal(winner.published, true); assert.equal(loser.reason, 'superseded');
  const final = await read();
  assert.equal(final.status, 200); assert.equal(final.stale, 'false'); assert.equal(final.body.features[0].properties.mag, 5);
  report.scenarios.push({ name: 'overlapping-publishers', winner: winner.published, olderResult: loser.reason, finalMagnitude: 5, fresh: true });
  console.log(JSON.stringify(report, null, 2));
} finally {
  await proxy?.dispose();
  await rm(directory, { recursive: true, force: true });
}
