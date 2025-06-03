import React, { memo } from 'react';

const LatestEvent = ({ lastMajorQuake, getMagnitudeColor, formatDate, handleQuakeClick }) => {
  // Logic for displaying the latest event will be added here
  if (!lastMajorQuake) {
    return null;
  }

  return (
    <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md">
      <h3 className="text-sm font-semibold text-indigo-300 mb-1">Latest Significant Event</h3>
      <p className="text-lg font-bold" style={{ color: getMagnitudeColor(lastMajorQuake.properties.mag) }}>
        M {lastMajorQuake.properties.mag?.toFixed(1)}
      </p>
      <p className="text-sm text-slate-300 truncate" title={lastMajorQuake.properties.place}>
        {lastMajorQuake.properties.place || "Location details pending..."}
      </p>
      <p className="text-xs text-slate-300">
        {formatDate(lastMajorQuake.properties.time)}
        {lastMajorQuake.geometry?.coordinates?.[2] !== undefined && `, Depth: ${lastMajorQuake.geometry.coordinates[2].toFixed(1)} km`}
      </p>
      <button
        onClick={() => handleQuakeClick(lastMajorQuake)}
        className="mt-2 w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-1.5 px-3 rounded transition-colors"
      >
        View Details
      </button>
    </div>
  );
};

export default memo(LatestEvent);
