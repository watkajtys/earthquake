import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EarthquakeDataProvider, useEarthquakeDataState } from '../../contexts/EarthquakeDataContext.jsx';
import { earthquakeFeature, feedEnvelope, feedResponse } from '../../test-utils/earthquakeFeedFixtures.js';
import { EXTENDED_REFRESH_INTERVAL_MS } from '../../hooks/useRefreshableResource.js';
import { REFRESH_INTERVAL_MS } from '../../constants/appConstants';

const wrapper = ({ children }) => <EarthquakeDataProvider>{children}</EarthquakeDataProvider>;
const now = Date.UTC(2026, 8, 21);
const flush = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
let calls;
let failing;
let fetchMock;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  calls = { day: 0, week: 0, month: 0 };
  failing = new Set();
  fetchMock = vi.fn(async (url) => {
    if (String(url).startsWith('/api/usgs-proxy')) return new Response(null, { status: 503 });
    const period = new URL(url, 'https://example.test').searchParams.get('period');
    calls[period]++;
    return failing.has(period) ? new Response('Unavailable', { status: 503 }) : feedResponse(feedEnvelope(period, [earthquakeFeature(`${period}-${calls[period]}`, period === 'month' ? { time: Date.now() - 15 * 86400000 } : {})], { snapshotSequence: calls[period] }));
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('provider refresh and failure recovery', () => {
  it('restarts cancelled initial requests under StrictMode and finishes loading normally', async () => {
    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper, reactStrictMode: true });
    await flush();
    expect(fetchMock.mock.calls.slice(0, 2).every(([, options]) => options.signal.aborted)).toBe(true);
    expect(result.current.isInitialAppLoad).toBe(false);
    expect(result.current.dailyDataSource).toBe('USGS snapshot');
    expect(result.current.weeklyDataSource).toBe('USGS snapshot');
    expect(result.current.error).toBeNull();
  });

  it('keeps month opt-in and refreshes it every five minutes while day/week retain one-minute cadence', async () => {
    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper });
    await flush();
    expect(calls).toEqual({ day: 1, week: 1, month: 0 });
    act(() => result.current.loadMonthlyData());
    await flush();
    expect(result.current.monthlyHasLoaded).toBe(true);
    act(() => result.current.loadMonthlyData());
    await flush();
    expect(calls.month).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(EXTENDED_REFRESH_INTERVAL_MS); });
    expect(calls).toEqual({ day: 6, week: 6, month: 2 });
    expect(result.current.allEarthquakes[0].id).toBe('month-2');
    expect(result.current.monthlyLastSuccessfulAtMs).toBe(now + EXTENDED_REFRESH_INTERVAL_MS);
    expect(result.current.monthlySourceGeneratedAtMs).toBe(now + EXTENDED_REFRESH_INTERVAL_MS);
  });

  it('permits an immediate explicit retry after the first monthly failure', async () => {
    failing.add('month');
    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper });
    await flush();
    act(() => result.current.loadMonthlyData());
    await flush();
    expect(result.current).toMatchObject({ hasAttemptedMonthlyLoad: true, monthlyHasLoaded: false, isLoadingMonthly: false });
    expect(result.current.monthlyError).toContain('HTTP 503');
    failing.delete('month');
    act(() => result.current.loadMonthlyData());
    await flush();
    expect(result.current).toMatchObject({ monthlyHasLoaded: true, monthlyError: null });
    expect(calls.month).toBe(2);
  });

  it('retries a failed first monthly attempt on its next interval without a page reload', async () => {
    failing.add('month');
    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper });
    await flush(); act(() => result.current.loadMonthlyData()); await flush();
    failing.delete('month');
    await act(async () => { await vi.advanceTimersByTimeAsync(EXTENDED_REFRESH_INTERVAL_MS); });
    expect(result.current.monthlyHasLoaded).toBe(true);
    expect(result.current.monthlyError).toBeNull();
    expect(calls.month).toBe(2);
  });

  it('retains last-good month data and its receipt timestamp when refresh fails', async () => {
    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper });
    await flush(); act(() => result.current.loadMonthlyData()); await flush();
    const successfulData = result.current.allEarthquakes;
    failing.add('month');
    await act(async () => { await vi.advanceTimersByTimeAsync(EXTENDED_REFRESH_INTERVAL_MS); });
    expect(result.current.allEarthquakes).toEqual(successfulData);
    expect(result.current.monthlyLastSuccessfulAtMs).toBe(now);
    expect(result.current.monthlyHasLoaded).toBe(true);
    expect(result.current.monthlyError).toContain('HTTP 503');
  });

  it('recovers failed initial day/week data and does not reopen the initial loading screen', async () => {
    failing.add('day'); failing.add('week');
    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper });
    await flush();
    expect(result.current.isInitialAppLoad).toBe(false);
    expect(result.current.error).toContain('Daily & Weekly');
    failing.clear();
    await act(async () => { await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS); });
    expect(result.current.error).toBeNull();
    expect(result.current.isInitialAppLoad).toBe(false);
    expect(result.current.earthquakesLast24Hours[0].id).toBe('day-2');
  });

  it('cancels pending requests on unmount without starting the fallback afterward', async () => {
    const requests = [];
    fetchMock.mockImplementation((url, options) => new Promise((resolve, reject) => {
      requests.push(options.signal);
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }));
    const { unmount } = renderHook(() => useEarthquakeDataState(), { wrapper });
    expect(requests).toHaveLength(2);
    unmount(); await flush();
    expect(requests.every(signal => signal.aborted)).toBe(true);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).startsWith('/api/usgs-proxy'))).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
