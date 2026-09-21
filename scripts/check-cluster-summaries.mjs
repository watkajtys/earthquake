#!/usr/bin/env node
// Bounded GET-only pagination/equivalence check; never mutates remote storage.
import assert from 'node:assert/strict';
import { brotliCompressSync, constants } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { compareSummaryItems, projectSummaryItem, validateSummaryEnvelope } from '../shared/clusterSummaryContract.js';

async function readJson(fetchImpl, url, maxBytes) {
  const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(30_000),
    headers: { 'User-Agent': 'Earthquake-Deployment-Smoke/1.0' } });
  assert.equal(response.status, 200, `${url.pathname}: HTTP ${response.status}`);
  assert.match(response.headers.get('Content-Type') || '', /application\/json/i);
  assert(response.body, 'Missing response body');
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      assert(bytes <= maxBytes, 'Response exceeds inspection byte budget');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  return { response, value: JSON.parse(Buffer.concat(chunks).toString('utf8')), bytes };
}

export async function checkClusterSummaries(origin, { compareLegacy = false, fetchImpl = fetch } = {}) {
  const base = new URL(origin);
  assert(['http:', 'https:'].includes(base.protocol) && !base.username && !base.password &&
    base.pathname === '/' && !base.search && !base.hash, 'Expected deployment origin without credentials');
  const items = [];
  const cursors = new Set();
  let next = '/api/cluster-summaries?view=overview&limit=100';
  let first;
  let requests = 0;
  let decodedBytes = 0;
  let firstPageBytes;
  while (next) {
    assert(++requests <= 200, 'Pagination exceeds 200-request budget');
    const page = await readJson(fetchImpl, new URL(next, base), 512 * 1024);
    assert.equal(page.response.headers.get('Cache-Control'), 'no-store');
    validateSummaryEnvelope(page.value);
    const envelope = page.value;
    assert(envelope.items.length <= 100, 'Requested page bound exceeded');
    first ??= envelope;
    firstPageBytes ??= page.bytes;
    for (const key of ['generationId', 'snapshotSequence', 'totalCount', 'sourceObservedAtMs', 'generatedAtMs', 'view']) {
      assert.equal(envelope[key], first[key], `Pagination changed ${key}`);
    }
    items.push(...envelope.items);
    decodedBytes += page.bytes;
    assert(items.length <= first.totalCount, 'Pagination exceeded total');
    if (envelope.nextCursor !== null) {
      assert(envelope.items.length > 0 && !cursors.has(envelope.nextCursor), 'Empty or repeated continuation');
      cursors.add(envelope.nextCursor);
      next = `/api/cluster-summaries?cursor=${encodeURIComponent(envelope.nextCursor)}`;
    } else next = null;
  }
  assert.equal(items.length, first.totalCount, 'Incomplete paginated snapshot');
  assert.equal(new Set(items.map(item => item.id)).size, items.length, 'Duplicate IDs across pages');
  for (let i = 1; i < items.length; i++) assert(compareSummaryItems(items[i - 1], items[i]) <= 0, 'Cross-page ordering changed');
  const report = {
    at: new Date().toISOString(), origin: base.origin,
    generationId: first.generationId, snapshotSequence: first.snapshotSequence,
    generatedAtMs: first.generatedAtMs, sourceObservedAtMs: first.sourceObservedAtMs,
    totalCount: first.totalCount, stale: first.stale,
    pageRequests: requests, firstPageDecodedBytes: firstPageBytes, allPageDecodedBytes: decodedBytes,
  };
  if (compareLegacy) {
    const legacy = await readJson(fetchImpl, new URL('/api/get-clusters', base), 32 * 1024 * 1024);
    assert(Array.isArray(legacy.value), 'Legacy response must remain an array');
    const eligible = legacy.value.filter(row => Number.isFinite(row.maxMagnitude) && row.maxMagnitude >= 4.5);
    const projected = await Promise.all(eligible.map(projectSummaryItem));
    projected.sort(compareSummaryItems);
    assert.deepEqual(items, projected, 'Legacy and compact observations differ; repeat after the scheduled publication finishes');
    const baseline = JSON.stringify(eligible);
    const compact = JSON.stringify(items);
    const baselineBytes = Buffer.byteLength(baseline);
    const compactBytes = Buffer.byteLength(compact);
    const brotli = text => brotliCompressSync(text, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }).byteLength;
    Object.assign(report, {
      legacyRecords: legacy.value.length, equivalentEligibleRecords: eligible.length,
      legacyAllDecodedBytes: legacy.bytes, equivalentLegacyDecodedBytes: baselineBytes,
      equivalentSummaryDecodedBytes: compactBytes,
      equivalentDecodedReductionPercent: 100 * (1 - compactBytes / baselineBytes),
      firstPageReductionVsLegacyAllPercent: 100 * (1 - firstPageBytes / legacy.bytes),
      // Recompressed identical JSON fixtures at quality 4, not observed wire bytes.
      fixtureBrotliQuality: 4, equivalentLegacyBrotliBytes: brotli(baseline), equivalentSummaryBrotliBytes: brotli(compact),
    });
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const origin = args.find(arg => !arg.startsWith('--'));
  assert(origin && args.length <= 2 && args.every(arg => arg === origin || arg === '--compare-legacy'),
    'Usage: node scripts/check-cluster-summaries.mjs <origin> [--compare-legacy]');
  checkClusterSummaries(origin, { compareLegacy: args.includes('--compare-legacy') })
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
