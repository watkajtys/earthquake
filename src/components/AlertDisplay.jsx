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
 * @returns {JSX.Element|null} The AlertDisplay component or null if there are no alerts to display.
 */
const AlertDisplay = ({ currentAlertConfig, hasRecentTsunamiWarning }) => { // ALERT_LEVELS removed from props
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

  /**
   * Determines a numerical magnitude value for styling PAGER alerts based on alert level text.
   * These magnitudes are then used with `getMagnitudeColorStyle` to get appropriate Tailwind classes.
   * @param {string|undefined|null} alertLevelText - The text of the alert level (e.g., "GREEN", "YELLOW").
   * @returns {number|null} A numerical magnitude to be used for styling, or null for default/unknown.
   */
  const getPagerMagnitudeForStyling = (alertLevelText) => {
    switch (alertLevelText?.toUpperCase()) {
      case 'GREEN':
        return 3.0; // Yields emerald-400
      case 'YELLOW':
        return 4.5; // Yields yellow-400
      case 'ORANGE':
        return 6.5; // Yields orange-500
      case 'RED':
        return 7.5; // Yields red-500
      default:
        // Fallback to a neutral style if somehow an unknown alert level text is received
        return null;
    }
  };

  // Style for tsunami alerts, using Magnitude 1.5 blue (cyan-400)
  const tsunamiAlertClasses = `${getMagnitudeColorStyle(1.5)} p-2.5 rounded-lg shadow-md text-xs cursor-pointer`;

  // Determine PAGER alert classes
  let pagerAlertClasses = 'p-2.5 rounded-lg shadow-md text-xs cursor-pointer'; // Base classes
  if (currentAlertConfig) {
    const pagerMag = getPagerMagnitudeForStyling(currentAlertConfig.text);
    pagerAlertClasses = `${getMagnitudeColorStyle(pagerMag)} p-2.5 rounded-lg shadow-md text-xs cursor-pointer`;
  }


  return (
    <>
      {currentAlertConfig && (
        <div
            className={pagerAlertClasses} // Use the new pagerAlertClasses
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
              {tsunamiTriggeringQuake.properties?.time ? formatTimeAgo(tsunamiTriggeringQuake.properties.time) : 'Time N/A'}
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
