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
// vi.mock('../../services/usgsApiService', () => ({
//   fetchUsgsData: vi.fn(),
// }));
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
  let setIntervalSpy;

  // MSW server lifecycle handlers
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
    // Reset to a clean state, no default handlers from src/mocks/handlers.js for this specific suite
    server.resetHandlers();
  });

  // Setup setInterval mock for all tests in this describe block
  // Using real timers for this suite to avoid potential issues with fake timers and waitFor/async operations.
  beforeEach(() => {
    setIntervalSpy = vi.spyOn(global, 'setInterval').mockImplementation(() => 12345);
    isValidFeatureArray.mockClear().mockReturnValue(true);
    isValidGeoJson.mockClear().mockReturnValue(true);
  });

  afterEach(() => {
    server.resetHandlers();
    vi.clearAllMocks(); // This will also clear vi.spyOn mocks if not restored, but good practice to restore.
    if (setIntervalSpy) setIntervalSpy.mockRestore();
  });

  afterAll(() => {
    server.close();
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

      // expect(fetchUsgsData).not.toHaveBeenCalled(); // fetchUsgsData is no longer a spy
      expect(result.current.monthlyDataSource).toBe('D1');
      expect(result.current.allEarthquakes).toEqual(expect.arrayContaining(d1MonthlyDataFeatures));
      expect(result.current.monthlyError).toBeNull();
    }, 10000);

    it('D1 Failure (500), USGS Success: should fall back to USGS', async () => {
      // Old vi.fn mocks for fetchUsgsData and fetchSpy (if any) are removed or commented out.
      // MSW handlers will now take over.

      server.use(
        // Combined handler for all /api/get-earthquakes calls for this test
        http.get('/api/get-earthquakes', ({ request }) => {
          const url = new URL(request.url);
          const timeWindow = url.searchParams.get('timeWindow');

          if (timeWindow === 'day') {
            // console.log('[MSW Day Override] Intercepted D1 API call for day');
            return HttpResponse.json([{ id: 'test-d1-day', properties: { place: 'Test D1 Day', mag: 0.1, time: Date.now() } }], { status: 200, headers: { 'X-Data-Source': 'D1' } });
          }
          if (timeWindow === 'week') {
            // console.log('[MSW Week Override] Intercepted D1 API call for week');
            return HttpResponse.json([{ id: 'test-d1-week', properties: { place: 'Test D1 Week', mag: 0.2, time: Date.now() } }], { status: 200, headers: { 'X-Data-Source': 'D1' } });
          }
          if (timeWindow === 'month') {
            // console.log('[MSW D1 Fail Override] Intercepted D1 API call for month, returning 500');
            return HttpResponse.text('D1 Monthly Error Simulation', { status: 500 });
          }
          // Fallback for any other timeWindow, though not expected in this test's flow
          return HttpResponse.json({error: `Unhandled timeWindow: ${timeWindow}`}, {status: 400});
        }),
        // This handler targets the proxied USGS call, which is what fetchUsgsData (unmocked) will make
        http.get('/api/usgs-proxy', ({ request }) => {
          const url = new URL(request.url);
          const apiUrlParam = url.searchParams.get('apiUrl');
          // console.log('[MSW /api/usgs-proxy DEBUG] Intercepted. apiUrlParam:', apiUrlParam); // Helpful for debugging
          if (apiUrlParam === USGS_API_URL_MONTH) {
            // console.log('[MSW USGS Month Success Override] Intercepted USGS API call for month via proxy');
            return HttpResponse.json({
              type: 'FeatureCollection',
              features: [mockUsgsFeatureMonth], // mockUsgsFeatureMonth is defined in the test scope
              metadata: { generated: Date.now(), count: 1 }
            });
          }
          // console.error('[MSW /api/usgs-proxy DEBUG] Fallthrough - apiUrlParam did not match:', apiUrlParam, 'Expected:', USGS_API_URL_MONTH);
        })
      );

      const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });

      await act(async () => {
        result.current.loadMonthlyData();
      });

      // Adjusted waitFor to give more time and check for the expected end state
      await waitFor(() => {
        expect(result.current.isLoadingMonthly).toBe(false);
      }, { timeout: 9500 });

      // Assertions after waitFor resolves
      expect(result.current.monthlyDataSource).toBe('USGS');
      expect(result.current.allEarthquakes).toEqual(expect.arrayContaining([mockUsgsFeatureMonth]));
      expect(result.current.monthlyError).toBeNull();
    }, 10000);

    it('D1 Returns Invalid Header, USGS Success: should fall back to USGS', async () => {
      server.use(
        http.get('/api/get-earthquakes', ({ request }) => {
          const url = new URL(request.url);
          const timeWindow = url.searchParams.get('timeWindow');
          if (timeWindow === 'day') {
            return HttpResponse.json([{ id: 'test-d1-day', properties: { place: 'Test D1 Day', mag: 0.1, time: Date.now() } }], { status: 200, headers: { 'X-Data-Source': 'D1' } });
          }
          if (timeWindow === 'week') {
            return HttpResponse.json([{ id: 'test-d1-week', properties: { place: 'Test D1 Week', mag: 0.2, time: Date.now() } }], { status: 200, headers: { 'X-Data-Source': 'D1' } });
          }
          if (timeWindow === 'month') {
            return HttpResponse.json([mockD1FeatureMonth], { status: 200, headers: { 'X-Data-Source': 'NotD1' } });
          }
          return HttpResponse.json({error: `Unhandled timeWindow: ${timeWindow}`}, {status: 400});
        }),
        http.get('/api/usgs-proxy', ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get('apiUrl') === USGS_API_URL_MONTH) {
            return HttpResponse.json({ type: 'FeatureCollection', features: [mockUsgsFeatureMonth], metadata: { generated: Date.now(), count: 1 } });
          }
        })
      );

      const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
      await act(async () => { result.current.loadMonthlyData(); });

      await waitFor(() => {
        expect(result.current.isLoadingMonthly).toBe(false);
        expect(result.current.monthlyDataSource).toBe('USGS');
      });

      expect(result.current.allEarthquakes).toEqual(expect.arrayContaining([mockUsgsFeatureMonth]));
      expect(result.current.monthlyError).toBeNull();
    }, 10000);

    it('D1 Returns Invalid Feature Array, USGS Success: should fall back to USGS', async () => {
      isValidFeatureArray.mockReturnValueOnce(false); // Ensure this is cleared by clearAllMocks in afterEach

      server.use(
        http.get('/api/get-earthquakes', ({ request }) => {
          const url = new URL(request.url);
          const timeWindow = url.searchParams.get('timeWindow');
          if (timeWindow === 'day') {
            return HttpResponse.json([{ id: 'test-d1-day', properties: { place: 'Test D1 Day', mag: 0.1, time: Date.now() } }], { status: 200, headers: { 'X-Data-Source': 'D1' } });
          }
          if (timeWindow === 'week') {
            return HttpResponse.json([{ id: 'test-d1-week', properties: { place: 'Test D1 Week', mag: 0.2, time: Date.now() } }], { status: 200, headers: { 'X-Data-Source': 'D1' } });
          }
          if (timeWindow === 'month') {
            return HttpResponse.json(["invalid data"], { status: 200, headers: { 'X-Data-Source': 'D1' } });
          }
          return HttpResponse.json({error: `Unhandled timeWindow: ${timeWindow}`}, {status: 400});
        }),
        http.get('/api/usgs-proxy', ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get('apiUrl') === USGS_API_URL_MONTH) {
            return HttpResponse.json({ type: 'FeatureCollection', features: [mockUsgsFeatureMonth], metadata: { generated: Date.now(), count: 1 } });
          }
        })
      );

      const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
      await act(async () => { result.current.loadMonthlyData(); });

      await waitFor(() => {
        expect(result.current.isLoadingMonthly).toBe(false);
        expect(result.current.monthlyDataSource).toBe('USGS');
      });

      expect(isValidFeatureArray).toHaveBeenCalledTimes(1); // Service calls it once for D1
      expect(result.current.allEarthquakes).toEqual(expect.arrayContaining([mockUsgsFeatureMonth]));
      expect(result.current.monthlyError).toBeNull();
    }, 10000);

    it('Both D1 and USGS Fail: should set monthlyError', async () => {
      server.use(
        http.get('/api/get-earthquakes', ({ request }) => {
          const url = new URL(request.url);
          const timeWindow = url.searchParams.get('timeWindow');
          if (timeWindow === 'day') {
            return HttpResponse.json([{ id: 'test-d1-day', properties: { place: 'Test D1 Day', mag: 0.1, time: Date.now() } }], { status: 200, headers: { 'X-Data-Source': 'D1' } });
          }
          if (timeWindow === 'week') {
            return HttpResponse.json([{ id: 'test-d1-week', properties: { place: 'Test D1 Week', mag: 0.2, time: Date.now() } }], { status: 200, headers: { 'X-Data-Source': 'D1' } });
          }
          if (timeWindow === 'month') {
            return HttpResponse.text('D1 Monthly Error Text', { status: 500 });
          }
          return HttpResponse.json({error: `Unhandled timeWindow: ${timeWindow}`}, {status: 400});
        }),
        http.get('/api/usgs-proxy', ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get('apiUrl') === USGS_API_URL_MONTH) {
            // Simulate an error from the USGS service itself (e.g., service unavailable or internal error)
            // fetchUsgsData is expected to turn this into an error object { error: { message: ... } }
            // Forcing a 503 to be distinct and then checking how fetchUsgsData translates it.
            // The service EarthquakeDataContext expects { error: { message: "USGS Monthly Down" } } from fetchUsgsData.
            // fetchUsgsData, when it receives a non-ok response from its internal fetch to /api/usgs-proxy,
            // creates an object: { error: true, message: `Failed to fetch from USGS proxy: ${response.status} ${errorText}` }
            // So, we need to match that structure if we want to test the exact error message generation in EarthquakeDataContext.
            // Alternatively, we can make the proxy return what fetchUsgsData would return if USGS itself failed.
            // Let's simulate the proxy returning an error that fetchUsgsData would then process.
            // The context expects: monthlyFetchError += `USGS Error (Monthly): ${usgsMonthlyRes?.error?.message ...}`
            // So, usgsMonthlyRes should be { error: { message: "USGS Monthly Down" } }
            // For this to happen, /api/usgs-proxy must return a JSON that fetchUsgsData interprets as such.
            // Given fetchUsgsData structure:
            // if (!response.ok) return { error: true, message: `Failed to fetch from USGS proxy: ${response.status} ${errorText}` };
            // if (responseData.error) return { error: true, message: responseData.error.message || 'Unknown USGS API error' };
            // So, if /api/usgs-proxy returns a 503 with JSON { "message": "USGS Monthly Down" }
            // fetchUsgsData will return { error: true, message: "Failed to fetch from USGS proxy: 503 {\"message\":\"USGS Monthly Down\"}" }
            // This is fine, the context will then report this.
            // The original test was expecting "USGS Monthly Down" directly. This implies fetchUsgsData was mocked to return that.
            // To achieve "USGS Monthly Down", the /api/usgs-proxy should return a 200 OK, but with error content:
            return HttpResponse.json({ error: { message: "USGS Monthly Down" } }, { status: 200 });
            // If we want to simulate a network error for the proxy itself:
            // return HttpResponse.text('USGS Proxy Error', { status: 503 });
          }
        })
      );

      const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
      await act(async () => { result.current.loadMonthlyData(); });

      await waitFor(() => {
        expect(result.current.isLoadingMonthly).toBe(false);
        // Stop waiting if error is set, to see the error quickly
        return !!result.current.monthlyError;
      });

      expect(result.current.monthlyError).toContain("D1 Error (Monthly): Failed to fetch from D1: 500 D1 Monthly Error Text");
      expect(result.current.monthlyError).toContain("USGS Error (Monthly): USGS Monthly Down");
      expect(result.current.monthlyDataSource).toBeNull();
    }, 10000);
  });

  // Keep existing tests, ensuring D1 fails first for them to test USGS path correctly
  describe('Original USGS Path Tests (assuming D1 fails first for monthly load)', () => {
    // The beforeEach and afterEach from the parent describe block will apply here for setInterval etc.

    // Default D1 failure for 'month', and default success for 'day'/'week' for this suite.
    // Individual tests can override USGS responses.
    beforeEach(() => {
      server.use(
        http.get('/api/get-earthquakes', ({ request }) => {
          const url = new URL(request.url);
          const timeWindow = url.searchParams.get('timeWindow');
          if (timeWindow === 'day') {
            return HttpResponse.json([{ id: 'test-d1-day', properties: { place: 'Test D1 Day', mag: 0.1, time: Date.now() } }], { status: 200, headers: { 'X-Data-Source': 'D1' } });
          }
          if (timeWindow === 'week') {
            return HttpResponse.json([{ id: 'test-d1-week', properties: { place: 'Test D1 Week', mag: 0.2, time: Date.now() } }], { status: 200, headers: { 'X-Data-Source': 'D1' } });
          }
          if (timeWindow === 'month') {
            return HttpResponse.text('D1 generic monthly fallback error', { status: 500 });
          }
          return HttpResponse.json({error: `Unhandled timeWindow: ${timeWindow}`}, {status: 400});
        })
      );
    });

    it('should fetch monthly data and dispatch MONTHLY_DATA_PROCESSED on success (USGS path)', async () => {
      const minimalMockFeatures = [{ id: 'mocker1', properties: { time: Date.now(), mag: 3.0, place: "Minimal Mock" } }];
      // D1 failure is handled by the describe block's beforeEach
      server.use( // Add to existing handlers, specifically for USGS success
        http.get('/api/usgs-proxy', ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get('apiUrl') === USGS_API_URL_MONTH) {
            return HttpResponse.json({ type: 'FeatureCollection', features: minimalMockFeatures, metadata: { generated: Date.now(), count: minimalMockFeatures.length } });
          }
        })
      );

      const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
      await act(async () => { result.current.loadMonthlyData(); });

      await waitFor(() => {
        expect(result.current.isLoadingMonthly).toBe(false);
        expect(result.current.hasAttemptedMonthlyLoad).toBe(true);
        // Ensure data is actually loaded before proceeding with more assertions
        return result.current.monthlyDataSource === 'USGS' && result.current.allEarthquakes.length > 0;
      });

      expect(result.current.monthlyError).toBeNull();
      expect(result.current.allEarthquakes.length).toBe(minimalMockFeatures.length);
      if (minimalMockFeatures.length > 0) {
        expect(result.current.allEarthquakes).toEqual(expect.arrayContaining(minimalMockFeatures));
      }
      expect(result.current.monthlyDataSource).toBe('USGS');
    }, 10000);

    it('should set monthlyError if API returns an error object (USGS path)', async () => {
      const errorMessage = "API Error for monthly data";
      // D1 failure is handled by the describe block's beforeEach
      server.use( // Add to existing handlers, specifically for USGS error
        http.get('/api/usgs-proxy', ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get('apiUrl') === USGS_API_URL_MONTH) {
            return HttpResponse.json({ error: { message: errorMessage } }, { status: 200 });
          }
        })
      );

      const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
      await act(async () => { result.current.loadMonthlyData(); });

      await waitFor(() => {
        expect(result.current.isLoadingMonthly).toBe(false);
        return !!result.current.monthlyError; // Wait until error is set
      });

      expect(result.current.monthlyError).toContain(`USGS Error (Monthly): ${errorMessage}`);
      expect(result.current.monthlyDataSource).toBeNull();
    }, 10000);

    it('should set monthlyError if API call throws an error (USGS path)', async () => {
      const thrownErrorMessage = "Network failure";
      // D1 failure is handled by the describe block's beforeEach
      server.use( // Add to existing handlers, specifically for USGS network error
        http.get('/api/usgs-proxy', ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get('apiUrl') === USGS_API_URL_MONTH) {
            // Simulate a specific server error that fetchUsgsData will process
            return new Response(null, { status: 503, statusText: 'Service Unavailable (Simulated)' });
          }
        })
      );

      const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
      await act(async () => { result.current.loadMonthlyData(); });

      await waitFor(() => {
        expect(result.current.isLoadingMonthly).toBe(false);
        return !!result.current.monthlyError; // Wait until error is set
      });
      // fetchUsgsData will turn the 503 into: { error: true, message: "HTTP error! status: 503 " } (statusText is not part of message)
      // The context will then display: "USGS Error (Monthly): HTTP error! status: 503 "
      // The full error message will also include the D1 error.
      expect(result.current.monthlyError).toContain('D1 Error (Monthly): Failed to fetch from D1: 500 D1 generic monthly fallback error');
      expect(result.current.monthlyError.replace(/\s+$/, '')).toContain('USGS Error (Monthly): HTTP error! status: 503'); // Trim trailing space for robust match
      expect(result.current.monthlyDataSource).toBeNull();
    }, 10000);

    it('should set monthlyError if API returns empty features array (USGS path)', async () => {
      const expectedErrorMessage = "USGS Error (Monthly): Monthly USGS data features missing or invalid.";
      isValidGeoJson.mockReturnValueOnce(false); // Crucial for this test case

      // D1 failure is handled by the describe block's beforeEach
      server.use(
        http.get('/api/usgs-proxy', ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get('apiUrl') === USGS_API_URL_MONTH) {
            return HttpResponse.json({ type: 'FeatureCollection', features: [], metadata: { generated: Date.now(), count: 0 } });
          }
        })
      );

      const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
      await act(async () => { result.current.loadMonthlyData(); });

      await waitFor(() => {
        expect(result.current.isLoadingMonthly).toBe(false);
        return !!result.current.monthlyError;
      });
      expect(result.current.monthlyError).toContain(expectedErrorMessage);
      expect(result.current.monthlyDataSource).toBeNull();
    }, 10000);

    it('should set monthlyError if API returns no features key (USGS path)', async () => {
      const expectedErrorMessage = "USGS Error (Monthly): Monthly USGS data features missing or invalid.";
      isValidGeoJson.mockReturnValueOnce(false); // Crucial for this test case

      // D1 failure is handled by the describe block's beforeEach
      server.use(
        http.get('/api/usgs-proxy', ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get('apiUrl') === USGS_API_URL_MONTH) {
            return HttpResponse.json({ metadata: { generated: Date.now(), count: 0 } }); // No 'features' key
          }
        })
      );

      const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
      await act(async () => { result.current.loadMonthlyData(); });

      await waitFor(() => {
        expect(result.current.isLoadingMonthly).toBe(false);
        return !!result.current.monthlyError;
      });
      expect(result.current.monthlyError).toContain(expectedErrorMessage);
      expect(result.current.monthlyDataSource).toBeNull();
    }, 10000);
  });
});
