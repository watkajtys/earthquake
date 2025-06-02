// src/hooks/useMonthlyEarthquakeData.test.js
import { describe, it, expect, vi, beforeEach, afterEach, test } from 'vitest';
// import { renderHook, act } from '@testing-library/react';
// import useMonthlyEarthquakeData from './useMonthlyEarthquakeData';
// import * as usgsApiService from '../services/usgsApiService';
// import { USGS_API_URL_MONTH, MAJOR_QUAKE_THRESHOLD } from '../constants/appConstants';

// // Mock the service
// vi.mock('../services/usgsApiService');

// const mockMonthlyDataFull = {
//     type: "FeatureCollection",
//     metadata: { generated: Date.now(), url: USGS_API_URL_MONTH, title: "USGS All Earthquakes, Past Month", count: 5, status: 200 },
//     features: [
//         { id: "m1", properties: { mag: 5.0, place: "Month Place 1", time: Date.now() - 5 * 24 * 36e5, alert: 'green', sig: 400 }, geometry: { coordinates: [-120, 35, 10] } }, // 5 days ago
//         { id: "m2", properties: { mag: 4.5, place: "Month Place 2", time: Date.now() - 10 * 24 * 36e5, alert: 'yellow', sig: 300 }, geometry: { coordinates: [-121, 36, 5] } }, // 10 days ago
//         { id: "m3", properties: { mag: 6.0, place: "Month Place 3", time: Date.now() - 15 * 24 * 36e5, alert: 'orange', sig: 700 }, geometry: { coordinates: [-122, 37, 15] } }, // 15 days ago
//         { id: "m4", properties: { mag: 2.0, place: "Month Place 4", time: Date.now() - 20 * 24 * 36e5, alert: null, sig: 50 }, geometry: { coordinates: [-123, 38, 20] } },    // 20 days ago
//         { id: "m5", properties: { mag: 5.5, place: "Month Place 5", time: Date.now() - 28 * 24 * 36e5, alert: 'red', sig: 600 }, geometry: { coordinates: [-124, 39, 25] } },     // 28 days ago
//     ]
// };

// const mockEmptyMonthlyData = {
//     type: "FeatureCollection",
//     metadata: { generated: Date.now(), url: USGS_API_URL_MONTH, title: "USGS All Earthquakes, Past Month", count: 0, status: 200 },
//     features: []
// };

// describe.skip('useMonthlyEarthquakeData', () => {
//     let mockSetLastMajorQuake;
//     let mockSetPreviousMajorQuake;
//     let mockSetTimeBetweenPreviousMajorQuakes;
//     let currentLastMajorQuakeFromMainHook;

//     beforeEach(() => {
//         vi.useFakeTimers();
//         usgsApiService.fetchUsgsData.mockReset();

//         mockSetLastMajorQuake = vi.fn();
//         mockSetPreviousMajorQuake = vi.fn();
//         mockSetTimeBetweenPreviousMajorQuakes = vi.fn();
//         currentLastMajorQuakeFromMainHook = null; // Reset before each test
//     });

//     afterEach(() => {
//         vi.restoreAllMocks();
//         vi.useRealTimers();
//     });

//     describe('Initial State & Loading', () => {
//         it('should have correct initial states', () => {
//             usgsApiService.fetchUsgsData.mockResolvedValue(JSON.parse(JSON.stringify(mockMonthlyDataFull)));
//             const { result } = renderHook(() => useMonthlyEarthquakeData(
//                 currentLastMajorQuakeFromMainHook,
//                 mockSetLastMajorQuake,
//                 mockSetPreviousMajorQuake,
//                 mockSetTimeBetweenPreviousMajorQuakes
//             ));

//             expect(result.current.isLoadingMonthly).toBe(false);
//             expect(result.current.hasAttemptedMonthlyLoad).toBe(false);
//             expect(result.current.monthlyError).toBeNull();
//             expect(result.current.allEarthquakes).toEqual([]);
//             expect(result.current.earthquakesLast14Days).toEqual([]);
//             expect(result.current.earthquakesLast30Days).toEqual([]);
//             expect(result.current.prev7DayData).toEqual([]);
//             expect(result.current.prev14DayData).toEqual([]);
//         });
//     });

//     describe('loadMonthlyData Functionality (Successful Fetch)', () => {
//         beforeEach(() => {
//             // Default to successful full data fetch for these tests
//             usgsApiService.fetchUsgsData.mockResolvedValue(JSON.parse(JSON.stringify(mockMonthlyDataFull)));
//         });

//         it('should set loading states correctly during and after fetch', async () => {
//             const { result } = renderHook(() => useMonthlyEarthquakeData(null, vi.fn(), vi.fn(), vi.fn()));
//             const loadDataPromise = act(async () => {
//                 result.current.loadMonthlyData();
//             });
//             // Check loading state *during* fetch (immediately after calling loadMonthlyData)
//             expect(result.current.isLoadingMonthly).toBe(true);
//             expect(result.current.hasAttemptedMonthlyLoad).toBe(true); // Set true on attempt
//             expect(result.current.monthlyError).toBeNull();

//             await act(async () => { await loadDataPromise; await vi.runAllTimersAsync(); }); // Wait for all promises and timers

//             expect(result.current.isLoadingMonthly).toBe(false);
//             expect(result.current.monthlyError).toBeNull(); // Should still be null on success
//         });

//         it('should process and filter data correctly', async () => {
//             const { result } = renderHook(() => useMonthlyEarthquakeData(null, vi.fn(), vi.fn(), vi.fn()));
//             await act(async () => {
//                 await result.current.loadMonthlyData();
//                 await vi.runAllTimersAsync();
//             });

//             expect(result.current.allEarthquakes.length).toBe(mockMonthlyDataFull.features.length);
//             // These counts depend on the fixed Date.now() and the mock data's relative times.
//             // For this example, let's assume all are within 30 days for simplicity of test setup.
//             expect(result.current.earthquakesLast14Days.length).toBeGreaterThanOrEqual(2); // m1, m2
//             expect(result.current.earthquakesLast30Days.length).toBe(mockMonthlyDataFull.features.length);
//             expect(result.current.prev7DayData.length).toBeGreaterThanOrEqual(1); // m2 (10d ago) is between 7-14d
//             expect(result.current.prev14DayData.length).toBeGreaterThanOrEqual(2); // m3 (15d), m4 (20d) are between 14-28d
//         });

//         describe('Major Quake Consolidation', () => {
//             it('should set major quakes from monthly if currentLastMajorQuake is null', async () => {
//                 const { result } = renderHook(() => useMonthlyEarthquakeData(
//                     null, mockSetLastMajorQuake, mockSetPreviousMajorQuake, mockSetTimeBetweenPreviousMajorQuakes
//                 ));
//                 await act(async () => { await result.current.loadMonthlyData(); });

//                 expect(mockSetLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: "m3" })); // 6.0 mag
//                 expect(mockSetPreviousMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: "m5" })); // 5.5 mag
//                 expect(mockSetTimeBetweenPreviousMajorQuakes).toHaveBeenCalled();
//             });

//             it('should update with monthly if monthly major quake is newer', async () => {
//                 currentLastMajorQuakeFromMainHook = { id: "current_old", properties: { mag: 7.0, time: Date.now() - 20 * 24 * 36e5 }, geometry: { coordinates: [0,0,0] } }; // 20 days old
//                 const { result } = renderHook(() => useMonthlyEarthquakeData(
//                     currentLastMajorQuakeFromMainHook, mockSetLastMajorQuake, mockSetPreviousMajorQuake, mockSetTimeBetweenPreviousMajorQuakes
//                 ));
//                 await act(async () => { await result.current.loadMonthlyData(); }); // m3 (6.0) is 15 days old, m1 (5.0) is 5 days old

//                 expect(mockSetLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: "m1" })); // Newest is m1 (5.0)
//                 expect(mockSetPreviousMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: "m3" })); // Next is m3 (6.0)
//             });

//             it('should keep current if currentLastMajorQuake is newer than any in monthly', async () => {
//                 currentLastMajorQuakeFromMainHook = { id: "current_newest", properties: { mag: 7.5, time: Date.now() - 1 * 24 * 36e5 }, geometry: { coordinates: [0,0,0] } }; // 1 day old
//                 const { result } = renderHook(() => useMonthlyEarthquakeData(
//                     currentLastMajorQuakeFromMainHook, mockSetLastMajorQuake, mockSetPreviousMajorQuake, mockSetTimeBetweenPreviousMajorQuakes
//                 ));
//                 await act(async () => { await result.current.loadMonthlyData(); });

//                 expect(mockSetLastMajorQuake).toHaveBeenCalledWith(currentLastMajorQuakeFromMainHook);
//                 expect(mockSetPreviousMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: "m1" })); // m1 (5.0 at 5 days) is next
//             });
//             it('should correctly place currentLastMajorQuake if it is between monthly major quakes', async () => {
//                 // m1 (5.0, 5 days ago), m3 (6.0, 15 days ago)
//                 currentLastMajorQuakeFromMainHook = { id: "current_middle", properties: { mag: 7.0, time: Date.now() - 10 * 24 * 36e5 }, geometry: { coordinates: [0,0,0] } }; // 10 days old

//                 const { result } = renderHook(() => useMonthlyEarthquakeData(
//                     currentLastMajorQuakeFromMainHook, mockSetLastMajorQuake, mockSetPreviousMajorQuake, mockSetTimeBetweenPreviousMajorQuakes
//                 ));
//                 await act(async () => { await result.current.loadMonthlyData(); });

//                 expect(mockSetLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: "m1" })); // m1 is newest
//                 expect(mockSetPreviousMajorQuake).toHaveBeenCalledWith(currentLastMajorQuakeFromMainHook); // current_middle is next
//             });


//             it('should handle no major quakes in monthly feed but currentLastMajorQuake exists', async () => {
//                 const noMajorMonthlyData = { ...mockMonthlyDataFull, features: [mockMonthlyDataFull.features[3]] }; // Only m4 (2.0 mag)
//                 usgsApiService.fetchUsgsData.mockResolvedValue(JSON.parse(JSON.stringify(noMajorMonthlyData)));
//                 currentLastMajorQuakeFromMainHook = { id: "current_only_major", properties: { mag: 5.0, time: Date.now() - 1 * 24 * 36e5 }, geometry: { coordinates: [0,0,0] } };

//                 const { result } = renderHook(() => useMonthlyEarthquakeData(
//                     currentLastMajorQuakeFromMainHook, mockSetLastMajorQuake, mockSetPreviousMajorQuake, mockSetTimeBetweenPreviousMajorQuakes
//                 ));
//                 await act(async () => { await result.current.loadMonthlyData(); });

//                 expect(mockSetLastMajorQuake).toHaveBeenCalledWith(currentLastMajorQuakeFromMainHook);
//                 expect(mockSetPreviousMajorQuake).toHaveBeenCalledWith(null); // No other major quakes
//             });
//         });
//     });

//     describe('loadMonthlyData Functionality (Error Handling)', () => {
//         it('should set monthlyError if fetch fails (simulated network error via service)', async () => {
//             usgsApiService.fetchUsgsData.mockRejectedValue(new Error("Network Error")); // Simulate fetch throwing an error
//             const { result } = renderHook(() => useMonthlyEarthquakeData(null, vi.fn(), vi.fn(), vi.fn()));
//             await act(async () => { await result.current.loadMonthlyData(); });
//             expect(result.current.monthlyError).toBe("Monthly Data Processing Error: Network Error");
//             expect(result.current.allEarthquakes).toEqual([]); // Data should be empty
//         });

//         it('should set monthlyError if response has no features (error from service)', async () => {
//             usgsApiService.fetchUsgsData.mockResolvedValue({ ...mockMonthlyDataFull, features: null }); // Simulate API returning null features
//             const { result } = renderHook(() => useMonthlyEarthquakeData(null, vi.fn(), vi.fn(), vi.fn()));
//             await act(async () => { await result.current.loadMonthlyData(); });
//             expect(result.current.monthlyError).toBe("Monthly data is currently unavailable or incomplete.");
//         });
//         it('should set monthlyError if service returns error object (e.g. HTTP error)', async () => {
//             usgsApiService.fetchUsgsData.mockResolvedValue({ error: { message: "USGS Server Down", status: 503 } });
//             const { result } = renderHook(() => useMonthlyEarthquakeData(null, vi.fn(), vi.fn(), vi.fn()));
//             await act(async () => { await result.current.loadMonthlyData(); });
//             expect(result.current.monthlyError).toBe("USGS Server Down");
//         });
//     });
// });

// New top-level describe to skip all tests in this file
describe.skip('useMonthlyEarthquakeData (deprecated - logic moved to EarthquakeDataProvider)', () => {
    it('should be skipped', () => {
        expect(true).toBe(true);
    });
});
