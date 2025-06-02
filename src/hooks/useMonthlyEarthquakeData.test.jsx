import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { EarthquakeDataContext } from '../contexts/EarthquakeDataContext';
import useMonthlyEarthquakeData from './useMonthlyEarthquakeData';
import { USGS_API_URL_MONTH, MAJOR_QUAKE_THRESHOLD, INITIAL_LOADING_MESSAGES } from '../constants/appConstants';

const mockFetchDataCb = vi.fn();
const MOCKED_NOW = 1700000000000;
const MOCKED_NOW_DATE = new Date(MOCKED_NOW);

const createMockContextValue = () => {
    const context = {}; // Object to be populated and returned

    Object.assign(context, {
        lastMajorQuake: null,
        previousMajorQuake: null,
        timeBetweenPreviousMajorQuakes: null,
        isInitialAppLoad: true,
        isLoadingDaily: false, // Not primarily managed by monthly hook but part of shared context
        isLoadingWeekly: false, // "
        currentLoadingMessage: INITIAL_LOADING_MESSAGES[0], // "
        error: null, // "
        dataFetchTime: null, // "
        lastUpdated: null, // "
        earthquakesLastHour: [], // "
        earthquakesPriorHour: [], // "
        earthquakesLast24Hours: [], // "
        earthquakesLast72Hours: [], // "
        earthquakesLast7Days: [], // "
        prev24HourData: [], // "
        globeEarthquakes: [], // "
        hasRecentTsunamiWarning: false, // "
        highestRecentAlert: null, // "
        activeAlertTriggeringQuakes: [], // "
        
        isLoadingMonthly: false, // Specifically managed by monthly hook's effects
        hasAttemptedMonthlyLoad: false, // "
        monthlyError: null, // "
        allEarthquakes: [], // "
        earthquakesLast14Days: [], // "
        earthquakesLast30Days: [], // "
        prev7DayData: [], // "
        prev14DayData: [], // "

        setIsLoadingDaily: vi.fn((val) => { context.isLoadingDaily = val; }),
        setIsLoadingWeekly: vi.fn((val) => { context.isLoadingWeekly = val; }),
        setError: vi.fn((val) => { context.error = val; }),
        setDataFetchTime: vi.fn((val) => { context.dataFetchTime = val; }),
        setLastUpdated: vi.fn((val) => { context.lastUpdated = val; }),
        setEarthquakesLastHour: vi.fn((val) => { context.earthquakesLastHour = val; }),
        setEarthquakesPriorHour: vi.fn((val) => { context.earthquakesPriorHour = val; }),
        setEarthquakesLast24Hours: vi.fn((val) => { context.earthquakesLast24Hours = val; }),
        setEarthquakesLast72Hours: vi.fn((val) => { context.earthquakesLast72Hours = val; }),
        setEarthquakesLast7Days: vi.fn((val) => { context.earthquakesLast7Days = val; }),
        setPrev24HourData: vi.fn((val) => { context.prev24HourData = val; }),
        setGlobeEarthquakes: vi.fn((val) => { context.globeEarthquakes = val; }),
        setHasRecentTsunamiWarning: vi.fn((val) => { context.hasRecentTsunamiWarning = val; }),
        setHighestRecentAlert: vi.fn((val) => { context.highestRecentAlert = val; }),
        setActiveAlertTriggeringQuakes: vi.fn((val) => { context.activeAlertTriggeringQuakes = val; }),
        setLastMajorQuake: vi.fn((val) => { context.lastMajorQuake = val; }),
        setPreviousMajorQuake: vi.fn((val) => { context.previousMajorQuake = val; }),
        setTimeBetweenPreviousMajorQuakes: vi.fn((val) => { context.timeBetweenPreviousMajorQuakes = val; }),
        setCurrentLoadingMessage: vi.fn((val) => { context.currentLoadingMessage = val; }),
        setIsInitialAppLoad: vi.fn((val) => { context.isInitialAppLoad = val; }),
        
        setIsLoadingMonthly: vi.fn((val) => { context.isLoadingMonthly = val; }),
        setHasAttemptedMonthlyLoad: vi.fn((val) => { context.hasAttemptedMonthlyLoad = val; }),
        setMonthlyError: vi.fn((val) => { context.monthlyError = val; }),
        setAllEarthquakes: vi.fn((val) => { context.allEarthquakes = val; }),
        setEarthquakesLast14Days: vi.fn((val) => { context.earthquakesLast14Days = val; }),
        setEarthquakesLast30Days: vi.fn((val) => { context.earthquakesLast30Days = val; }),
        setPrev7DayData: vi.fn((val) => { context.prev7DayData = val; }),
        setPrev14DayData: vi.fn((val) => { context.prev14DayData = val; }),
        loadMonthlyData: vi.fn(async () => {}), // Actual loadMonthlyData is returned by the hook, this is for other consumers if any
    });
    return context;
};

const createMockEarthquake = (id, timeOffsetDays, mag, title = 'Test Quake') => ({
    type: 'Feature', properties: { mag, place: 'Test Place', time: MOCKED_NOW - timeOffsetDays * 24 * 3600 * 1000, updated: MOCKED_NOW - timeOffsetDays * 24 * 3600 * 1000, url: `https://earthquake.usgs.gov/earthquakes/eventpage/test${id}`, detail: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/test${id}.geojson`, alert: null, status: 'reviewed', tsunami: 0, sig: Math.round(mag * 100), net: 'test', code: `test${id}`, ids: `,test${id},`, sources: ',test,', types: ',origin,phase-data,', magType: 'mw', type: 'earthquake', title, }, geometry: { type: 'Point', coordinates: [0, 0, 0] }, id: `test${id}`,
});

const mockMonthlyResponse = {
    type: 'FeatureCollection', metadata: { generated: MOCKED_NOW - 1000 * 60 * 60, url: USGS_API_URL_MONTH, title: 'USGS All Earthquakes, Past Month', status: 200, api: '1.10.3', count: 7 },
    features: [ createMockEarthquake('month1', 1, 5.5), createMockEarthquake('month2', 5, 4.0), createMockEarthquake('month3', 10, 6.0), createMockEarthquake('month4', 15, 3.0), createMockEarthquake('month5', 20, 5.2), createMockEarthquake('month6', 25, 2.5), createMockEarthquake('month7', 35, 5.8), ],
};

describe('useMonthlyEarthquakeData', () => {
    let currentTestMockContext;

    const renderHookWithContext = (hook, options = {}) => {
        const contextToUse = options.wrapperProps?.contextValue || currentTestMockContext;
        return renderHook(hook, {
            wrapper: ({ children }) => <EarthquakeDataContext.Provider value={contextToUse}>{children}</EarthquakeDataContext.Provider>,
            ...options,
        });
    };

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(MOCKED_NOW_DATE);
        mockFetchDataCb.mockReset();
        currentTestMockContext = createMockContextValue();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('loadMonthlyData Functionality (Successful Fetch)', () => {
        beforeEach(() => {
            mockFetchDataCb.mockResolvedValue({ ...mockMonthlyResponse });
        });

        it('should call context setters for loading states correctly during and after fetch', async () => {
            const { result } = renderHookWithContext(() => useMonthlyEarthquakeData(mockFetchDataCb));
            let loadPromise;
            act(() => { loadPromise = result.current.loadMonthlyData(); });
            
            expect(currentTestMockContext.setIsLoadingMonthly).toHaveBeenCalledWith(true);
            expect(currentTestMockContext.setHasAttemptedMonthlyLoad).toHaveBeenCalledWith(true);
            
            await act(async () => { await loadPromise; });

            expect(currentTestMockContext.setIsLoadingMonthly).toHaveBeenCalledWith(false);
            expect(currentTestMockContext.setMonthlyError).toHaveBeenCalledWith(null);
        });

        it('should call context setters to process and filter data correctly', async () => {
            const { result } = renderHookWithContext(() => useMonthlyEarthquakeData(mockFetchDataCb));
            await act(async () => { await result.current.loadMonthlyData(); });

            expect(currentTestMockContext.setAllEarthquakes).toHaveBeenCalledWith(mockMonthlyResponse.features);
            expect(currentTestMockContext.allEarthquakes.length).toBe(mockMonthlyResponse.features.length);

            expect(currentTestMockContext.setEarthquakesLast14Days).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'testmonth1' }), expect.objectContaining({ id: 'testmonth2' }), expect.objectContaining({ id: 'testmonth3' }),]));
            expect(currentTestMockContext.earthquakesLast14Days.length).toBe(3);

            expect(currentTestMockContext.setEarthquakesLast30Days).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'testmonth1' }), expect.objectContaining({ id: 'testmonth2' }), expect.objectContaining({ id: 'testmonth3' }), expect.objectContaining({ id: 'testmonth4' }), expect.objectContaining({ id: 'testmonth5' }), expect.objectContaining({ id: 'testmonth6' }),]));
            expect(currentTestMockContext.earthquakesLast30Days.length).toBe(6);
            
            expect(currentTestMockContext.setPrev7DayData).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'testmonth3' })]));
            expect(currentTestMockContext.prev7DayData.length).toBe(1);

            expect(currentTestMockContext.setPrev14DayData).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'testmonth4' }), expect.objectContaining({ id: 'testmonth5' }), expect.objectContaining({ id: 'testmonth6' }),]));
            expect(currentTestMockContext.prev14DayData.length).toBe(3);
        });

        describe('Major Quake Consolidation', () => {
            it('should set major quakes from monthly if context.lastMajorQuake is null', async () => {
                currentTestMockContext.lastMajorQuake = null;
                const { result } = renderHookWithContext(() => useMonthlyEarthquakeData(mockFetchDataCb));
                await act(async () => { await result.current.loadMonthlyData(); });

                expect(currentTestMockContext.setLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testmonth1' }));
                expect(currentTestMockContext.setPreviousMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testmonth3' }));
                const time1 = mockMonthlyResponse.features.find(f=>f.id === 'testmonth1').properties.time;
                const time3 = mockMonthlyResponse.features.find(f=>f.id === 'testmonth3').properties.time;
                expect(currentTestMockContext.setTimeBetweenPreviousMajorQuakes).toHaveBeenCalledWith(time1 - time3);
            });

            it('should update with monthly if monthly major quake is newer than context.lastMajorQuake', async () => {
                currentTestMockContext.lastMajorQuake = createMockEarthquake('currentMajor', 12, 7.0);
                const { result } = renderHookWithContext(() => useMonthlyEarthquakeData(mockFetchDataCb));
                await act(async () => { await result.current.loadMonthlyData(); });
                expect(currentTestMockContext.setLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testmonth1' }));
                expect(currentTestMockContext.setPreviousMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testmonth3' }));
            });

            it('should keep context.lastMajorQuake if it is newer than any in monthly', async () => {
                currentTestMockContext.lastMajorQuake = createMockEarthquake('superMajor', 0.5, 7.5);
                const { result } = renderHookWithContext(() => useMonthlyEarthquakeData(mockFetchDataCb));
                await act(async () => { await result.current.loadMonthlyData(); });
                expect(currentTestMockContext.setLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testsuperMajor' }));
                expect(currentTestMockContext.setPreviousMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testmonth1' }));
            });
            
            it('should correctly place context.lastMajorQuake if it is between monthly major quakes', async () => {
                currentTestMockContext.lastMajorQuake = createMockEarthquake('midMajor', 7, 6.2);
                const { result } = renderHookWithContext(() => useMonthlyEarthquakeData(mockFetchDataCb));
                await act(async () => { await result.current.loadMonthlyData(); });
                expect(currentTestMockContext.setLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testmonth1' }));
                expect(currentTestMockContext.setPreviousMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testmidMajor' }));
            });

            it('should handle no major quakes in monthly feed but context.lastMajorQuake exists', async () => {
                currentTestMockContext.lastMajorQuake = createMockEarthquake('onlyMajor', 10, 7.0);
                const noMajorMonthlyResponse = { ...mockMonthlyResponse, features: [createMockEarthquake('nonMajor', 1, 4.0)] };
                mockFetchDataCb.mockResolvedValue(noMajorMonthlyResponse);
                const { result } = renderHookWithContext(() => useMonthlyEarthquakeData(mockFetchDataCb));
                await act(async () => { await result.current.loadMonthlyData(); });
                expect(currentTestMockContext.setLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testonlyMajor' }));
                expect(currentTestMockContext.setPreviousMajorQuake).toHaveBeenCalledWith(null);
                expect(currentTestMockContext.setTimeBetweenPreviousMajorQuakes).toHaveBeenCalledWith(null);
            });
        });
    });

    describe('loadMonthlyData Functionality (Error Handling)', () => {
        it('should call setMonthlyError if fetch fails (network error)', async () => {
            mockFetchDataCb.mockRejectedValue(new Error("Network failure"));
            const { result } = renderHookWithContext(() => useMonthlyEarthquakeData(mockFetchDataCb));
            await act(async () => { await result.current.loadMonthlyData(); });
            expect(currentTestMockContext.setIsLoadingMonthly).toHaveBeenCalledWith(false);
            expect(currentTestMockContext.setMonthlyError).toHaveBeenCalledWith("Monthly Data Error: Network failure");
            expect(currentTestMockContext.allEarthquakes.length).toBe(0); // Data should be cleared
            expect(currentTestMockContext.setLastMajorQuake).not.toHaveBeenCalled();
        });

        it('should call setMonthlyError if response has no features', async () => {
            mockFetchDataCb.mockResolvedValue({ metadata: { generated: MOCKED_NOW }, features: [] });
            const { result } = renderHookWithContext(() => useMonthlyEarthquakeData(mockFetchDataCb));
            await act(async () => { await result.current.loadMonthlyData(); });
            expect(currentTestMockContext.setMonthlyError).toHaveBeenCalledWith("Monthly data is currently unavailable or incomplete.");
        });

        it('should call setMonthlyError if response has metadata error message', async () => {
            mockFetchDataCb.mockResolvedValue({ metadata: { errorMessage: "USGS server error" } });
            const { result } = renderHookWithContext(() => useMonthlyEarthquakeData(mockFetchDataCb));
            await act(async () => { await result.current.loadMonthlyData(); });
            expect(currentTestMockContext.setMonthlyError).toHaveBeenCalledWith("USGS server error");
        });
    });
});
