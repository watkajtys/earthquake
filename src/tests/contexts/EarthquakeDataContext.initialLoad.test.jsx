import React from 'react';
import { EarthquakeDataProvider, useEarthquakeDataState } from '../../contexts/EarthquakeDataContext';
import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server.js';
import { REFRESH_INTERVAL_MS } from '../../constants/appConstants';

// Mock the refresh interval to prevent it from interfering with tests
vi.spyOn(global, 'setInterval').mockImplementation((callback, timeoutMs) => {
  if (timeoutMs === REFRESH_INTERVAL_MS) {
    return 999999; // Dummy ID for the suppressed interval
  }
  return global.setTimeout(callback, timeoutMs); // Use setTimeout for other intervals
});

const AllTheProviders = ({ children }) => (<EarthquakeDataProvider>{children}</EarthquakeDataProvider>);

// A comprehensive mock of the new, pre-processed data structure from the API
const mockApiSuccessResponse = {
  earthquakesLast24Hours: [{ id: "day1", properties: { mag: 1.0 } }],
  earthquakesLast7Days: [{ id: "week1", properties: { mag: 2.0 } }],
  earthquakesLast30Days: [{ id: "month1", properties: { mag: 3.0 } }],
  timeSeriesData: { last24Hours: [], last7Days: [], last30Days: [] },
  magnitudeDistribution: { last24Hours: [], last7Days: [], last30Days: [] },
  earthquakeCounts: { day: 1, week: 1, month: 1 },
  regionData: { last24Hours: [], last7Days: [], last30Days: [] },
  deepestEarthquakes: { last24Hours: [], last7Days: [], last30Days: [] },
  strongestEarthquakes: { last24Hours: [], last7Days: [], last30Days: [] },
  lastUpdated: new Date().toISOString(),
  dataSources: { daily: 'D1', weekly: 'D1', monthly: 'D1' },
};


describe('EarthquakeDataProvider Initial Load (Refactored)', () => {

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('should fetch and process data successfully on initial load', async () => {
    // Mock a successful API response
    server.use(
      http.get('/api/get-earthquakes', () => {
        return HttpResponse.json(mockApiSuccessResponse);
      })
    );

    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });

    // Wait for the hook to initialize before checking the state
    await vi.waitUntil(() => result.current !== undefined);

    // Initial state should be loading
    expect(result.current.isLoading).toBe(true);

    // Wait for the API call to resolve and the state to update
    await vi.waitUntil(() => !result.current.isLoading, { timeout: 5000 });

    // Assert the final state
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isInitialAppLoad).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.earthquakesLast24Hours).toEqual(mockApiSuccessResponse.earthquakesLast24Hours);
    expect(result.current.earthquakesLast7Days).toEqual(mockApiSuccessResponse.earthquakesLast7Days);
    expect(result.current.earthquakesLast30Days).toEqual(mockApiSuccessResponse.earthquakesLast30Days);
    expect(result.current.timeSeriesData).toEqual(mockApiSuccessResponse.timeSeriesData);
    expect(result.current.dailyDataSource).toBe('D1'); // Check if data source is passed through
  });

  it('should handle API failure and set the error state', async () => {
    // Mock a failed API response
    server.use(
      http.get('/api/get-earthquakes', () => {
        return new HttpResponse('Internal Server Error', { status: 500 });
      })
    );

    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });

    // Wait for the hook to initialize before checking the state
    await vi.waitUntil(() => result.current !== undefined);

    // Initial state
    expect(result.current.isLoading).toBe(true);

    // Wait for the fetch to fail and the state to update
    await vi.waitUntil(() => !result.current.isLoading, { timeout: 5000 });

    // Assert the error state
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isInitialAppLoad).toBe(false);
    expect(result.current.error).not.toBeNull();
    expect(result.current.error).toContain('Failed to fetch initial earthquake data');
    // Ensure data arrays are empty
    expect(result.current.earthquakesLast24Hours).toEqual([]);
  });
});
