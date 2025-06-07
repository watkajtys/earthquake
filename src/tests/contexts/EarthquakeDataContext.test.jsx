import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock the service
vi.mock('../../services/processedDataService', () => ({
  fetchProcessedEarthquakeData: vi.fn(),
}));

// Static imports - Vitest hoists vi.mock
import { EarthquakeDataProvider, useEarthquakeDataState } from '../../contexts/EarthquakeDataContext';
import { fetchProcessedEarthquakeData } from '../../services/processedDataService';

// Helper component to display state
const TestComponent = () => {
  const state = useEarthquakeDataState();
  return <pre data-testid="state">{JSON.stringify(state, null, 2)}</pre>;
};

// Define a basic structure for mock processed data, similar to initialState for data fields
const getMockInitialDataState = () => ({
    dataFetchTime: null,
    lastUpdated: null,
    earthquakesLastHour: [],
    earthquakesPriorHour: [],
    earthquakesLast24Hours: [],
    highestRecentAlert: null,
    activeAlertTriggeringQuakes: [],
    hasRecentTsunamiWarning: false,
    tsunamiTriggeringQuake: null,
    lastMajorQuake: null,
    previousMajorQuake: null,
    timeBetweenPreviousMajorQuakes: null,
    earthquakesLast72Hours: [],
    prev24HourData: [],
    earthquakesLast7Days: [],
    globeEarthquakes: [],
    dailyCounts7Days: [],
    sampledEarthquakesLast7Days: [],
    magnitudeDistribution7Days: [],
    allEarthquakesMonth: [],
    earthquakesLast14Days: [],
    earthquakesLast30Days: [],
    dailyCounts14Days: [],
    dailyCounts30Days: [],
    sampledEarthquakesLast14Days: [],
    sampledEarthquakesLast30Days: [],
    magnitudeDistribution14Days: [],
    magnitudeDistribution30Days: [],
    prev7DayData: [],
    prev14DayData: [],
    feelableQuakes7Days_ctx: [],
    significantQuakes7Days_ctx: [],
    feelableQuakes30Days_ctx: [],
    significantQuakes30Days_ctx: [],
});


describe('EarthquakeDataContext', () => {
  beforeEach(() => { // Removed async from beforeEach
    fetchProcessedEarthquakeData.mockReset();
    // Provide a default mock implementation for all calls unless overridden by mockResolvedValueOnce
    fetchProcessedEarthquakeData.mockResolvedValue({
      data: { ...getMockInitialDataState(), lastUpdated: 'default mock response' },
      error: null
    });
    vi.useFakeTimers();
    // Spy on setInterval and clearInterval
    vi.spyOn(global, 'setInterval');
    vi.spyOn(global, 'clearInterval');
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllTimers(); // Ensure all timers are cleared
    vi.restoreAllMocks(); // Restore spies and other mocks
  });

  it('should have correct initial state and trigger initial fetch', async () => {
    // Mock a promise that doesn't resolve immediately to check initial loading state
    let resolveFetch;
    const initialFetchPromise = new Promise(resolve => { resolveFetch = resolve; });
    fetchProcessedEarthquakeData.mockReturnValue(initialFetchPromise);

    render(
      <EarthquakeDataProvider>
        <TestComponent />
      </EarthquakeDataProvider>
    );

    let state = JSON.parse(screen.getByTestId('state').textContent);
    expect(state.isLoadingData).toBe(true);
    expect(state.isInitialAppLoad).toBe(true);
    expect(state.error).toBeNull();
    expect(fetchProcessedEarthquakeData).toHaveBeenCalledTimes(1);

    // Resolve the fetch and wait for state updates
    await act(async () => {
      resolveFetch({ data: { ...getMockInitialDataState(), lastUpdated: 'initial' }, error: null });
      await Promise.resolve(); // Ensure the promise resolution propagates
    });

    // Use waitFor to allow React to process state updates triggered by the promise resolution
    await waitFor(() => {
      const updatedState = JSON.parse(screen.getByTestId('state').textContent);
      expect(updatedState.isLoadingData).toBe(false);
      expect(updatedState.isInitialAppLoad).toBe(false);
      expect(updatedState.lastUpdated).toBe('initial');
    });
  });

  it('handles successful data fetch and updates state', async () => {
    const mockData = {
      ...getMockInitialDataState(),
      earthquakesLastHour: [{ id: 'eq1', properties: { mag: 2.5, place: 'Test Place' } }],
      lastMajorQuake: { id: 'major1', properties: { mag: 5.0 } },
      dataFetchTime: Date.now(),
      lastUpdated: new Date().toISOString(),
      // ensure all fields from getMockInitialDataState are here or set to valid values
    };
    fetchProcessedEarthquakeData.mockResolvedValueOnce({ data: mockData, error: null });

    render(
      <EarthquakeDataProvider>
        <TestComponent />
      </EarthquakeDataProvider>
    );


    // Ensure all state updates from the resolved promise are processed
    await waitFor(() => {
      const updatedState = JSON.parse(screen.getByTestId('state').textContent);
      expect(updatedState.isLoadingData).toBe(false);
      expect(updatedState.error).toBeNull();
      expect(updatedState.earthquakesLastHour).toEqual(mockData.earthquakesLastHour);
      expect(updatedState.lastMajorQuake).toEqual(mockData.lastMajorQuake);
      expect(updatedState.isInitialAppLoad).toBe(false);
      expect(updatedState.lastUpdated).toBe(mockData.lastUpdated);
    });
  });

  it('handles error during data fetch', async () => {
    const errorMessage = 'Network Error - Failed to fetch';
    fetchProcessedEarthquakeData.mockResolvedValueOnce({ data: null, error: { message: errorMessage } });

    render(
      <EarthquakeDataProvider>
        <TestComponent />
      </EarthquakeDataProvider>
    );

    await waitFor(() => {
      const updatedState = JSON.parse(screen.getByTestId('state').textContent);
      expect(updatedState.isLoadingData).toBe(false);
      expect(updatedState.error).toBe(errorMessage);
      expect(updatedState.isInitialAppLoad).toBe(false);
      expect(updatedState.earthquakesLastHour).toEqual([]);
      expect(updatedState.lastMajorQuake).toBeNull();
    });
  });

  it('should reflect loading state during fetch operation', async () => {
    let resolveFetch;
    const fetchPromise = new Promise(resolve => { resolveFetch = resolve; });
    fetchProcessedEarthquakeData.mockReturnValue(fetchPromise);

    render(
      <EarthquakeDataProvider>
        <TestComponent />
      </EarthquakeDataProvider>
    );

    let state = JSON.parse(screen.getByTestId('state').textContent);
    expect(state.isLoadingData).toBe(true);
    expect(fetchProcessedEarthquakeData).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch({ data: { ...getMockInitialDataState(), lastUpdated: 'resolved data' }, error: null });
      await Promise.resolve(); // Ensure promise resolution propagates
    });

    await waitFor(() => {
      const updatedState = JSON.parse(screen.getByTestId('state').textContent);
      expect(updatedState.isLoadingData).toBe(false);
      expect(updatedState.lastUpdated).toBe('resolved data');
    });
  });

  it('should periodically refresh data', async () => {
    const initialData = { ...getMockInitialDataState(), lastUpdated: 'first fetch', dataFetchTime: Date.now() };
    const refreshedData = { ...getMockInitialDataState(), lastUpdated: 'second fetch', dataFetchTime: Date.now() + 60000 };

    fetchProcessedEarthquakeData
      .mockResolvedValueOnce({ data: initialData, error: null }) // For initial load
      .mockResolvedValueOnce({ data: refreshedData, error: null }); // For refresh

    render(
      <EarthquakeDataProvider>
        <TestComponent />
      </EarthquakeDataProvider>
    );

    // Wait for initial load
    await waitFor(() => {
      const state = JSON.parse(screen.getByTestId('state').textContent);
      expect(state.lastUpdated).toBe('first fetch');
    });
    expect(fetchProcessedEarthquakeData).toHaveBeenCalledTimes(1);

    // Advance timers past the refresh interval
    // REFRESH_INTERVAL_MS is 1 minute (60000 ms) in the context
    await act(async () => {
      vi.advanceTimersByTimeAsync(60000);
    });

    // Wait for the refreshed data. The second mockResolvedValueOnce should be used.
    // Ensure the setInterval callback for refresh has been captured
    const refreshIntervalCallback = global.setInterval.mock.calls.find(
      call => call[1] === 60000 // REFRESH_INTERVAL_MS
    )?.[0];

    expect(refreshIntervalCallback).toBeDefined();

    // Manually trigger the refresh interval callback within act
    if (refreshIntervalCallback) {
      await act(async () => {
        refreshIntervalCallback(); // This should trigger orchestrateInitialDataLoad again
        await Promise.resolve(); // Flush promises from the fetch
      });
    }

    await waitFor(() => {
      const updatedState = JSON.parse(screen.getByTestId('state').textContent);
      expect(updatedState.lastUpdated).toBe('second fetch');
    }, { timeout: 2000 }); // Added a shorter timeout for quicker feedback if it still fails
    expect(fetchProcessedEarthquakeData).toHaveBeenCalledTimes(2);
  });

  it('should cycle loading messages during initial load', async () => {
    let resolveFetch;
    const fetchPromise = new Promise(resolve => { resolveFetch = resolve; });
    fetchProcessedEarthquakeData.mockReturnValue(fetchPromise);

    render(
      <EarthquakeDataProvider>
        <TestComponent />
      </EarthquakeDataProvider>
    );

    let state = JSON.parse(screen.getByTestId('state').textContent);
    const initialMessage = state.currentLoadingMessages[state.loadingMessageIndex];
    expect(state.isLoadingData).toBe(true);

    // Advance timer for loading message interval
    // LOADING_MESSAGE_INTERVAL_MS is 750ms in the context
    // Capture the loading message interval callback
    const loadingIntervalCallback = global.setInterval.mock.calls.find(
      call => call[1] === 750 // LOADING_MESSAGE_INTERVAL_MS
    )?.[0];
    expect(loadingIntervalCallback).toBeDefined();

    if (loadingIntervalCallback) {
      await act(async () => {
        loadingIntervalCallback(); // Manually trigger one cycle
        await Promise.resolve();
      });
    }

    state = JSON.parse(screen.getByTestId('state').textContent);
    expect(state.currentLoadingMessages[state.loadingMessageIndex]).not.toBe(initialMessage);
    expect(state.isLoadingData).toBe(true); // Still loading

    // Resolve the actual data fetch
    await act(async () => {
      resolveFetch({ data: { ...getMockInitialDataState(), lastUpdated: 'final data' }, error: null });
    });

    await waitFor(() => {
      state = JSON.parse(screen.getByTestId('state').textContent);
      expect(state.isLoadingData).toBe(false); // Loading finished
    });
    expect(state.isLoadingData).toBe(false); // Loading finished
    // The loading message might have cycled once more or reset, not strictly testing its value after load.
  });

});
