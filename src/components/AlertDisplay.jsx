import React, { memo, useCallback } from 'react'; // Add useCallback
import { useNavigate } from 'react-router-dom';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext'; // Add this

/**
 * Displays alerts related to seismic activity, including USGS alerts and tsunami warnings.
 * It uses data from the EarthquakeDataContext to determine which alerts to show.
 * The component is memoized for performance optimization.
 *
 * @component
 * @param {Object} props - The component props.
 * @param {Object} props.currentAlertConfig - Configuration object for the current USGS alert. Contains text and description.
 * @param {boolean} props.hasRecentTsunamiWarning - Flag indicating if there's a recent tsunami warning.
 * @param {Object} props.ALERT_LEVELS - Object mapping alert levels (e.g., "RED", "ORANGE") to their corresponding color classes.
 * @returns {JSX.Element|null} The AlertDisplay component or null if there are no alerts to display.
 */
const AlertDisplay = ({ currentAlertConfig, hasRecentTsunamiWarning, ALERT_LEVELS }) => {
  // Consume data from EarthquakeDataContext (tsunamiTriggeringQuake will be used later)
  const { tsunamiTriggeringQuake, activeAlertTriggeringQuakes } = useEarthquakeDataState();
  const navigate = useNavigate();

  /**
   * Handles click events on an alert.
   * Navigates to the detail page of the associated earthquake.
   * It tries to get the detail URL from `quake.properties.detail` first,
   * then constructs a URL using `quake.id` if the first is not available.
   * Logs a warning if no valid quake data is found for navigation.
   * @param {Object} quake - The earthquake object associated with the alert.
   */
  const handleAlertClick = useCallback((quake) => {
    if (quake && quake.properties && quake.properties.detail) {
        const detailUrl = quake.properties.detail;
        navigate(`/quake/${encodeURIComponent(detailUrl)}`);
    } else if (quake && quake.id) {
        const detailUrl = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${quake.id}.geojson`;
        navigate(`/quake/${encodeURIComponent(detailUrl)}`);
    } else {
        console.warn("Alert clicked, but no valid quake data found to navigate.", quake);
    }
  }, [navigate]);

  if (!currentAlertConfig && !hasRecentTsunamiWarning) {
    return null;
  }

  return (
    <>
      {currentAlertConfig && (
        <div
            className={`border-l-4 p-2.5 rounded-r-md shadow-md text-xs ${ALERT_LEVELS[currentAlertConfig.text.toUpperCase()]?.detailsColorClass || ALERT_LEVELS[currentAlertConfig.text.toUpperCase()]?.colorClass} cursor-pointer`} // Add cursor-pointer
            onClick={() => activeAlertTriggeringQuakes && activeAlertTriggeringQuakes.length > 0 && handleAlertClick(activeAlertTriggeringQuakes[0])} // Add onClick
            role="button" // Add role
            tabIndex={0} // Add tabIndex for accessibility
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { activeAlertTriggeringQuakes && activeAlertTriggeringQuakes.length > 0 && handleAlertClick(activeAlertTriggeringQuakes[0]); } }} // Add keyboard accessibility
        >
          <p className="font-bold text-sm mb-1">Active USGS Alert: {currentAlertConfig.text}</p>
          <p className="text-xs">{currentAlertConfig.description}</p>
        </div>
      )}

      {hasRecentTsunamiWarning && !currentAlertConfig && ( // This condition might need to be re-evaluated if a tsunami alert can also be the currentAlertConfig
        <div
            className="bg-sky-700 bg-opacity-40 border-l-4 border-sky-500 text-sky-200 p-2.5 rounded-md shadow-md text-xs cursor-pointer" // Add cursor-pointer
            onClick={() => tsunamiTriggeringQuake && handleAlertClick(tsunamiTriggeringQuake)} // Add onClick
            role="button" // Add role
            tabIndex={0} // Add tabIndex for accessibility
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { tsunamiTriggeringQuake && handleAlertClick(tsunamiTriggeringQuake); } }} // Add keyboard accessibility
        >
          <p className="font-bold mb-1">Tsunami Information</p>
          <p className="text-xs">Recent quakes may indicate tsunami activity. Please check official channels for alerts.</p>
        </div>
      )}
    </>
  );
};

export default memo(AlertDisplay);
