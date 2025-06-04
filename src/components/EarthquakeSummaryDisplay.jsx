// src/components/EarthquakeSummaryDisplay.jsx
import React, { useState, useEffect } from 'react';
import SkeletonText from './skeletons/SkeletonText'; // Assuming SkeletonText is available

/**
 * Fetches and displays earthquake summary data from the /api/earthquake-summary endpoint.
 * This includes the count of all earthquakes in the past hour and significant earthquakes in the past day.
 */
const EarthquakeSummaryDisplay = () => {
  const [summaryData, setSummaryData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSummary = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/earthquake-summary');
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: response.statusText }));
          throw new Error(`Failed to fetch summary: ${response.status} ${errorData.message || response.statusText}`);
        }
        const data = await response.json();
        setSummaryData(data);
      } catch (err) {
        console.error("Error fetching earthquake summary:", err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSummary();
    // Optional: Set up an interval to periodically refresh the data
    const intervalId = setInterval(fetchSummary, 5 * 60 * 1000); // Refresh every 5 minutes

    return () => clearInterval(intervalId); // Cleanup interval on component unmount
  }, []);

  if (error) {
    return (
      <div className="text-xs sm:text-sm text-red-400" role="alert">
        <p>Summary Error:</p>
        <p>{error.length > 50 ? error.substring(0, 50) + '...' : error}</p>
      </div>
    );
  }

  const allPastHourCount = summaryData?.all_quakes_past_hour?.count;
  const significantPastDayCount = summaryData?.significant_quakes_past_day?.count;

  return (
    <>
      <div className="text-xs sm:text-sm">
        Last Hour:
        {isLoading && !allPastHourCount ? (
          <SkeletonText width="w-6" height="h-5" className="inline-block ml-1 bg-slate-600" />
        ) : (
          <span className="font-bold text-sm sm:text-base text-sky-300 ml-1">
            {typeof allPastHourCount === 'number' ? allPastHourCount : 'N/A'}
          </span>
        )}
      </div>
      <div className="text-xs sm:text-sm">
        Significant (24h):
        {isLoading && !significantPastDayCount ? (
          <SkeletonText width="w-6" height="h-5" className="inline-block ml-1 bg-slate-600" />
        ) : (
          <span className="font-bold text-sm sm:text-base text-orange-300 ml-1">
            {typeof significantPastDayCount === 'number' ? significantPastDayCount : 'N/A'}
          </span>
        )}
      </div>
    </>
  );
};

export default EarthquakeSummaryDisplay;
