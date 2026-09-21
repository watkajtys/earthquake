import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRefreshableResource, RESOURCE_TIMEOUT_MS } from './useRefreshableResource.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-21T00:00:00Z')); });
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
