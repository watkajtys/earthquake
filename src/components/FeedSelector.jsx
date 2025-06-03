import React from 'react'; // React is needed
// No PropTypes needed here as this is a simpler component for now

const FeedSelector = ({
  activeFeedPeriod,
  setActiveFeedPeriod,
  // Props for conditional rendering of 14/30 day buttons
  hasAttemptedMonthlyLoad, // Corresponds to contextHasAttemptedMonthlyLoad
  allEarthquakes, // Corresponds to contextAllEarthquakes
  // Constants for button labels
  FEELABLE_QUAKE_THRESHOLD,
  MAJOR_QUAKE_THRESHOLD,
}) => {
  // The button group structure from FeedsPageLayout.jsx
  return (
    <div className="my-2 flex flex-wrap gap-2 pb-2">
      <button
        onClick={() => setActiveFeedPeriod('last_hour')}
        className={`text-xs px-3 py-1.5 rounded whitespace-nowrap ${
          activeFeedPeriod === 'last_hour' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500'
        }`}
      >
        Last Hour
      </button>
      <button
        onClick={() => setActiveFeedPeriod('feelable_quakes')}
        className={`text-xs px-3 py-1.5 rounded whitespace-nowrap ${
          activeFeedPeriod === 'feelable_quakes' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500'
        }`}
      >
        Feelable (M{FEELABLE_QUAKE_THRESHOLD.toFixed(1)}+)
      </button>
      <button
        onClick={() => setActiveFeedPeriod('significant_quakes')}
        className={`text-xs px-3 py-1.5 rounded whitespace-nowrap ${
          activeFeedPeriod === 'significant_quakes' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500'
        }`}
      >
        Significant (M{MAJOR_QUAKE_THRESHOLD.toFixed(1)}+)
      </button>
      <button
        onClick={() => setActiveFeedPeriod('last_24_hours')}
        className={`text-xs px-3 py-1.5 rounded whitespace-nowrap ${
          activeFeedPeriod === 'last_24_hours' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500'
        }`}
      >
        Last 24hr
      </button>
      <button
        onClick={() => setActiveFeedPeriod('last_7_days')}
        className={`text-xs px-3 py-1.5 rounded whitespace-nowrap ${
          activeFeedPeriod === 'last_7_days' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500'
        }`}
      >
        Last 7day
      </button>
      {/* Conditional rendering for 14-day and 30-day buttons */}
      {hasAttemptedMonthlyLoad && allEarthquakes && allEarthquakes.length > 0 && (
        <React.Fragment key="monthly-feed-buttons">
          <button
            onClick={() => setActiveFeedPeriod('last_14_days')}
            className={`text-xs px-3 py-1.5 rounded whitespace-nowrap ${
              activeFeedPeriod === 'last_14_days' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500'
            }`}
          >
            14-Day
          </button>
          <button
            onClick={() => setActiveFeedPeriod('last_30_days')}
            className={`text-xs px-3 py-1.5 rounded whitespace-nowrap ${
              activeFeedPeriod === 'last_30_days' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500'
            }`}
          >
            30-Day
          </button>
        </React.Fragment>
      )}
    </div>
  );
};

export default FeedSelector;
