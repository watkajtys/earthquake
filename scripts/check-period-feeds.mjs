#!/usr/bin/env node
// Read-only, sequential and byte/deadline bounded. Never logs feature payloads.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { FEED_PERIODS, FEED_FRESHNESS_MS, isFeedStale, readBoundedFeedJson, validateFeedEnvelope } from '../shared/earthquakeFeedContract.js';

const CACHE_CONTROL = 'private, no-cache, max-age=0, must-revalidate';
const HEADER_FIELDS = {
  'X-Feed-Period': 'period', 'X-Feed-Generation': 'generationId', 'X-Feed-Sequence': 'snapshotSequence',
  'X-Feed-Generated-At': 'generatedAtMs', 'X-Feed-Source-Observed-At': 'sourceObservedAtMs',
  'X-Feed-Upstream-Generated-At': 'upstreamGeneratedAtMs', 'X-Feed-Coverage-Start': 'coverageStartMs',
  'X-Feed-Coverage-End': 'coverageEndMs', 'X-Feed-Complete': 'complete',
};
function checkHeaders(response, envelope, stale = false) {
  assert.match(response.headers.get('Content-Type') || '', /application\/json/i, 'Feed content type');
  assert.equal(response.headers.get('Cache-Control'), CACHE_CONTROL, 'Feed revalidation policy');
  assert.match(response.headers.get('ETag') || '', /^(?:W\/)?"feed-[0-9a-f]{64}"$/, 'Feed ETag');
  assert.equal(response.headers.get('X-Feed-Stale'), String(stale), 'Feed stale metadata must be truthful');
  for (const [header, field] of Object.entries(HEADER_FIELDS)) {
    assert.equal(response.headers.get(header), String(envelope[field]), `${header}: metadata mismatch`);
  }
}

export async function checkPeriodFeeds(origin, { fetchImpl = fetch, log = console.log, now = () => Date.now(),
  conditional = false, preview = false, periods = FEED_PERIODS, requireFresh = true } = {}) {
  const base = new URL(origin);
  assert(['http:', 'https:'].includes(base.protocol) && !base.username && !base.password &&
    base.pathname === '/' && !base.search && !base.hash, 'Expected an HTTP(S) origin without credentials');
  const results = [];
  for (const period of periods) {
    assert(FEED_PERIODS.includes(period), 'Invalid feed period');
    const url = new URL(`/api/earthquake-feeds?period=${period}`, base);
    const options = { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { 'User-Agent': 'Earthquake-Deployment-Smoke/1.0' } };
    const response = await fetchImpl(url, options);
    assert.equal(response.status, 200, `${period}: unexpected HTTP status`);
    const envelope = validateFeedEnvelope(await readBoundedFeedJson(response, options.signal),
      { period, requireFresh, now: now() });
    const fallback = response.headers.get('X-Feed-Fallback') === 'true';
    const stale = fallback || isFeedStale(envelope, now());
    checkHeaders(response, envelope, stale);
    if (preview) assert(envelope.features.every(feature => /^previewquake/.test(feature.id) &&
      /SYNTHETIC PREVIEW/.test(feature.properties.place)), `${period}: expected synthetic preview features only`);
    const etag = response.headers.get('ETag');
    const observedHeaderBytes = Number(response.headers.get('Content-Length'));
    const decodedBytes = new TextEncoder().encode(JSON.stringify(envelope)).byteLength;
    if (conditional) {
      for (const method of ['GET', 'HEAD']) {
        const checked = await fetchImpl(url, { ...options, method, signal: AbortSignal.timeout(30_000),
          headers: method === 'GET' ? { ...options.headers, 'If-None-Match': etag } : { ...options.headers, 'Accept-Encoding': 'identity' } });
        assert.equal(checked.status, method === 'GET' ? 304 : 200, `${period}: conditional ${method} changed or failed; rerun after publication settles`);
        checkHeaders(checked, envelope, stale);
        assert.equal(checked.headers.get('ETag')?.replace(/^W\//u, ''), etag.replace(/^W\//u, ''), `${period}: conditional ETag mismatch`);
        if (method === 'GET') assert.equal(checked.headers.get('Content-Length'), null, '304 must not declare body length');
        else assert.equal(Number(checked.headers.get('Content-Length')), decodedBytes, 'HEAD decoded object size');
        assert.equal((await checked.arrayBuffer()).byteLength, 0, `${method} must be bodyless`);
      }
    }
    const result = { period, generationId: envelope.generationId, snapshotSequence: envelope.snapshotSequence,
      totalCount: envelope.totalCount, decodedBytes,
      observedHeaderBytes: Number.isSafeInteger(observedHeaderBytes) && observedHeaderBytes > 0 ? observedHeaderBytes : null,
      generatedAtMs: envelope.generatedAtMs, sourceObservedAtMs: envelope.sourceObservedAtMs,
      upstreamGeneratedAtMs: envelope.upstreamGeneratedAtMs, coverageStartMs: envelope.coverageStartMs,
      coverageEndMs: envelope.coverageEndMs, complete: envelope.complete, stale, etag, state: fallback ? 'degraded' : stale ? 'stale' : 'fresh',
      sourceAgeMs: Math.max(0, now() - envelope.upstreamGeneratedAtMs),
      publicationAgeMs: Math.max(0, now() - envelope.generatedAtMs), thresholdMs: FEED_FRESHNESS_MS };
    results.push(result);
    log(JSON.stringify(result));
  }
  return results;
}

// A concrete read-only check for an external scheduler: checks all periods,
// emits safe JSON records, and exits nonzero for stale/unavailable publication.
export async function monitorPeriodFeeds(origin, options = {}) {
  const results = [];
  for (const period of FEED_PERIODS) {
    try {
      results.push(...await checkPeriodFeeds(origin, { ...options, periods: [period], requireFresh: false }));
    } catch {
      const result = { period, state: 'unavailable', code: 'FEED_CHECK_FAILED' };
      results.push(result); (options.log ?? console.log)(JSON.stringify(result));
    }
  }
  return { healthy: results.every(result => result.state === 'fresh'), results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const positional = args.filter(value => value !== '--conditional' && value !== '--preview' && value !== '--monitor');
  assert(positional.length === 1 && !positional[0].startsWith('--'),
    'Usage: node scripts/check-period-feeds.mjs <origin> [--conditional] [--preview] [--monitor]');
  const options = { conditional: args.includes('--conditional'), preview: args.includes('--preview') };
  const operation = args.includes('--monitor') ? monitorPeriodFeeds(positional[0], options).then(result => {
    if (!result.healthy) process.exitCode = 1;
  }) : checkPeriodFeeds(positional[0], options);
  operation.catch(error => { console.error(error.message); process.exitCode = 1; });
}
