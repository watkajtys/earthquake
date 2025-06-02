import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import useMonthlyEarthquakeData from './useMonthlyEarthquakeData';
import { USGS_API_URL_MONTH } from '../constants/appConstants'; // MAJOR_QUAKE_THRESHOLD is used by createMockEarthquake
import { fetchUsgsData } from '../services/usgsApiService';

// Mock the usgsApiService
vi.mock('../services/usgsApiService', () => ({
    fetchUsgsData: vi.fn()
}));

// Mock state setters passed as props
const mockSetLastMajorQuake = vi.fn();
const mockSetPreviousMajorQuake = vi.fn();
const mockSetTimeBetweenPreviousMajorQuakes = vi.fn();

// Mock Date.now() for consistent time-based filtering
const MOCKED_NOW = 1700000000000; // Fixed point: Nov 14, 2023 22:13:20 GMT
const MOCKED_NOW_DATE = new Date(MOCKED_NOW);

// Helper to create mock earthquake features
const createMockEarthquake = (id, timeOffsetDays, mag, title = 'Test Quake') => ({
    type: 'Feature',
    properties: {
        mag,
        place: 'Test Place',
        time: MOCKED_NOW - timeOffsetDays * 24 * 3600 * 1000, // timeOffsetDays days ago
        updated: MOCKED_NOW - timeOffsetDays * 24 * 3600 * 1000,
        url: `https://earthquake.usgs.gov/earthquakes/eventpage/test${id}`,
        detail: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/test${id}.geojson`,
        alert: null,
        status: 'reviewed',
        tsunami: 0,
        sig: Math.round(mag * 100),
        net: 'test',
        code: `test${id}`,
        ids: `,test${id},`,
        sources: ',test,',
        types: ',origin,phase-data,',
        magType: 'mw',
        type: 'earthquake',
        title,
    },
    geometry: { type: 'Point', coordinates: [0, 0, 0] },
    id: `test${id}`,
});

// Mock API response for monthly data
const mockMonthlyResponse = {
    type: 'FeatureCollection',
    metadata: {
        generated: MOCKED_NOW - 1000 * 60 * 60, // 1 hour ago
        url: USGS_API_URL_MONTH,
        title: 'USGS All Earthquakes, Past Month',
        status: 200,
        api: '1.10.3',
        count: 5,
    },
    features: [
        createMockEarthquake('month1', 1, 5.5),  // 1 day ago, Major
        createMockEarthquake('month2', 5, 4.0),  // 5 days ago
        createMockEarthquake('month3', 10, 6.0), // 10 days ago, Major
        createMockEarthquake('month4', 15, 3.0), // 15 days ago
        createMockEarthquake('month5', 20, 5.2), // 20 days ago, Major
        createMockEarthquake('month6', 25, 2.5), // 25 days ago
        createMockEarthquake('month7', 35, 5.8), // 35 days ago (outside 30 day filter for some arrays), Major
    ],
};


describe('useMonthlyEarthquakeData', () => {
    let currentLastMajorQuakeMock = null;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(MOCKED_NOW_DATE);
        fetchUsgsData.mockReset(); // Use the mocked service function
        mockSetLastMajorQuake.mockReset();
        mockSetPreviousMajorQuake.mockReset();
        mockSetTimeBetweenPreviousMajorQuakes.mockReset();
        currentLastMajorQuakeMock = null; // Reset mock for current major quake
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const getHook = () => renderHook(() => useMonthlyEarthquakeData(
        currentLastMajorQuakeMock,
        mockSetLastMajorQuake,
        mockSetPreviousMajorQuake,
        mockSetTimeBetweenPreviousMajorQuakes
    ));

    describe('Initial State & Loading', () => {
        it('should have correct initial states', () => {
            const { result } = getHook();
            expect(result.current.isLoadingMonthly).toBe(false);
            expect(result.current.hasAttemptedMonthlyLoad).toBe(false);
            expect(result.current.monthlyError).toBeNull();
            expect(result.current.allEarthquakes).toEqual([]);
            expect(result.current.earthquakesLast14Days).toEqual([]);
            expect(result.current.earthquakesLast30Days).toEqual([]);
            expect(result.current.prev7DayData).toEqual([]);
            expect(result.current.prev14DayData).toEqual([]);
        });
    });

    describe('loadMonthlyData Functionality (Successful Fetch)', () => {
        beforeEach(() => {
            fetchUsgsData.mockImplementation(async (url) => {
                if (url === USGS_API_URL_MONTH) return Promise.resolve({ ...mockMonthlyResponse });
                return Promise.resolve({ features: [], metadata: { generated: MOCKED_NOW } });
            });
        });

        it('should set loading states correctly during and after fetch', async () => {
            const { result } = getHook();
            let loadPromise;

            // Act for the synchronous part of loadMonthlyData
            act(() => {
                loadPromise = result.current.loadMonthlyData();
            });
            // Check isLoadingMonthly immediately after loadMonthlyData is called
            expect(result.current.isLoadingMonthly).toBe(true);
            expect(result.current.hasAttemptedMonthlyLoad).toBe(true); // This is set sync

            // Act for the asynchronous part to complete
            await act(async () => { await loadPromise; });

            expect(result.current.isLoadingMonthly).toBe(false);
            expect(result.current.monthlyError).toBeNull();
        });

        it('should process and filter data correctly', async () => {
            const { result } = getHook();
            await act(async () => { await result.current.loadMonthlyData(); });

            expect(result.current.allEarthquakes.length).toBe(mockMonthlyResponse.features.length);
            expect(result.current.earthquakesLast14Days.map(e => e.id)).toEqual(
                expect.arrayContaining(['testmonth1', 'testmonth2', 'testmonth3'])
            );
            expect(result.current.earthquakesLast30Days.map(e => e.id)).toEqual(
                expect.arrayContaining(['testmonth1', 'testmonth2', 'testmonth3', 'testmonth4', 'testmonth5', 'testmonth6'])
            );
            // prev7DayData: 7-14 days ago. month3 (10d)
            expect(result.current.prev7DayData.map(e => e.id)).toEqual(['testmonth3']);
             // prev14DayData: 14-28 days ago. month4 (15d), month5 (20d), month6 (25d)
            expect(result.current.prev14DayData.map(e => e.id)).toEqual(
                expect.arrayContaining(['testmonth4', 'testmonth5', 'testmonth6'])
            );
        });

        describe('Major Quake Consolidation', () => {
            it('should set major quakes from monthly if currentLastMajorQuake is null', async () => {
                currentLastMajorQuakeMock = null;
                const { result } = getHook();
                await act(async () => { await result.current.loadMonthlyData(); });

                // month1 (5.5, 1 day ago), month3 (6.0, 10 days ago)
                expect(mockSetLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testmonth1' }));
                expect(mockSetPreviousMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testmonth3' }));
                const time1 = mockMonthlyResponse.features.find(f=>f.id === 'testmonth1').properties.time;
                const time3 = mockMonthlyResponse.features.find(f=>f.id === 'testmonth3').properties.time;
                expect(mockSetTimeBetweenPreviousMajorQuakes).toHaveBeenCalledWith(time1 - time3);
            });

            it('should update with monthly if monthly major quake is newer', async () => {
                currentLastMajorQuakeMock = createMockEarthquake('currentMajor', 12, 7.0); // 12 days ago
                const { result } = getHook();
                await act(async () => { await result.current.loadMonthlyData(); });

                // month1 (5.5, 1 day ago) is newer than currentMajor (12 days ago)
                expect(mockSetLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testmonth1' }));
                // previous should be month3 (10 days ago) as it's next most recent from combined list after month1
                expect(mockSetPreviousMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testmonth3'}));
                const time1 = mockMonthlyResponse.features.find(f=>f.id === 'testmonth1').properties.time;
                const time3 = mockMonthlyResponse.features.find(f=>f.id === 'testmonth3').properties.time;
                expect(mockSetTimeBetweenPreviousMajorQuakes).toHaveBeenCalledWith(time1 - time3);
            });

            it('should keep current if currentLastMajorQuake is newer than any in monthly', async () => {
                currentLastMajorQuakeMock = createMockEarthquake('superMajor', 0.5, 7.5); // 0.5 days ago
                const { result } = getHook();
                await act(async () => { await result.current.loadMonthlyData(); });

                expect(mockSetLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testsuperMajor' }));
                // previous would be month1 (1 day ago)
                expect(mockSetPreviousMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testmonth1' }));
            });

            it('should correctly place currentLastMajorQuake if it is between monthly major quakes', async () => {
                currentLastMajorQuakeMock = createMockEarthquake('midMajor', 7, 6.2); // 7 days ago
                 // Monthly: month1 (1d, 5.5), month3 (10d, 6.0)
                const { result } = getHook();
                await act(async () => { await result.current.loadMonthlyData(); });

                // month1 is newest
                expect(mockSetLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testmonth1' }));
                // midMajor (7d) is next
                expect(mockSetPreviousMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testmidMajor' }));
            });

            it('should handle no major quakes in monthly feed but currentLastMajorQuake exists', async () => {
                currentLastMajorQuakeMock = createMockEarthquake('onlyMajor', 10, 7.0);
                const noMajorMonthlyResponse = { ...mockMonthlyResponse, features: [createMockEarthquake('nonMajor', 1, 4.0)] };
                fetchUsgsData.mockResolvedValue(noMajorMonthlyResponse); // Simplified for this test
                const { result } = getHook();
                await act(async () => { await result.current.loadMonthlyData(); });

                expect(mockSetLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testonlyMajor' }));
                expect(mockSetPreviousMajorQuake).toHaveBeenCalledWith(null);
                expect(mockSetTimeBetweenPreviousMajorQuakes).toHaveBeenCalledWith(null);
            });
        });
    });

    describe('loadMonthlyData Functionality (Error Handling)', () => {
        it('should set monthlyError if fetch fails (simulated network error via service)', async () => {
            fetchUsgsData.mockResolvedValue({ error: { message: "Network failure via service", status: null } });
            const { result } = getHook();
            await act(async () => { await result.current.loadMonthlyData(); });

            expect(result.current.isLoadingMonthly).toBe(false);
            // The hook prepends "Monthly Data Error: " or "Monthly Data Processing Error: "
            // Based on the refactored hook, if monthlyResult.error exists, it uses monthlyResult.error.message.
            expect(result.current.monthlyError).toBe("Network failure via service");
            expect(result.current.allEarthquakes).toEqual([]);
            expect(mockSetLastMajorQuake).not.toHaveBeenCalled();
        });

        it('should set monthlyError if response has no features (error from service)', async () => {
            // This scenario implies the service successfully fetched but the data was empty,
            // which fetchUsgsData would return as success. The hook then checks features.length.
            // Or, if the service itself considered "no features" an error and returned an error object.
            // Let's assume the hook's logic `!monthlyResult.error && monthlyResult.features && monthlyResult.features.length > 0`
            // means an empty features array is handled by the `else` block.
            fetchUsgsData.mockResolvedValue({ metadata: { generated: MOCKED_NOW }, features: [] });
            const { result } = getHook();
            await act(async () => { await result.current.loadMonthlyData(); });

            expect(result.current.isLoadingMonthly).toBe(false);
            expect(result.current.monthlyError).toBe("Monthly data is currently unavailable or incomplete.");
        });

        it('should set monthlyError if service returns error object (e.g. HTTP error)', async () => {
            // This simulates fetchUsgsData returning an error object due to e.g. a non-200 response
            fetchUsgsData.mockResolvedValue({ error: { message: "USGS server error", status: 500 } });
            const { result } = getHook();
            await act(async () => { await result.current.loadMonthlyData(); });

            expect(result.current.isLoadingMonthly).toBe(false);
            expect(result.current.monthlyError).toBe("USGS server error");
        });
    });
});
