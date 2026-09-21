import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchEarthquakeFeed, isEarthquakeFeedStale } from './earthquakeFeedService.js';
import { MAX_FEED_BYTES } from '../../shared/earthquakeFeedContract.js';
import { earthquakeFeature, completeUsgsFeed, feedEnvelope, feedResponse, feedHeaders } from '../test-utils/earthquakeFeedFixtures.js';
const now = Date.UTC(2026, 8, 21);
const day = 86400000;
let fetchMock;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); fetchMock = vi.spyOn(globalThis, 'fetch'); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const fallback = () => Response.json(completeUsgsFeed([earthquakeFeature('fallback')]));

describe('complete earthquake feed transport', () => {
  it('accepts old month events and nullable/negative magnitudes from a fresh complete snapshot with one request', async () => {
    const events = [earthquakeFeature('old', { time: now - 29 * day, updated: now - 20 * day, mag: null, place: null }),
      earthquakeFeature('negative', { mag: -0.5 })];
    const envelope = feedEnvelope('month', events);
    fetchMock.mockResolvedValue(feedResponse(envelope));
    const result = await fetchEarthquakeFeed('month');
    expect(result.features).toEqual(events);
    expect(result).toMatchObject({ period: 'month', dataSource: 'USGS snapshot', sourceGeneratedAtMs: now,
      coverage: { complete: true, asOfMs: now, startTimeMs: now - 30 * day, endTimeMs: now } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/earthquake-feeds?period=month');
  });
  it('accepts a complete empty snapshot', async () => {
    fetchMock.mockResolvedValue(feedResponse(feedEnvelope('day', [])));
    expect((await fetchEarthquakeFeed('day')).features).toEqual([]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([
    ['missing alert metadata', e => { delete e.features[0].properties.alert; }],
    ['stale source', e => { e.upstreamGeneratedAtMs -= 11 * 60_000; e.coverageStartMs -= 11 * 60_000; e.coverageEndMs -= 11 * 60_000; }],
    ['stale observation', e => { e.sourceObservedAtMs -= 11 * 60_000; }],
    ['future source', e => { e.upstreamGeneratedAtMs += 120_000; }],
    ['wrong period', e => { e.period = 'week'; }],
    ['wrong count', e => { e.totalCount = 2; }],
    ['duplicate IDs', e => { e.features.push(e.features[0]); e.totalCount = 2; }],
    ['incomplete snapshot', e => { e.complete = false; }],
  ])('uses only one approved fallback for %s', async (_, modify) => {
    const envelope = feedEnvelope(); modify(envelope);
    fetchMock.mockResolvedValueOnce(feedResponse(envelope)).mockResolvedValueOnce(fallback());
    const result = await fetchEarthquakeFeed('day');
    expect(result.dataSource).toBe('USGS');
    expect(result.features[0].id).toBe('fallback');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/usgs-proxy?apiUrl=https%3A%2F%2Fearthquake.usgs.gov%2Fearthquakes%2Ffeed%2Fv1.0%2Fsummary%2Fall_day.geojson');
  });
  it('rejects malformed fallback metadata instead of manufacturing a complete feed', async () => {
    const invalid = completeUsgsFeed(); delete invalid.features[0].properties.sig;
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(Response.json(invalid));
    await expect(fetchEarthquakeFeed('day')).rejects.toThrow('alert metadata');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('validates matching metadata and cached freshness on a warm 304 without fallback', async () => {
    const envelope = feedEnvelope();
    fetchMock.mockResolvedValueOnce(feedResponse(envelope)).mockResolvedValueOnce(feedResponse(envelope, { status: 304 }));
    const previousData = await fetchEarthquakeFeed('day');
    vi.setSystemTime(now + 60_000);
    const result = await fetchEarthquakeFeed('day', { previousData });
    expect(fetchMock.mock.calls[1][1].headers['If-None-Match']).toBe(feedHeaders(envelope).ETag);
    expect(result.features).toBe(previousData.features);
    expect(result.sourceGeneratedAtMs).toBe(now);
    expect(result.fetchTime).toBe(now + 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([['weak then strong', true, false], ['strong then weak', false, true]])('uses matching compressed-response ETags: %s', async (_, firstWeak, nextWeak) => {
    const envelope = feedEnvelope();
    const strong = feedHeaders(envelope).ETag;
    fetchMock.mockResolvedValueOnce(feedResponse(envelope, { headers: { ETag: firstWeak ? `W/${strong}` : strong } }))
      .mockResolvedValueOnce(feedResponse(envelope, { status: 304, headers: { ETag: nextWeak ? `W/${strong}` : strong } }));
    const previousData = await fetchEarthquakeFeed('day');
    expect((await fetchEarthquakeFeed('day', { previousData })).features).toBe(previousData.features);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each(['cold', 'etag', 'metadata', 'stale'])('falls back for a %s 304', async mode => {
    const envelope = feedEnvelope();
    let previousData;
    if (mode !== 'cold') {
      fetchMock.mockResolvedValueOnce(feedResponse(envelope));
      previousData = await fetchEarthquakeFeed('day');
      fetchMock.mockClear();
    }
    if (mode === 'stale') vi.setSystemTime(now + 11 * 60_000);
    const headers = mode === 'etag' ? { ETag: `"feed-${'f'.repeat(64)}"` } : mode === 'metadata' ? { 'X-Feed-Period': 'month' } : {};
    fetchMock.mockResolvedValueOnce(feedResponse(envelope, { status: 304, headers })).mockResolvedValueOnce(fallback());
    expect((await fetchEarthquakeFeed('day', { previousData })).dataSource).toBe('USGS');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('rejects snapshot/source rollback and keeps last-good source clocks available to the caller', async () => {
    fetchMock.mockResolvedValueOnce(feedResponse(feedEnvelope('day', [earthquakeFeature()], { snapshotSequence: 2 })));
    const previousData = await fetchEarthquakeFeed('day');
    fetchMock.mockResolvedValueOnce(feedResponse(feedEnvelope('day', [earthquakeFeature()], { snapshotSequence: 1 })))
      .mockResolvedValueOnce(Response.json(completeUsgsFeed([earthquakeFeature()], now - 1000)));
    await expect(fetchEarthquakeFeed('day', { previousData })).rejects.toThrow('older than');
    expect(previousData.sourceGeneratedAtMs).toBe(now);
  });
  it('limits primary wait to ten seconds and the complete fallback chain to thirty seconds', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const outcome = fetchEarthquakeFeed('day').catch(error => error);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await outcome).toMatchObject({ name: 'TimeoutError' });
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('aborts a stalled body and never starts fallback after caller cancellation', async () => {
    const controller = new AbortController(); const cancel = vi.fn();
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ cancel })));
    const outcome = fetchEarthquakeFeed('day', { signal: controller.signal }).catch(error => error);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    controller.abort();
    expect(await outcome).toMatchObject({ name: 'AbortError' });
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('does not initiate a request for an already cancelled caller', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(fetchEarthquakeFeed('day', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('cancels an oversized streamed primary body and rejects an oversized fallback', async () => {
    const cancel = vi.fn();
    fetchMock.mockResolvedValueOnce(new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(MAX_FEED_BYTES + 1)); }, cancel })))
      .mockResolvedValueOnce(new Response('[]', { headers: { 'Content-Length': String(MAX_FEED_BYTES + 1) } }));
    await expect(fetchEarthquakeFeed('day')).rejects.toThrow(/byte limit/);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('source age remains stale even if receipt time is recent', () => {
    expect(isEarthquakeFeedStale({ sourceGeneratedAtMs: now - 11 * 60_000, sourceObservedAtMs: now,
      fetchTime: now, snapshotGeneratedAtMs: null })).toBe(true);
  });
});
