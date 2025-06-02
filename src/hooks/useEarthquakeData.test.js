import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import useEarthquakeData from './useEarthquakeData';
import { fetchDataCb as actualFetchDataCb } from '../utils/fetchUtils';

import {
    USGS_API_URL_DAY,
    USGS_API_URL_WEEK,
    REFRESH_INTERVAL_MS, 
    MAJOR_QUAKE_THRESHOLD,
    ALERT_LEVELS,
    INITIAL_LOADING_MESSAGES,
    LOADING_MESSAGE_INTERVAL_MS
} from '../constants/appConstants';

vi.mock('../utils/fetchUtils', () => ({
  fetchDataCb: vi.fn(),
}));
const mockedFetchDataCb = actualFetchDataCb;

const MOCKED_NOW = 1700000000000;
const createMockEarthquake = (id, timeOffsetHours, mag, tsunami = 0, alert = null, title = 'Test Quake') => ({
    type: 'Feature',
    properties: { mag, place: 'Test Place', time: MOCKED_NOW - timeOffsetHours * 3600 * 1000, updated: MOCKED_NOW - timeOffsetHours * 3600 * 1000, tsunami, alert, title, type: 'earthquake', status: 'reviewed', ids: `,test${id},` },
    geometry: { type: 'Point', coordinates: [0,0,0] },
    id: `test${id}`,
});

const mockDailyResponse = {
    type: 'FeatureCollection', metadata: { generated: MOCKED_NOW - 1000 * 60 * 5, count: 2 },
    features: [ createMockEarthquake('day1', 0.5, 2.5), createMockEarthquake('day2', 1.5, 5.5, 1, 'red') ],
};
const mockWeeklyResponse = {
    type: 'FeatureCollection', metadata: { generated: MOCKED_NOW - 1000 * 60 * 30, count: 2 },
    features: [ createMockEarthquake('week1', 26, 3.0), createMockEarthquake('week2', 49, 6.0) ],
};
const mockEmptyDailyResponse = { type: 'FeatureCollection', metadata: { generated: MOCKED_NOW, count: 0 }, features: [] };

// Mock functions that would be passed from the provider
let mockSetLoadingStatus;
let mockSetErrorState;
let mockSetDailyEarthquakeData;
let mockSetWeeklyEarthquakeData;
let mockSetDataFetchTime;
let mockSetLastUpdated;
let mockUpdateLastMajorQuake;
let mockSetCurrentLoadingMessage;
let mockSetIsInitialAppLoad;
let mockHookProps; // This will hold the props for the hook

describe('useEarthquakeData', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(MOCKED_NOW));
    
    mockedFetchDataCb.mockReset();
    
    // Initialize mockHookProps here so it's fresh for each test
    mockHookProps = {
      isInitialAppLoad: true,
      isLoadingDaily: false, 
      isLoadingWeekly: false,
      setLoadingStatus: vi.fn((statusUpdate) => {
        // Simulate provider updating its state, which would be new props for the hook
        if (statusUpdate.daily !== undefined) mockHookProps.isLoadingDaily = statusUpdate.daily;
        if (statusUpdate.weekly !== undefined) mockHookProps.isLoadingWeekly = statusUpdate.weekly;
        if (statusUpdate.initial !== undefined) mockHookProps.isInitialAppLoad = statusUpdate.initial; // Though setIsInitialAppLoad is separate
      }),
      setErrorState: vi.fn(),
      setDailyEarthquakeData: vi.fn(),
      setWeeklyEarthquakeData: vi.fn(),
      updateLastMajorQuake: vi.fn(),
      setDataFetchTime: vi.fn(),
      setLastUpdated: vi.fn(),
      setCurrentLoadingMessage: vi.fn(),
      setIsInitialAppLoad: vi.fn((val) => {
        mockHookProps.isInitialAppLoad = val; // Simulate provider updating this state
      }),
    };
    
    // Assign to module-level mocks for direct use in expect clauses if needed,
    // but tests should primarily assert against mockHookProps.setXyz
    mockSetLoadingStatus = mockHookProps.setLoadingStatus;
    mockSetErrorState = mockHookProps.setErrorState;
    mockSetDailyEarthquakeData = mockHookProps.setDailyEarthquakeData;
    mockSetWeeklyEarthquakeData = mockHookProps.setWeeklyEarthquakeData;
    mockSetDataFetchTime = mockHookProps.setDataFetchTime;
    mockSetLastUpdated = mockHookProps.setLastUpdated;
    mockUpdateLastMajorQuake = mockHookProps.updateLastMajorQuake;
    mockSetCurrentLoadingMessage = mockHookProps.setCurrentLoadingMessage;
    mockSetIsInitialAppLoad = mockHookProps.setIsInitialAppLoad;
  });

  afterEach(() => {
    vi.restoreAllMocks(); 
    vi.useRealTimers();
  });

  // Helper to render the hook, allowing prop overrides for specific tests
  const renderTestHook = (customProps = {}) => {
    const currentProps = { ...mockHookProps, ...customProps };
    return renderHook((propsToPass) => useEarthquakeData(mockedFetchDataCb, propsToPass), {
      initialProps: currentProps,
    });
  };

  describe('Initial Load and Data Processing', () => {
    it('should call setLoadingStatus correctly during initial load', async () => {
      mockedFetchDataCb
        .mockResolvedValueOnce({ ...mockDailyResponse })
        .mockResolvedValueOnce({ ...mockWeeklyResponse });

      await act(async () => {
        renderTestHook();
        await vi.runAllTimersAsync(); // Reverted change here
      });

      expect(mockSetLoadingStatus).toHaveBeenCalledWith({ daily: true, weekly: true, initial: true });
      expect(mockSetCurrentLoadingMessage).toHaveBeenCalledWith(INITIAL_LOADING_MESSAGES[0]);
      expect(mockSetLoadingStatus).toHaveBeenCalledWith({ daily: false });
      expect(mockSetLoadingStatus).toHaveBeenCalledWith({ weekly: false });
      expect(mockSetIsInitialAppLoad).toHaveBeenCalledWith(false);
      expect(mockSetLoadingStatus).toHaveBeenCalledWith({ initial: false });
    });

    it('should call passed-in updaters with processed data on successful fetch', async () => {
      mockedFetchDataCb
        .mockResolvedValueOnce({ ...mockDailyResponse })
        .mockResolvedValueOnce({ ...mockWeeklyResponse });

      await act(async () => {
        renderTestHook();
        await vi.runAllTimersAsync(); // Reverted change here
      });

      expect(mockSetDailyEarthquakeData).toHaveBeenCalledWith(expect.objectContaining({
        hasTsunamiWarning: true, 
        highestAlert: 'red',     // Corrected to lowercase
        activeAlerts: expect.arrayContaining([expect.objectContaining({id: 'testday2'})]),
      }));
      expect(mockSetWeeklyEarthquakeData).toHaveBeenCalledWith(expect.objectContaining({
        globe: expect.any(Array),
      }));
      expect(mockSetDataFetchTime).toHaveBeenCalledWith(MOCKED_NOW);
      expect(mockSetLastUpdated).toHaveBeenCalledWith(new Date(mockDailyResponse.metadata.generated).toLocaleString());
      
      expect(mockUpdateLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testday2' }));
      expect(mockUpdateLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testweek2' }));
    });

    it('should cycle loading messages during initial load', async () => {
      mockedFetchDataCb.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({...mockEmptyDailyResponse}), LOADING_MESSAGE_INTERVAL_MS * 3.5)));
      
      const { rerender } = renderTestHook();

      // Initial call to orchestrate...
      await act(async () => { vi.advanceTimersByTime(0); }); // Let initial async calls queue up
      expect(mockSetCurrentLoadingMessage).toHaveBeenCalledWith(INITIAL_LOADING_MESSAGES[0]);
      
      // Simulate prop updates that would happen in the real provider
      mockHookProps.isLoadingDaily = true;
      mockHookProps.isLoadingWeekly = true;
      rerender(mockHookProps);
      await act(async () => { vi.advanceTimersByTime(LOADING_MESSAGE_INTERVAL_MS + 1); });
      expect(mockSetCurrentLoadingMessage).toHaveBeenCalledWith(INITIAL_LOADING_MESSAGES[1]);
      
      rerender(mockHookProps); // isLoadingDaily/Weekly still true
      await act(async () => { vi.advanceTimersByTime(LOADING_MESSAGE_INTERVAL_MS + 1); });
      expect(mockSetCurrentLoadingMessage).toHaveBeenCalledWith(INITIAL_LOADING_MESSAGES[2]);

      rerender(mockHookProps);
      await act(async () => { vi.advanceTimersByTime(LOADING_MESSAGE_INTERVAL_MS + 1); });
      expect(mockSetCurrentLoadingMessage).toHaveBeenCalledWith(INITIAL_LOADING_MESSAGES[3 % INITIAL_LOADING_MESSAGES.length]);

      // Allow all fetches and subsequent state updates to complete
      await act(async () => { vi.runAllTimersAsync(); });
    });
  });

  describe('Error Handling', () => {
    it('should call setErrorState if daily fetch fails', async () => {
      mockedFetchDataCb
        .mockResolvedValueOnce({ metadata: { errorMessage: 'Daily failed' } })
        .mockResolvedValueOnce({ ...mockWeeklyResponse });

      await act(async () => {
        renderTestHook();
        await vi.runAllTimersAsync(); // Reverted change here
      });

      expect(mockSetErrorState).toHaveBeenCalledWith({ type: 'main', message: 'Daily data error: Daily failed. Some features may be affected.' });
    });

    it('should call setErrorState if both fetches fail', async () => {
      mockedFetchDataCb
        .mockResolvedValueOnce({ metadata: { errorMessage: 'Daily failed' } })
        .mockResolvedValueOnce({ metadata: { errorMessage: 'Weekly failed' } });
      
      await act(async () => {
        renderTestHook();
        await vi.runAllTimersAsync(); // Reverted change here
      });

      expect(mockSetErrorState).toHaveBeenCalledWith({ type: 'main', message: "Failed to fetch critical earthquake data. Some features may be unavailable." });
    });
  });

  // describe('forceRefresh Function', () => {
  //   it('should re-fetch data and call updaters when forceRefresh is called', async () => {
  //     mockedFetchDataCb
  //       .mockResolvedValueOnce({ ...mockDailyResponse }) // Initial load
  //       .mockResolvedValueOnce({ ...mockWeeklyResponse }); // Initial load
      
  //     // Initial load
  //     mockedFetchDataCb
  //       .mockResolvedValueOnce({ ...mockDailyResponse })
  //       .mockResolvedValueOnce({ ...mockWeeklyResponse });
      
  //     mockedFetchDataCb
  //       .mockResolvedValueOnce({ ...mockDailyResponse })
  //       .mockResolvedValueOnce({ ...mockWeeklyResponse });
      
  //     const { result, rerender } = renderTestHook({ ...mockHookProps, isInitialAppLoad: true });
  //     await act(async () => { await vi.runAllTimersAsync(); }); 
      
  //     vi.clearAllTimers(); // Clear any lingering timers from initial load

  //     // Clear mocks for the refresh part of the test
  //     mockSetLoadingStatus.mockClear();
  //     mockSetDailyEarthquakeData.mockClear();
  //     mockedFetchDataCb.mockClear();
  //     mockSetCurrentLoadingMessage.mockClear(); 
  //     // mockSetIsInitialAppLoad.mockClear(); // We assert it's NOT called, so don't clear its call history for that specific check.
  //                                        // However, the isInitialAppLoad prop itself IS false.

  //     // isInitialAppLoad is already false in mockHookProps due to the initial load completing
  //     rerender({ ...mockHookProps }); 

  //     const refreshedDailyResponse = { ...mockDailyResponse, features: [createMockEarthquake('day_refresh', 0.2, 1.0)]};
  //     mockedFetchDataCb
  //       .mockResolvedValueOnce(refreshedDailyResponse) 
  //       .mockResolvedValueOnce({ ...mockWeeklyResponse });

  //     const originalSetInterval = global.setInterval;
  //     global.setInterval = vi.fn(() => 12345); // Disable main refresh interval
  //     const originalSetCurrentLoadingMessage = mockHookProps.setCurrentLoadingMessage;
  //     mockHookProps.setCurrentLoadingMessage = vi.fn(); // Disable loading message calls specifically

  //     await act(async () => {
  //       await result.current.forceRefresh(); 
  //     });
      
  //     global.setInterval = originalSetInterval; 
  //     mockHookProps.setCurrentLoadingMessage = originalSetCurrentLoadingMessage; // Restore

  //     expect(mockSetLoadingStatus).toHaveBeenCalledWith(expect.objectContaining({ daily: true, weekly: true, initial: false }));
  //     expect(mockSetDailyEarthquakeData).toHaveBeenCalledWith(expect.objectContaining({
  //         lastHour: expect.arrayContaining([expect.objectContaining({id: 'testday_refresh'})]),
  //     }));
  //     expect(mockHookProps.setCurrentLoadingMessage).not.toHaveBeenCalled(); // Check the specifically neutered one
  //     expect(mockSetIsInitialAppLoad).not.toHaveBeenCalled(); 
  //     expect(mockSetLoadingStatus).toHaveBeenCalledWith(expect.objectContaining({ daily: false }));
  //     expect(mockSetLoadingStatus).toHaveBeenCalledWith(expect.objectContaining({ weekly: false }));
  //   });
  // });
});
