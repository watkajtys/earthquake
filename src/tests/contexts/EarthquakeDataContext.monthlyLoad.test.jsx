import React from 'react';
import { EarthquakeDataProvider, useEarthquakeDataState } from '../../contexts/EarthquakeDataContext';
import { initialState as originalInitialState } from '../../contexts/earthquakeDataContextUtils.js'; // Import original
// --- React specific testing imports ---
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { http, HttpResponse } from 'msw'; // Import MSW handlers
import { server } from '../../mocks/server.js'; // Import MSW server
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

const AllTheProviders = ({ children }) => (<EarthquakeDataProvider>{children}</EarthquakeDataProvider>);

// Mock features
const mockD1FeatureMonth = { type: "Feature", id: "d1_month", properties: { time: Date.now() - 15 * 24 * 3600 * 1000, mag: 3.3, place: "D1 Month Place" }, geometry: {} };
const mockUsgsFeatureMonth = { type: "Feature", id: "usgs_month", properties: { time: Date.now() - 15 * 24 * 3600 * 1000, mag: 3.5, place: "USGS Month Place" }, geometry: {} };


describe('EarthquakeDataContext: loadMonthlyData with D1 Fallback', () => {
  // MSW server lifecycle handlers
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
    // Reset to a clean state, no default handlers from src/mocks/handlers.js for this specific suite
    server.resetHandlers();
  });
  afterEach(() => {
    server.resetHandlers();
    // Existing afterEach logic below
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });
  afterAll(() => server.close());

  beforeEach(() => {
    vi.useFakeTimers(); // Use fake timers for consistent Date.now() if processing relies on it
    fetchUsgsData.mockReset();
    // fetchSpy related logic is removed as MSW will handle network requests.
    isValidFeatureArray.mockClear().mockReturnValue(true);
    isValidGeoJson.mockClear().mockReturnValue(true);
  });

  // Helper to simulate D1 API response (no longer needed if MSW directly mocks D1 responses)
  const mockD1Response = (jsonData, {
    dataSourceHeader = 'D1',
    status = 200,
    ok = (status >= 200 && status < 300),
    errorTextOverride = null, // Specific text for error response body
    contentType = 'application/json'
  } = {}) => {
    let bodyText;

    if (ok) {
      bodyText = JSON.stringify(jsonData);
    } else {
      // For non-ok responses, fetchFromD1 uses response.text()
      bodyText = errorTextOverride !== null ? errorTextOverride : JSON.stringify(jsonData || { error: `Simulated server error ${status}` });
    }

    return Promise.resolve({
      ok,
      status,
      headers: {
        get: (headerName) => {
          const lowerHeaderName = headerName.toLowerCase();
          if (lowerHeaderName === 'x-data-source') {
            return dataSourceHeader;
          }
          if (lowerHeaderName === 'content-type') {
            return contentType;
          }
          return null;
        }
      },
      json: () => {
        if (ok) {
            try {
                return Promise.resolve(typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData);
            } catch (e) {
                return Promise.reject(e);
            }
        }
        try {
            return Promise.resolve(JSON.parse(bodyText));
        } catch (e) {
            return Promise.reject(new SyntaxError(`Unexpected token in JSON at position 0: ${bodyText.charAt(0)}`));
        }
      },
      text: () => Promise.resolve(bodyText),
    });
  };

  // Helper to simulate USGS API response structure
  const mockUsgsApiServiceResponse = (features, metadata = { generated: Date.now() }, error = null) => {
    if (error) return Promise.resolve({ error });
    return Promise.resolve({ features, metadata });
  };

  describe('D1 Fallback Logic for loadMonthlyData', () => {
    it('D1 Success Path: should fetch monthly data from D1', async () => {
      const d1MonthlyDataFeatures = [mockD1FeatureMonth]; // fetchFromD1 expects an array of features

      server.use(
        http.get('/api/get-earthquakes', ({ request }) => {
          const url = new URL(request.url);
          const timeWindow = url.searchParams.get('timeWindow');
          if (timeWindow === 'month') {
            // console.log('[MSW Monthly D1 Success Override] Intercepted D1 API call for month');
            // fetchFromD1 in context expects the direct array of features from response.json()
            return HttpResponse.json(d1MonthlyDataFeatures, { status: 200, headers: { 'X-Data-Source': 'D1' } });
          }
          return HttpResponse.json({ error: 'Test D1 Monthly Success override: Unexpected timeWindow ' + timeWindow }, { status: 400 });
        })
      );

      const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });

      await act(async () => { result.current.loadMonthlyData(); });

      await vi.waitUntil(() => (
          !result.current.isLoadingMonthly &&
          result.current.monthlyDataSource === 'D1' &&
          result.current.allEarthquakes.some(q => q.id === mockD1FeatureMonth.id)
        ), { timeout: 7000, interval: 50 }
      );

      expect(fetchUsgsData).not.toHaveBeenCalled();
      expect(result.current.monthlyDataSource).toBe('D1');
      expect(result.current.allEarthquakes).toEqual(expect.arrayContaining(d1MonthlyDataFeatures));
      expect(result.current.monthlyError).toBeNull();
    }, 10000);

    it('D1 Failure (500), USGS Success: should fall back to USGS', async () => {
      // fetchSpy.mockResolvedValueOnce(mockD1Response(null, { status: 500, ok: false, errorTextOverride: "D1 Monthly Error" })); // D1 fails
      // fetchUsgsData.mockResolvedValueOnce(mockUsgsApiServiceResponse([mockUsgsFeatureMonth])); // USGS success
      // TODO: Convert this test to MSW
      const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
      await act(async () => { result.current.loadMonthlyData(); });
      await waitFor(() => expect(result.current.isLoadingMonthly).toBe(false));

      // expect(fetchSpy).toHaveBeenCalledWith('/api/get-earthquakes?timeWindow=month');
      expect(fetchUsgsData).toHaveBeenCalledWith(USGS_API_URL_MONTH);
      expect(result.current.monthlyDataSource).toBe('USGS');
      expect(result.current.allEarthquakes).toEqual(expect.arrayContaining([mockUsgsFeatureMonth]));
      expect(result.current.monthlyError).toBeNull();
    }, 10000);

    it('D1 Returns Invalid Header, USGS Success: should fall back to USGS', async () => {
        // fetchSpy.mockResolvedValueOnce(mockD1Response([mockD1FeatureMonth], { dataSourceHeader: 'NotD1' }));
        // fetchUsgsData.mockResolvedValueOnce(mockUsgsApiServiceResponse([mockUsgsFeatureMonth]));
        // TODO: Convert this test to MSW
        const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
        await act(async () => { result.current.loadMonthlyData(); });
        await waitFor(() => expect(result.current.isLoadingMonthly).toBe(false));
        expect(fetchUsgsData).toHaveBeenCalledWith(USGS_API_URL_MONTH);
        expect(result.current.monthlyDataSource).toBe('USGS');
    }, 10000);

    it('D1 Returns Invalid Feature Array, USGS Success: should fall back to USGS', async () => {
        // isValidFeatureArray.mockReturnValueOnce(false);
        // fetchSpy.mockResolvedValueOnce(mockD1Response(["invalid data"]));
        // fetchUsgsData.mockResolvedValueOnce(mockUsgsApiServiceResponse([mockUsgsFeatureMonth]));
        // TODO: Convert this test to MSW
        const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
        await act(async () => { result.current.loadMonthlyData(); });
        await waitFor(() => expect(result.current.isLoadingMonthly).toBe(false));
        expect(isValidFeatureArray).toHaveBeenCalledTimes(1);
        expect(fetchUsgsData).toHaveBeenCalledWith(USGS_API_URL_MONTH);
        expect(result.current.monthlyDataSource).toBe('USGS');
    }, 10000);

    it('Both D1 and USGS Fail: should set monthlyError', async () => {
      // fetchSpy.mockResolvedValueOnce(mockD1Response(null, { status: 500, ok: false, errorTextOverride: "D1 Monthly Error Text" })); // D1 fails
      // fetchUsgsData.mockResolvedValueOnce(mockUsgsApiServiceResponse(null, null, { message: "USGS Monthly Down" })); // USGS fails
      // TODO: Convert this test to MSW
      const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
      await act(async () => { result.current.loadMonthlyData(); });
      await waitFor(() => expect(result.current.isLoadingMonthly).toBe(false));

      expect(result.current.monthlyError).toContain("D1 Error (Monthly): Failed to fetch from D1: 500 D1 Monthly Error Text. USGS Error (Monthly): USGS Monthly Down");
      expect(result.current.monthlyDataSource).toBeNull();
    }, 10000);
  });

  // Keep existing tests, ensuring D1 fails first for them to test USGS path correctly
  describe('Original USGS Path Tests (assuming D1 fails first for monthly load)', () => {
    beforeEach(() => {
        // Override default fetchSpy behavior for this describe block
        // fetchSpy.mockImplementation(async (url, options) => { // Corrected to match the new signature
        //     const requestedUrl = typeof url === 'string' ? url : (url && typeof url.url === 'string' ? url.url : '');
        //     if (requestedUrl.includes('/api/get-earthquakes?timeWindow=month')) {
        //         return mockD1Response(null, {
        //             dataSourceHeader: 'D1_failed_for_USGS_monthly_tests',
        //             status: 500,
        //             ok: false,
        //             errorTextOverride: "D1 generic monthly fallback error"
        //         });
        //     }
        //     return Promise.reject(new Error(`Unexpected fetch call to ${url} in monthly USGS failure tests.`));
        // });
        // TODO: Convert this describe block's beforeEach to MSW
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
      }, 10000);

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
      }, 10000);

      it('should set monthlyError if API call throws an error (USGS path)', async () => {
        const thrownErrorMessage = "Network failure";
        fetchUsgsData.mockRejectedValueOnce(new Error(thrownErrorMessage));
        const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
        await act(async () => { result.current.loadMonthlyData(); });
        await waitFor(() => {
          expect(result.current.monthlyError).toContain(`USGS Fetch Error (Monthly): ${thrownErrorMessage}`);
          expect(result.current.isLoadingMonthly).toBe(false);
        });
      }, 10000);

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
      }, 10000);
  });
});
