// src/contexts/EarthquakeDataContext.jsx
import React, { useContext, useEffect, useCallback, useMemo, useReducer, useRef } from 'react';
import {
    REFRESH_INTERVAL_MS,
    FEELABLE_QUAKE_THRESHOLD,
    MAJOR_QUAKE_THRESHOLD,
    INITIAL_LOADING_MESSAGES,
    LOADING_MESSAGE_INTERVAL_MS
} from '../constants/appConstants';
import {
    earthquakeReducer,
    initialState,
    actionTypes,
} from './earthquakeDataContextUtils.js';
import { EarthquakeDataContext } from './earthquakeDataContextUtils.js';

export const EarthquakeDataProvider = ({ children }) => {
    const [state, dispatch] = useReducer(earthquakeReducer, initialState);

    const performDataFetch = useCallback(async (isInitialFetch = false) => {
        dispatch({ type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingDaily: true, isLoadingWeekly: true } });
        if (!isInitialFetch) {
            dispatch({ type: actionTypes.SET_ERROR, payload: { error: null } });
        }

        try {
            const response = await fetch('/api/get-earthquakes?timeWindow=week');
            if (!response.ok) {
                throw new Error(`Failed to fetch weekly data: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            dispatch({ type: actionTypes.PROCESSED_DATA_RECEIVED, payload: data });
        } catch (error) {
            dispatch({ type: actionTypes.SET_ERROR, payload: { error: error.message } });
        } finally {
            dispatch({ type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingDaily: false, isLoadingWeekly: false } });
        }
    }, [dispatch]);

    const fetchMonthlyDataInternal = useCallback(async () => {
        dispatch({ type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingMonthly: true, hasAttemptedMonthlyLoad: true } });
        dispatch({ type: actionTypes.SET_ERROR, payload: { monthlyError: null } });

        try {
            const response = await fetch('/api/get-earthquakes?timeWindow=month');
            if (!response.ok) {
                throw new Error(`Failed to fetch monthly data: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            dispatch({ type: actionTypes.PROCESSED_DATA_RECEIVED, payload: data });
        } catch (error) {
            dispatch({ type: actionTypes.SET_ERROR, payload: { monthlyError: error.message } });
        } finally {
            dispatch({ type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingMonthly: false } });
        }
    }, [dispatch]);

    const loadMonthlyData = useCallback(() => {
        dispatch({ type: actionTypes.REQUEST_MONTHLY_DATA_LOAD });
    }, [dispatch]);

    useEffect(() => {
        if (state.isInitialAppLoad) {
            dispatch({ type: actionTypes.UPDATE_LOADING_MESSAGE_INDEX });
            performDataFetch(true);
        }
    }, [state.isInitialAppLoad, performDataFetch, dispatch]);

    useEffect(() => {
        if (state.isInitialAppLoad && !state.isLoadingDaily && !state.isLoadingWeekly) {
            dispatch({ type: actionTypes.SET_INITIAL_LOAD_COMPLETE });
        }
    }, [state.isInitialAppLoad, state.isLoadingDaily, state.isLoadingWeekly, dispatch]);

    useEffect(() => {
        if (state.isInitialAppLoad) {
            return;
        }
        const intervalId = setInterval(() => performDataFetch(false), REFRESH_INTERVAL_MS);
        return () => clearInterval(intervalId);
    }, [state.isInitialAppLoad, performDataFetch]);

    useEffect(() => {
        let messageInterval;
        if (state.isInitialAppLoad && (state.isLoadingDaily || state.isLoadingWeekly)) {
            messageInterval = setInterval(() => {
                dispatch({ type: actionTypes.UPDATE_LOADING_MESSAGE_INDEX });
            }, LOADING_MESSAGE_INTERVAL_MS);
        }
        return () => clearInterval(messageInterval);
    }, [state.isInitialAppLoad, state.isLoadingDaily, state.isLoadingWeekly, dispatch]);

    useEffect(() => {
        if (state.shouldFetchMonthlyData) {
            fetchMonthlyDataInternal();
            dispatch({ type: actionTypes.MONTHLY_DATA_LOAD_HANDLED });
        }
    }, [state.shouldFetchMonthlyData, fetchMonthlyDataInternal, dispatch]);

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
        feelableQuakes30Days_ctx, significantQuakes30Days_ctx,
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
