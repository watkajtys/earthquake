import React, { memo } from 'react';

/**
 * Displays a summary card for the latest significant earthquake event.
 * This component is memoized using `React.memo` for performance optimization.
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {Object|null} props.lastMajorQuake - The earthquake object for the latest significant event.
 *   If null or undefined, the component will render nothing. Expected structure:
 *   - `properties`:
 *     - `mag` (number): Magnitude of the earthquake.
 *     - `place` (string): Location string of the earthquake.
 *     - `time` (number): Timestamp of the earthquake event.
 *   - `geometry.coordinates` (Array<number>, optional): Coordinates array `[lng, lat, depth]`. Depth is used if available.
 * @param {function(number):string} props.getMagnitudeColor - Function that returns a color string based on earthquake magnitude.
 * @param {function(number):string} props.formatDate - Function to format a timestamp into a human-readable date/time string.
 * @param {function(Object):void} props.handleQuakeClick - Callback function triggered when the "View Details" button is clicked.
 *   Receives the `lastMajorQuake` object as an argument.
 * @returns {JSX.Element|null} The LatestEvent component, or null if `lastMajorQuake` is not provided.
 */
const LatestEvent = ({ lastMajorQuake, getMagnitudeColor, formatDate, handleQuakeClick }) => {
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
