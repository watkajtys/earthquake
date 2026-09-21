import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRefreshableResource, EXTENDED_REFRESH_INTERVAL_MS, RESOURCE_TIMEOUT_MS } from './useRefreshableResource.js';
import { useActiveClusters } from './useActiveClusters.js';
import { fetchActiveClusters } from '../services/clusterApiService.js';

vi.mock('../services/clusterApiService.js', () => ({ fetchActiveClusters: vi.fn() }));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-21T00:00:00Z')); fetchActiveClusters.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('bounded resource lifecycle', () => {
  it('keeps the intended polling cadence when successful requests take nonzero time', async () => {
    const pending = deferred();
    const load = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValue(['next']);
    const { result } = renderHook(() => useRefreshableResource(load, { intervalMs: 60_000 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); pending.resolve(['first']); });
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(59_500); });
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual(['next']);
  });

  it('shares an in-flight request across manual refreshes and intervals', async () => {
    const pending = deferred();
    const load = vi.fn(() => pending.promise);
    const { result } = renderHook(() => useRefreshableResource(load, { intervalMs: 1000 }));
    act(() => { void result.current.refresh(); void result.current.refresh(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(load).toHaveBeenCalledTimes(1);
    pending.resolve(['first']);
    await flush();
    expect(result.current).toMatchObject({ data: ['first'], loading: false, hasLoaded: true });
  });

  it('times out, recovers, and ignores a late response from the expired request', async () => {
    const pending = deferred();
    const load = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValueOnce(['new']);
    const { result } = renderHook(() => useRefreshableResource(load, { intervalMs: 60_000 }));
    const oldSignal = load.mock.calls[0][0].signal;
    await act(async () => { await vi.advanceTimersByTimeAsync(RESOURCE_TIMEOUT_MS); });
    expect(oldSignal.aborted).toBe(true);
    expect(result.current).toMatchObject({ loading: false, hasLoaded: false, error: 'Request timed out. Please retry.' });
    await act(async () => { await result.current.refresh(); });
    const acceptedAt = result.current.lastSuccessfulAtMs;
    pending.resolve(['old']);
    await flush();
    expect(result.current).toMatchObject({ data: ['new'], loading: false, error: null, lastSuccessfulAtMs: acceptedAt });
  });

  it('aborts on unmount and prevents stale finally from interfering with a replacement loader', async () => {
    const pending = deferred();
    const oldLoad = vi.fn(() => pending.promise);
    const nextPending = deferred();
    const nextLoad = vi.fn(() => nextPending.promise);
    const { result, rerender, unmount } = renderHook(({ load }) => useRefreshableResource(load, { intervalMs: 60_000 }), { initialProps: { load: oldLoad } });
    rerender({ load: nextLoad });
    await flush();
    expect(oldLoad.mock.calls[0][0].signal.aborted).toBe(true);
    pending.resolve(['old']);
    await flush();
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    unmount();
    expect(nextLoad.mock.calls[0][0].signal.aborted).toBe(true);
    nextPending.resolve(['too-late']);
    await flush();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('active cluster polling', () => {
  it('does no initial, interval or visibility polling while the route is disabled', async () => {
    const { rerender } = renderHook(({ enabled }) => useActiveClusters({ enabled }), { initialProps: { enabled: false } });
    await act(async () => { await vi.advanceTimersByTimeAsync(EXTENDED_REFRESH_INTERVAL_MS * 2); });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(fetchActiveClusters).not.toHaveBeenCalled();
    fetchActiveClusters.mockResolvedValue([]);
    rerender({ enabled: true });
    await flush();
    expect(fetchActiveClusters).toHaveBeenCalledOnce();
  });

  it('aborts refresh on route leave and restores fresh cached data without a stuck loading state on re-entry', async () => {
    const pending = deferred();
    fetchActiveClusters.mockResolvedValueOnce([{ id: 'A' }]).mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce([{ id: 'B' }]);
    const { result, rerender } = renderHook(({ enabled }) => useActiveClusters({ enabled }), { initialProps: { enabled: true } });
    await flush();
    act(() => { void result.current.refresh(); });
    const signal = fetchActiveClusters.mock.calls[1][0].signal;
    expect(result.current.refreshing).toBe(true);
    rerender({ enabled: false });
    await flush();
    expect(signal.aborted).toBe(true);
    expect(result.current).toMatchObject({ clusters: [{ id: 'A' }], loading: false, refreshing: false });
    rerender({ enabled: true });
    await flush();
    expect(fetchActiveClusters).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({ clusters: [{ id: 'A' }], loading: false, refreshing: false });
    pending.resolve([{ id: 'stale' }]);
    await flush();
    expect(result.current.clusters).toEqual([{ id: 'A' }]);
    await act(async () => { await vi.advanceTimersByTimeAsync(EXTENDED_REFRESH_INTERVAL_MS); });
    expect(result.current).toMatchObject({ clusters: [{ id: 'B' }], loading: false, refreshing: false });
  });

  it('recovers from an initial error on manual retry, then polls without erasing last-good data', async () => {
    fetchActiveClusters.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce([{ id: 'A' }])
      .mockRejectedValueOnce(new Error('Temporary failure')).mockResolvedValueOnce([{ id: 'B' }]);
    const { result } = renderHook(() => useActiveClusters());
    await flush();
    expect(result.current).toMatchObject({ clusters: [], hasLoaded: false, error: 'Offline' });
    await act(async () => { await result.current.refresh(); });
    const lastGoodAt = result.current.lastSuccessfulAtMs;
    await act(async () => { await vi.advanceTimersByTimeAsync(EXTENDED_REFRESH_INTERVAL_MS); });
    expect(result.current).toMatchObject({ clusters: [{ id: 'A' }], error: 'Temporary failure', hasLoaded: true, lastSuccessfulAtMs: lastGoodAt });
    await act(async () => { await vi.advanceTimersByTimeAsync(EXTENDED_REFRESH_INTERVAL_MS); });
    expect(result.current).toMatchObject({ clusters: [{ id: 'B' }], error: null });
  });

  it('refreshes stale data on return to visibility and accepts a genuine empty result', async () => {
    fetchActiveClusters.mockResolvedValueOnce([{ id: 'A' }]).mockResolvedValueOnce([]);
    const { result } = renderHook(() => useActiveClusters());
    await flush();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await flush();
    expect(fetchActiveClusters).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + EXTENDED_REFRESH_INTERVAL_MS);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await flush();
    expect(fetchActiveClusters).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({ clusters: [], error: null, hasLoaded: true });
    visibility.mockRestore();
  });
});
