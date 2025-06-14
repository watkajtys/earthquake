// src/contexts/EarthquakeDataContext.jsx
import React, { useContext, useEffect, useCallback, useMemo, useReducer } from 'react'; // Removed createContext
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


export const EarthquakeDataProvider = ({ children }) => {
    const [state, dispatch] = useReducer(earthquakeReducer, initialState);

    const performDataFetch = useCallback(async (isInitialFetch = false) => {
        dispatch({ type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingDaily: true, isLoadingWeekly: true } });
        if (!isInitialFetch) {
            dispatch({ type: actionTypes.SET_ERROR, payload: { error: null } });
        }

        const nowForFiltering = Date.now();
        let dailyError = null, weeklyError = null;
        let dailyFeatures = null, weeklyFeatures = null;
        let dailyMetadata = null;

        try {
            const dailyRes = await fetchUsgsData(USGS_API_URL_DAY);
            if (dailyRes.error || !dailyRes.features) {
                dailyError = dailyRes?.error?.message || "Daily data features missing.";
            } else {
                dailyFeatures = dailyRes.features;
                dailyMetadata = dailyRes.metadata;
            }
        } catch (e) { dailyError = e.message || "Error fetching daily data."; }
        finally { dispatch({ type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingDaily: false } }); }

        try {
            const weeklyResult = await fetchUsgsData(USGS_API_URL_WEEK);
            if (weeklyResult.error || !weeklyResult.features) {
                weeklyError = weeklyResult?.error?.message || "Weekly data features missing.";
            } else {
                weeklyFeatures = weeklyResult.features;
            }
        } catch (e) { weeklyError = e.message || "Error fetching weekly data."; }
        finally { dispatch({ type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingWeekly: false } });}

        if (dailyFeatures) {
            dispatch({ type: actionTypes.DAILY_DATA_PROCESSED, payload: { features: dailyFeatures, metadata: dailyMetadata, fetchTime: nowForFiltering } });
        }
        if (weeklyFeatures) {
            dispatch({ type: actionTypes.WEEKLY_DATA_PROCESSED, payload: { features: weeklyFeatures, fetchTime: nowForFiltering } });
        }

        let finalErrorMsg = null;
        if (dailyError && weeklyError) finalErrorMsg = "Failed to fetch critical daily and weekly data.";
        else if (dailyError) finalErrorMsg = `Daily data error: ${dailyError}.`;
        else if (weeklyError) finalErrorMsg = `Weekly data error: ${weeklyError}.`;

        if (finalErrorMsg) {
            dispatch({ type: actionTypes.SET_ERROR, payload: { error: finalErrorMsg } });
        }
    }, [dispatch]); // dispatch is stable

    useEffect(() => {
        let isMounted = true;
        const initialLoadSequence = async () => {
            if (!isMounted) return;
            // INITIAL_LOADING_MESSAGES is part of initialState from utils, so no need to dispatch SET_LOADING_MESSAGES here
            // if it's correctly set in the imported initialState.
            // dispatch({ type: actionTypes.SET_LOADING_MESSAGES, payload: INITIAL_LOADING_MESSAGES }); // This might be redundant
            dispatch({ type: actionTypes.UPDATE_LOADING_MESSAGE_INDEX });

            await performDataFetch(true);

            if (isMounted) {
                dispatch({ type: actionTypes.SET_INITIAL_LOAD_COMPLETE });
            }
        };

        if (state.isInitialAppLoad) {
            initialLoadSequence();
        }
        return () => { isMounted = false; };
    }, [state.isInitialAppLoad, dispatch, performDataFetch]); // Added dispatch and performDataFetch

    useEffect(() => {
        if (state.isInitialAppLoad) {
            return;
        }

        let isMounted = true;
        const intervalId = setInterval(() => {
            if (isMounted) {
                performDataFetch(false);
            }
        }, REFRESH_INTERVAL_MS);

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

    const loadMonthlyData = useCallback(async () => {
        dispatch({type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingMonthly: true, hasAttemptedMonthlyLoad: true }});
        dispatch({type: actionTypes.SET_ERROR, payload: { monthlyError: null }});

        const nowForFiltering = Date.now();
        try {
            const monthlyResult = await fetchUsgsData(USGS_API_URL_MONTH);
            if (!monthlyResult.error && monthlyResult.features && monthlyResult.features.length > 0) {
                dispatch({ type: actionTypes.MONTHLY_DATA_PROCESSED, payload: { features: monthlyResult.features, fetchTime: nowForFiltering } });
            } else {
                const errorMsg = monthlyResult?.error?.message || "Monthly data is unavailable or incomplete.";
                dispatch({type: actionTypes.SET_ERROR, payload: { monthlyError: errorMsg }});
                dispatch({type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingMonthly: false }});
            }
        } catch (e) {
            const errorMsg = `Monthly Data Processing Error: ${e.message || "An unexpected error occurred."}`;
            dispatch({ type: actionTypes.SET_ERROR, payload: { monthlyError: errorMsg }});
            dispatch({type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingMonthly: false }});
        }
    }, [dispatch]); // Added dispatch

    const isLoadingInitialData = useMemo(() => (state.isLoadingDaily || state.isLoadingWeekly) && state.isInitialAppLoad, [state.isLoadingDaily, state.isLoadingWeekly, state.isInitialAppLoad]);
    const currentLoadingMessage = useMemo(() => state.currentLoadingMessages[state.loadingMessageIndex], [state.currentLoadingMessages, state.loadingMessageIndex]);

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
    }), [
        state, isLoadingInitialData, currentLoadingMessage, loadMonthlyData,
        feelableQuakes7Days_ctx, significantQuakes7Days_ctx,
        feelableQuakes30Days_ctx, significantQuakes30Days_ctx
    ]);

    return (
        <EarthquakeDataContext.Provider value={contextValue}>
            {children}
        </EarthquakeDataContext.Provider>
    );
};

export const useEarthquakeDataState = () => {
    const context = useContext(EarthquakeDataContext);
    if (context === null) {
        throw new Error('useEarthquakeDataState must be used within an EarthquakeDataProvider');
    }
    return context;
};

// Only export the provider and hook. Context is exported from utils.
// initialState, actionTypes, and earthquakeReducer are now imported from utils by components/tests that need them.
// All necessary exports (EarthquakeDataProvider, useEarthquakeDataState) are done inline.
