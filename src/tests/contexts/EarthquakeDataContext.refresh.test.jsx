import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EarthquakeDataProvider, useEarthquakeDataState } from '../../contexts/EarthquakeDataContext.jsx';
import { earthquakeFeature, feedEnvelope, feedResponse } from '../../test-utils/earthquakeFeedFixtures.js';
import { REFRESH_INTERVAL_MS } from '../../constants/appConstants.js';
const now = Date.UTC(2026, 8, 21);
const wrapper = ({ children }) => <EarthquakeDataProvider>{children}</EarthquakeDataProvider>;
const flush = async () => { await act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); }); };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('provider conditional refresh', () => {
  it('revalidates each cached period without replacing upstream time with recent receipt time', async () => {
    const envelopes = Object.fromEntries(['day', 'week'].map(period => [period, feedEnvelope(period, [earthquakeFeature(period)])]));
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      const period = new URL(url, 'https://example.test').searchParams.get('period');
      return feedResponse(envelopes[period], { status: options.headers['If-None-Match'] ? 304 : 200 });
    });
    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper });
    await flush();
    expect(result.current.dailyHasLoaded).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS); });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(result.current.dailyLastSuccessfulAtMs).toBe(now + REFRESH_INTERVAL_MS);
    expect(result.current.dailySourceGeneratedAtMs).toBe(now);
    expect(result.current.feedSnapshots.day.coverage.asOfMs).toBe(now);
    expect(result.current.error).toBeNull();
  });
  it('marks the retained source stale at its own deadline even after a successful 304 receipt', async () => {
    const envelopes = Object.fromEntries(['day', 'week'].map(period => [period, feedEnvelope(period, [earthquakeFeature(period)])]));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      const period = new URL(url, 'https://example.test').searchParams.get('period');
      return feedResponse(envelopes[period], { status: options.headers['If-None-Match'] ? 304 : 200 });
    });
    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper });
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000); });
    expect(result.current.dailyFeedStatus.stale).toBe(false);
    expect(result.current.dailyLastSuccessfulAtMs).toBe(now + 10 * 60_000);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current.dailyFeedStatus.stale).toBe(true);
    expect(result.current.weeklyFeedStatus.stale).toBe(true);
    expect(result.current.dailySourceGeneratedAtMs).toBe(now);
  });

  it('applies a fresh corrected snapshot across loaded period state without resurrecting older scientific fields', async () => {
    let sequence = 1;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
      const period = new URL(url, 'https://example.test').searchParams.get('period');
      const feature = earthquakeFeature('shared', { mag: sequence === 1 ? 5 : 4, updated: now + (sequence - 1) * REFRESH_INTERVAL_MS,
        alert: sequence === 1 ? 'red' : null, tsunami: sequence === 1 ? 1 : 0 });
      return feedResponse(feedEnvelope(period, [feature], { snapshotSequence: sequence }));
    });
    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper });
    await flush();
    expect(result.current.lastMajorQuake.id).toBe('shared');
    sequence = 2;
    await act(async () => { await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS); });
    expect(result.current.lastMajorQuake).toBeNull();
    expect(result.current.highestRecentAlert).toBeNull();
    expect(result.current.hasRecentTsunamiWarning).toBe(false);
    expect(result.current.earthquakesLast7Days[0].properties.mag).toBe(4);
  });
});
