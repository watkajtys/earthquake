import React from 'react';

/**
 * Renders a list of the latest feelable earthquakes.
 * Each item in the list is clickable and navigates to the earthquake details.
 *
 * @component
 * @param {Object} props - The component props.
 * @param {Array<Object>} props.latestFeelableQuakesSnippet - An array of earthquake objects to display in the list.
 * @param {function} props.getMagnitudeColor - A function that returns a color based on the earthquake's magnitude.
 * @param {function} props.formatTimeAgo - A function that formats a timestamp into a human-readable "time ago" string.
 * @param {function} props.handleQuakeClick - A function to handle clicks on individual earthquake items, likely to show more details.
 * @param {function} props.navigate - A function used for programmatic navigation, typically from a routing library.
 * @returns {JSX.Element|null} The ActivityList component or null if there are no quakes to display.
 */
const ActivityList = ({ latestFeelableQuakesSnippet, getMagnitudeColor, formatTimeAgo, handleQuakeClick, navigate }) => {
  if (!latestFeelableQuakesSnippet || latestFeelableQuakesSnippet.length === 0) {
    return null; // Or some placeholder if no activity
  }

  return (
    <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md">
      <h3 className="text-sm font-semibold text-indigo-300 mb-2">Latest Activity</h3>
      <ul className="space-y-2">
        {latestFeelableQuakesSnippet.map(quake => (
          <li
            key={`snippet-${quake.id}`}
            className="text-xs border-b border-slate-600 last:border-b-0 rounded"
          >
            <button
              type="button"
              onClick={() => handleQuakeClick(quake)}
              className="w-full text-left p-2 hover:bg-slate-600 focus:bg-slate-500 transition-colors rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <div className="flex justify-between items-center">
                <span className="font-semibold" style={{ color: getMagnitudeColor(quake.properties.mag) }}>
                  M {quake.properties.mag?.toFixed(1)}
                </span>
                <span className="text-slate-300">
                  {formatTimeAgo(Date.now() - quake.properties.time)}
                </span>
              </div>
              <p className="text-slate-300 truncate text-[11px]" title={quake.properties.place}>
                {quake.properties.place || "Location details pending..."}
              </p>
            </button>
          </li>
        ))}
      </ul>
      <button
        onClick={() => navigate('/feeds?activeFeedPeriod=last_24_hours')} // Example navigation
        className="mt-3 w-full bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold py-1.5 px-3 rounded transition-colors"
      >
        View All Recent Activity
      </button>
    </div>
  );
};

export default ActivityList;
