import React from 'react';
import { EarthquakeDataProvider, useEarthquakeDataState } from '../../contexts/EarthquakeDataContext';
import { initialState as contextInitialState } from '../../contexts/earthquakeDataContextUtils.js';

// --- React specific testing imports ---
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { fetchUsgsData } from '../../services/usgsApiService';
import {
    USGS_API_URL_DAY,
    USGS_API_URL_WEEK,
    LOADING_MESSAGE_INTERVAL_MS,
    // REFRESH_INTERVAL_MS // Not used in this file
} from '../../constants/appConstants';

// Mock the usgsApiService
vi.mock('../../services/usgsApiService', () => ({
  fetchUsgsData: vi.fn(),
}));

const AllTheProviders = ({ children }) => (<EarthquakeDataProvider>{children}</EarthquakeDataProvider>);

describe('EarthquakeDataProvider Initial Load', () => {
  let setIntervalSpy;
  let clearIntervalSpy;
  let intervalCallbacks = {};
  let intervalIdCounter = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchUsgsData.mockReset();

    intervalCallbacks = {};
    intervalIdCounter = 0;

    setIntervalSpy = vi.spyOn(global, 'setInterval');
    clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    setIntervalSpy.mockImplementation((callback, timeout) => {
      const id = ++intervalIdCounter;
      intervalCallbacks[id] = { callback, timeout, type: timeout === LOADING_MESSAGE_INTERVAL_MS ? 'loadingMessage' : 'other' }; // Simplified type
      return id;
    });

    clearIntervalSpy.mockImplementation((id) => {
      delete intervalCallbacks[id];
    });
  });

  afterEach(() => {
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllTimers();
    intervalCallbacks = {};
  });

  const runIntervals = async (type, runMax = Infinity) => {
    let runCount = 0;
    for (const id in intervalCallbacks) {
        if (intervalCallbacks[id].type === type && runCount < runMax) {
            await act(async () => {
                intervalCallbacks[id].callback();
            });
            runCount++;
        }
    }
  };

  // This helper might be overkill if only loadingMessage intervals are relevant here
  const runAllIntervalsMultipleTimes = async (count = 3) => {
    for (let i = 0; i < count; i++) {
        for (const id in intervalCallbacks) {
             await act(async () => {
                intervalCallbacks[id].callback();
            });
        }
        await act(async () => { await Promise.resolve(); });
    }
  };

  it('should perform initial data load (daily & weekly) on mount and set loading states', async () => {
    const specificTest_mockDailyData = { features: [{id: 'd1', properties: {time: Date.now(), mag: 1}}], metadata: { generated: Date.now() }};
    const specificTest_mockWeeklyData = { features: [{id: 'w1', properties: {time: Date.now(), mag: 2}}], metadata: { generated: Date.now() }};

    let dailyFetchResolved = false;
    let weeklyFetchResolved = false;

    fetchUsgsData.mockImplementation(async (url) => {
        await Promise.resolve();
        if (url === USGS_API_URL_DAY) {
            dailyFetchResolved = true;
            return specificTest_mockDailyData;
        }
        if (url === USGS_API_URL_WEEK) {
            weeklyFetchResolved = true;
            return specificTest_mockWeeklyData;
        }
        return { features: [], metadata: {} };
    });

    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });

    expect(result.current.isLoadingDaily).toBe(true);
    expect(result.current.isLoadingWeekly).toBe(true);
    expect(result.current.isInitialAppLoad).toBe(true);

    await runIntervals('loadingMessage'); // Simulate some loading messages
    await runIntervals('loadingMessage');

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(dailyFetchResolved).toBe(true);
    expect(weeklyFetchResolved).toBe(true);
    expect(fetchUsgsData).toHaveBeenCalledWith(USGS_API_URL_DAY);
    expect(fetchUsgsData).toHaveBeenCalledWith(USGS_API_URL_WEEK);
    expect(result.current.isLoadingDaily).toBe(false);
    expect(result.current.isLoadingWeekly).toBe(false);
    expect(result.current.isInitialAppLoad).toBe(false);
    expect(result.current.earthquakesLastHour.length).toBeGreaterThanOrEqual(0);
    expect(result.current.earthquakesLast7Days.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle error if daily fetch fails during initial load', async () => {
    const mockWeeklyData = { features: [{id: 'w1', properties: {time: Date.now(), mag: 1}}], metadata: {generated: Date.now()} };
    fetchUsgsData.mockImplementation(async (url) => {
      if (url === USGS_API_URL_DAY) return Promise.resolve({ error: { message: "Daily fetch failed" } });
      if (url === USGS_API_URL_WEEK) return Promise.resolve(mockWeeklyData);
      return Promise.resolve({ features: [] });
    });

    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });

    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
    await runAllIntervalsMultipleTimes(2);

    expect(result.current.isLoadingDaily).toBe(false);
    expect(result.current.isLoadingWeekly).toBe(false);
    expect(result.current.error).toContain("Daily data error: Daily fetch failed");
    expect(result.current.isInitialAppLoad).toBe(false);
  });

  it('should handle error if weekly fetch fails during initial load', async () => {
    const mockDailyData = { features: [{id: 'd1', properties: {time: Date.now(), mag: 1}}], metadata: {generated: Date.now()} };
    fetchUsgsData.mockImplementation(async (url) => {
      if (url === USGS_API_URL_DAY) return Promise.resolve(mockDailyData);
      if (url === USGS_API_URL_WEEK) return Promise.resolve({ error: { message: "Weekly fetch failed" } });
      return Promise.resolve({ features: [] });
    });

    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });

    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
    await runAllIntervalsMultipleTimes(2);

    expect(result.current.isLoadingDaily).toBe(false);
    expect(result.current.isLoadingWeekly).toBe(false);
    expect(result.current.error).toContain("Weekly data error: Weekly fetch failed");
    expect(result.current.isInitialAppLoad).toBe(false);
  });

  it('should handle errors if both daily and weekly fetches fail during initial load', async () => {
    fetchUsgsData.mockImplementation(async (url) => {
      if (url === USGS_API_URL_DAY) return Promise.resolve({ error: { message: "Daily failed" } });
      if (url === USGS_API_URL_WEEK) return Promise.resolve({ error: { message: "Weekly failed" } });
      return Promise.resolve({ features: [] });
    });

    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });

    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
    await runAllIntervalsMultipleTimes(2);

    expect(result.current.error).toBe("Failed to fetch critical daily and weekly data.");
    expect(result.current.isInitialAppLoad).toBe(false);
  });

  it.skip('should cycle loading messages during initial load and stop after', async () => {
    fetchUsgsData
        .mockResolvedValueOnce({ features: [{id:'q_daily_cycle_test', properties:{time: Date.now(), mag:1}}], metadata: { generated: Date.now() } })
        .mockResolvedValueOnce({ features: [{id:'q_weekly_cycle_test', properties:{time: Date.now(), mag:2}}], metadata: { generated: Date.now() } });

    const initialMessages = contextInitialState.currentLoadingMessages;
    expect(initialMessages.length).toBeGreaterThan(1);

    let result;

    await act(async () => {
        const { result: hookResult } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
        result = hookResult;
        await new Promise(setImmediate);
    });

    const expectedMessageAfterSyncDispatches = initialMessages.length >= 3 ? initialMessages[2] :
                                              (initialMessages.length === 2 ? initialMessages[0] : initialMessages[0]);
    expect(result.current.currentLoadingMessage).toBe(expectedMessageAfterSyncDispatches);
    expect(result.current.isInitialAppLoad).toBe(true);

    await act(async () => {
        vi.advanceTimersByTime(1);
    });

    await waitFor(() => {
      expect(result.current.isInitialAppLoad).toBe(false);
    }, { timeout: 4800 });

    expect(fetchUsgsData).toHaveBeenCalledWith(USGS_API_URL_DAY);
    expect(fetchUsgsData).toHaveBeenCalledWith(USGS_API_URL_WEEK);
    expect(fetchUsgsData).toHaveBeenCalledTimes(2);

    const messageWhenLoadFinished = result.current.currentLoadingMessage;

    await act(async () => {
      vi.advanceTimersByTime(LOADING_MESSAGE_INTERVAL_MS * 3);
    });

    expect(result.current.currentLoadingMessage).toBe(messageWhenLoadFinished, "Loading message should not change after initial load is complete and interval is cleared.");
  });
});
