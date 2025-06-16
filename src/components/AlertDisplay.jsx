import React, { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext';
import { getMagnitudeColorStyle, formatTimeAgo } from '../utils/utils'; // Added formatTimeAgo

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

  // Style for tsunami alerts, using the lightest magnitude color and updated rounding
  const tsunamiAlertClasses = `${getMagnitudeColorStyle(0.5)} p-2.5 rounded-lg shadow-md text-xs cursor-pointer`; // Changed to rounded-lg

  return (
    <>
      {currentAlertConfig && (
        <div
            className={`p-2.5 rounded-lg shadow-md text-xs ${ALERT_LEVELS[currentAlertConfig.text.toUpperCase()]?.detailsColorClass || ALERT_LEVELS[currentAlertConfig.text.toUpperCase()]?.colorClass} cursor-pointer`} // Removed border-l-4, changed rounded-r-md to rounded-lg
            onClick={() => activeAlertTriggeringQuakes && activeAlertTriggeringQuakes.length > 0 && handleAlertClick(activeAlertTriggeringQuakes[0])}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { activeAlertTriggeringQuakes && activeAlertTriggeringQuakes.length > 0 && handleAlertClick(activeAlertTriggeringQuakes[0]); } }}
        >
          <p className="font-bold text-sm mb-1">Active USGS Alert: {currentAlertConfig.text}</p>
          <p className="text-xs">{currentAlertConfig.description}</p>
        </div>
      )}

      {hasRecentTsunamiWarning && !currentAlertConfig && tsunamiTriggeringQuake && ( // Added null check for tsunamiTriggeringQuake
        <div
            className={tsunamiAlertClasses}
            onClick={() => handleAlertClick(tsunamiTriggeringQuake)} // Simplified onClick
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { handleAlertClick(tsunamiTriggeringQuake); } }} // Simplified onKeyDown
        >
          <p className="font-bold text-sm mb-1">Tsunami Information</p>
          <div className="flex justify-between items-center text-xs mb-1">
            <span className="font-bold">
              M {tsunamiTriggeringQuake.properties?.mag?.toFixed(1) || 'N/A'}
            </span>
            <span>
              {tsunamiTriggeringQuake.properties?.time ? formatTimeAgo(Date.now() - tsunamiTriggeringQuake.properties.time) : 'Time N/A'}
            </span>
          </div>
          <p className="truncate text-[11px] font-medium mb-1" title={tsunamiTriggeringQuake.properties?.place || undefined}>
            {tsunamiTriggeringQuake.properties?.place || "Location details pending..."}
          </p>
          <p className="text-xs">Recent quakes may indicate tsunami activity. Please check official channels for alerts.</p>
        </div>
      )}
    </>
  );
};

export default memo(AlertDisplay);
