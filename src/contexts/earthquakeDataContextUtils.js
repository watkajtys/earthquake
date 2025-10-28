// src/contexts/earthquakeDataContextUtils.js
import { createContext } from 'react';
import { INITIAL_LOADING_MESSAGES } from '../constants/appConstants';

export const initialState = {
    isLoadingDaily: true,
    isLoadingWeekly: true,
    isLoadingMonthly: false,
    isInitialAppLoad: true,
    error: null,
    monthlyError: null,
    dataFetchTime: null,
    lastUpdated: null,
    earthquakesLastHour: [],
    earthquakesPriorHour: [],
    earthquakesLast24Hours: [],
    earthquakesLast72Hours: [],
    earthquakesLast7Days: [],
    prev24HourData: [],
    prev7DayData: [],
    prev14DayData: [],
    allEarthquakes: [],
    earthquakesLast14Days: [],
    earthquakesLast30Days: [],
    globeEarthquakes: [],
    hasRecentTsunamiWarning: false,
    highestRecentAlert: null,
    activeAlertTriggeringQuakes: [],
    lastMajorQuake: null,
    previousMajorQuake: null,
    timeBetweenPreviousMajorQuakes: null,
    loadingMessageIndex: 0,
    currentLoadingMessages: INITIAL_LOADING_MESSAGES,
    hasAttemptedMonthlyLoad: false,
    dailyCounts14Days: [],
    dailyCounts30Days: [],
    sampledEarthquakesLast14Days: [],
    sampledEarthquakesLast30Days: [],
    magnitudeDistribution14Days: [],
    magnitudeDistribution30Days: [],
    dailyCounts7Days: [],
    sampledEarthquakesLast7Days: [],
    magnitudeDistribution7Days: [],
    tsunamiTriggeringQuake: null,
    dailyDataSource: null,
    weeklyDataSource: null,
    monthlyDataSource: null,
    shouldFetchMonthlyData: false,
};

export const EarthquakeDataContext = createContext(null);

export const actionTypes = {
    SET_LOADING_FLAGS: 'SET_LOADING_FLAGS',
    SET_ERROR: 'SET_ERROR',
    PROCESSED_DATA_RECEIVED: 'PROCESSED_DATA_RECEIVED',
    SET_INITIAL_LOAD_COMPLETE: 'SET_INITIAL_LOAD_COMPLETE',
    UPDATE_LOADING_MESSAGE_INDEX: 'UPDATE_LOADING_MESSAGE_INDEX',
    REQUEST_MONTHLY_DATA_LOAD: 'REQUEST_MONTHLY_DATA_LOAD',
    MONTHLY_DATA_LOAD_HANDLED: 'MONTHLY_DATA_LOAD_HANDLED',
};

export function earthquakeReducer(state = initialState, action) {
    switch (action.type) {
        case actionTypes.SET_LOADING_FLAGS:
            return { ...state, ...action.payload };
        case actionTypes.SET_ERROR:
            return { ...state, ...action.payload };
        case actionTypes.PROCESSED_DATA_RECEIVED:
            return {
                ...state,
                ...action.payload,
                lastUpdated: new Date(action.payload.fetchTime).toLocaleString(),
                dailyDataSource: action.payload.dataSource,
                weeklyDataSource: action.payload.dataSource,
                monthlyDataSource: action.payload.dataSource,
            };
        case actionTypes.SET_INITIAL_LOAD_COMPLETE:
            return { ...state, isInitialAppLoad: false };
        case actionTypes.UPDATE_LOADING_MESSAGE_INDEX:
            return { ...state, loadingMessageIndex: (state.loadingMessageIndex + 1) % state.currentLoadingMessages.length };
        case actionTypes.REQUEST_MONTHLY_DATA_LOAD:
            return { ...state, shouldFetchMonthlyData: true };
        case actionTypes.MONTHLY_DATA_LOAD_HANDLED:
            return { ...state, shouldFetchMonthlyData: false };
        default:
            return state;
    }
}
