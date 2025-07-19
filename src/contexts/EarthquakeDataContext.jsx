// src/contexts/EarthquakeDataContext.jsx
import React, { useContext, useEffect, useCallback, useMemo, useReducer, useRef } from 'react'; // Removed createContext, Added useRef
import { fetchUsgsData } from '../services/usgsApiService';
import {
    USGS_API_URL_DAY,
    USGS_API_URL_WEEK,
    USGS_API_URL_MONTH,
    REFRESH_INTERVAL_MS,
    FEELABLE_QUAKE_THRESHOLD,
    MAJOR_QUAKE_THRESHOLD,
    // ALERT_LEVELS, // Moved to utils as it's used by reducer
    INITIAL_LOADING_MESSAGES, // This is part of initialState from utils
    LOADING_MESSAGE_INTERVAL_MS
} from '../constants/appConstants';
// import { getMagnitudeColor } from '../utils/utils.js'; // Not directly used in Provider, but in utils by reducer helpers

// Import helpers, reducer, initialState, and actionTypes from the new utils file
import {
    earthquakeReducer,
    initialState, // This now comes from utils
    actionTypes,
    // Specific helpers used by the Provider itself (if any)
    // filterByTime, // Used by reducer
    // filterMonthlyByTime, // Used by reducer
    // consolidateMajorQuakesLogic, // Used by reducer
    // sampleArray, // Used by reducer
    // sampleArrayWithPriority, // Used by reducer
    // SCATTER_SAMPLING_THRESHOLD_7_DAYS, // Used by reducer
    // SCATTER_SAMPLING_THRESHOLD_14_DAYS, // Used by reducer
    // SCATTER_SAMPLING_THRESHOLD_30_DAYS, // Used by reducer
    // MAGNITUDE_RANGES, // Used by reducer
    // formatDateForTimeline, // Used by reducer
    // getInitialDailyCounts, // Used by reducer
    // calculateMagnitudeDistribution // Used by reducer
} from './earthquakeDataContextUtils.js';
import { EarthquakeDataContext } from './earthquakeDataContextUtils.js'; // Import the context
import { isValidGeoJson, isValidFeatureArray } from '../utils/geoJsonUtils.js'; // Added isValidFeatureArray

/**
 * @typedef {object} EarthquakeDataProviderProps
 * @property {React.ReactNode} children - The child components that will have access to the earthquake data context.
 */

/**
 * Provides earthquake data to its child components through context.
 * It fetches, processes, and manages earthquake data, prioritizing a D1 database source
 * via the `/api/get-earthquakes` endpoint, and falling back to the USGS API (via `usgsApiService`)
 * if D1 is unavailable or fails.
 * The context value also includes `dailyDataSource`, `weeklyDataSource`, and `monthlyDataSource`
 * to indicate the origin of the respective data sets.
 *
 * @param {EarthquakeDataProviderProps} props - The props for the EarthquakeDataProvider.
 * @returns {JSX.Element} The EarthquakeDataProvider component.
 */
export const EarthquakeDataProvider = ({ children }) => {
    const [state, dispatch] = useReducer(earthquakeReducer, initialState);
    const dataCacheRef = useRef({}); // Initialize cache

    /**
     * Helper function to fetch earthquake data from the D1 database via the internal API.
     * @async
     * @param {('day'|'week'|'month')} timeWindow - The time window for which to fetch data.
     * @returns {Promise<{data: Array<object>|null, source: ('D1'|'D1_failed'), error: string|null}>}
     *          An object containing the fetched data (array of GeoJSON features), the source, and any error message.
     */
    const fetchFromD1 = async (timeWindow) => {
        try {
            const response = await fetch(`/api/get-earthquakes?timeWindow=${timeWindow}`);
            if (response.ok && response.headers.get('X-Data-Source') === 'D1') {
                const data = await response.json(); // Expecting an array of features
                if (isValidFeatureArray(data)) {
                    return { data, source: 'D1', error: null };
                } else {
                    // console.warn(`D1 returned invalid feature array for ${timeWindow}:`, data);
                    return { data: null, source: 'D1_failed', error: 'D1 returned invalid feature array.' };
                }
            }
            const errorText = await response.text();
            // console.warn(`Failed to fetch from D1 for ${timeWindow} or invalid response: ${response.status} ${errorText}`);
            return { data: null, source: 'D1_failed', error: `Failed to fetch from D1: ${response.status} ${errorText}` };
        } catch (error) {
            // console.error(`Error fetching from D1 for ${timeWindow}:`, error);
            return { data: null, source: 'D1_failed', error: error.message };
        }
    };

    /**
     * Fetches and processes daily and weekly earthquake data.
     * It first attempts to fetch data from the D1 database via the `/api/get-earthquakes` endpoint.
     * If the D1 fetch is successful, `dailyDataSource` and `weeklyDataSource` are set to 'D1'.
     * If the D1 fetch fails or returns an invalid response, it falls back to fetching data
     * from the USGS API via `fetchUsgsData`. In this case, `dailyDataSource` and `weeklyDataSource`
     * are set to 'USGS'.
     * Manages loading states and aggregates errors from both potential sources.
     * This function is typically called on initial application load and on a set refresh interval.
     * @async
     * @param {boolean} [isInitialFetch=false] - Indicates if this is the first data fetch attempt.
     * @returns {Promise<void>} A promise that resolves when the data fetch and processing are complete.
     */
    const performDataFetch = useCallback(async (isInitialFetch = false) => {
        dispatch({ type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingDaily: true, isLoadingWeekly: true } });
        if (!isInitialFetch) {
            dispatch({ type: actionTypes.SET_ERROR, payload: { error: null } });
        }

        const nowForFiltering = Date.now(); // Timestamp for data processing logic (e.g. filtering by time)
        const currentTimestamp = Date.now(); // Timestamp for cache entry validity

        let dailyErrorMsg = null, weeklyErrorMsg = null;
        let dailyDataSource = null, weeklyDataSource = null;
        let dailyDataSkippedDueToCache = false;
        let weeklyDataSkippedDueToCache = false;

        const CACHE_KEY_DAILY = 'day';
        const CACHE_KEY_WEEKLY = 'week';

        // --- Daily Data Fetching ---
        if (dataCacheRef.current[CACHE_KEY_DAILY] && (currentTimestamp - dataCacheRef.current[CACHE_KEY_DAILY].timestamp < REFRESH_INTERVAL_MS)) {
            // console.log("Serving daily data from cache");
            const cachedEntry = dataCacheRef.current[CACHE_KEY_DAILY];
            dispatch({
                type: actionTypes.DAILY_DATA_PROCESSED,
                payload: { ...cachedEntry.data, fetchTime: cachedEntry.data.fetchTime }
            });
            dailyDataSource = cachedEntry.data.dataSource;
            dailyDataSkippedDueToCache = true;
        } else {
            const d1DailyResponse = await fetchFromD1('day');
            if (d1DailyResponse.source === 'D1') {
                // console.log("Successfully fetched daily data from D1");
                const processedData = { features: d1DailyResponse.data, metadata: null, fetchTime: nowForFiltering, dataSource: 'D1' };
                dispatch({ type: actionTypes.DAILY_DATA_PROCESSED, payload: processedData });
                dataCacheRef.current[CACHE_KEY_DAILY] = { data: processedData, timestamp: currentTimestamp };
                dailyDataSource = 'D1';
            } else {
                // console.warn("Failed to fetch daily data from D1, falling back to USGS.", d1DailyResponse.error);
                dailyErrorMsg = `D1 Error (Daily): ${d1DailyResponse.error || 'Unknown D1 error'}. `;
                try {
                    const usgsDailyRes = await fetchUsgsData(USGS_API_URL_DAY);
                    if (usgsDailyRes.error || !isValidGeoJson(usgsDailyRes)) {
                        dailyErrorMsg += `USGS Error (Daily): ${usgsDailyRes?.error?.message || 'Daily USGS data features missing or invalid.'}`;
                    } else {
                        const processedData = { features: usgsDailyRes.features, metadata: usgsDailyRes.metadata, fetchTime: nowForFiltering, dataSource: 'USGS' };
                        dispatch({ type: actionTypes.DAILY_DATA_PROCESSED, payload: processedData });
                        dataCacheRef.current[CACHE_KEY_DAILY] = { data: processedData, timestamp: currentTimestamp };
                        dailyDataSource = 'USGS';
                        dailyErrorMsg = null;
                    }
                } catch (e) {
                    dailyErrorMsg += `USGS Fetch Error (Daily): ${e.message || 'Error fetching daily USGS data.'}`;
                }
            }
        }
        dispatch({ type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingDaily: false } });

        // --- Weekly Data Fetching ---
        if (dataCacheRef.current[CACHE_KEY_WEEKLY] && (currentTimestamp - dataCacheRef.current[CACHE_KEY_WEEKLY].timestamp < REFRESH_INTERVAL_MS)) {
            // console.log("Serving weekly data from cache");
            const cachedEntry = dataCacheRef.current[CACHE_KEY_WEEKLY];
            dispatch({
                type: actionTypes.WEEKLY_DATA_PROCESSED,
                payload: { ...cachedEntry.data, fetchTime: cachedEntry.data.fetchTime }
            });
            weeklyDataSource = cachedEntry.data.dataSource;
            weeklyDataSkippedDueToCache = true;
        } else {
            const d1WeeklyResponse = await fetchFromD1('week');
            if (d1WeeklyResponse.source === 'D1') {
                // console.log("Successfully fetched weekly data from D1");
                const processedData = { features: d1WeeklyResponse.data, fetchTime: nowForFiltering, dataSource: 'D1' };
                dispatch({ type: actionTypes.WEEKLY_DATA_PROCESSED, payload: processedData });
                dataCacheRef.current[CACHE_KEY_WEEKLY] = { data: processedData, timestamp: currentTimestamp };
                weeklyDataSource = 'D1';
            } else {
                // console.warn("Failed to fetch weekly data from D1, falling back to USGS.", d1WeeklyResponse.error);
                weeklyErrorMsg = `D1 Error (Weekly): ${d1WeeklyResponse.error || 'Unknown D1 error'}. `;
                try {
                    const usgsWeeklyRes = await fetchUsgsData(USGS_API_URL_WEEK);
                    if (usgsWeeklyRes.error || !isValidGeoJson(usgsWeeklyRes)) {
                        weeklyErrorMsg += `USGS Error (Weekly): ${usgsWeeklyRes?.error?.message || 'Weekly USGS data features missing or invalid.'}`;
                    } else {
                        const processedData = { features: usgsWeeklyRes.features, fetchTime: nowForFiltering, dataSource: 'USGS' };
                        dispatch({ type: actionTypes.WEEKLY_DATA_PROCESSED, payload: processedData });
                        dataCacheRef.current[CACHE_KEY_WEEKLY] = { data: processedData, timestamp: currentTimestamp };
                        weeklyDataSource = 'USGS';
                        weeklyErrorMsg = null;
                    }
                } catch (e) {
                    weeklyErrorMsg += `USGS Fetch Error (Weekly): ${e.message || 'Error fetching weekly USGS data.'}`;
                }
            }
        }
        dispatch({ type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingWeekly: false } });

        // --- Error Aggregation ---
        // --- Error Aggregation ---
        let finalErrorMsg = null;
        // Check if data was successfully obtained, considering cache usage
        const dailyDataTrulyMissing = !dailyDataSource && !dailyDataSkippedDueToCache;
        const weeklyDataTrulyMissing = !weeklyDataSource && !weeklyDataSkippedDueToCache;

        if (dailyErrorMsg && dailyDataTrulyMissing && weeklyErrorMsg && weeklyDataTrulyMissing) {
            finalErrorMsg = `Daily & Weekly Data Errors: ${dailyErrorMsg} ${weeklyErrorMsg}`;
        } else if (dailyErrorMsg && dailyDataTrulyMissing) {
            finalErrorMsg = `Daily Data Error: ${dailyErrorMsg}`; // Added prefix
        } else if (weeklyErrorMsg && weeklyDataTrulyMissing) {
            finalErrorMsg = `Weekly Data Error: ${weeklyErrorMsg}`; // Added prefix
        }

        if (finalErrorMsg) {
            dispatch({ type: actionTypes.SET_ERROR, payload: { error: finalErrorMsg.trim() } });
        } else if (dailyDataTrulyMissing && weeklyDataTrulyMissing) {
            // This case implies no specific error messages were generated, but data is still missing.
            dispatch({ type: actionTypes.SET_ERROR, payload: { error: "Failed to load any daily or weekly data, and cache was not used." } });
        } else if (dailyDataTrulyMissing) {
            dispatch({ type: actionTypes.SET_ERROR, payload: { error: "Failed to load daily data." } });
        } else if (weeklyDataTrulyMissing) {
            dispatch({ type: actionTypes.SET_ERROR, payload: { error: "Failed to load weekly data." } });
        }


    }, [dispatch]); // dispatch is stable

    // --- Monthly Data Fetching Logic ---
    // Renamed from loadMonthlyData to fetchMonthlyDataInternal - MOVED EARLIER
    const fetchMonthlyDataInternal = useCallback(async () => {
        const CACHE_KEY_MONTH = 'month';
        const now = Date.now();

        // Check cache first
        if (dataCacheRef.current[CACHE_KEY_MONTH]) {
            const cachedEntry = dataCacheRef.current[CACHE_KEY_MONTH];
            // Cache is valid if fetched within REFRESH_INTERVAL_MS
            if (now - cachedEntry.timestamp < REFRESH_INTERVAL_MS) {
                // console.log("Serving monthly data from cache");
                dispatch({ type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingMonthly: true, hasAttemptedMonthlyLoad: true } });
                dispatch({
                    type: actionTypes.MONTHLY_DATA_PROCESSED,
                    payload: { ...cachedEntry.data, fetchTime: cachedEntry.data.fetchTime } // Use cached fetchTime for consistency
                });
                dispatch({ type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingMonthly: false } });
                return;
            }
        }

        dispatch({ type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingMonthly: true, hasAttemptedMonthlyLoad: true } });
        dispatch({ type: actionTypes.SET_ERROR, payload: { monthlyError: null } });

        const nowForFiltering = Date.now(); // This is for data processing, not cache timestamp
        let monthlyFetchError = null;
        let monthlyDataSource = null;

        const d1MonthlyResponse = await fetchFromD1('month');
        if (d1MonthlyResponse.source === 'D1') {
            // console.log("Successfully fetched monthly data from D1");
            const processedData = { features: d1MonthlyResponse.data, fetchTime: nowForFiltering, dataSource: 'D1' };
            dispatch({
                type: actionTypes.MONTHLY_DATA_PROCESSED,
                payload: processedData
            });
            dataCacheRef.current[CACHE_KEY_MONTH] = { data: processedData, timestamp: Date.now() };
            monthlyDataSource = 'D1';
        } else {
            // console.warn("Failed to fetch monthly data from D1, falling back to USGS.", d1MonthlyResponse.error);
            monthlyFetchError = `D1 Error (Monthly): ${d1MonthlyResponse.error || 'Unknown D1 error'}. `;
            try {
                const usgsMonthlyRes = await fetchUsgsData(USGS_API_URL_MONTH);

                if (usgsMonthlyRes.error || !isValidGeoJson(usgsMonthlyRes)) {
                    monthlyFetchError += `USGS Error (Monthly): ${usgsMonthlyRes?.error?.message || 'Monthly USGS data features missing or invalid.'}`;
                } else {
                    const processedData = { features: usgsMonthlyRes.features, fetchTime: nowForFiltering, dataSource: 'USGS' };
                    dispatch({
                        type: actionTypes.MONTHLY_DATA_PROCESSED,
                        payload: processedData
                    });
                    dataCacheRef.current[CACHE_KEY_MONTH] = { data: processedData, timestamp: Date.now() };
                    monthlyDataSource = 'USGS';
                    monthlyFetchError = null; // Clear D1 error if USGS succeeds
                }
            } catch (e) {
                monthlyFetchError += `USGS Fetch Error (Monthly): ${e.message || 'Error fetching monthly USGS data.'}`;
            }
        }

        if (monthlyFetchError && !monthlyDataSource) { // Only set error if no data was successfully processed
            dispatch({ type: actionTypes.SET_ERROR, payload: { monthlyError: monthlyFetchError.trim() } });
        } else if (!monthlyDataSource) {
            dispatch({ type: actionTypes.SET_ERROR, payload: { monthlyError: "Failed to load any monthly data." } });
        }

        dispatch({ type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingMonthly: false } });
    }, [dispatch]); // Added dispatch

    // This is the function that will be exposed to context consumers - MOVED EARLIER
    const loadMonthlyData = useCallback(() => {
        dispatch({ type: actionTypes.REQUEST_MONTHLY_DATA_LOAD });
    }, [dispatch]);

    // --- useEffect Hooks for Data Fetching and State Management ---

    // Effect for initiating initial daily/weekly fetch (Replaces part of original L146 effect)
    useEffect(() => {
        if (state.isInitialAppLoad) {
            // Update loading message index at the beginning of the load sequence
            dispatch({ type: actionTypes.UPDATE_LOADING_MESSAGE_INDEX });
            performDataFetch(true); // true indicates initial fetch
        }
    }, [state.isInitialAppLoad, performDataFetch, dispatch]);

    // Effect for handling initial load completion (Replaces part of original L146 effect)
    useEffect(() => {
        // Only proceed if it's the initial app load and daily/weekly loading has finished.
        // And also ensure that isInitialAppLoad is still true, meaning SET_INITIAL_LOAD_COMPLETE hasn't been dispatched yet by this effect.
        if (state.isInitialAppLoad && !state.isLoadingDaily && !state.isLoadingWeekly) {
            // Check if loading flags were previously true or if data sources are now set,
            // to ensure this runs after data has actually been loaded or attempted.
            // This check might be overly complex if isLoadingDaily/Weekly are reliably true during load.
            // Assuming that isLoadingDaily and isLoadingWeekly transition from true to false once loaded.
            dispatch({ type: actionTypes.SET_INITIAL_LOAD_COMPLETE });
        }
    }, [state.isInitialAppLoad, state.isLoadingDaily, state.isLoadingWeekly, dispatch]);

    // Original useEffect at L146-163 is now replaced by the two above effects.

    useEffect(() => {
        if (state.isInitialAppLoad) {
            return;
        }

        let isMounted = true;
        const intervalCallback = () => {
            if (isMounted) {
                performDataFetch(false);
            }
        };

        const intervalId = setInterval(intervalCallback, REFRESH_INTERVAL_MS);

        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    }, [state.isInitialAppLoad, performDataFetch]); // Added performDataFetch

    useEffect(() => {
        let messageInterval;
        if (state.isInitialAppLoad && (state.isLoadingDaily || state.isLoadingWeekly)) {
            messageInterval = setInterval(() => {
                dispatch({ type: actionTypes.UPDATE_LOADING_MESSAGE_INDEX });
            }, LOADING_MESSAGE_INTERVAL_MS);
        }
        return () => clearInterval(messageInterval);
    }, [state.isInitialAppLoad, state.isLoadingDaily, state.isLoadingWeekly, dispatch]); // Added dispatch

    // Effect to handle fetching monthly data when requested
    useEffect(() => {
        if (state.shouldFetchMonthlyData) {
            fetchMonthlyDataInternal();
            dispatch({ type: actionTypes.MONTHLY_DATA_LOAD_HANDLED });
        }
    }, [state.shouldFetchMonthlyData, fetchMonthlyDataInternal, dispatch]);

    // The original loadMonthlyData function (with full fetch logic) was here.
    // It has been replaced by fetchMonthlyDataInternal (defined below, containing the same logic)
    // and the new loadMonthlyData (also below, which just dispatches an action).
    // This comment block replaces the old function to prevent duplicate declarations.

    const isLoadingInitialData = useMemo(() => (state.isLoadingDaily || state.isLoadingWeekly) && state.isInitialAppLoad, [state.isLoadingDaily, state.isLoadingWeekly, state.isInitialAppLoad]);
    const currentLoadingMessage = useMemo(() => state.currentLoadingMessages[state.loadingMessageIndex], [state.currentLoadingMessages, state.loadingMessageIndex]);

    // Definitions of fetchMonthlyDataInternal and loadMonthlyData were moved before useEffects.
    // This section is now empty as those definitions are placed earlier.

    const feelableQuakes7Days_ctx = useMemo(() => state.earthquakesLast7Days?.filter(q => q.properties.mag !== null && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD) || [], [state.earthquakesLast7Days]);
    const significantQuakes7Days_ctx = useMemo(() => state.earthquakesLast7Days?.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD) || [], [state.earthquakesLast7Days]);
    const feelableQuakes30Days_ctx = useMemo(() => state.allEarthquakes?.filter(q => q.properties.mag !== null && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD) || [], [state.allEarthquakes]);
    const significantQuakes30Days_ctx = useMemo(() => state.allEarthquakes?.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD) || [], [state.allEarthquakes]);

    const contextValue = useMemo(() => ({
        ...state,
        isLoadingInitialData,
        currentLoadingMessage,
        loadMonthlyData,
        feelableQuakes7Days_ctx,
        significantQuakes7Days_ctx,
        feelableQuakes30Days_ctx,
        significantQuakes30Days_ctx,
        dailyDataSource: state.dailyDataSource,
        weeklyDataSource: state.weeklyDataSource,
        monthlyDataSource: state.monthlyDataSource,
        dispatch,
    }), [
        state, isLoadingInitialData, currentLoadingMessage, loadMonthlyData,
        feelableQuakes7Days_ctx, significantQuakes7Days_ctx,
        feelableQuakes30Days_ctx, significantQuakes30Days_ctx,
        dispatch,
    ]);

    return (
        <EarthquakeDataContext.Provider value={contextValue}>
            {children}
        </EarthquakeDataContext.Provider>
    );
};

/**
 * Custom hook to access the earthquake data state and action dispatchers.
 * This hook must be used within a component that is a descendant of `EarthquakeDataProvider`.
 *
 * @returns {object} The earthquake data context, including state (like `earthquakesLast24Hours`,
 * `dailyDataSource`, `weeklyDataSource`, `monthlyDataSource`, loading flags, errors) and
 * functions like `loadMonthlyData`.
 * @throws {Error} If used outside of an EarthquakeDataProvider.
 */
export const useEarthquakeDataState = () => {
    const context = useContext(EarthquakeDataContext);
    if (context === null) {
        throw new Error('useEarthquakeDataState must be used within an EarthquakeDataProvider');
    }
    return context;
};

export const useEarthquakeDataDispatch = () => {
    const context = useContext(EarthquakeDataContext);
    if (context === null) {
        throw new Error('useEarthquakeDataDispatch must be used within an EarthquakeDataProvider');
    }
    return context.dispatch;
};

// Only export the provider and hook. Context is exported from utils.
// initialState, actionTypes, and earthquakeReducer are now imported from utils by components/tests that need them.
// All necessary exports (EarthquakeDataProvider, useEarthquakeDataState) are done inline.
