import React from 'react';
import { EarthquakeDataProvider, useEarthquakeDataState } from '../../contexts/EarthquakeDataContext';
// --- React specific testing imports ---
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { fetchUsgsData } from '../../services/usgsApiService';
import {
    USGS_API_URL_MONTH,
    USGS_API_URL_DAY, // Needed because initial load still happens
    USGS_API_URL_WEEK, // Needed because initial load still happens
} from '../../constants/appConstants';

// Mock the usgsApiService
vi.mock('../../services/usgsApiService', () => ({
  fetchUsgsData: vi.fn(),
}));

const AllTheProviders = ({ children }) => (<EarthquakeDataProvider>{children}</EarthquakeDataProvider>);

describe('EarthquakeDataContext: loadMonthlyData', () => {
  beforeEach(() => {
    fetchUsgsData.mockReset();
    vi.useFakeTimers(); // Use fake timers for consistency, although not strictly for interval spies here
  });

   afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllTimers(); // Clear Vitest's fake timers
  });

  it('should fetch monthly data and dispatch MONTHLY_DATA_PROCESSED on success', async () => {
    const minimalMockFeatures = [{ id: 'mocker1', properties: { time: Date.now(), mag: 3.0 } }];
    fetchUsgsData.mockImplementation(async (url) => {
      if (url === USGS_API_URL_MONTH) return Promise.resolve({ features: minimalMockFeatures });
      if (url === USGS_API_URL_DAY) return Promise.resolve({ features: [], metadata: {generated: Date.now()} });
      if (url === USGS_API_URL_WEEK) return Promise.resolve({ features: [], metadata: {generated: Date.now()} });
      return Promise.resolve({ features: [], metadata: {} });
    });

    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
    await waitFor(() => expect(result.current.isInitialAppLoad).toBe(false));

    expect(result.current.monthlyError).toBeNull();
    await act(async () => { result.current.loadMonthlyData(); });
    await act(async () => { await Promise.resolve(); }); // Ensure promises from loadMonthlyData resolve

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

    fetchUsgsData.mockImplementation(async (url) => {
      if (url === USGS_API_URL_MONTH) return Promise.resolve({}); // No 'features' key
      if (url === USGS_API_URL_DAY) return Promise.resolve({ features: [], metadata: {generated: Date.now()} });
      if (url === USGS_API_URL_WEEK) return Promise.resolve({ features: [], metadata: {generated: Date.now()} });
      return Promise.resolve({ features: [], metadata: {} });
    });

    await act(async () => { result.current.loadMonthlyData(); });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.monthlyError).toBe("Monthly data is unavailable or incomplete.");
  });
});
