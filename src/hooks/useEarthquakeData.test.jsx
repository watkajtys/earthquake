import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { EarthquakeDataContext } from '../contexts/EarthquakeDataContext';
import useEarthquakeData from './useEarthquakeData';
import {
    USGS_API_URL_DAY,
    USGS_API_URL_WEEK,
    // REFRESH_INTERVAL_MS, // Not directly used in assertions after setInterval mock
    MAJOR_QUAKE_THRESHOLD,
    // ALERT_LEVELS, // Implicitly used by logic, not direct assertion
    INITIAL_LOADING_MESSAGES,
    // LOADING_MESSAGE_INTERVAL_MS // Not directly used in assertions
} from '../constants/appConstants';

const mockFetchDataCb = vi.fn();
const MOCKED_NOW = 1700000000000;

const createMockContextValue = () => {
    const context = {}; // Object to be populated and returned

    Object.assign(context, {
        lastMajorQuake: null,
        previousMajorQuake: null,
        timeBetweenPreviousMajorQuakes: null,
        isInitialAppLoad: true,
        isLoadingDaily: true,
        isLoadingWeekly: true,
        currentLoadingMessage: INITIAL_LOADING_MESSAGES[0],
        error: null,
        dataFetchTime: null,
        lastUpdated: null,
        earthquakesLastHour: [],
        earthquakesPriorHour: [],
        earthquakesLast24Hours: [],
        earthquakesLast72Hours: [],
        earthquakesLast7Days: [],
        prev24HourData: [],
        globeEarthquakes: [],
        hasRecentTsunamiWarning: false,
        highestRecentAlert: null,
        activeAlertTriggeringQuakes: [],
        isLoadingMonthly: false,
        hasAttemptedMonthlyLoad: false,
        monthlyError: null,
        allEarthquakes: [],
        earthquakesLast14Days: [],
        earthquakesLast30Days: [],
        prev7DayData: [],
        prev14DayData: [],

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
        loadMonthlyData: vi.fn(async () => {}),
    });
    return context;
};

const createMockEarthquake = (id, timeOffsetHours, mag, tsunami = 0, alert = null, title = 'Test Quake') => ({
    type: 'Feature', properties: { mag, place: 'Test Place', time: MOCKED_NOW - timeOffsetHours * 3600 * 1000, updated: MOCKED_NOW - timeOffsetHours * 3600 * 1000, tz: null, url: `https://earthquake.usgs.gov/earthquakes/eventpage/test${id}`, detail: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/test${id}.geojson`, felt: null, cdi: null, mmi: null, alert, status: 'reviewed', tsunami, sig: Math.round(mag * 100), net: 'test', code: `test${id}`, ids: `,test${id},`, sources: ',test,', types: ',origin,phase-data,', nst: Math.round(mag * 10), dmin: mag / 10, rms: mag / 20, gap: Math.round(90 / mag), magType: 'mw', type: 'earthquake', title, }, geometry: { type: 'Point', coordinates: [0, 0, 0], }, id: `test${id}`,
});

const mockDailyResponse = { type: 'FeatureCollection', metadata: { generated: MOCKED_NOW - 1000 * 60 * 5, url: USGS_API_URL_DAY, title: 'USGS All Earthquakes, Past Day', status: 200, api: '1.10.3', count: 5, }, features: [ createMockEarthquake('day1', 0.5, 2.5, 0, 'green'), createMockEarthquake('day2', 1.5, 4.5, 1, 'yellow'), createMockEarthquake('day3', 10, 5.0, 0, 'orange'), createMockEarthquake('day4', 23, 1.0), createMockEarthquake('day5', 25, 6.0, 0, 'red'), ], };
const mockWeeklyResponse = { type: 'FeatureCollection', metadata: { generated: MOCKED_NOW - 1000 * 60 * 30, url: USGS_API_URL_WEEK, title: 'USGS All Earthquakes, Past Week', status: 200, api: '1.10.3', count: 5, }, features: [ createMockEarthquake('week1', 0.8, 3.0), createMockEarthquake('week2', 26, 2.0), createMockEarthquake('week3', 49, 6.5, 0, 'red'), createMockEarthquake('week4', 70, 1.5), createMockEarthquake('week5', 7 * 24 - 1, 0.5), createMockEarthquake('week6', 8 * 24, 7.0), ], };

describe('useEarthquakeData', () => {
    let mockSetIntervalFn;
    let mockClearIntervalFn;
    let currentTestMockContext; 

    const TestWrapper = ({ children, contextValue }) => (
        <EarthquakeDataContext.Provider value={contextValue || currentTestMockContext}>
            {children}
        </EarthquakeDataContext.Provider>
    );

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(MOCKED_NOW));
        mockFetchDataCb.mockReset();
        currentTestMockContext = createMockContextValue();

        mockSetIntervalFn = vi.spyOn(global, 'setInterval').mockImplementation(() => 123456789);
        mockClearIntervalFn = vi.spyOn(global, 'clearInterval').mockImplementation(() => {});
    });

    afterEach(() => {
        mockSetIntervalFn.mockRestore();
        mockClearIntervalFn.mockRestore();
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    const renderHookWithContext = (hook, options = {}) => {
        const contextToUse = options.wrapperProps?.contextValue || currentTestMockContext;
        return renderHook(hook, {
            wrapper: ({ children }) => <EarthquakeDataContext.Provider value={contextToUse}>{children}</EarthquakeDataContext.Provider>,
            ...options,
        });
    };

    describe('Initial Loading States', () => {
        it('should reflect initial context state for loading flags', () => {
            const neverResolvingFetchCb = vi.fn(() => new Promise(() => {}));
            renderHookWithContext(() => useEarthquakeData(neverResolvingFetchCb));
            expect(currentTestMockContext.isInitialAppLoad).toBe(true);
            expect(currentTestMockContext.isLoadingDaily).toBe(true); 
            expect(currentTestMockContext.isLoadingWeekly).toBe(true); 
        });

        it('should call setCurrentLoadingMessage with the initial message', () => {
            const neverResolvingFetchCb = vi.fn(() => new Promise(() => {}));
            renderHookWithContext(() => useEarthquakeData(neverResolvingFetchCb));
            expect(currentTestMockContext.setCurrentLoadingMessage).toHaveBeenCalledWith(INITIAL_LOADING_MESSAGES[0]);
        });
    });

    describe('Successful Data Fetch & Processing', () => {
        beforeEach(() => {
            mockFetchDataCb.mockImplementation(async (url) => {
                if (url === USGS_API_URL_DAY) return { ...mockDailyResponse };
                if (url === USGS_API_URL_WEEK) return { ...mockWeeklyResponse };
                return { features: [], metadata: { generated: MOCKED_NOW } };
            });
        });

        it('should set loading states to false and error to null via context', async () => {
            renderHookWithContext(() => useEarthquakeData(mockFetchDataCb));
            await act(async () => { await vi.runAllTimersAsync(); });
            expect(currentTestMockContext.setIsInitialAppLoad).toHaveBeenCalledWith(false);
            expect(currentTestMockContext.setIsLoadingDaily).toHaveBeenCalledWith(false);
            expect(currentTestMockContext.setIsLoadingWeekly).toHaveBeenCalledWith(false);
            expect(currentTestMockContext.setError).toHaveBeenCalledWith(null);
        });

        it('should set dataFetchTime and lastUpdated correctly via context', async () => {
            renderHookWithContext(() => useEarthquakeData(mockFetchDataCb));
            await act(async () => { await vi.runAllTimersAsync(); });
            expect(currentTestMockContext.setDataFetchTime).toHaveBeenCalledWith(MOCKED_NOW);
            expect(currentTestMockContext.setLastUpdated).toHaveBeenCalledWith(new Date(mockDailyResponse.metadata.generated).toLocaleString());
        });

        it('should call setEarthquakesLastHour with filtered data', async () => {
            renderHookWithContext(() => useEarthquakeData(mockFetchDataCb));
            await act(async () => { await vi.runAllTimersAsync(); });
            expect(currentTestMockContext.setEarthquakesLastHour).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'testday1' })]));
            expect(currentTestMockContext.earthquakesLastHour.length).toBe(1);
        });

        it('should call setEarthquakesPriorHour with filtered data', async () => {
            renderHookWithContext(() => useEarthquakeData(mockFetchDataCb));
            await act(async () => { await vi.runAllTimersAsync(); });
            expect(currentTestMockContext.setEarthquakesPriorHour).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'testday2' })]));
            expect(currentTestMockContext.earthquakesPriorHour.length).toBe(1);
        });

        it('should call setEarthquakesLast24Hours with filtered data', async () => {
            renderHookWithContext(() => useEarthquakeData(mockFetchDataCb));
            await act(async () => { await vi.runAllTimersAsync(); });
            expect(currentTestMockContext.setEarthquakesLast24Hours).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'testday1' }), expect.objectContaining({ id: 'testday2' }), expect.objectContaining({ id: 'testday3' }), expect.objectContaining({ id: 'testday4' }),]));
            expect(currentTestMockContext.earthquakesLast24Hours.length).toBe(4);
        });
        
        it('should call setEarthquakesLast72Hours (from weekly) with filtered data', async () => {
            renderHookWithContext(() => useEarthquakeData(mockFetchDataCb));
            await act(async () => { await vi.runAllTimersAsync(); });
            expect(currentTestMockContext.setEarthquakesLast72Hours).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'testweek1' }), expect.objectContaining({ id: 'testweek2' }), expect.objectContaining({ id: 'testweek3' }), expect.objectContaining({ id: 'testweek4' }),]));
            expect(currentTestMockContext.earthquakesLast72Hours.length).toBe(4);
        });

        it('should call setEarthquakesLast7Days (from weekly) with filtered data', async () => {
            renderHookWithContext(() => useEarthquakeData(mockFetchDataCb));
            await act(async () => { await vi.runAllTimersAsync(); });
            expect(currentTestMockContext.setEarthquakesLast7Days).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'testweek1' }), expect.objectContaining({ id: 'testweek2' }), expect.objectContaining({ id: 'testweek3' }), expect.objectContaining({ id: 'testweek4' }), expect.objectContaining({ id: 'testweek5' }),]));
            expect(currentTestMockContext.earthquakesLast7Days.length).toBe(5);
        });

        it('should call setPrev24HourData (24-48h ago from weekly) with filtered data', async () => {
            renderHookWithContext(() => useEarthquakeData(mockFetchDataCb));
            await act(async () => { await vi.runAllTimersAsync(); });
            expect(currentTestMockContext.setPrev24HourData).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'testweek2' })]));
            expect(currentTestMockContext.prev24HourData.length).toBe(1);
        });

        it('should call setGlobeEarthquakes with processed data', async () => {
            renderHookWithContext(() => useEarthquakeData(mockFetchDataCb));
            await act(async () => { await vi.runAllTimersAsync(); });
            const expectedGlobeQuakes = [expect.objectContaining({ id: 'testweek3'}), expect.objectContaining({ id: 'testweek1'}), expect.objectContaining({ id: 'testweek2'}), expect.objectContaining({ id: 'testweek4'}),];
            expect(currentTestMockContext.setGlobeEarthquakes).toHaveBeenCalledWith(expectedGlobeQuakes);
            expect(currentTestMockContext.globeEarthquakes.length).toBe(4);
        });

        it('should call setHasRecentTsunamiWarning correctly', async () => {
            renderHookWithContext(() => useEarthquakeData(mockFetchDataCb));
            await act(async () => { await vi.runAllTimersAsync(); });
            expect(currentTestMockContext.setHasRecentTsunamiWarning).toHaveBeenCalledWith(true);

            const noTsunamiDaily = { ...mockDailyResponse, features: mockDailyResponse.features.map(f => ({...f, properties: {...f.properties, tsunami: 0}})) };
            mockFetchDataCb.mockImplementation(async (url) => url === USGS_API_URL_DAY ? noTsunamiDaily : { ...mockWeeklyResponse });
            const freshContext = createMockContextValue();
            renderHookWithContext(() => useEarthquakeData(mockFetchDataCb), { wrapperProps: { contextValue: freshContext }});
            await act(async () => { await vi.runAllTimersAsync(); });
            expect(freshContext.setHasRecentTsunamiWarning).toHaveBeenCalledWith(false);
        });

        it('should call setHighestRecentAlert and setActiveAlertTriggeringQuakes correctly', async () => {
            renderHookWithContext(() => useEarthquakeData(mockFetchDataCb));
            await act(async () => { await vi.runAllTimersAsync(); });
            expect(currentTestMockContext.setHighestRecentAlert).toHaveBeenCalledWith('orange');
            expect(currentTestMockContext.setActiveAlertTriggeringQuakes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'testday3' })]));
            expect(currentTestMockContext.activeAlertTriggeringQuakes.length).toBe(1);

            const greenAlertsDaily = { ...mockDailyResponse, features: mockDailyResponse.features.map(f => ({...f, properties: {...f.properties, alert: 'green'}})) };
            mockFetchDataCb.mockImplementation(async (url) => url === USGS_API_URL_DAY ? greenAlertsDaily : { ...mockWeeklyResponse });
            const freshContext = createMockContextValue();
            renderHookWithContext(() => useEarthquakeData(mockFetchDataCb), { wrapperProps: { contextValue: freshContext }});
            await act(async () => { await vi.runAllTimersAsync(); });
            expect(freshContext.setHighestRecentAlert).toHaveBeenCalledWith(null);
            expect(freshContext.setActiveAlertTriggeringQuakes).toHaveBeenCalledWith([]);
        });

        describe('Major Quake Logic', () => {
            it('should call setLastMajorQuake, setPreviousMajorQuake, setTimeBetweenPreviousMajorQuakes correctly', async () => {
                renderHookWithContext(() => useEarthquakeData(mockFetchDataCb));
                await act(async () => { await vi.runAllTimersAsync(); });
                const day2 = mockDailyResponse.features.find(f => f.id === 'testday2');
                const day3 = mockDailyResponse.features.find(f => f.id === 'testday3');
                expect(currentTestMockContext.setLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testday2' }));
                expect(currentTestMockContext.setPreviousMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testday3' }));
                expect(currentTestMockContext.setTimeBetweenPreviousMajorQuakes).toHaveBeenCalledWith(day2.properties.time - day3.properties.time);
            });

            it('should handle scenario with only one major quake', async () => {
                const singleMajorDaily = { ...mockDailyResponse, features: [createMockEarthquake('singleMajor', 5, MAJOR_QUAKE_THRESHOLD + 0.5)] };
                const emptyWeekly = {...mockWeeklyResponse, features: []};
                mockFetchDataCb.mockImplementation(async (url) => url === USGS_API_URL_DAY ? singleMajorDaily : emptyWeekly);
                const freshContext = createMockContextValue();
                renderHookWithContext(() => useEarthquakeData(mockFetchDataCb), { wrapperProps: { contextValue: freshContext }});
                await act(async () => { await vi.runAllTimersAsync(); });
                expect(freshContext.setLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testsingleMajor' }));
                expect(freshContext.setPreviousMajorQuake).toHaveBeenCalledWith(null);
                expect(freshContext.setTimeBetweenPreviousMajorQuakes).toHaveBeenCalledWith(null);
            });

            it('should handle no major quakes', async () => {
                const noMajorDaily = { ...mockDailyResponse, features: mockDailyResponse.features.filter(f => f.properties.mag < MAJOR_QUAKE_THRESHOLD) };
                const noMajorWeekly = { ...mockWeeklyResponse, features: mockWeeklyResponse.features.filter(f => f.properties.mag < MAJOR_QUAKE_THRESHOLD) };
                mockFetchDataCb.mockImplementation(async (url) => url === USGS_API_URL_DAY ? noMajorDaily : noMajorWeekly);
                const freshContext = createMockContextValue();
                renderHookWithContext(() => useEarthquakeData(mockFetchDataCb), { wrapperProps: { contextValue: freshContext }});
                await act(async () => { await vi.runAllTimersAsync(); });
                expect(freshContext.setLastMajorQuake).toHaveBeenCalledWith(null);
                expect(freshContext.setPreviousMajorQuake).toHaveBeenCalledWith(null);
                expect(freshContext.setTimeBetweenPreviousMajorQuakes).toHaveBeenCalledWith(null);
            });
        });
    });

    describe('Error Handling', () => {
        it('should call setError if daily fetch fails, but still process weekly', async () => {
            mockFetchDataCb.mockImplementation(async (url) => {
                if (url === USGS_API_URL_DAY) return { metadata: { errorMessage: 'Daily fetch failed' } };
                return { ...mockWeeklyResponse };
            });
            renderHookWithContext(() => useEarthquakeData(mockFetchDataCb));
            await act(async () => { await vi.runAllTimersAsync(); });
            expect(currentTestMockContext.setError).toHaveBeenCalledWith('Daily data error: Daily fetch failed. Some features may be affected.');
            expect(currentTestMockContext.earthquakesLast72Hours.length).toBeGreaterThan(0); // Weekly data processed
            expect(currentTestMockContext.earthquakesLastHour.length).toBe(0); 
        });
        
        it('should set error state if weekly fetch fails, but still process daily', async () => {
            mockFetchDataCb.mockImplementation(async (url) => {
                if (url === USGS_API_URL_DAY) return { ...mockDailyResponse };
                if (url === USGS_API_URL_WEEK) return { metadata: { errorMessage: 'Weekly fetch failed' } };
                return { features: [] };
            });
            renderHookWithContext(() => useEarthquakeData(mockFetchDataCb));
            await act(async () => { await vi.runAllTimersAsync(); });
            expect(currentTestMockContext.setError).toHaveBeenCalledWith('Weekly data error: Weekly fetch failed. Some features may be affected.');
            expect(currentTestMockContext.earthquakesLastHour.length).toBeGreaterThan(0);
            expect(currentTestMockContext.earthquakesLast72Hours.length).toBe(0);
        });

        it('should set a generic error if both fetches fail', async () => {
            mockFetchDataCb.mockImplementation(async (url) => ({ metadata: { errorMessage: 'Fetch failed for ' + url } }));
            renderHookWithContext(() => useEarthquakeData(mockFetchDataCb));
            await act(async () => { await vi.runAllTimersAsync(); });
            expect(currentTestMockContext.setError).toHaveBeenCalledWith("Failed to fetch critical earthquake data. Some features may be unavailable.");
        });

        it('should handle network/exception errors during fetch', async () => {
            mockFetchDataCb.mockImplementation(async (url) => {
                if (url === USGS_API_URL_DAY) throw new Error("Network error daily");
                return { ...mockWeeklyResponse };
            });
            renderHookWithContext(() => useEarthquakeData(mockFetchDataCb));
            await act(async () => { await vi.runAllTimersAsync(); });
            expect(currentTestMockContext.setError).toHaveBeenCalledWith("Daily data error: Network error daily. Some features may be affected.");
        });
    });
    
    describe('Refresh Cycle', () => {
        beforeEach(() => {
            mockFetchDataCb.mockImplementation(async (url) => {
                if (url === USGS_API_URL_DAY) return { ...mockDailyResponse };
                if (url === USGS_API_URL_WEEK) return { ...mockWeeklyResponse };
                return { features: [], metadata: { generated: MOCKED_NOW } };
            });
        });
        it.skip('should refetch data after REFRESH_INTERVAL_MS');
        it.skip('should preserve lastMajorQuake and previousMajorQuake across refreshes if no newer ones arrive');
        it.skip('should update lastMajorQuake if a newer one arrives during refresh');
        
        it('isInitialAppLoad (from context) should be false after the first load cycle', async () => {
            renderHookWithContext(() => useEarthquakeData(mockFetchDataCb));
            await act(async () => { await vi.runAllTimersAsync(); });
            expect(currentTestMockContext.setIsInitialAppLoad).toHaveBeenCalledWith(false);
        });
        it.skip('should not show initial loading messages again on refresh');

        describe('Additional Major Quake Scenarios', () => {
            it('Test Case: Multiple major quakes in daily, one in weekly, daily provides both last and previous.', async () => {
                const dailyQuakes = [ createMockEarthquake('D1', 1, MAJOR_QUAKE_THRESHOLD + 0.5), createMockEarthquake('D2', 5, MAJOR_QUAKE_THRESHOLD + 0.6), createMockEarthquake('D_non_major', 0.5, MAJOR_QUAKE_THRESHOLD -1) ];
                const weeklyQuakes = [ createMockEarthquake('W1', 10, MAJOR_QUAKE_THRESHOLD + 1.5) ];
                mockFetchDataCb.mockImplementation(async (url) => url === USGS_API_URL_DAY ? { features: dailyQuakes, metadata: { generated: MOCKED_NOW } } : { features: weeklyQuakes, metadata: { generated: MOCKED_NOW } });
                const freshContext = createMockContextValue();
                renderHookWithContext(() => useEarthquakeData(mockFetchDataCb), { wrapperProps: { contextValue: freshContext }});
                await act(async () => { await vi.runAllTimersAsync(); });
                expect(freshContext.setLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testD1' }));
                expect(freshContext.setPreviousMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testD2' }));
            });

            it('Test Case: Last major from weekly, previous from daily.', async () => {
                const dailyQuakes = [ createMockEarthquake('D1', 5, MAJOR_QUAKE_THRESHOLD + 0.5) ];
                const weeklyQuakes = [ createMockEarthquake('W1', 1, MAJOR_QUAKE_THRESHOLD + 1.5) ];
                mockFetchDataCb.mockImplementation(async (url) => url === USGS_API_URL_DAY ? { features: dailyQuakes, metadata: { generated: MOCKED_NOW } } : { features: weeklyQuakes, metadata: { generated: MOCKED_NOW } });
                const freshContext = createMockContextValue();
                renderHookWithContext(() => useEarthquakeData(mockFetchDataCb), { wrapperProps: { contextValue: freshContext }});
                await act(async () => { await vi.runAllTimersAsync(); });
                expect(freshContext.setLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testW1' }));
                expect(freshContext.setPreviousMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testD1' }));
            });

            it('Test Case: Last major from daily, previous from weekly.', async () => {
                const dailyQuakes = [ createMockEarthquake('D1', 1, MAJOR_QUAKE_THRESHOLD + 0.5), createMockEarthquake('D2', 10, MAJOR_QUAKE_THRESHOLD + 0.1) ];
                const weeklyQuakes = [ createMockEarthquake('W1', 5, MAJOR_QUAKE_THRESHOLD + 1.5) ];
                mockFetchDataCb.mockImplementation(async (url) => url === USGS_API_URL_DAY ? { features: dailyQuakes, metadata: { generated: MOCKED_NOW } } : { features: weeklyQuakes, metadata: { generated: MOCKED_NOW } });
                const freshContext = createMockContextValue();
                renderHookWithContext(() => useEarthquakeData(mockFetchDataCb), { wrapperProps: { contextValue: freshContext }});
                await act(async () => { await vi.runAllTimersAsync(); });
                expect(freshContext.setLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testD1' }));
                expect(freshContext.setPreviousMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testW1' }));
            });
        });
    });
});
