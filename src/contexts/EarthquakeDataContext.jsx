// src/contexts/EarthquakeDataContext.jsx
import React, { createContext, useContext, useState, useMemo } from 'react';
import useEarthquakeData from '../hooks/useEarthquakeData';
import useMonthlyEarthquakeData from '../hooks/useMonthlyEarthquakeData';
import { fetchDataCb } from '../utils/fetchUtils';

const INITIAL_LOADING_MESSAGE_DEFAULT = "Initializing...";

// Define a default shape for the context, ensuring no "cannot destructure of null" errors.
const defaultContextShape = {
    isLoadingDaily: false,
    setIsLoadingDaily: () => {},
    isLoadingWeekly: false,
    setIsLoadingWeekly: () => {},
    isLoadingInitialData: true,
    setIsLoadingInitialData: () => {},
    error: null,
    setError: () => {},
    dataFetchTime: null,
    setDataFetchTime: () => {},
    lastUpdated: null,
    setLastUpdated: () => {},
    earthquakesLastHour: [],
    setEarthquakesLastHour: () => {},
    earthquakesPriorHour: [],
    setEarthquakesPriorHour: () => {},
    earthquakesLast24Hours: [],
    setEarthquakesLast24Hours: () => {},
    earthquakesLast72Hours: [],
    setEarthquakesLast72Hours: () => {},
    earthquakesLast7Days: [],
    setEarthquakesLast7Days: () => {},
    prev24HourData: [],
    setPrev24HourData: () => {},
    globeEarthquakes: [],
    setGlobeEarthquakes: () => {},
    hasRecentTsunamiWarning: false,
    setHasRecentTsunamiWarning: () => {},
    highestRecentAlert: null,
    setHighestRecentAlert: () => {},
    activeAlertTriggeringQuakes: [],
    setActiveAlertTriggeringQuakes: () => {},
    lastMajorQuake: null,
    setLastMajorQuake: () => {},
    previousMajorQuake: null,
    setPreviousMajorQuake: () => {},
    timeBetweenPreviousMajorQuakes: null,
    setTimeBetweenPreviousMajorQuakes: () => {},
    currentLoadingMessage: INITIAL_LOADING_MESSAGE_DEFAULT,
    setCurrentLoadingMessage: () => {},
    isInitialAppLoad: true,
    setIsInitialAppLoad: () => {},
    
    isLoadingMonthly: false,
    setIsLoadingMonthly: () => {},
    hasAttemptedMonthlyLoad: false,
    setHasAttemptedMonthlyLoad: () => {},
    monthlyError: null,
    setMonthlyError: () => {},
    allEarthquakes: [],
    setAllEarthquakes: () => {},
    earthquakesLast14Days: [],
    setEarthquakesLast14Days: () => {},
    earthquakesLast30Days: [],
    setEarthquakesLast30Days: () => {},
    prev7DayData: [],
    setPrev7DayData: () => {},
    prev14DayData: [],
    setPrev14DayData: () => {},
    loadMonthlyData: async () => { console.warn("Default loadMonthlyData called"); }, // Default async function
};

const EarthquakeDataContext = createContext(defaultContextShape);

export const EarthquakeDataProvider = ({ children }) => {
    // States from useEarthquakeData (now managed directly)
    const [isLoadingDaily, setIsLoadingDaily] = useState(defaultContextShape.isLoadingDaily);
    const [isLoadingWeekly, setIsLoadingWeekly] = useState(defaultContextShape.isLoadingWeekly);
    const [isLoadingInitialData, setIsLoadingInitialData] = useState(defaultContextShape.isLoadingInitialData);
    const [error, setError] = useState(defaultContextShape.error);
    const [dataFetchTime, setDataFetchTime] = useState(defaultContextShape.dataFetchTime);
    const [lastUpdated, setLastUpdated] = useState(defaultContextShape.lastUpdated);
    const [earthquakesLastHour, setEarthquakesLastHour] = useState(defaultContextShape.earthquakesLastHour);
    const [earthquakesPriorHour, setEarthquakesPriorHour] = useState(defaultContextShape.earthquakesPriorHour);
    const [earthquakesLast24Hours, setEarthquakesLast24Hours] = useState(defaultContextShape.earthquakesLast24Hours);
    const [earthquakesLast72Hours, setEarthquakesLast72Hours] = useState(defaultContextShape.earthquakesLast72Hours);
    const [earthquakesLast7Days, setEarthquakesLast7Days] = useState(defaultContextShape.earthquakesLast7Days);
    const [prev24HourData, setPrev24HourData] = useState(defaultContextShape.prev24HourData);
    const [globeEarthquakes, setGlobeEarthquakes] = useState(defaultContextShape.globeEarthquakes);
    const [hasRecentTsunamiWarning, setHasRecentTsunamiWarning] = useState(defaultContextShape.hasRecentTsunamiWarning);
    const [highestRecentAlert, setHighestRecentAlert] = useState(defaultContextShape.highestRecentAlert);
    const [activeAlertTriggeringQuakes, setActiveAlertTriggeringQuakes] = useState(defaultContextShape.activeAlertTriggeringQuakes);
    const [lastMajorQuake, setLastMajorQuake] = useState(defaultContextShape.lastMajorQuake);
    const [previousMajorQuake, setPreviousMajorQuake] = useState(defaultContextShape.previousMajorQuake);
    const [timeBetweenPreviousMajorQuakes, setTimeBetweenPreviousMajorQuakes] = useState(defaultContextShape.timeBetweenPreviousMajorQuakes);
    const [currentLoadingMessage, setCurrentLoadingMessage] = useState(defaultContextShape.currentLoadingMessage);
    const [isInitialAppLoad, setIsInitialAppLoad] = useState(defaultContextShape.isInitialAppLoad);

    // States from useMonthlyEarthquakeData (now managed directly)
    const [isLoadingMonthly, setIsLoadingMonthly] = useState(defaultContextShape.isLoadingMonthly);
    const [hasAttemptedMonthlyLoad, setHasAttemptedMonthlyLoad] = useState(defaultContextShape.hasAttemptedMonthlyLoad);
    const [monthlyError, setMonthlyError] = useState(defaultContextShape.monthlyError);
    const [allEarthquakes, setAllEarthquakes] = useState(defaultContextShape.allEarthquakes);
    const [earthquakesLast14Days, setEarthquakesLast14Days] = useState(defaultContextShape.earthquakesLast14Days);
    const [earthquakesLast30Days, setEarthquakesLast30Days] = useState(defaultContextShape.earthquakesLast30Days);
    const [prev7DayData, setPrev7DayData] = useState(defaultContextShape.prev7DayData);
    const [prev14DayData, setPrev14DayData] = useState(defaultContextShape.prev14DayData);
    
    // Activate hooks
    useEarthquakeData(fetchDataCb); 
    const { loadMonthlyData } = useMonthlyEarthquakeData(fetchDataCb);

    const contextValue = useMemo(() => ({
        isLoadingDaily, setIsLoadingDaily,
        isLoadingWeekly, setIsLoadingWeekly,
        isLoadingInitialData, setIsLoadingInitialData,
        error, setError,
        dataFetchTime, setDataFetchTime,
        lastUpdated, setLastUpdated,
        earthquakesLastHour, setEarthquakesLastHour,
        earthquakesPriorHour, setEarthquakesPriorHour,
        earthquakesLast24Hours, setEarthquakesLast24Hours,
        earthquakesLast72Hours, setEarthquakesLast72Hours,
        earthquakesLast7Days, setEarthquakesLast7Days,
        prev24HourData, setPrev24HourData,
        globeEarthquakes, setGlobeEarthquakes,
        hasRecentTsunamiWarning, setHasRecentTsunamiWarning,
        highestRecentAlert, setHighestRecentAlert,
        activeAlertTriggeringQuakes, setActiveAlertTriggeringQuakes,
        lastMajorQuake, setLastMajorQuake,
        previousMajorQuake, setPreviousMajorQuake,
        timeBetweenPreviousMajorQuakes, setTimeBetweenPreviousMajorQuakes,
        currentLoadingMessage, setCurrentLoadingMessage,
        isInitialAppLoad, setIsInitialAppLoad,
        
        isLoadingMonthly, setIsLoadingMonthly,
        hasAttemptedMonthlyLoad, setHasAttemptedMonthlyLoad,
        monthlyError, setMonthlyError,
        allEarthquakes, setAllEarthquakes,
        earthquakesLast14Days, setEarthquakesLast14Days,
        earthquakesLast30Days, setEarthquakesLast30Days,
        prev7DayData, setPrev7DayData,
        prev14DayData, setPrev14DayData,
        loadMonthlyData: loadMonthlyData || defaultContextShape.loadMonthlyData // Ensure loadMonthlyData is always a function
    }), [
        // All state values
        isLoadingDaily, isLoadingWeekly, isLoadingInitialData, error, dataFetchTime, lastUpdated,
        earthquakesLastHour, earthquakesPriorHour, earthquakesLast24Hours, earthquakesLast72Hours,
        earthquakesLast7Days, prev24HourData, globeEarthquakes, hasRecentTsunamiWarning,
        highestRecentAlert, activeAlertTriggeringQuakes, lastMajorQuake, previousMajorQuake,
        timeBetweenPreviousMajorQuakes, currentLoadingMessage, isInitialAppLoad,
        isLoadingMonthly, hasAttemptedMonthlyLoad, monthlyError, allEarthquakes,
        earthquakesLast14Days, earthquakesLast30Days, prev7DayData, prev14DayData,
        // All setters
        // Note: Setters from useState are stable and don't strictly need to be in useMemo deps,
        // but including them doesn't hurt and can be explicit.
        // For brevity in this example, only state values and loadMonthlyData are listed as primary drivers of change.
        // However, in a strict sense, all values used in the contextValue object should be listed.
        // For this refactor, the key is that loadMonthlyData is correctly included.
        loadMonthlyData 
        // For full correctness, all setters should be here too, but they are stable.
        // The primary goal is to ensure the contextValue object is correctly formed and memoized.
    ]);

    return (
        <EarthquakeDataContext.Provider value={contextValue}>
            {children}
        </EarthquakeDataContext.Provider>
    );
};

export const useEarthquakeDataState = () => {
    const context = useContext(EarthquakeDataContext);
    // No need to check for `null` if a default shape is always provided by createContext
    // However, it's still good practice if there's any chance it could be unprovided elsewhere.
    if (context === undefined) { // Should check against undefined if that's a possible state
        throw new Error('useEarthquakeDataState must be used within an EarthquakeDataProvider');
    }
    return context;
};

export { EarthquakeDataContext };
