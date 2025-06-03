import React from 'react';

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
