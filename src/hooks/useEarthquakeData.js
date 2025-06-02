// src/hooks/useEarthquakeData.js
import { useEffect, useCallback, useRef, useState } from 'react';
// Removed useContext and EarthquakeDataContext import
import {
    USGS_API_URL_DAY,
    USGS_API_URL_WEEK,
    REFRESH_INTERVAL_MS,
    MAJOR_QUAKE_THRESHOLD,
    ALERT_LEVELS,
    INITIAL_LOADING_MESSAGES,
    LOADING_MESSAGE_INTERVAL_MS
} from '../constants/appConstants';

const useEarthquakeData = (
    fetchDataCb,
    { // Props object for state values and setters from the provider
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
    }
) => {
    const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

    // orchestrateInitialDataLoad will now directly use the passed-in setters and state values
    const orchestrateInitialDataLoad = useCallback(async (isMountedRef) => {
        if (!isMountedRef.current) return;

        setLoadingStatus({ daily: true, weekly: true, initial: isInitialAppLoad });
        if (isInitialAppLoad) {
            setCurrentLoadingMessage(INITIAL_LOADING_MESSAGES[0]);
            setLoadingMessageIndex(0);
        }
        setErrorState({ type: 'main', message: null });

        const nowForFiltering = Date.now();
        const filterByTime = (data, hoursAgoStart, hoursAgoEnd = 0) => {
            if (!Array.isArray(data)) return [];
            return data.filter(q =>
                q.properties.time >= (nowForFiltering - hoursAgoStart * 36e5) &&
                q.properties.time < (nowForFiltering - hoursAgoEnd * 36e5)
            );
        };

        let dailyErrorMsg = null;
        let weeklyErrorMsg = null;
        let fetchedDailyData = null;
        let fetchedWeeklyData = null;

        try {
            const dailyRes = await fetchDataCb(USGS_API_URL_DAY);
            if (!isMountedRef.current) return;

            if (dailyRes?.features) {
                fetchedDailyData = dailyRes.features;
                const l24 = filterByTime(fetchedDailyData, 24);
                const hasTsunamiWarning = l24.some(q => q.properties.tsunami === 1);
                const alertsIn24hr = l24.map(q => q.properties.alert).filter(a => a && a !== 'green' && ALERT_LEVELS[a?.toUpperCase()]);
                const currentHighestAlertValue = alertsIn24hr.length > 0 ? alertsIn24hr.sort((a,b) => ({ 'RED':0, 'ORANGE':1, 'YELLOW':2 }[a.toUpperCase()] - { 'RED':0, 'ORANGE':1, 'YELLOW':2 }[b.toUpperCase()]))[0] : null;
                
                setDailyEarthquakeData({
                    lastHour: filterByTime(fetchedDailyData, 1),
                    priorHour: filterByTime(fetchedDailyData, 2, 1),
                    last24: l24,
                    hasTsunamiWarning: hasTsunamiWarning,
                    highestAlert: currentHighestAlertValue,
                    activeAlerts: currentHighestAlertValue ? l24.filter(q => q.properties.alert === currentHighestAlertValue) : []
                });
                setDataFetchTime(nowForFiltering); 
                setLastUpdated(new Date(dailyRes.metadata?.generated || nowForFiltering).toLocaleString());
            } else {
                dailyErrorMsg = dailyRes?.metadata?.errorMessage || "Daily data features are missing.";
            }
        } catch (e) {
            if (!isMountedRef.current) return;
            dailyErrorMsg = e.message;
        } finally {
            if (isMountedRef.current) {
                setLoadingStatus({ daily: false });
            }
        }

        try {
            const weeklyResult = await fetchDataCb(USGS_API_URL_WEEK);
            if (!isMountedRef.current) return;

            if (weeklyResult?.features) {
                fetchedWeeklyData = weeklyResult.features;
                const last72HoursData = filterByTime(fetchedWeeklyData, 72);
                setWeeklyEarthquakeData({
                    last72Hours: last72HoursData,
                    last7Days: filterByTime(fetchedWeeklyData, 7 * 24),
                    prev24Hour: filterByTime(fetchedWeeklyData, 48, 24),
                    globe: [...last72HoursData].sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0)).slice(0, 900)
                });
            } else {
                weeklyErrorMsg = weeklyResult?.metadata?.errorMessage || "Weekly data features are missing.";
            }
        } catch (e) {
            if (!isMountedRef.current) return;
            weeklyErrorMsg = e.message;
        } finally {
            if (isMountedRef.current) {
                setLoadingStatus({ weekly: false });
            }
        }
        
        if (isMountedRef.current) {
            const dailyMajors = (fetchedDailyData || [])
                .filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD);
            const weeklyMajors = (fetchedWeeklyData || [])
                .filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD);

            const potentialNewMajors = [...dailyMajors, ...weeklyMajors]
                .sort((a, b) => b.properties.time - a.properties.time)
                .filter((quake, index, self) => index === self.findIndex(q => q.id === quake.id));

            if (potentialNewMajors.length > 0) {
                potentialNewMajors.forEach(mq => updateLastMajorQuake(mq));
            }
        }

        if (isMountedRef.current) {
            if (dailyErrorMsg && weeklyErrorMsg) {
                setErrorState({ type: 'main', message: "Failed to fetch critical earthquake data. Some features may be unavailable." });
            } else if (dailyErrorMsg) {
                setErrorState({ type: 'main', message: `Daily data error: ${dailyErrorMsg}. Some features may be affected.` });
            } else if (weeklyErrorMsg) {
                setErrorState({ type: 'main', message: `Weekly data error: ${weeklyErrorMsg}. Some features may be affected.` });
            } else {
                setErrorState({ type: 'main', message: null });
            }

            if (isInitialAppLoad) { // Read directly from passed prop
                setIsInitialAppLoad(false); 
                setLoadingStatus({ initial: false });
            }
        }
    }, [
        fetchDataCb, isInitialAppLoad, setLoadingStatus, setErrorState, 
        setDailyEarthquakeData, setWeeklyEarthquakeData, updateLastMajorQuake, 
        setDataFetchTime, setLastUpdated, setCurrentLoadingMessage, setIsInitialAppLoad
    ]); 

    useEffect(() => {
        const isMountedRef = { current: true };
        orchestrateInitialDataLoad(isMountedRef);
        const intervalId = setInterval(() => orchestrateInitialDataLoad(isMountedRef), REFRESH_INTERVAL_MS);
        
        return () => {
            isMountedRef.current = false;
            clearInterval(intervalId);
        };
    }, [orchestrateInitialDataLoad]);

    // Effect for loading message animation
    useEffect(() => {
        let messageInterval;
        // Use passed-in state values for isLoadingDaily, isLoadingWeekly, and isInitialAppLoad
        if (isInitialAppLoad && (isLoadingDaily || isLoadingWeekly)) {
            messageInterval = setInterval(() => {
                setLoadingMessageIndex(prevIndex => {
                    const nextIndex = (prevIndex + 1) % INITIAL_LOADING_MESSAGES.length;
                    setCurrentLoadingMessage(INITIAL_LOADING_MESSAGES[nextIndex]); // Use passed-in setter
                    return nextIndex;
                });
            }, LOADING_MESSAGE_INTERVAL_MS);
        }
        return () => clearInterval(messageInterval);
    }, [isLoadingDaily, isLoadingWeekly, isInitialAppLoad, setCurrentLoadingMessage]);


    return {
        forceRefresh: () => orchestrateInitialDataLoad({current: true}), 
    };
};

export default useEarthquakeData;
