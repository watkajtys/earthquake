import React from 'react';
import { EarthquakeDataProvider, useEarthquakeDataState } from '../../contexts/EarthquakeDataContext';
// --- React specific testing imports ---
import { renderHook, act } from '@testing-library/react'; // Removed waitFor as it's not used in the moved test
import { vi } from 'vitest';
import { fetchUsgsData } from '../../services/usgsApiService';
import {
    USGS_API_URL_DAY,
    USGS_API_URL_WEEK,
    REFRESH_INTERVAL_MS
    // LOADING_MESSAGE_INTERVAL_MS // Not used here
} from '../../constants/appConstants';

// Mock the usgsApiService
vi.mock('../../services/usgsApiService', () => ({
  fetchUsgsData: vi.fn(),
}));

const AllTheProviders = ({ children }) => (<EarthquakeDataProvider>{children}</EarthquakeDataProvider>);

describe('EarthquakeDataProvider Data Refresh', () => {
  let setIntervalSpy;
  let clearIntervalSpy;
  let intervalCallbacks = {};
  let intervalIdCounter = 0;
  let fetchSpy; // Standardized name

  beforeEach(() => {
    vi.useFakeTimers();
    fetchUsgsData.mockReset();

    fetchSpy = vi.spyOn(global, 'fetch');
    fetchSpy.mockImplementation(async (url, options) => {
      const requestedUrl = typeof url === 'string' ? url : (url && typeof url.url === 'string' ? url.url : '');
      if (requestedUrl.includes('/api/get-earthquakes')) {
        // console.log(`Simulating D1 API failure for: ${requestedUrl} in refresh.test.jsx`);
        return Promise.resolve({
          ok: false,
          status: 503, // Service Unavailable
          headers: { get: (headerName) => headerName.toLowerCase() === 'x-data-source' ? 'D1_Error_Simulated' : null },
          json: () => Promise.resolve({ error: "Simulated D1 Service Unavailable" }),
          text: () => Promise.resolve("Simulated D1 Service Unavailable"),
        });
      }
      console.error(`Unexpected global.fetch call to ${requestedUrl} in refresh.test.jsx. Ensure it is intended and mocked.`);
      return Promise.reject(new Error(`Unexpected global.fetch call to ${requestedUrl} in refresh.test.jsx.`));
    });

    intervalCallbacks = {};
    intervalIdCounter = 0;

    setIntervalSpy = vi.spyOn(global, 'setInterval');
    clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    setIntervalSpy.mockImplementation((callback, timeout) => {
      const id = ++intervalIdCounter;
      // In this file, we are primarily interested in the 'refresh' interval
      intervalCallbacks[id] = { callback, timeout, type: timeout === REFRESH_INTERVAL_MS ? 'refresh' : 'other' };
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
    if (fetchSpy) {
      fetchSpy.mockRestore();
    }
  });

  // Helper to run specific intervals by type
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

  it('should refresh data when refresh interval callback is manually triggered', async () => {
    const initialDailyTime = Date.now();
    const initialWeeklyTime = initialDailyTime - 1000;

    fetchUsgsData.mockResolvedValueOnce({ type: "FeatureCollection", features: [{id:'q_initial_daily', properties: {time: initialDailyTime, mag: 1, place: 'Initial Daily Place'}}], metadata: {generated: initialDailyTime, title: 'Initial Daily Feed'} })
                   .mockResolvedValueOnce({ type: "FeatureCollection", features: [{id:'q_initial_weekly', properties: {time: initialWeeklyTime, mag: 1, place: 'Initial Weekly Place'}}], metadata: {generated: initialWeeklyTime, title: 'Initial Weekly Feed'} });

    let result;
    await act(async () => {
        const { result: hookResult } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
        result = hookResult;
        // Allow initial fetches to complete
        await Promise.resolve();
        await Promise.resolve();
        // If there were loading message intervals set up by initial load, run them to simulate passing time
        // This might be needed if the refresh interval setup depends on initial load completing.
        // Using 'other' type for loading messages if they are not REFRESH_INTERVAL_MS
        await runIntervals('other', 2);
    });

    expect(fetchUsgsData).toHaveBeenCalledTimes(2); // Initial daily and weekly

    fetchUsgsData.mockClear(); // Clear for the refresh call
    const refreshFetchTime = Date.now() + 5000;
    const refreshedDailyQuakeTime = refreshFetchTime - 1000;

    fetchUsgsData.mockResolvedValueOnce({ type: "FeatureCollection", features: [{id:'q_refresh_daily', properties: {time: refreshedDailyQuakeTime, mag: 2, place: 'Refreshed Daily Place'}}], metadata: {generated: refreshFetchTime, title: 'Refreshed Daily Feed'} })
                   .mockResolvedValueOnce({ type: "FeatureCollection", features: [{id:'q_refresh_weekly', properties: {time: refreshedDailyQuakeTime - 2000, mag: 2, place: 'Refreshed Weekly Place'}}], metadata: {generated: refreshFetchTime, title: 'Refreshed Weekly Feed'} });

    const dateNowSpy = vi.spyOn(global.Date, 'now').mockReturnValueOnce(refreshFetchTime);

    await act(async () => {
        await runIntervals('refresh', 1); // Run only the refresh interval
        // Allow refresh fetches to complete
        await Promise.resolve();
        await Promise.resolve();
    });

    dateNowSpy.mockRestore();

    expect(fetchUsgsData).toHaveBeenCalledTimes(2); // Daily and weekly for refresh
    expect(result.current.earthquakesLastHour.some(q => q.id === 'q_refresh_daily')).toBe(true);
  }, 10000);
});
