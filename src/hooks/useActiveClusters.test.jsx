import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useActiveClusters } from './useActiveClusters.js';
import { EXTENDED_REFRESH_INTERVAL_MS, RESOURCE_TIMEOUT_MS } from './useRefreshableResource.js';
import { fetchActiveClusters } from '../services/clusterApiService.js';
import { summaryItem, summaryPage, SUMMARY_TEST_TIME } from '../test-utils/clusterSummaryFixtures.js';

vi.mock('../services/clusterApiService.js', () => ({ fetchActiveClusters: vi.fn() }));
const items = (count, start = 0) => Array.from({ length: count }, (_, index) => summaryItem(start + index));
const first = () => summaryPage(items(100), { totalCount: 205, nextCursor: 'page-2' });
const second = () => summaryPage(items(100, 100), { totalCount: 205, nextCursor: 'page-3' });
const newer = () => summaryPage(items(2), { snapshotSequence: 2, generationId: '22222222-2222-4222-8222-222222222222' });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(SUMMARY_TEST_TIME); fetchActiveClusters.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('compact cluster snapshot lifecycle', () => {
  it('ages a verified unchanged observation rather than the immutable generation', async () => {
    vi.setSystemTime(SUMMARY_TEST_TIME + 30 * 60_000);
    fetchActiveClusters.mockResolvedValue(summaryPage(items(2), {
      lastObservedAtMs: SUMMARY_TEST_TIME + 25 * 60_000, stale: false,
    }));
    const { result, rerender } = renderHook(() => useActiveClusters());
    await flush();
    expect(result.current.stale).toBe(false);
    vi.setSystemTime(SUMMARY_TEST_TIME + 46 * 60_000);
    rerender();
    expect(result.current.stale).toBe(true);
  });

  it('loads one first page, shares each continuation request, and preserves loaded pages on same-generation refresh', async () => {
    const pending = deferred();
    fetchActiveClusters.mockResolvedValueOnce(first()).mockImplementationOnce(() => pending.promise).mockResolvedValueOnce({ ...first(), nextCursor: 'new-issued-first-cursor' });
    const { result } = renderHook(() => useActiveClusters());
    await flush();
    expect(fetchActiveClusters).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ totalCount: 205, hasMore: true, loading: false });
    expect(result.current.clusters).toHaveLength(100);
    let a, b;
    act(() => { a = result.current.loadMore(); b = result.current.loadMore(); });
    expect(a).toBe(b);
    expect(fetchActiveClusters.mock.calls[1][0]).toMatchObject({ cursor: 'page-2' });
    await act(async () => { pending.resolve(second()); await a; });
    expect(result.current.clusters).toHaveLength(200);
    await act(async () => { await result.current.refresh(); });
    expect(result.current.clusters).toHaveLength(200);
    expect(result.current.generationId).toBe(first().generationId);
  });

  it('atomically replaces the generation and aborts/ignores a late old continuation', async () => {
    const pending = deferred();
    fetchActiveClusters.mockResolvedValueOnce(first()).mockImplementationOnce(() => pending.promise).mockResolvedValueOnce(newer());
    const { result } = renderHook(() => useActiveClusters());
    await flush();
    act(() => { void result.current.loadMore(); });
    const signal = fetchActiveClusters.mock.calls[1][0].signal;
    await act(async () => { await result.current.refresh(); });
    expect(signal.aborted).toBe(true);
    expect(result.current).toMatchObject({ generationId: newer().generationId, totalCount: 2, loadingMore: false, nextError: null });
    pending.resolve(second());
    await flush();
    expect(result.current.clusters).toHaveLength(2);
  });

  it('retains last-good pages during refresh failures and rejects sequence rollback or identity reuse', async () => {
    fetchActiveClusters.mockResolvedValueOnce(newer()).mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(first()).mockResolvedValueOnce({ ...newer(), generationId: first().generationId })
      .mockResolvedValueOnce({ ...newer(), snapshotSequence: 3 }).mockResolvedValueOnce(newer());
    const { result } = renderHook(() => useActiveClusters());
    await flush();
    const oldItems = result.current.clusters;
    for (let index = 0; index < 4; index++) {
      await act(async () => { await result.current.refresh(); });
      expect(result.current.clusters).toBe(oldItems);
      expect(result.current.error).toBeTruthy();
    }
    await act(async () => { await result.current.refresh(); });
    expect(result.current.error).toBeNull();
  });

  it.each([
    ['duplicate ID', () => ({ ...second(), items: [summaryItem(0), ...items(99, 101)] })],
    ['mismatched total', () => ({ ...second(), totalCount: 206 })],
    ['mismatched generation', () => ({ ...second(), generationId: newer().generationId })],
    ['repeated cursor', () => ({ ...second(), nextCursor: 'page-2' })],
    ['empty nonterminal page', () => ({ ...second(), items: [] })],
    ['short nonterminal page', () => ({ ...second(), items: items(20, 100) })],
    ['premature terminal page', () => ({ ...second(), nextCursor: null })],
    ['cross-page order reversal', () => ({ ...second(), items: items(100, 20).map(item => ({ ...item, id: `other-${item.id}` })) })],
  ])('rejects %s without changing the cards, then permits retry', async (_, badPage) => {
    fetchActiveClusters.mockResolvedValueOnce(first()).mockResolvedValueOnce(badPage()).mockResolvedValueOnce(second());
    const { result } = renderHook(() => useActiveClusters());
    await flush();
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.clusters).toHaveLength(100);
    expect(result.current.nextError).toBeTruthy();
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.clusters).toHaveLength(200);
    expect(result.current.nextError).toBeNull();
  });

  it('refreshes an expired cursor atomically and never appends the replacement generation', async () => {
    const pendingRefresh = deferred();
    fetchActiveClusters.mockResolvedValueOnce(first())
      .mockRejectedValueOnce(Object.assign(new Error('Expired'), { code: 'GENERATION_EXPIRED' }))
      .mockImplementationOnce(() => pendingRefresh.promise);
    const { result } = renderHook(() => useActiveClusters());
    await flush();
    act(() => { void result.current.loadMore(); });
    await flush();
    expect(result.current.clusters).toHaveLength(100);
    expect(result.current.loading).toBe(true);
    expect(fetchActiveClusters.mock.calls[2][0]).not.toHaveProperty('cursor');
    pendingRefresh.resolve(newer());
    await flush();
    expect(result.current.clusters).toHaveLength(2);
    expect(result.current.nextError).toBeNull();
  });

  it('resets an expired cursor chain even when the same generation remains current', async () => {
    fetchActiveClusters.mockResolvedValueOnce(first()).mockResolvedValueOnce(second())
      .mockRejectedValueOnce(Object.assign(new Error('Expired'), { code: 'GENERATION_EXPIRED' }))
      .mockResolvedValueOnce({ ...first(), nextCursor: 'fresh-first-cursor' }).mockResolvedValueOnce(second());
    const { result } = renderHook(() => useActiveClusters());
    await flush();
    await act(async () => { await result.current.loadMore(); });
    const previousKey = result.current.paginationKey;
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.clusters).toHaveLength(100);
    expect(result.current.generationId).toBe(first().generationId);
    expect(result.current.paginationKey).not.toBe(previousKey);
    expect(result.current.nextError).toBeNull();
    await act(async () => { await result.current.loadMore(); });
    expect(fetchActiveClusters.mock.calls.at(-1)[0].cursor).toBe('fresh-first-cursor');
    expect(result.current.clusters).toHaveLength(200);
  });

  it('keeps last-good data and explicit retry after an expiry refresh also fails' , async () => {
    fetchActiveClusters.mockResolvedValueOnce(first())
      .mockRejectedValueOnce(Object.assign(new Error('Expired'), { code: 'GENERATION_EXPIRED' }))
      .mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(newer());
    const { result } = renderHook(() => useActiveClusters());
    await flush();
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.clusters).toHaveLength(100);
    expect(result.current.error).toBe('Offline');
    expect(result.current.nextError).toMatch(/expired/i);
    await act(async () => { await result.current.loadMore(); });
    expect(fetchActiveClusters.mock.calls.at(-1)[0]).not.toHaveProperty('cursor');
    expect(result.current.clusters).toHaveLength(2);
    expect(result.current).toMatchObject({ loadingMore: false, nextError: null });
  });

  it('does no requests on static routes and cancels both in-flight requests on leave, with usable cached re-entry', async () => {
    const next = deferred(); const refresh = deferred();
    fetchActiveClusters.mockResolvedValueOnce(first()).mockImplementationOnce(() => next.promise).mockImplementationOnce(() => refresh.promise);
    const { result, rerender } = renderHook(({ enabled }) => useActiveClusters({ enabled }), { initialProps: { enabled: false } });
    await act(async () => { await vi.advanceTimersByTimeAsync(EXTENDED_REFRESH_INTERVAL_MS * 2); });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => { await result.current.refresh(); await result.current.loadMore(); });
    expect(fetchActiveClusters).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await flush();
    act(() => { void result.current.loadMore(); void result.current.refresh(); });
    const signals = fetchActiveClusters.mock.calls.slice(1).map(([options]) => options.signal);
    rerender({ enabled: false });
    await flush();
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(result.current).toMatchObject({ loading: false, refreshing: false, loadingMore: false });
    rerender({ enabled: true });
    await flush();
    expect(fetchActiveClusters).toHaveBeenCalledTimes(3);
    next.resolve(second()); refresh.resolve(newer());
    await flush();
    expect(result.current.clusters).toHaveLength(100);
    expect(result.current).toMatchObject({ loading: false, refreshing: false, loadingMore: false });
  });

  it('times out a stalled continuation and ignores its late response after a successful retry', async () => {
    const pending = deferred();
    fetchActiveClusters.mockResolvedValueOnce(first()).mockImplementationOnce(() => pending.promise).mockResolvedValueOnce(second());
    const { result } = renderHook(() => useActiveClusters());
    await flush();
    act(() => { void result.current.loadMore(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(RESOURCE_TIMEOUT_MS); });
    expect(result.current.nextError).toMatch(/timed out/);
    expect(fetchActiveClusters.mock.calls[1][0].signal.aborted).toBe(true);
    await act(async () => { await result.current.loadMore(); });
    pending.resolve({ ...second(), items: [] });
    await flush();
    expect(result.current.clusters).toHaveLength(200);
  });

  it('polls every five minutes, refreshes stale visible data, and accepts an empty newer snapshot', async () => {
    fetchActiveClusters.mockResolvedValueOnce(first()).mockResolvedValueOnce(first())
      .mockResolvedValueOnce({ ...newer(), items: [], totalCount: 0 });
    const { result } = renderHook(() => useActiveClusters());
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(EXTENDED_REFRESH_INTERVAL_MS); });
    expect(fetchActiveClusters).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + EXTENDED_REFRESH_INTERVAL_MS);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await flush();
    expect(result.current).toMatchObject({ clusters: [], totalCount: 0, hasLoaded: true, error: null });
  });
});
