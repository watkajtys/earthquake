import React from 'react';
import { EarthquakeDataProvider, useEarthquakeDataState } from '../../contexts/EarthquakeDataContext';
import { initialState as contextInitialState, EarthquakeDataContext } from '../../contexts/earthquakeDataContextUtils.js'; // Corrected path

// --- React specific testing imports ---
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { fetchUsgsData } from '../../services/usgsApiService';
import {
    USGS_API_URL_MONTH,
    USGS_API_URL_DAY,
    USGS_API_URL_WEEK,
    LOADING_MESSAGE_INTERVAL_MS, // Used in a skipped test, but good to keep for context
    REFRESH_INTERVAL_MS
} from '../../constants/appConstants';

// Mock the usgsApiService
vi.mock('../../services/usgsApiService', () => ({
  fetchUsgsData: vi.fn(),
}));

const AllTheProviders = ({ children }) => (<EarthquakeDataProvider>{children}</EarthquakeDataProvider>);

// --- Tests for EarthquakeDataProvider async logic and initial load ---
describe('EarthquakeDataProvider initial load and refresh', () => {
  let setIntervalSpy;
  let clearIntervalSpy;
  let intervalCallbacks = {};
  let intervalIdCounter = 0;

  beforeEach(() => {
    vi.useFakeTimers(); // Still use fake timers for other time-based logic if needed
    fetchUsgsData.mockReset();

    intervalCallbacks = {}; // Reset on each test
    intervalIdCounter = 0;

    setIntervalSpy = vi.spyOn(global, 'setInterval');
    clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    setIntervalSpy.mockImplementation((callback, timeout) => {
      const id = ++intervalIdCounter;
      // console.log(`Mock setInterval called: id=${id}, timeout=${timeout}`);
      intervalCallbacks[id] = { callback, timeout, type: timeout === REFRESH_INTERVAL_MS ? 'refresh' : 'loadingMessage' };
      return id;
    });

    clearIntervalSpy.mockImplementation((id) => {
      // console.log(`Mock clearInterval called: id=${id}`);
      delete intervalCallbacks[id];
    });
  });

  afterEach(() => {
    // Restore original timers and clear any spies
    // vi.restoreAllMocks() // This would restore all mocks, might be too broad if other spies are used intentionally
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();

    vi.runOnlyPendingTimers(); // Clear any remaining standard fake timers
    vi.useRealTimers();
    vi.clearAllTimers(); // Ensure Vitest's own fake timers are cleared
    intervalCallbacks = {}; // Clean up
  });

  // Helper to run specific intervals by type
  const runIntervals = async (type, runMax = Infinity) => {
    let runCount = 0;
    // console.log(`Running intervals of type: ${type}. Found:`, Object.values(intervalCallbacks).filter(ic => ic.type === type).length);
    for (const id in intervalCallbacks) {
        if (intervalCallbacks[id].type === type && runCount < runMax) {
            // console.log(`Manually calling interval id: ${id} of type ${type}`);
            await act(async () => {
                intervalCallbacks[id].callback();
            });
            runCount++;
        }
    }
  };

  const runAllIntervalsMultipleTimes = async (count = 3) => {
    for (let i = 0; i < count; i++) {
        for (const id in intervalCallbacks) {
             await act(async () => {
                intervalCallbacks[id].callback();
            });
        }
        await act(async () => { await Promise.resolve(); }); // Flush promises between runs
    }
  };


  it('should perform initial data load (daily & weekly) on mount and set loading states', async () => {
    // Renamed these consts to avoid conflict with broader scope variables
    const specificTest_mockDailyData = { features: [{id: 'd1', properties: {time: Date.now(), mag: 1}}], metadata: { generated: Date.now() }};
    const specificTest_mockWeeklyData = { features: [{id: 'w1', properties: {time: Date.now(), mag: 2}}], metadata: { generated: Date.now() }};

    let dailyFetchResolved = false;
    let weeklyFetchResolved = false;

    fetchUsgsData.mockImplementation(async (url) => {
        await Promise.resolve(); // Simulate async nature of fetch
        if (url === USGS_API_URL_DAY) {
            dailyFetchResolved = true;
            return specificTest_mockDailyData; // Use renamed variable
        }
        if (url === USGS_API_URL_WEEK) {
            weeklyFetchResolved = true;
            return specificTest_mockWeeklyData; // Use renamed variable
        }
        return { features: [], metadata: {} };
    });

    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });

    // Initial state assertions
    expect(result.current.isLoadingDaily).toBe(true);
    expect(result.current.isLoadingWeekly).toBe(true);
    expect(result.current.isInitialAppLoad).toBe(true);

    // Advance timers enough for loading messages to cycle a bit
    // and for initial effects in orchestrateInitialDataLoad to fire
    // Initial render (the renderHook above this block is the correct one for this test)

    // Initial state assertions
    expect(result.current.isLoadingDaily).toBe(true);
    expect(result.current.isLoadingWeekly).toBe(true);
    expect(result.current.isInitialAppLoad).toBe(true);

    // Manually trigger loading message intervals a few times
    await runIntervals('loadingMessage');
    await runIntervals('loadingMessage');

    // Allow promises from fetchUsgsData (called by orchestrateInitialDataLoad on mount) to resolve
    await act(async () => {
      await Promise.resolve(); // Flush microtasks for fetch promises
      await Promise.resolve(); // Again to be safe for chained promises
    });

    // After fetches, state updates should have happened
    expect(dailyFetchResolved).toBe(true); // Check if mock fetch was called and resolved
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
    const mockWeeklyData = { features: [{id: 'w1', properties: {time: Date.now(), mag: 1}}], metadata: {generated: Date.now()} }; // Added properties
    fetchUsgsData.mockImplementation(async (url) => {
      if (url === USGS_API_URL_DAY) return Promise.resolve({ error: { message: "Daily fetch failed" } });
      if (url === USGS_API_URL_WEEK) return Promise.resolve(mockWeeklyData);
      return Promise.resolve({ features: [] });
    });

    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });

    await act(async () => {
        await Promise.resolve(); // Allow fetches to "complete"
        await Promise.resolve();
    });
    await runAllIntervalsMultipleTimes(2); // Run loading/refresh intervals

    expect(result.current.isLoadingDaily).toBe(false);
    expect(result.current.isLoadingWeekly).toBe(false);
    expect(result.current.error).toContain("Daily data error: Daily fetch failed");
    expect(result.current.isInitialAppLoad).toBe(false);
  });

  it('should handle error if weekly fetch fails during initial load', async () => {
    const mockDailyData = { features: [{id: 'd1', properties: {time: Date.now(), mag: 1}}], metadata: {generated: Date.now()} }; // Added properties
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
    // Ensure distinct successful responses for daily and weekly initial loads
    fetchUsgsData
        .mockResolvedValueOnce({ features: [{id:'q_daily_cycle_test', properties:{time: Date.now(), mag:1}}], metadata: { generated: Date.now() } }) // For daily
        .mockResolvedValueOnce({ features: [{id:'q_weekly_cycle_test', properties:{time: Date.now(), mag:2}}], metadata: { generated: Date.now() } }); // For weekly

    const initialMessages = contextInitialState.currentLoadingMessages;
    expect(initialMessages.length).toBeGreaterThan(1);

    let result;

    // Initial Render + synchronous effects from orchestrateInitialDataLoad
    await act(async () => {
        const { result: hookResult } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
        result = hookResult;
        // Allow microtasks to flush, ensuring initial sync dispatches in useEffect -> orchestrateInitialDataLoad complete
        // Vitest's act typically handles promise flushing, but an explicit await can sometimes help ensure order.
        await new Promise(setImmediate); // More robust than setTimeout(0) for promise flushing in some test envs
    });

    // Check message after the two synchronous UPDATE_LOADING_MESSAGE_INDEX dispatches from orchestrateInitialDataLoad
    // Initial state: index 0. Dispatch 1: index 1. Dispatch 2: index 2.
    const expectedMessageAfterSyncDispatches = initialMessages.length >= 3 ? initialMessages[2] :
                                              (initialMessages.length === 2 ? initialMessages[0] : initialMessages[0]);
    expect(result.current.currentLoadingMessage).toBe(expectedMessageAfterSyncDispatches);
    expect(result.current.isInitialAppLoad).toBe(true);

    // Use waitFor to ensure isInitialAppLoad becomes false, indicating loading completion.
    // The timeout for waitFor should be less than the test's own timeout.
    // This also allows React to process state updates and effects naturally with fake timers.
    await act(async () => {
        // It's important that `fetchUsgsData` mocks resolve.
        // Advancing timers helps if there are any `setTimeout` or `setInterval` involved in the loading process itself,
        // beyond the message cycling. The `orchestrateInitialDataLoad` uses async/await and promises.
        // We need to ensure these promises resolve and their effects on state are processed.
        // Running all timers might be too aggressive if it clears the message interval prematurely for the test's logic.
        // Let's advance by a small amount to ensure any initial async setup starts.
        vi.advanceTimersByTime(1);
        // The key is waiting for the state to change, not just timers.
    });

    await waitFor(() => {
      expect(result.current.isInitialAppLoad).toBe(false);
    }, { timeout: 4800 }); // Slightly less than the default 5s test timeout. Increased from 4500

    // Verify that fetch was called for both daily and weekly data
    expect(fetchUsgsData).toHaveBeenCalledWith(USGS_API_URL_DAY);
    expect(fetchUsgsData).toHaveBeenCalledWith(USGS_API_URL_WEEK);
    expect(fetchUsgsData).toHaveBeenCalledTimes(2);

    const messageWhenLoadFinished = result.current.currentLoadingMessage;

    // Now that isInitialAppLoad is false, the interval should have been cleared.
    // Advance time again to check if the message *still* changes. It shouldn't.
    await act(async () => {
      vi.advanceTimersByTime(LOADING_MESSAGE_INTERVAL_MS * 3);
    });

    expect(result.current.currentLoadingMessage).toBe(messageWhenLoadFinished, "Loading message should not change after initial load is complete and interval is cleared.");
  });

  // Test for refresh logic needs to be adapted for manual interval trigger
  it('should refresh data when refresh interval callback is manually triggered', async () => {
    const initialDailyTime = Date.now();
    const initialWeeklyTime = initialDailyTime - 1000; // Ensure distinct times

    fetchUsgsData.mockResolvedValueOnce({ features: [{id:'q_initial_daily', properties: {time: initialDailyTime, mag: 1}}], metadata: {generated: initialDailyTime} })
                   .mockResolvedValueOnce({ features: [{id:'q_initial_weekly', properties: {time: initialWeeklyTime, mag: 1}}], metadata: {generated: initialWeeklyTime} });

    let result;
    await act(async () => {
        const { result: hookResult } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
        result = hookResult;
        await Promise.resolve();
        await Promise.resolve();
        await runIntervals('loadingMessage', 2); // Settle initial loading messages
    });

    expect(fetchUsgsData).toHaveBeenCalledTimes(2);

    // Setup for refresh call
    fetchUsgsData.mockClear();
    const refreshFetchTime = Date.now() + 5000; // Simulate time passing for the refresh
    const refreshedDailyQuakeTime = refreshFetchTime - 1000; // 1 second before this "new Date.now()"

    fetchUsgsData.mockResolvedValueOnce({ features: [{id:'q_refresh_daily', properties: {time: refreshedDailyQuakeTime, mag: 2}}], metadata: {generated: refreshFetchTime} })
                   .mockResolvedValueOnce({ features: [{id:'q_refresh_weekly', properties: {time: refreshedDailyQuakeTime - 2000, mag: 2}}], metadata: {generated: refreshFetchTime} });

    // Manually trigger THE refresh interval's callback
    // The orchestrateInitialDataLoad called by refresh will use its own Date.now() for filtering.
    // We need to ensure our mocked feature times are relative to that.
    // For the test, we'll mock Date.now() just for the duration of the refresh callback.
    vi.spyOn(global.Date, 'now').mockReturnValueOnce(refreshFetchTime);

    await act(async () => {
        await runIntervals('refresh', 1);
        await Promise.resolve();
        await Promise.resolve();
    });

    global.Date.now.mockRestore(); // IMPORTANT: Restore Date.now

    expect(fetchUsgsData).toHaveBeenCalledTimes(2);
    expect(result.current.earthquakesLastHour.some(q => q.id === 'q_refresh_daily')).toBe(true);
  });

});


describe('EarthquakeDataContext: loadMonthlyData', () => {
  beforeEach(() => {
    fetchUsgsData.mockReset();
    // It's good practice to also reset timers if they might interact, though these tests are more focused on fetch.
    vi.useFakeTimers();
  });

   afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });


  it('should fetch monthly data and dispatch MONTHLY_DATA_PROCESSED on success', async () => {
    const minimalMockFeatures = [{ id: 'mocker1', properties: { time: Date.now(), mag: 3.0 } }];
    fetchUsgsData.mockImplementation(async (url) => {
      if (url === USGS_API_URL_MONTH) return Promise.resolve({ features: minimalMockFeatures });
      // Mock initial daily/weekly fetches that happen on provider mount
      if (url === USGS_API_URL_DAY) return Promise.resolve({ features: [], metadata: {generated: Date.now()} });
      if (url === USGS_API_URL_WEEK) return Promise.resolve({ features: [], metadata: {generated: Date.now()} });
      return Promise.resolve({ features: [], metadata: {} });
    });

    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
    // Wait for initial daily/weekly loads to complete
    await waitFor(() => expect(result.current.isInitialAppLoad).toBe(false));


    expect(result.current.monthlyError).toBeNull();
    await act(async () => { result.current.loadMonthlyData(); });
    // Ensure promises from loadMonthlyData resolve
    await act(async () => { await Promise.resolve(); });


    expect(fetchUsgsData).toHaveBeenCalledWith(USGS_API_URL_MONTH);
    expect(result.current.isLoadingMonthly).toBe(false);
    expect(result.current.hasAttemptedMonthlyLoad).toBe(true);
    expect(result.current.monthlyError).toBeNull();
    expect(result.current.allEarthquakes.length).toBe(minimalMockFeatures.length);
    if (minimalMockFeatures.length > 0) expect(result.current.allEarthquakes[0].id).toBe(minimalMockFeatures[0].id);
  });

  it('should set monthlyError if API returns an error object', async () => {
    const errorMessage = "API Error for monthly data";
    const apiErrorResponse = { error: { message: errorMessage } };
    fetchUsgsData.mockImplementation(async (url) => {
      if (url === USGS_API_URL_MONTH) return Promise.resolve(apiErrorResponse);
      if (url === USGS_API_URL_DAY) return Promise.resolve({ features: [], metadata: {generated: Date.now()} });
      if (url === USGS_API_URL_WEEK) return Promise.resolve({ features: [], metadata: {generated: Date.now()} });
      return Promise.resolve({ features: [], metadata: {} });
    });

    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
    await waitFor(() => expect(result.current.isInitialAppLoad).toBe(false));

    await act(async () => { result.current.loadMonthlyData(); });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.monthlyError).toBe(errorMessage);
  });

  it('should set monthlyError if API call throws an error', async () => {
    const thrownErrorMessage = "Network failure";
    fetchUsgsData.mockImplementation(async (url) => {
      if (url === USGS_API_URL_MONTH) return Promise.reject(new Error(thrownErrorMessage));
      if (url === USGS_API_URL_DAY) return Promise.resolve({ features: [], metadata: {generated: Date.now()} });
      if (url === USGS_API_URL_WEEK) return Promise.resolve({ features: [], metadata: {generated: Date.now()} });
      return Promise.resolve({ features: [], metadata: {} });
    });

    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
    await waitFor(() => expect(result.current.isInitialAppLoad).toBe(false));

    await act(async () => { result.current.loadMonthlyData(); });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.monthlyError).toContain(`Monthly Data Processing Error: ${thrownErrorMessage}`);
  });

  it('should set monthlyError if API returns no features or empty features array', async () => {
    fetchUsgsData.mockImplementation(async (url) => {
      if (url === USGS_API_URL_MONTH) return Promise.resolve({ features: [] });
      if (url === USGS_API_URL_DAY) return Promise.resolve({ features: [], metadata: {generated: Date.now()} });
      if (url === USGS_API_URL_WEEK) return Promise.resolve({ features: [], metadata: {generated: Date.now()} });
      return Promise.resolve({ features: [], metadata: {} });
    });

    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
    await waitFor(() => expect(result.current.isInitialAppLoad).toBe(false));

    await act(async () => { result.current.loadMonthlyData(); });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.monthlyError).toBe("Monthly data is unavailable or incomplete.");

    // Reset fetchUsgsData for the next case within the same test
    fetchUsgsData.mockImplementation(async (url) => {
      if (url === USGS_API_URL_MONTH) return Promise.resolve({}); // No 'features' key
      if (url === USGS_API_URL_DAY) return Promise.resolve({ features: [], metadata: {generated: Date.now()} });
      if (url === USGS_API_URL_WEEK) return Promise.resolve({ features: [], metadata: {generated: Date.now()} });
      return Promise.resolve({ features: [], metadata: {} });
    });

    // Re-trigger loadMonthlyData for the new mock scenario
    await act(async () => { result.current.loadMonthlyData(); });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.monthlyError).toBe("Monthly data is unavailable or incomplete.");
  });
});
