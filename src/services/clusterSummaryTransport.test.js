import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchActiveClusters, CLUSTER_SUMMARY_MAX_BYTES } from './clusterApiService.js';
import { summaryItem, summaryPage } from '../test-utils/clusterSummaryFixtures.js';
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('bounded compact summary transport', () => {
  it('requests only the first 100 or the encoded opaque cursor, preserving validated order and metadata', async () => {
    const data = summaryPage([summaryItem(0), summaryItem(1)]);
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(json(data)));
    expect(await fetchActiveClusters()).toEqual(data);
    expect(fetch.mock.calls[0][0]).toBe('/api/cluster-summaries?view=overview&limit=100');
    await fetchActiveClusters({ cursor: 'opaque+/=' });
    const query = new URL(fetch.mock.calls[1][0], 'https://test.local').searchParams;
    expect([...query.entries()]).toEqual([['cursor', 'opaque+/=']]);
  });
  it.each([
    ['wrong schema', page => ({ ...page, schemaVersion: 1 })],
    ['extra membership', page => ({ ...page, items: [{ ...page.items[0], earthquakeIds: ['a'] }] })],
    ['duplicate IDs', page => ({ ...page, items: [page.items[0], page.items[0]], totalCount: 2 })],
    ['missing stale', page => { const { stale: _stale, ...rest } = page; return rest; }],
    ['unfiltered magnitude', page => ({ ...page, items: [{ ...page.items[0], maxMagnitude: 4.4 }] })],
    ['invalid range', page => ({ ...page, items: [{ ...page.items[0], startTime: 10, endTime: 1 }] })],
    ['empty nonterminal page', page => ({ ...page, items: [], totalCount: 10, nextCursor: 'next' })],
    ['short nonterminal page', page => ({ ...page, totalCount: 105, nextCursor: 'next' })],
    ['too many requested items', page => ({ ...page, items: Array.from({ length: 101 }, (_, i) => summaryItem(i)), totalCount: 101 })],
    ['out of order', page => ({ ...page, items: [summaryItem(1), summaryItem(0)], totalCount: 2 })],
  ])('rejects %s without falling back to the legacy endpoint', async (_, modify) => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(modify(summaryPage([summaryItem()]))));
    await expect(fetchActiveClusters()).rejects.toThrow(/Invalid cluster summary/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('classifies only the explicit 410 expiry code and never fetches legacy definitions', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 'GENERATION_EXPIRED' }), { status: 410 }));
    await expect(fetchActiveClusters({ cursor: 'expired' })).rejects.toMatchObject({ code: 'GENERATION_EXPIRED' });
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue(new Response(JSON.stringify({ code: 'SUMMARY_UNAVAILABLE' }), { status: 503 }));
    await expect(fetchActiveClusters()).rejects.toThrow('HTTP 503');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('cancels a streamed oversized body even without content-length', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(CLUSTER_SUMMARY_MAX_BYTES)); controller.enqueue(new Uint8Array(1)); }, cancel });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body));
    await expect(fetchActiveClusters()).rejects.toThrow('too large');
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('rejects an oversized declared response before reading it', async () => {
    const cancel = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers: { 'content-length': String(CLUSTER_SUMMARY_MAX_BYTES + 1) } }));
    await expect(fetchActiveClusters()).rejects.toThrow('too large');
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('cancels a stalled stream at the request deadline', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ReadableStream({ cancel })));
    const pending = fetchActiveClusters();
    const rejection = pending.catch(error => error);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await rejection).toMatchObject({ name: 'TimeoutError' });
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('propagates caller cancellation through stream reading', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ReadableStream({ cancel })));
    const pending = fetchActiveClusters({ signal: controller.signal });
    const rejection = pending.catch(error => error);
    await Promise.resolve(); await Promise.resolve();
    controller.abort();
    expect(await rejection).toMatchObject({ name: 'AbortError' });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
