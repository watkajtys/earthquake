import React from 'react';
import { EarthquakeDataProvider, useEarthquakeDataState } from '../../contexts/EarthquakeDataContext';
import { initialState as originalInitialState } from '../../contexts/earthquakeDataContextUtils.js'; // Import original
// --- React specific testing imports ---
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { fetchUsgsData } from '../../services/usgsApiService';
import {
    USGS_API_URL_MONTH,
    // USGS_API_URL_DAY, // No longer needed for these specific tests
    // USGS_API_URL_WEEK, // No longer needed for these specific tests
} from '../../constants/appConstants';

// Mock the usgsApiService
vi.mock('../../services/usgsApiService', () => ({
  fetchUsgsData: vi.fn(),
}));

// Mock earthquakeDataContextUtils to override initialState for this test suite
vi.mock('../../contexts/earthquakeDataContextUtils.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    initialState: {
      ...original.initialState,
      isInitialAppLoad: false, // Override this for the test suite
    },
  };
});


const AllTheProviders = ({ children }) => (<EarthquakeDataProvider>{children}</EarthquakeDataProvider>);

describe('EarthquakeDataContext: loadMonthlyData', () => {
  beforeEach(() => {
    fetchUsgsData.mockReset();
    // vi.useFakeTimers();
  });

   afterEach(() => {
    // vi.runOnlyPendingTimers();
    // vi.useRealTimers();
    // vi.clearAllTimers();
  });

  it('should fetch monthly data and dispatch MONTHLY_DATA_PROCESSED on success', async () => {
    const minimalMockFeatures = [{ id: 'mocker1', properties: { time: Date.now(), mag: 3.0 } }];
    fetchUsgsData.mockImplementation(async (url) => {
      if (url === USGS_API_URL_MONTH) return Promise.resolve({ features: minimalMockFeatures });
      return Promise.reject(new Error(`Unexpected API call to ${url} in monthlyLoad test with initialLoad bypassed`));
    });

    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
    // await waitFor(() => expect(result.current.isInitialAppLoad).toBe(false)); // Removed

    expect(result.current.monthlyError).toBeNull();
    await act(async () => { result.current.loadMonthlyData(); });

    await waitFor(() => {
      expect(result.current.isLoadingMonthly).toBe(false);
      expect(result.current.hasAttemptedMonthlyLoad).toBe(true);
      expect(result.current.monthlyError).toBeNull();
      expect(result.current.allEarthquakes.length).toBe(minimalMockFeatures.length);
      if (minimalMockFeatures.length > 0) expect(result.current.allEarthquakes[0].id).toBe(minimalMockFeatures[0].id);
    });
    expect(fetchUsgsData).toHaveBeenCalledWith(USGS_API_URL_MONTH);
  });

  it('should set monthlyError if API returns an error object', async () => {
    const errorMessage = "API Error for monthly data";
    const apiErrorResponse = { error: { message: errorMessage } };
    fetchUsgsData.mockImplementation(async (url) => {
      if (url === USGS_API_URL_MONTH) return Promise.resolve(apiErrorResponse);
      return Promise.reject(new Error(`Unexpected API call to ${url} in monthlyLoad test with initialLoad bypassed`));
    });

    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
    // await waitFor(() => expect(result.current.isInitialAppLoad).toBe(false)); // Removed

    await act(async () => { result.current.loadMonthlyData(); });
    await waitFor(() => {
      expect(result.current.monthlyError).toBe(errorMessage);
      expect(result.current.isLoadingMonthly).toBe(false);
    });
    expect(fetchUsgsData).toHaveBeenCalledWith(USGS_API_URL_MONTH);
  });

  it('should set monthlyError if API call throws an error', async () => {
    const thrownErrorMessage = "Network failure";
    fetchUsgsData.mockImplementation(async (url) => {
      if (url === USGS_API_URL_MONTH) return Promise.reject(new Error(thrownErrorMessage));
      return Promise.reject(new Error(`Unexpected API call to ${url} in monthlyLoad test with initialLoad bypassed`));
    });

    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
    // await waitFor(() => expect(result.current.isInitialAppLoad).toBe(false)); // Removed

    await act(async () => { result.current.loadMonthlyData(); });
    await waitFor(() => {
      expect(result.current.monthlyError).toContain(`Monthly Data Processing Error: ${thrownErrorMessage}`);
      expect(result.current.isLoadingMonthly).toBe(false);
    });
    expect(fetchUsgsData).toHaveBeenCalledWith(USGS_API_URL_MONTH);
  });

  it('should set monthlyError if API returns no features or empty features array', async () => {
    fetchUsgsData.mockImplementation(async (url) => {
      if (url === USGS_API_URL_MONTH) return Promise.resolve({ features: [] });
      return Promise.reject(new Error(`Unexpected API call to ${url} in monthlyLoad test with initialLoad bypassed`));
    });

    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
    // await waitFor(() => expect(result.current.isInitialAppLoad).toBe(false)); // Removed

    await act(async () => { result.current.loadMonthlyData(); });
    await waitFor(() => {
      expect(result.current.monthlyError).toBe("Monthly data is unavailable or incomplete.");
      expect(result.current.isLoadingMonthly).toBe(false);
    });
    expect(fetchUsgsData).toHaveBeenCalledWith(USGS_API_URL_MONTH);


    // Test case for no 'features' key
    fetchUsgsData.mockImplementation(async (url) => {
      if (url === USGS_API_URL_MONTH) return Promise.resolve({}); // No 'features' key
      return Promise.reject(new Error(`Unexpected API call to ${url} in monthlyLoad test with initialLoad bypassed`));
    });

    await act(async () => { result.current.loadMonthlyData(); });
    await waitFor(() => {
      expect(result.current.monthlyError).toBe("Monthly data is unavailable or incomplete.");
      expect(result.current.isLoadingMonthly).toBe(false);
    });
    expect(fetchUsgsData).toHaveBeenCalledWith(USGS_API_URL_MONTH);
  });
});
