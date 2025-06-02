// src/contexts/EarthquakeDataContext.jsx
import React, { createContext, useContext, useMemo } from 'react'; // Removed useState, useEffect, useCallback, useRef as they are not directly used here
import useEarthquakeData from '../hooks/useEarthquakeData';
import useMonthlyEarthquakeData from '../hooks/useMonthlyEarthquakeData';

const EarthquakeDataContext = createContext(null);

export const EarthquakeDataProvider = ({ children }) => {
    const {
        isLoadingDaily,
        isLoadingWeekly,
        isLoadingInitialData,
        error,
        dataFetchTime,
        lastUpdated,
        earthquakesLastHour,
        earthquakesPriorHour,
        earthquakesLast24Hours,
        earthquakesLast72Hours,
        earthquakesLast7Days,
        prev24HourData,
        globeEarthquakes,
        hasRecentTsunamiWarning,
        highestRecentAlert,
        activeAlertTriggeringQuakes,
        lastMajorQuake,
        setLastMajorQuake,
        previousMajorQuake,
        setPreviousMajorQuake,
        timeBetweenPreviousMajorQuakes,
        setTimeBetweenPreviousMajorQuakes,
        currentLoadingMessage,
        isInitialAppLoad
    } = useEarthquakeData();

    const {
        isLoadingMonthly,
        hasAttemptedMonthlyLoad,
        monthlyError,
        allEarthquakes,
        earthquakesLast14Days,
        earthquakesLast30Days,
        prev7DayData,
        prev14DayData,
        loadMonthlyData
    } = useMonthlyEarthquakeData(
        lastMajorQuake,
        setLastMajorQuake,
        setPreviousMajorQuake,
        setTimeBetweenPreviousMajorQuakes
    );

    const contextValue = useMemo(() => ({
        // From useEarthquakeData
        isLoadingDaily,
        isLoadingWeekly,
        isLoadingInitialData,
        error,
        dataFetchTime,
        lastUpdated,
        earthquakesLastHour,
        earthquakesPriorHour,
        earthquakesLast24Hours,
        earthquakesLast72Hours,
        earthquakesLast7Days,
        prev24HourData,
        globeEarthquakes,
        hasRecentTsunamiWarning,
        highestRecentAlert,
        activeAlertTriggeringQuakes,
        lastMajorQuake,
        setLastMajorQuake,
        previousMajorQuake,
        setPreviousMajorQuake,
        timeBetweenPreviousMajorQuakes,
        setTimeBetweenPreviousMajorQuakes,
        currentLoadingMessage,
        isInitialAppLoad,
        // From useMonthlyEarthquakeData
        isLoadingMonthly,
        hasAttemptedMonthlyLoad,
        monthlyError,
        allEarthquakes,
        earthquakesLast14Days,
        earthquakesLast30Days,
        prev7DayData,
        prev14DayData,
        loadMonthlyData
    }), [
        // Dependencies from useEarthquakeData
        isLoadingDaily, isLoadingWeekly, isLoadingInitialData, error, dataFetchTime, lastUpdated,
        earthquakesLastHour, earthquakesPriorHour, earthquakesLast24Hours, earthquakesLast72Hours,
        earthquakesLast7Days, prev24HourData, globeEarthquakes, hasRecentTsunamiWarning,
        highestRecentAlert, activeAlertTriggeringQuakes, lastMajorQuake, setLastMajorQuake,
        previousMajorQuake, setPreviousMajorQuake, timeBetweenPreviousMajorQuakes,
        setTimeBetweenPreviousMajorQuakes, currentLoadingMessage, isInitialAppLoad,
        // Dependencies from useMonthlyEarthquakeData
        isLoadingMonthly, hasAttemptedMonthlyLoad, monthlyError, allEarthquakes,
        earthquakesLast14Days, earthquakesLast30Days, prev7DayData, prev14DayData, loadMonthlyData
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
