// src/hooks/useMonthlyEarthquakeData.js
import { useCallback } from 'react';
// Removed useContext and EarthquakeDataContext import
import { USGS_API_URL_MONTH, MAJOR_QUAKE_THRESHOLD } from '../constants/appConstants';

const useMonthlyEarthquakeData = (
    fetchDataCb,
    { // Props object for state value and setters from the provider
        lastMajorQuake, // Read this from provider's state
        setLoadingStatus,
        setErrorState,
        setMonthlyEarthquakeData,
        updateLastMajorQuake,
        setHasAttemptedMonthlyLoad
    }
) => {
    const loadMonthlyData = useCallback(async () => {
        setLoadingStatus({ monthly: true });
        setHasAttemptedMonthlyLoad(true);
        setErrorState({ type: 'monthly', message: null });

        const nowForFiltering = Date.now();
        const filterByTime = (data, daysAgoStart, daysAgoEnd = 0) => {
            if (!Array.isArray(data)) return [];
            return data.filter(q =>
                q.properties.time >= (nowForFiltering - (daysAgoStart * 24 * 36e5)) &&
                q.properties.time < (nowForFiltering - (daysAgoEnd * 24 * 36e5))
            );
        };

        try {
            const monthlyResult = await fetchDataCb(USGS_API_URL_MONTH);
            if (monthlyResult?.features && monthlyResult.features.length > 0) {
                const monthlyData = monthlyResult.features;
                
                setMonthlyEarthquakeData({
                    all: monthlyData,
                    last14: filterByTime(monthlyData, 14, 0),
                    last30: filterByTime(monthlyData, 30, 0),
                    prev7: filterByTime(monthlyData, 14, 7),
                    prev14: filterByTime(monthlyData, 28, 14)
                });

                const majorQuakesMonthly = monthlyData
                    .filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD)
                    .sort((a, b) => b.properties.time - a.properties.time);

                let consolidatedMajors = [...majorQuakesMonthly];
                // Use the passed lastMajorQuake state value for consolidation
                if (lastMajorQuake && !consolidatedMajors.find(q => q.id === lastMajorQuake.id)) {
                    consolidatedMajors.push(lastMajorQuake);
                }

                consolidatedMajors = consolidatedMajors
                    .sort((a, b) => b.properties.time - a.properties.time)
                    .filter((quake, index, self) => index === self.findIndex(q => q.id === quake.id));

                consolidatedMajors.forEach(quake => {
                    updateLastMajorQuake(quake);
                });

            } else {
                const errorMsg = monthlyResult?.metadata?.errorMessage || "Monthly data is currently unavailable or incomplete.";
                console.error("Monthly data features are missing or empty:", monthlyResult);
                setErrorState({ type: 'monthly', message: errorMsg });
            }
        } catch (e) {
            console.error("Failed to fetch monthly data:", e);
            setErrorState({ type: 'monthly', message: `Monthly Data Error: ${e.message}` });
        } finally {
            setLoadingStatus({ monthly: false });
        }
    }, [
        fetchDataCb, 
        lastMajorQuake, // Dependency
        setLoadingStatus, 
        setErrorState, 
        setMonthlyEarthquakeData, 
        updateLastMajorQuake, 
        setHasAttemptedMonthlyLoad
    ]);

    return {
        loadMonthlyData,
    };
};

export default useMonthlyEarthquakeData;
