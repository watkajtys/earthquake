import React, { memo } from 'react';

const AlertDisplay = ({ currentAlertConfig, hasRecentTsunamiWarning, ALERT_LEVELS }) => {
  if (!currentAlertConfig && !hasRecentTsunamiWarning) {
    return null;
  }

  return (
    <>
      {currentAlertConfig && (
        <div className={`border-l-4 p-2.5 rounded-r-md shadow-md text-xs ${ALERT_LEVELS[currentAlertConfig.text.toUpperCase()]?.detailsColorClass || ALERT_LEVELS[currentAlertConfig.text.toUpperCase()]?.colorClass}`}>
          <p className="font-bold text-sm mb-1">Active USGS Alert: {currentAlertConfig.text}</p>
          <p className="text-xs">{currentAlertConfig.description}</p>
        </div>
      )}

      {hasRecentTsunamiWarning && !currentAlertConfig && (
        <div className="bg-sky-700 bg-opacity-40 border-l-4 border-sky-500 text-sky-200 p-2.5 rounded-md shadow-md text-xs" role="alert">
          <p className="font-bold mb-1">Tsunami Information</p>
          <p className="text-xs">Recent quakes may indicate tsunami activity. Please check official channels for alerts.</p>
        </div>
      )}
    </>
  );
};

export default memo(AlertDisplay);
