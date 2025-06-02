// src/contexts/EarthquakeDataContext.jsx
import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import useEarthquakeData from '../hooks/useEarthquakeData.js';
import useMonthlyEarthquakeData from '../hooks/useMonthlyEarthquakeData.js';
import { fetchDataCb } from '../utils/fetchUtils.js';

const EarthquakeDataContext = createContext(null);

export const EarthquakeDataProvider = ({ children }) => {
    // State definitions (as before)
    const [isLoadingDaily, setIsLoadingDaily] = useState(false);
    const [isLoadingWeekly, setIsLoadingWeekly] = useState(false);
    const [isLoadingMonthly, setIsLoadingMonthly] = useState(false);
    const [isLoadingInitialData, setIsLoadingInitialData] = useState(false);
    const [error, setError] = useState(null);
    const [monthlyError, setMonthlyError] = useState(null);
    const [dataFetchTime, setDataFetchTime] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [earthquakesLastHour, setEarthquakesLastHour] = useState([]);
    const [earthquakesPriorHour, setEarthquakesPriorHour] = useState([]);
    const [earthquakesLast24Hours, setEarthquakesLast24Hours] = useState([]);
    const [earthquakesLast72Hours, setEarthquakesLast72Hours] = useState([]);
    const [earthquakesLast7Days, setEarthquakesLast7Days] = useState([]);
    const [prev24HourData, setPrev24HourData] = useState([]);
    const [globeEarthquakes, setGlobeEarthquakes] = useState([]);
    const [activeAlertTriggeringQuakes, setActiveAlertTriggeringQuakes] = useState([]);
    const [allEarthquakes, setAllEarthquakes] = useState([]);
    const [earthquakesLast14Days, setEarthquakesLast14Days] = useState([]);
    const [earthquakesLast30Days, setEarthquakesLast30Days] = useState([]);
    const [prev7DayData, setPrev7DayData] = useState([]);
    const [prev14DayData, setPrev14DayData] = useState([]);
    const [hasRecentTsunamiWarning, setHasRecentTsunamiWarning] = useState(false);
    const [highestRecentAlert, setHighestRecentAlert] = useState(null);
    const [lastMajorQuake, setLastMajorQuakeState] = useState(null);
    const [previousMajorQuake, setPreviousMajorQuakeState] = useState(null);
    const [timeBetweenPreviousMajorQuakes, setTimeBetweenPreviousMajorQuakesState] = useState(null);
    const [currentLoadingMessage, setCurrentLoadingMessage] = useState('');
    const [isInitialAppLoad, setIsInitialAppLoad] = useState(true);
    const [hasAttemptedMonthlyLoad, setHasAttemptedMonthlyLoad] = useState(false);

    // Updater functions (as before)
    const setLoadingStatus = useCallback(({ daily, weekly, monthly, initial }) => {
        if (daily !== undefined) setIsLoadingDaily(daily);
        if (weekly !== undefined) setIsLoadingWeekly(weekly);
        if (monthly !== undefined) setIsLoadingMonthly(monthly);
        if (initial !== undefined) setIsLoadingInitialData(initial);
    }, []);

    const setErrorState = useCallback(({ type, message }) => {
        if (type === 'main') setError(message);
        else if (type === 'monthly') setMonthlyError(message);
    }, []);

    const setDailyEarthquakeData = useCallback(({ lastHour, priorHour, last24, hasTsunamiWarning, highestAlert, activeAlerts }) => {
        if (lastHour) setEarthquakesLastHour(lastHour);
        if (priorHour) setEarthquakesPriorHour(priorHour);
        if (last24) setEarthquakesLast24Hours(last24);
        if (hasTsunamiWarning !== undefined) setHasRecentTsunamiWarning(hasTsunamiWarning);
        if (highestAlert !== undefined) setHighestRecentAlert(highestAlert);
        if (activeAlerts) setActiveAlertTriggeringQuakes(activeAlerts);
    }, []);
    
    const setWeeklyEarthquakeData = useCallback(({ last72Hours, last7Days, prev24Hour, globe }) => {
        if (last72Hours) setEarthquakesLast72Hours(last72Hours);
        if (last7Days) setEarthquakesLast7Days(last7Days);
        if (prev24Hour) setPrev24HourData(prev24Hour);
        if (globe) setGlobeEarthquakes(globe);
    }, []);

    const setMonthlyEarthquakeData = useCallback(({ all, last14, last30, prev7, prev14 }) => {
        if (all) setAllEarthquakes(all);
        if (last14) setEarthquakesLast14Days(last14);
        if (last30) setEarthquakesLast30Days(last30);
        if (prev7) setPrev7DayData(prev7);
        if (prev14) setPrev14DayData(prev14);
    }, []);

    const updateLastMajorQuake = useCallback((newMajorQuake) => {
        setLastMajorQuakeState(currentLastMajor => {
            if (newMajorQuake && (!currentLastMajor || newMajorQuake.time > currentLastMajor.time)) {
                setPreviousMajorQuakeState(currentLastMajor);
                if (currentLastMajor && newMajorQuake) {
                    setTimeBetweenPreviousMajorQuakesState(newMajorQuake.time - currentLastMajor.time);
                }
                return newMajorQuake;
            }
            return currentLastMajor;
        });
    }, []);
    
    const setPreviousMajorQuake = useCallback((quake) => { // This specific setter might not be directly used by hooks if updateLastMajorQuake handles all logic
        setPreviousMajorQuakeState(quake);
    }, []);

    const setTimeBetweenPreviousMajorQuakes = useCallback((time) => { // Same as above
        setTimeBetweenPreviousMajorQuakesState(time);
    }, []);

    // Instantiate hooks, passing necessary state and updater functions directly
    const { forceRefresh } = useEarthquakeData(fetchDataCb, {
        isInitialAppLoad,
        isLoadingDaily,
        isLoadingWeekly,
        setLoadingStatus,
        setErrorState,
        setDailyEarthquakeData,
        setWeeklyEarthquakeData,
        updateLastMajorQuake,
        setDataFetchTime,
        setLastUpdated,
        setCurrentLoadingMessage,
        setIsInitialAppLoad
    });

    const { loadMonthlyData } = useMonthlyEarthquakeData(fetchDataCb, {
        lastMajorQuake, // Pass the state value
        setLoadingStatus,
        setErrorState,
        setMonthlyEarthquakeData,
        updateLastMajorQuake,
        setHasAttemptedMonthlyLoad
    });

    const contextValue = useMemo(() => ({
        isLoadingDaily, setIsLoadingDaily, // Exposing main setters for direct use if ever needed, though hooks use specific ones
        isLoadingWeekly, setIsLoadingWeekly,
        isLoadingMonthly, setIsLoadingMonthly,
        isLoadingInitialData, setIsLoadingInitialData,
        error, setError, // Main error setter
        monthlyError, setMonthlyError, // Monthly error setter
        dataFetchTime, setDataFetchTime,
        lastUpdated, setLastUpdated,
        earthquakesLastHour, setEarthquakesLastHour,
        earthquakesPriorHour, setEarthquakesPriorHour,
        earthquakesLast24Hours, setEarthquakesLast24Hours,
        earthquakesLast72Hours, setEarthquakesLast72Hours,
        earthquakesLast7Days, setEarthquakesLast7Days,
        prev24HourData, setPrev24HourData,
        globeEarthquakes, setGlobeEarthquakes,
        activeAlertTriggeringQuakes, setActiveAlertTriggeringQuakes,
        allEarthquakes, setAllEarthquakes,
        earthquakesLast14Days, setEarthquakesLast14Days,
        earthquakesLast30Days, setEarthquakesLast30Days,
        prev7DayData, setPrev7DayData,
        prev14DayData, setPrev14DayData,
        hasRecentTsunamiWarning, setHasRecentTsunamiWarning,
        highestRecentAlert, setHighestRecentAlert,
        lastMajorQuake, 
        previousMajorQuake, 
        timeBetweenPreviousMajorQuakes, 
        currentLoadingMessage, setCurrentLoadingMessage,
        isInitialAppLoad, setIsInitialAppLoad,
        hasAttemptedMonthlyLoad, setHasAttemptedMonthlyLoad,
        
        // Provider's own setters, which are passed to hooks
        setLoadingStatus,
        setErrorState,
        setDailyEarthquakeData,
        setWeeklyEarthquakeData,
        setMonthlyEarthquakeData,
        updateLastMajorQuake,
        setLastMajorQuake: setLastMajorQuakeState, // Direct state setter for lastMajorQuake
        setPreviousMajorQuake: setPreviousMajorQuakeState, // Direct state setter for previousMajorQuake
        setTimeBetweenPreviousMajorQuakes: setTimeBetweenPreviousMajorQuakesState, // Direct state setter

        // Functions from hooks
        forceRefresh,
        loadMonthlyData,
    }), [
        // All state values
        isLoadingDaily, isLoadingWeekly, isLoadingMonthly, isLoadingInitialData,
        error, monthlyError, dataFetchTime, lastUpdated,
        earthquakesLastHour, earthquakesPriorHour, earthquakesLast24Hours,
        earthquakesLast72Hours, earthquakesLast7Days, prev24HourData, globeEarthquakes,
        activeAlertTriggeringQuakes, allEarthquakes, earthquakesLast14Days,
        earthquakesLast30Days, prev7DayData, prev14DayData,
        hasRecentTsunamiWarning, highestRecentAlert, lastMajorQuake, previousMajorQuake,
        timeBetweenPreviousMajorQuakes, currentLoadingMessage, isInitialAppLoad,
        hasAttemptedMonthlyLoad,
        // All updater functions from provider
        setLoadingStatus, setErrorState, setDailyEarthquakeData, setWeeklyEarthquakeData, 
        setMonthlyEarthquakeData, updateLastMajorQuake, setLastMajorQuakeState, 
        setPreviousMajorQuakeState, setTimeBetweenPreviousMajorQuakesState,
        setDataFetchTime, setLastUpdated, setCurrentLoadingMessage, setIsInitialAppLoad, setHasAttemptedMonthlyLoad,
        // Functions from hooks
        forceRefresh, loadMonthlyData
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

export { EarthquakeDataContext };
