// src/contexts/EarthquakeDataContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchUsgsData } from '../services/usgsApiService';
import {
    USGS_API_URL_DAY,
    USGS_API_URL_WEEK,
    USGS_API_URL_MONTH,
    REFRESH_INTERVAL_MS,
    MAJOR_QUAKE_THRESHOLD,
    ALERT_LEVELS,
    INITIAL_LOADING_MESSAGES,
    LOADING_MESSAGE_INTERVAL_MS
} from '../constants/appConstants';

const EarthquakeDataContext = createContext(null);

export const EarthquakeDataProvider = ({ children }) => {
    // States from useEarthquakeData
    const [isLoadingDaily, setIsLoadingDaily] = useState(true);
    const [isLoadingWeekly, setIsLoadingWeekly] = useState(true);
    const [error, setError] = useState(null); // Combined error for daily/weekly
    const [dataFetchTime, setDataFetchTime] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [earthquakesLastHour, setEarthquakesLastHour] = useState([]);
    const [earthquakesPriorHour, setEarthquakesPriorHour] = useState([]);
    const [earthquakesLast24Hours, setEarthquakesLast24Hours] = useState([]);
    const [earthquakesLast72Hours, setEarthquakesLast72Hours] = useState([]);
    const [earthquakesLast7Days, setEarthquakesLast7Days] = useState([]);
    const [prev24HourData, setPrev24HourData] = useState([]);
    const [globeEarthquakes, setGlobeEarthquakes] = useState([]);
    const [hasRecentTsunamiWarning, setHasRecentTsunamiWarning] = useState(false);
    const [highestRecentAlert, setHighestRecentAlert] = useState(null);
    const [activeAlertTriggeringQuakes, setActiveAlertTriggeringQuakes] = useState([]);
    
    // Major quake states - managed globally now
    const [lastMajorQuake, setLastMajorQuake] = useState(null);
    const [previousMajorQuake, setPreviousMajorQuake] = useState(null);
    const [timeBetweenPreviousMajorQuakes, setTimeBetweenPreviousMajorQuakes] = useState(null);

    // Loading message states from useEarthquakeData
    const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
    const [currentLoadingMessages, setCurrentLoadingMessages] = useState(INITIAL_LOADING_MESSAGES);
    const isInitialAppLoadRef = useRef(true);

    // States from useMonthlyEarthquakeData
    const [isLoadingMonthly, setIsLoadingMonthly] = useState(false);
    const [hasAttemptedMonthlyLoad, setHasAttemptedMonthlyLoad] = useState(false);
    const [monthlyError, setMonthlyError] = useState(null);
    const [allEarthquakes, setAllEarthquakes] = useState([]); // Monthly data
    const [earthquakesLast14Days, setEarthquakesLast14Days] = useState([]);
    const [earthquakesLast30Days, setEarthquakesLast30Days] = useState([]);
    const [prev7DayData, setPrev7DayData] = useState([]); // Monthly context: 7-14 days ago
    const [prev14DayData, setPrev14DayData] = useState([]); // Monthly context: 14-28 days ago

    // Helper function for filtering
    const filterByTime = (data, hoursAgoStart, hoursAgoEnd = 0, now = Date.now()) => {
        if (!Array.isArray(data)) return [];
        const startTime = now - hoursAgoStart * 36e5;
        const endTime = now - hoursAgoEnd * 36e5;
        return data.filter(q => q.properties.time >= startTime && q.properties.time < endTime);
    };
    
    // Effect for daily and weekly data fetching (adapted from useEarthquakeData)
    useEffect(() => {
        let isMounted = true;
        const orchestrateInitialDataLoad = async () => {
            if (!isMounted) return;

            if (!isInitialAppLoadRef.current) {
                setIsLoadingDaily(true);
                setIsLoadingWeekly(true);
            } else {
                setLoadingMessageIndex(0);
                setCurrentLoadingMessages(INITIAL_LOADING_MESSAGES);
            }
            setError(null);

            // Initialize daily/weekly data states
            setEarthquakesLastHour([]);
            setEarthquakesPriorHour([]);
            setEarthquakesLast24Hours([]);
            setEarthquakesLast72Hours([]);
            setEarthquakesLast7Days([]);
            setPrev24HourData([]);
            setGlobeEarthquakes([]);
            setActiveAlertTriggeringQuakes([]);

            const nowForFiltering = Date.now();
            let dailyErrorMsg = null;
            let weeklyErrorMsg = null;
            let fetchedDailyMajors = [];
            let fetchedWeeklyMajors = [];

            // Fetch Daily Data
            try {
                if (isMounted && isInitialAppLoadRef.current) setLoadingMessageIndex(prev => (prev + 1) % INITIAL_LOADING_MESSAGES.length);
                const dailyRes = await fetchUsgsData(USGS_API_URL_DAY);
                if (!isMounted) return;

                if (!dailyRes.error && dailyRes.features) {
                    if (isMounted && isInitialAppLoadRef.current) setLoadingMessageIndex(prev => (prev + 1) % INITIAL_LOADING_MESSAGES.length);
                    const dD = dailyRes.features;
                    setEarthquakesLastHour(filterByTime(dD, 1, 0, nowForFiltering));
                    setEarthquakesPriorHour(filterByTime(dD, 2, 1, nowForFiltering));
                    const l24 = filterByTime(dD, 24, 0, nowForFiltering);
                    setEarthquakesLast24Hours(l24);

                    setHasRecentTsunamiWarning(l24.some(q => q.properties.tsunami === 1));
                    const alertsIn24hr = l24.map(q => q.properties.alert).filter(a => a && a !== 'green' && ALERT_LEVELS[a.toUpperCase()]);
                    const currentHighestAlertValue = alertsIn24hr.length > 0 ? alertsIn24hr.sort((a,b) => ({ 'red':0, 'orange':1, 'yellow':2 }[a] - { 'red':0, 'orange':1, 'yellow':2 }[b]))[0] : null;
                    setHighestRecentAlert(currentHighestAlertValue);
                    if (currentHighestAlertValue && ALERT_LEVELS[currentHighestAlertValue.toUpperCase()]) {
                        setActiveAlertTriggeringQuakes(l24.filter(q => q.properties.alert === currentHighestAlertValue));
                    } else {
                        setActiveAlertTriggeringQuakes([]);
                    }
                    
                    fetchedDailyMajors = dD.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD).sort((a, b) => b.properties.time - a.properties.time);
                    setDataFetchTime(nowForFiltering);
                    setLastUpdated(new Date(dailyRes.metadata?.generated || nowForFiltering).toLocaleString());
                } else {
                    dailyErrorMsg = dailyRes?.error?.message || "Daily data features are missing.";
                }
            } catch (e) {
                if (!isMounted) return;
                dailyErrorMsg = e.message || "Error processing daily data.";
            } finally {
                if (isMounted) setIsLoadingDaily(false);
            }

            // Fetch Weekly Data
            try {
                if (isMounted && isInitialAppLoadRef.current) setLoadingMessageIndex(prev => (prev + 1) % INITIAL_LOADING_MESSAGES.length);
                const weeklyResult = await fetchUsgsData(USGS_API_URL_WEEK);
                if (!isMounted) return;

                if (!weeklyResult.error && weeklyResult.features) {
                    if (isMounted && isInitialAppLoadRef.current) setLoadingMessageIndex(prev => (prev + 1) % INITIAL_LOADING_MESSAGES.length);
                    const weeklyData = weeklyResult.features;
                    const last72HoursData = filterByTime(weeklyData, 72, 0, nowForFiltering);
                    setEarthquakesLast72Hours(last72HoursData);
                    setPrev24HourData(filterByTime(weeklyData, 48, 24, nowForFiltering)); // 24-48 hours ago
                    setEarthquakesLast7Days(filterByTime(weeklyData, 7 * 24, 0, nowForFiltering));
                    
                    const sortedForGlobe = [...last72HoursData].sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0));
                    setGlobeEarthquakes(sortedForGlobe.slice(0, 900));

                    fetchedWeeklyMajors = weeklyData.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD).sort((a, b) => b.properties.time - a.properties.time);
                } else {
                    weeklyErrorMsg = weeklyResult?.error?.message || "Weekly data features are missing.";
                }
            } catch (e) {
                if (!isMounted) return;
                weeklyErrorMsg = e.message || "Error processing weekly data.";
            } finally {
                if (isMounted) setIsLoadingWeekly(false);
            }
            
            // Consolidate Major Quakes from Daily/Weekly (initial pass, monthly can override)
            if (isMounted) {
                let consolidatedMajors = [...fetchedDailyMajors, ...fetchedWeeklyMajors];
                // Add existing lastMajorQuake if it's not in the new fetches, it might be from monthly or a previous interval
                if (lastMajorQuake && !consolidatedMajors.find(q => q.id === lastMajorQuake.id)) {
                    consolidatedMajors.push(lastMajorQuake);
                }

                consolidatedMajors = consolidatedMajors
                    .sort((a, b) => b.properties.time - a.properties.time)
                    .filter((quake, index, self) => index === self.findIndex(q => q.id === quake.id)); // Deduplicate

                const newLastMajor = consolidatedMajors.length > 0 ? consolidatedMajors[0] : null;
                const newPreviousMajor = consolidatedMajors.length > 1 ? consolidatedMajors[1] : null;

                setLastMajorQuake(newLastMajor);
                setPreviousMajorQuake(newPreviousMajor);
                if (newLastMajor && newPreviousMajor) {
                    setTimeBetweenPreviousMajorQuakes(newLastMajor.properties.time - newPreviousMajor.properties.time);
                } else {
                    setTimeBetweenPreviousMajorQuakes(null);
                }

                if (dailyErrorMsg && weeklyErrorMsg) setError("Failed to fetch critical daily and weekly earthquake data.");
                else if (dailyErrorMsg) setError(`Daily data error: ${dailyErrorMsg}. Weekly data loaded.`);
                else if (weeklyErrorMsg) setError(`Weekly data error: ${weeklyErrorMsg}. Daily data loaded.`);
                else setError(null);
                
                if (isInitialAppLoadRef.current) {
                    isInitialAppLoadRef.current = false;
                }
            }
        };

        orchestrateInitialDataLoad();
        const intervalId = setInterval(orchestrateInitialDataLoad, REFRESH_INTERVAL_MS);
        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Runs once on mount and sets up interval

    // Loading message cycling effect
    useEffect(() => {
        let messageInterval;
        if (isInitialAppLoadRef.current && (isLoadingDaily || isLoadingWeekly)) {
            messageInterval = setInterval(() => {
                setLoadingMessageIndex(prevIndex => (prevIndex + 1) % currentLoadingMessages.length);
            }, LOADING_MESSAGE_INTERVAL_MS);
        }
        return () => clearInterval(messageInterval);
    }, [isLoadingDaily, isLoadingWeekly, currentLoadingMessages.length]);


    // loadMonthlyData function (adapted from useMonthlyEarthquakeData)
    const loadMonthlyData = useCallback(async () => {
        setIsLoadingMonthly(true);
        setHasAttemptedMonthlyLoad(true);
        setMonthlyError(null);

        setAllEarthquakes([]);
        setEarthquakesLast14Days([]);
        setEarthquakesLast30Days([]);
        setPrev7DayData([]);
        setPrev14DayData([]);
        
        const nowForFiltering = Date.now();
        // Helper for monthly data (days to hours)
        const filterMonthlyByTime = (data, daysAgoStart, daysAgoEnd = 0) => {
             if (!Array.isArray(data)) return [];
             const startTime = nowForFiltering - (daysAgoStart * 24 * 36e5);
             const endTime = nowForFiltering - (daysAgoEnd * 24 * 36e5);
             return data.filter(q => q.properties.time >= startTime && q.properties.time < endTime);
        };

        try {
            const monthlyResult = await fetchUsgsData(USGS_API_URL_MONTH);
            if (!monthlyResult.error && monthlyResult.features && monthlyResult.features.length > 0) {
                const monthlyData = monthlyResult.features;
                setAllEarthquakes(monthlyData);

                setEarthquakesLast14Days(filterMonthlyByTime(monthlyData, 14, 0));
                setEarthquakesLast30Days(filterMonthlyByTime(monthlyData, 30, 0));
                setPrev7DayData(filterMonthlyByTime(monthlyData, 14, 7)); // 7-14 days ago
                setPrev14DayData(filterMonthlyByTime(monthlyData, 28, 14)); // 14-28 days ago

                const fetchedMonthlyMajors = monthlyData
                    .filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD)
                    .sort((a, b) => b.properties.time - a.properties.time);

                // Consolidate with existing major quakes (which might be from daily/weekly)
                // `lastMajorQuake` state already holds the latest from daily/weekly/previous monthly
                let consolidatedMajors = [...fetchedMonthlyMajors];
                if (lastMajorQuake && !consolidatedMajors.find(q => q.id === lastMajorQuake.id)) {
                    consolidatedMajors.push(lastMajorQuake);
                }
                if (previousMajorQuake && !consolidatedMajors.find(q => q.id === previousMajorQuake.id)) {
                    consolidatedMajors.push(previousMajorQuake);
                }
                
                consolidatedMajors = consolidatedMajors
                    .sort((a,b) => b.properties.time - a.properties.time)
                    .filter((quake, index, self) => index === self.findIndex(q => q.id === quake.id)); // Deduplicate

                const finalLastMajor = consolidatedMajors.length > 0 ? consolidatedMajors[0] : null;
                const finalPreviousMajor = consolidatedMajors.length > 1 ? consolidatedMajors[1] : null;

                setLastMajorQuake(finalLastMajor);
                setPreviousMajorQuake(finalPreviousMajor);

                if (finalLastMajor && finalPreviousMajor) {
                    setTimeBetweenPreviousMajorQuakes(finalLastMajor.properties.time - finalPreviousMajor.properties.time);
                } else {
                    setTimeBetweenPreviousMajorQuakes(null);
                }
                 setMonthlyError(null);
            } else {
                setMonthlyError(monthlyResult?.error?.message || "Monthly data is unavailable or incomplete.");
            }
        } catch (e) {
            setMonthlyError(`Monthly Data Processing Error: ${e.message || "An unexpected error occurred."}`);
        } finally {
            setIsLoadingMonthly(false);
        }
    }, [lastMajorQuake, previousMajorQuake]); // Dependencies for major quake consolidation


    const isLoadingInitialData = useMemo(() => (isLoadingDaily || isLoadingWeekly) && isInitialAppLoadRef.current, [isLoadingDaily, isLoadingWeekly]);
    const currentLoadingMessage = useMemo(() => currentLoadingMessages[loadingMessageIndex], [currentLoadingMessages, loadingMessageIndex]);
    
    const contextValue = useMemo(() => ({
        isLoadingDaily,
        isLoadingWeekly,
        isLoadingInitialData, // Combines initial load status
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
        previousMajorQuake,
        timeBetweenPreviousMajorQuakes,
        currentLoadingMessage,
        isInitialAppLoad: isInitialAppLoadRef.current, // Expose the boolean value
        // Monthly data states
        isLoadingMonthly,
        hasAttemptedMonthlyLoad,
        monthlyError,
        allEarthquakes,
        earthquakesLast14Days,
        earthquakesLast30Days,
        prev7DayData,
        prev14DayData,
        // Function to trigger monthly data load
        loadMonthlyData,
        // No need to expose setters like setLastMajorQuake to the context consumers directly
        // as they are managed internally by the provider now.
    }), [
        isLoadingDaily, isLoadingWeekly, isLoadingInitialData, error, dataFetchTime, lastUpdated,
        earthquakesLastHour, earthquakesPriorHour, earthquakesLast24Hours, earthquakesLast72Hours,
        earthquakesLast7Days, prev24HourData, globeEarthquakes, hasRecentTsunamiWarning,
        highestRecentAlert, activeAlertTriggeringQuakes, lastMajorQuake, previousMajorQuake,
        timeBetweenPreviousMajorQuakes, currentLoadingMessage, 
        isLoadingMonthly, hasAttemptedMonthlyLoad, monthlyError, allEarthquakes,
        earthquakesLast14Days, earthquakesLast30Days, prev7DayData, prev14DayData, loadMonthlyData
        // Note: isInitialAppLoadRef.current is not a state, so it doesn't need to be in deps for contextValue if it only changes `isInitialAppLoad`
        // but to be safe and ensure context updates when its value for `isInitialAppLoad` changes:
        // However, since it's a ref, its change doesn't trigger re-render for contextValue.
        // The `isInitialAppLoad` property in contextValue will update when other state dependencies cause a re-render.
        // This is acceptable.
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
