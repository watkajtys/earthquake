import { useCallback, useContext } from 'react';
import { EarthquakeDataContext } from '../contexts/EarthquakeDataContext';
import { USGS_API_URL_MONTH, MAJOR_QUAKE_THRESHOLD } from '../constants/appConstants';

/**
 * Custom hook for managing the fetching and processing of monthly earthquake data from USGS.
 * This hook provides a function to load monthly data, which then updates the shared
 * state in EarthquakeDataContext, including consolidating major quake information.
 *
 * @param {function} fetchDataCb - Callback function responsible for fetching data from a given URL.
 * @returns {object} An object containing:
 * @property {function} loadMonthlyData - An asynchronous function that triggers the fetch and processing of monthly data.
 */
const useMonthlyEarthquakeData = (fetchDataCb) => {
    const context = useContext(EarthquakeDataContext);

    // Destructure necessary states and setters from context
    const {
        // States to read for major quake consolidation
        lastMajorQuake,
        previousMajorQuake,
        // Setters for monthly data
        setIsLoadingMonthly,
        setHasAttemptedMonthlyLoad,
        setMonthlyError,
        setAllEarthquakes,
        setEarthquakesLast14Days,
        setEarthquakesLast30Days,
        setPrev7DayData,
        setPrev14DayData,
        // Setters for major quake data (to update global state)
        setLastMajorQuake,
        setPreviousMajorQuake,
        setTimeBetweenPreviousMajorQuakes,
    } = context;

    const loadMonthlyData = useCallback(async () => {
        setIsLoadingMonthly(true);
        setHasAttemptedMonthlyLoad(true);
        setMonthlyError(null);

        // Initialize data arrays in context to empty
        setAllEarthquakes([]);
        setEarthquakesLast14Days([]);
        setEarthquakesLast30Days([]);
        setPrev7DayData([]);
        setPrev14DayData([]);

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
                setAllEarthquakes(monthlyData);

                setEarthquakesLast14Days(filterByTime(monthlyData, 14, 0));
                setEarthquakesLast30Days(filterByTime(monthlyData, 30, 0));
                setPrev7DayData(filterByTime(monthlyData, 14, 7)); // 7-14 days ago
                setPrev14DayData(filterByTime(monthlyData, 28, 14)); // 14-28 days ago

                const majorQuakesMonthly = monthlyData
                    .filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD)
                    .sort((a, b) => b.properties.time - a.properties.time);

                let consolidatedMajors = [...majorQuakesMonthly];
                // Use lastMajorQuake from context
                if (lastMajorQuake && !consolidatedMajors.find(q => q.id === lastMajorQuake.id)) {
                    consolidatedMajors.push(lastMajorQuake);
                }
                 // Optionally, consider previousMajorQuake from context as well if it could be relevant
                if (previousMajorQuake && !consolidatedMajors.find(q => q.id === previousMajorQuake.id)) {
                    consolidatedMajors.push(previousMajorQuake);
                }


                consolidatedMajors = consolidatedMajors
                    .sort((a,b) => b.properties.time - a.properties.time)
                    .filter((quake, index, self) => index === self.findIndex(q => q.id === quake.id)); // Deduplicate

                const finalLastMajorQuake = consolidatedMajors.length > 0 ? consolidatedMajors[0] : null;
                const finalPreviousMajorQuake = consolidatedMajors.length > 1 ? consolidatedMajors[1] : null;

                // Update global major quake states via context setters
                setLastMajorQuake(finalLastMajorQuake);
                setPreviousMajorQuake(finalPreviousMajorQuake);

                if (finalLastMajorQuake && finalPreviousMajorQuake) {
                    setTimeBetweenPreviousMajorQuakes(finalLastMajorQuake.properties.time - finalPreviousMajorQuake.properties.time);
                } else {
                    setTimeBetweenPreviousMajorQuakes(null);
                }

            } else {
                const errorMsg = monthlyResult?.metadata?.errorMessage || "Monthly data is currently unavailable or incomplete.";
                console.error("Monthly data features are missing or empty:", monthlyResult);
                setMonthlyError(errorMsg);
            }
        } catch (e) {
            console.error("Failed to fetch monthly data:", e);
            setMonthlyError(`Monthly Data Error: ${e.message}`);
        } finally {
            setIsLoadingMonthly(false);
        }
    }, [
        fetchDataCb,
        // Context states read
        lastMajorQuake,
        previousMajorQuake,
        // Context setters used
        setIsLoadingMonthly,
        setHasAttemptedMonthlyLoad,
        setMonthlyError,
        setAllEarthquakes,
        setEarthquakesLast14Days,
        setEarthquakesLast30Days,
        setPrev7DayData,
        setPrev14DayData,
        setLastMajorQuake,
        setPreviousMajorQuake,
        setTimeBetweenPreviousMajorQuakes,
    ]);

    return {
        loadMonthlyData,
    };
};

export default useMonthlyEarthquakeData;
