import React, { useContext, useEffect, useCallback, useMemo, useReducer, useState } from 'react';
import { REFRESH_INTERVAL_MS, FEELABLE_QUAKE_THRESHOLD, MAJOR_QUAKE_THRESHOLD, LOADING_MESSAGE_INTERVAL_MS } from '../constants/appConstants';
import { earthquakeReducer, initialState, actionTypes, EarthquakeDataContext } from './earthquakeDataContextUtils.js';
import { fetchDailyFeed, fetchWeeklyFeed, fetchMonthlyFeed } from '../services/earthquakeFeedService.js';
import { EXTENDED_REFRESH_INTERVAL_MS, useRefreshableResource } from '../hooks/useRefreshableResource.js';

export const EarthquakeDataProvider = ({ children }) => {
    const [state, dispatch] = useReducer(earthquakeReducer, initialState);
    const [monthlyRequested, setMonthlyRequested] = useState(false);
    const daily = useRefreshableResource(fetchDailyFeed, { intervalMs: REFRESH_INTERVAL_MS, enabled: initialState.isInitialAppLoad });
    const weekly = useRefreshableResource(fetchWeeklyFeed, { intervalMs: REFRESH_INTERVAL_MS, enabled: initialState.isInitialAppLoad });
    const monthly = useRefreshableResource(fetchMonthlyFeed, { intervalMs: EXTENDED_REFRESH_INTERVAL_MS, enabled: monthlyRequested });
    const { refresh: refreshDaily } = daily;
    const { refresh: refreshWeekly } = weekly;
    const { refresh: refreshMonthly } = monthly;

    useEffect(() => { if (daily.data) dispatch({ type: actionTypes.DAILY_DATA_PROCESSED, payload: daily.data }); }, [daily.data]);
    useEffect(() => { if (weekly.data) dispatch({ type: actionTypes.WEEKLY_DATA_PROCESSED, payload: weekly.data }); }, [weekly.data]);
    useEffect(() => { if (monthly.data) dispatch({ type: actionTypes.MONTHLY_DATA_PROCESSED, payload: monthly.data }); }, [monthly.data]);

    const loadMonthlyData = useCallback(() => {
        if (monthlyRequested) void refreshMonthly({ force: false });
        else setMonthlyRequested(true);
    }, [monthlyRequested, refreshMonthly]);
    const refreshData = useCallback(() => Promise.all([refreshDaily(), refreshWeekly()]), [refreshDaily, refreshWeekly]);
    const isInitialAppLoad = initialState.isInitialAppLoad && !(daily.hasAttempted && weekly.hasAttempted && !daily.loading && !weekly.loading);
    // Once the first attempt completes, later refreshes must not reopen the
    // full-page initial loader, including recovery after an initial failure.
    useEffect(() => {
        if (!isInitialAppLoad && state.isInitialAppLoad) dispatch({ type: actionTypes.SET_INITIAL_LOAD_COMPLETE });
    }, [isInitialAppLoad, state.isInitialAppLoad]);
    useEffect(() => {
        if (!state.isInitialAppLoad) return;
        const timer = setInterval(() => dispatch({ type: actionTypes.UPDATE_LOADING_MESSAGE_INDEX }), LOADING_MESSAGE_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [state.isInitialAppLoad]);

    const feelableQuakes7Days_ctx = useMemo(() => state.earthquakesLast7Days.filter(q => q.properties.mag != null && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD), [state.earthquakesLast7Days]);
    const significantQuakes7Days_ctx = useMemo(() => state.earthquakesLast7Days.filter(q => q.properties.mag != null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD), [state.earthquakesLast7Days]);
    const feelableQuakes30Days_ctx = useMemo(() => state.allEarthquakes.filter(q => q.properties.mag != null && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD), [state.allEarthquakes]);
    const significantQuakes30Days_ctx = useMemo(() => state.allEarthquakes.filter(q => q.properties.mag != null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD), [state.allEarthquakes]);

    const contextValue = useMemo(() => ({
        ...state,
        isLoadingDaily: daily.loading, isLoadingWeekly: weekly.loading, isLoadingMonthly: monthly.loading,
        isRefreshingDaily: daily.refreshing, isRefreshingWeekly: weekly.refreshing, isRefreshingMonthly: monthly.refreshing,
        isLoadingInitialData: state.isInitialAppLoad && (daily.loading || weekly.loading),
        currentLoadingMessage: state.currentLoadingMessages[state.loadingMessageIndex],
        error: daily.error && weekly.error ? `Daily & Weekly Data Errors: ${daily.error} ${weekly.error}` :
            daily.error ? `Daily Data Error: ${daily.error}` : weekly.error ? `Weekly Data Error: ${weekly.error}` : null,
        dailyError: daily.error, weeklyError: weekly.error, monthlyError: monthly.error,
        hasAttemptedMonthlyLoad: monthly.hasAttempted, monthlyHasLoaded: monthly.hasLoaded,
        dailyLastSuccessfulAtMs: daily.lastSuccessfulAtMs, weeklyLastSuccessfulAtMs: weekly.lastSuccessfulAtMs,
        monthlyLastSuccessfulAtMs: monthly.lastSuccessfulAtMs,
        dailySourceGeneratedAtMs: state.feedSnapshots.day?.sourceGeneratedAtMs ?? null,
        weeklySourceGeneratedAtMs: state.feedSnapshots.week?.sourceGeneratedAtMs ?? null,
        monthlySourceGeneratedAtMs: state.feedSnapshots.month?.sourceGeneratedAtMs ?? null,
        loadMonthlyData, refreshData,
        feelableQuakes7Days_ctx, significantQuakes7Days_ctx, feelableQuakes30Days_ctx, significantQuakes30Days_ctx,
    }), [state, daily, weekly, monthly, loadMonthlyData, refreshData,
        feelableQuakes7Days_ctx, significantQuakes7Days_ctx, feelableQuakes30Days_ctx, significantQuakes30Days_ctx]);
    return <EarthquakeDataContext.Provider value={contextValue}>{children}</EarthquakeDataContext.Provider>;
};

export const useEarthquakeDataState = () => {
    const context = useContext(EarthquakeDataContext);
    if (context === null) throw new Error('useEarthquakeDataState must be used within an EarthquakeDataProvider');
    return context;
};
