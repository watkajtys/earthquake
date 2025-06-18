import React from 'react';
import { EarthquakeDataProvider, useEarthquakeDataState } from '../../contexts/EarthquakeDataContext';
import { initialState as originalInitialState } from '../../contexts/earthquakeDataContextUtils.js'; // Import original
// --- React specific testing imports ---
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { fetchUsgsData } from '../../services/usgsApiService';
import { isValidFeatureArray, isValidGeoJson } from '../../utils/geoJsonUtils';
import {
    USGS_API_URL_MONTH,
} from '../../constants/appConstants';

// Mock services and utils
vi.mock('../../services/usgsApiService', () => ({
  fetchUsgsData: vi.fn(),
}));
vi.mock('../../utils/geoJsonUtils', () => ({
  isValidFeatureArray: vi.fn(() => true), // Default to true for valid mock data
  isValidGeoJson: vi.fn(() => true),     // Default to true for valid mock data
}));

// Mock earthquakeDataContextUtils to override initialState for this test suite
// This ensures that initial load (daily/weekly) doesn't interfere with monthly load tests
vi.mock('../../contexts/earthquakeDataContextUtils.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    initialState: {
      ...original.initialState,
      isInitialAppLoad: false,
      isLoadingDaily: false, // Ensure these are false so initial load doesn't run
      isLoadingWeekly: false,
    },
  };
});

// Mock global fetch for D1 calls
global.fetch = vi.fn();

const AllTheProviders = ({ children }) => (<EarthquakeDataProvider>{children}</EarthquakeDataProvider>);

// Mock features
const mockD1FeatureMonth = { type: "Feature", id: "d1_month", properties: { time: Date.now() - 15 * 24 * 3600 * 1000, mag: 3.3, place: "D1 Month Place" }, geometry: {} };
const mockUsgsFeatureMonth = { type: "Feature", id: "usgs_month", properties: { time: Date.now() - 15 * 24 * 3600 * 1000, mag: 3.5, place: "USGS Month Place" }, geometry: {} };


describe('EarthquakeDataContext: loadMonthlyData with D1 Fallback', () => {
  beforeEach(() => {
    vi.useFakeTimers(); // Use fake timers for consistent Date.now() if processing relies on it
    fetchUsgsData.mockReset();
    global.fetch.mockReset();
    isValidFeatureArray.mockClear().mockReturnValue(true);
    isValidGeoJson.mockClear().mockReturnValue(true);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // Helper to simulate D1 API response
  const mockD1Response = (data, dataSourceHeader = 'D1', status = 200) => {
    return Promise.resolve({
      ok: status === 200,
      status,
      headers: { get: () => dataSourceHeader },
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    });
  };

  // Helper to simulate USGS API response structure
  const mockUsgsApiServiceResponse = (features, metadata = { generated: Date.now() }, error = null) => {
    if (error) return Promise.resolve({ error });
    return Promise.resolve({ features, metadata });
  };

  describe('D1 Fallback Logic for loadMonthlyData', () => {
    it('D1 Success Path: should fetch monthly data from D1', async () => {
      global.fetch.mockResolvedValueOnce(mockD1Response([mockD1FeatureMonth]));
      const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });

      await act(async () => { result.current.loadMonthlyData(); });
      await waitFor(() => expect(result.current.isLoadingMonthly).toBe(false));

      expect(global.fetch).toHaveBeenCalledWith('/api/get-earthquakes?timeWindow=month');
      expect(fetchUsgsData).not.toHaveBeenCalled();
      expect(result.current.monthlyDataSource).toBe('D1');
      // Assuming 'allEarthquakes' or a similar field gets populated with monthly features
      expect(result.current.allEarthquakes).toEqual(expect.arrayContaining([mockD1FeatureMonth]));
      expect(result.current.monthlyError).toBeNull();
    });

    it('D1 Failure (500), USGS Success: should fall back to USGS', async () => {
      global.fetch.mockResolvedValueOnce(mockD1Response(null, null, 500)); // D1 fails
      fetchUsgsData.mockResolvedValueOnce(mockUsgsApiServiceResponse([mockUsgsFeatureMonth])); // USGS success

      const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
      await act(async () => { result.current.loadMonthlyData(); });
      await waitFor(() => expect(result.current.isLoadingMonthly).toBe(false));

      expect(global.fetch).toHaveBeenCalledWith('/api/get-earthquakes?timeWindow=month');
      expect(fetchUsgsData).toHaveBeenCalledWith(USGS_API_URL_MONTH);
      expect(result.current.monthlyDataSource).toBe('USGS');
      expect(result.current.allEarthquakes).toEqual(expect.arrayContaining([mockUsgsFeatureMonth]));
      expect(result.current.monthlyError).toBeNull();
    });

    it('D1 Returns Invalid Header, USGS Success: should fall back to USGS', async () => {
        global.fetch.mockResolvedValueOnce(mockD1Response([mockD1FeatureMonth], 'NotD1'));
        fetchUsgsData.mockResolvedValueOnce(mockUsgsApiServiceResponse([mockUsgsFeatureMonth]));
        const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
        await act(async () => { result.current.loadMonthlyData(); });
        await waitFor(() => expect(result.current.isLoadingMonthly).toBe(false));
        expect(fetchUsgsData).toHaveBeenCalledWith(USGS_API_URL_MONTH);
        expect(result.current.monthlyDataSource).toBe('USGS');
    });

    it('D1 Returns Invalid Feature Array, USGS Success: should fall back to USGS', async () => {
        isValidFeatureArray.mockReturnValueOnce(false);
        global.fetch.mockResolvedValueOnce(mockD1Response(["invalid data"]));
        fetchUsgsData.mockResolvedValueOnce(mockUsgsApiServiceResponse([mockUsgsFeatureMonth]));
        const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
        await act(async () => { result.current.loadMonthlyData(); });
        await waitFor(() => expect(result.current.isLoadingMonthly).toBe(false));
        expect(isValidFeatureArray).toHaveBeenCalledTimes(1);
        expect(fetchUsgsData).toHaveBeenCalledWith(USGS_API_URL_MONTH);
        expect(result.current.monthlyDataSource).toBe('USGS');
    });

    it('Both D1 and USGS Fail: should set monthlyError', async () => {
      global.fetch.mockResolvedValueOnce(mockD1Response(null, null, 500)); // D1 fails
      fetchUsgsData.mockResolvedValueOnce(mockUsgsApiServiceResponse(null, null, { message: "USGS Monthly Down" })); // USGS fails

      const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
      await act(async () => { result.current.loadMonthlyData(); });
      await waitFor(() => expect(result.current.isLoadingMonthly).toBe(false));

      expect(result.current.monthlyError).toContain("D1 Error (Monthly): Failed to fetch from D1: 500. USGS Error (Monthly): USGS Monthly Down");
      expect(result.current.monthlyDataSource).toBeNull();
    });
  });

  // Keep existing tests, ensuring D1 fails first for them to test USGS path correctly
  describe('Original USGS Path Tests (assuming D1 fails first for monthly load)', () => {
    beforeEach(() => {
        global.fetch.mockResolvedValue(mockD1Response(null, 'D1_failed_for_USGS_monthly_tests', 500)); // Generic D1 failure
    });

    it('should fetch monthly data and dispatch MONTHLY_DATA_PROCESSED on success (USGS path)', async () => {
        const minimalMockFeatures = [{ id: 'mocker1', properties: { time: Date.now(), mag: 3.0 } }];
        fetchUsgsData.mockImplementation(async (url) => {
          if (url === USGS_API_URL_MONTH) return Promise.resolve({ features: minimalMockFeatures });
          return Promise.reject(new Error(`Unexpected API call to ${url}`));
        });
        const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
        await act(async () => { result.current.loadMonthlyData(); });
        await waitFor(() => {
          expect(result.current.isLoadingMonthly).toBe(false);
          expect(result.current.hasAttemptedMonthlyLoad).toBe(true);
          expect(result.current.monthlyError).toBeNull();
          expect(result.current.allEarthquakes.length).toBe(minimalMockFeatures.length);
          if (minimalMockFeatures.length > 0) expect(result.current.allEarthquakes[0].id).toBe(minimalMockFeatures[0].id);
          expect(result.current.monthlyDataSource).toBe('USGS');
        });
        expect(fetchUsgsData).toHaveBeenCalledWith(USGS_API_URL_MONTH);
      });

      it('should set monthlyError if API returns an error object (USGS path)', async () => {
        const errorMessage = "API Error for monthly data";
        fetchUsgsData.mockResolvedValueOnce(mockUsgsApiServiceResponse(null, null, { message: errorMessage }));
        const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
        await act(async () => { result.current.loadMonthlyData(); });
        await waitFor(() => {
          expect(result.current.monthlyError).toContain(`USGS Error (Monthly): ${errorMessage}`);
          expect(result.current.isLoadingMonthly).toBe(false);
          expect(result.current.monthlyDataSource).toBeNull();
        });
      });

      it('should set monthlyError if API call throws an error (USGS path)', async () => {
        const thrownErrorMessage = "Network failure";
        fetchUsgsData.mockRejectedValueOnce(new Error(thrownErrorMessage));
        const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
        await act(async () => { result.current.loadMonthlyData(); });
        await waitFor(() => {
          expect(result.current.monthlyError).toContain(`USGS Fetch Error (Monthly): ${thrownErrorMessage}`);
          expect(result.current.isLoadingMonthly).toBe(false);
        });
      });

      it('should set monthlyError if API returns no features or empty features array (USGS path)', async () => {
        fetchUsgsData.mockResolvedValueOnce(mockUsgsApiServiceResponse([])); // Empty features
        const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
        await act(async () => { result.current.loadMonthlyData(); });
        await waitFor(() => {
          expect(result.current.monthlyError).toContain("USGS Error (Monthly): Monthly USGS data features missing or invalid.");
          expect(result.current.isLoadingMonthly).toBe(false);
        });

        fetchUsgsData.mockReset();
        fetchUsgsData.mockResolvedValueOnce(Promise.resolve({})); // No 'features' key
        await act(async () => { result.current.loadMonthlyData(); });
        await waitFor(() => {
          expect(result.current.monthlyError).toContain("USGS Error (Monthly): Monthly USGS data features missing or invalid.");
          expect(result.current.isLoadingMonthly).toBe(false);
        });
      });
  });
});
