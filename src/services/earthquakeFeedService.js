import { FEED_PERIOD_DAYS, FEED_FRESHNESS_MS, feedSourceUrl, validateFeedEnvelope,
  validateCompleteUsgsFeed, readBoundedFeedJson, isFeedStale } from '../../shared/earthquakeFeedContract.js';

export const FEED_REQUEST_TIMEOUT_MS = 30_000;
export const FEED_PRIMARY_TIMEOUT_MS = 10_000;
const headerFields = {
  'X-Feed-Generation': 'generationId', 'X-Feed-Sequence': 'snapshotSequence',
  'X-Feed-Generated-At': 'generatedAtMs', 'X-Feed-Source-Observed-At': 'sourceObservedAtMs',
  'X-Feed-Upstream-Generated-At': 'upstreamGeneratedAtMs', 'X-Feed-Coverage-Start': 'coverageStartMs',
  'X-Feed-Coverage-End': 'coverageEndMs', 'X-Feed-Complete': 'complete', 'X-Feed-Period': 'period',
};
const etagPattern = /^(?:W\/)?"feed-[a-f0-9]{64}"$/u;
const normalizeEtag = value => value.replace(/^W\//u, '');

async function withinBudget(parentSignal, timeoutMs, work) {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parentSignal.reason);
  if (parentSignal?.aborted) onParentAbort();
  else parentSignal?.addEventListener('abort', onParentAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Earthquake feed request timed out. Please retry.', 'TimeoutError')), timeoutMs);
  let onAbort;
  const cancelled = new Promise((_, reject) => {
    onAbort = () => reject(controller.signal.reason || new DOMException('Aborted', 'AbortError'));
    if (controller.signal.aborted) onAbort();
    else controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    if (controller.signal.aborted) return await cancelled;
    return await Promise.race([work(controller.signal), cancelled]);
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', onParentAbort);
    controller.signal.removeEventListener('abort', onAbort);
  }
}

async function request(url, signal, headers = {}) {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json', ...headers } });
  if (signal.aborted) {
    void response.body?.cancel().catch(() => {});
    throw signal.reason;
  }
  return response;
}
function checkHeaders(response, envelope, expectedEtag) {
  const etag = response.headers.get('ETag');
  if (!etagPattern.test(etag || '') || (expectedEtag && normalizeEtag(etag) !== normalizeEtag(expectedEtag)) ||
      Object.entries(headerFields).some(([header, field]) => response.headers.get(header) !== String(envelope[field])) ||
      response.headers.get('X-Feed-Stale') !== 'false') throw new Error('Earthquake snapshot metadata does not match its response.');
  return etag;
}
function checkSourceOrder(generated, previousData, period) {
  if (previousData?.period === period && Number.isFinite(previousData.sourceGeneratedAtMs) && generated < previousData.sourceGeneratedAtMs) {
    throw new Error('Earthquake source is older than the displayed feed.');
  }
}
function checkSnapshotOrder(envelope, cache) {
  if (!cache?.envelope || cache.envelope.period !== envelope.period) return;
  const previous = cache.envelope;
  if (envelope.snapshotSequence < previous.snapshotSequence ||
      (envelope.snapshotSequence === previous.snapshotSequence && envelope.generationId !== previous.generationId) ||
      (envelope.generationId === previous.generationId && envelope !== previous && JSON.stringify(envelope) !== JSON.stringify(previous))) {
    throw new Error('Earthquake snapshot generation is inconsistent.');
  }
}
async function internalFeed(period, signal, previousData) {
  const cache = previousData?.period === period ? previousData.snapshotCache : null;
  const headers = cache && etagPattern.test(cache.etag || '') ? { 'If-None-Match': cache.etag } : {};
  const response = await request(`/api/earthquake-feeds?period=${period}`, signal, headers);
  let envelope;
  let etag;
  if (response.status === 304) {
    if (!cache || !headers['If-None-Match']) throw new Error('Earthquake snapshot returned 304 without matching cached data.');
    envelope = validateFeedEnvelope(cache.envelope, { period });
    etag = checkHeaders(response, envelope, cache.etag);
  } else {
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new Error(`Earthquake snapshot request failed (HTTP ${response.status}).`);
    }
    envelope = validateFeedEnvelope(await readBoundedFeedJson(response, signal), { period });
    etag = checkHeaders(response, envelope);
  }
  checkSnapshotOrder(envelope, cache);
  checkSourceOrder(envelope.upstreamGeneratedAtMs, previousData, period);
  signal.throwIfAborted();
  return { period, features: envelope.features, metadata: { generated: envelope.upstreamGeneratedAtMs, count: envelope.totalCount, status: 200 },
    fetchTime: Date.now(), dataSource: 'USGS snapshot', sourceGeneratedAtMs: envelope.upstreamGeneratedAtMs,
    sourceObservedAtMs: envelope.sourceObservedAtMs, snapshotGeneratedAtMs: envelope.generatedAtMs,
    coverage: { complete: true, asOfMs: envelope.upstreamGeneratedAtMs, startTimeMs: envelope.coverageStartMs, endTimeMs: envelope.coverageEndMs },
    snapshotCache: { envelope, etag } };
}

export async function fetchEarthquakeFeed(period, { signal, previousData } = {}) {
  const url = feedSourceUrl(period);
  return withinBudget(signal, FEED_REQUEST_TIMEOUT_MS, async chainSignal => {
    let primaryError;
    try {
      return await withinBudget(chainSignal, FEED_PRIMARY_TIMEOUT_MS, primarySignal => internalFeed(period, primarySignal, previousData));
    } catch (error) {
      chainSignal.throwIfAborted();
      primaryError = error.message;
    }
    try {
      const response = await request(`/api/usgs-proxy?apiUrl=${encodeURIComponent(url)}`, chainSignal);
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new Error(`USGS proxy request failed (HTTP ${response.status}).`);
      }
      const feed = validateCompleteUsgsFeed(await readBoundedFeedJson(response, chainSignal), period);
      checkSourceOrder(feed.metadata.generated, previousData, period);
      chainSignal.throwIfAborted();
      const now = Date.now();
      return { period, features: feed.features, metadata: feed.metadata, fetchTime: now, dataSource: 'USGS',
        sourceGeneratedAtMs: feed.metadata.generated, sourceObservedAtMs: now, snapshotGeneratedAtMs: null,
        coverage: { complete: true, asOfMs: feed.metadata.generated,
          startTimeMs: feed.metadata.generated - FEED_PERIOD_DAYS[period] * 86400_000, endTimeMs: feed.metadata.generated },
        snapshotCache: previousData?.period === period ? previousData.snapshotCache : null };
    } catch (error) {
      chainSignal.throwIfAborted();
      throw new Error(`Unable to refresh ${period} earthquakes: ${primaryError} USGS fallback: ${error.message}`);
    }
  });
}

// Called while rendering status, independently of receipt/304 success time.
export function isEarthquakeFeedStale(payload, now = Date.now()) {
  if (!payload || !Number.isFinite(payload.sourceGeneratedAtMs) || !Number.isFinite(payload.sourceObservedAtMs)) return true;
  return payload.snapshotGeneratedAtMs !== null && payload.snapshotCache?.envelope
    ? isFeedStale(payload.snapshotCache.envelope, now)
    : now - payload.sourceGeneratedAtMs > FEED_FRESHNESS_MS || now - payload.sourceObservedAtMs > FEED_FRESHNESS_MS;
}
export const fetchDailyFeed = options => fetchEarthquakeFeed('day', options);
export const fetchWeeklyFeed = options => fetchEarthquakeFeed('week', options);
export const fetchMonthlyFeed = options => fetchEarthquakeFeed('month', options);
