import React from 'react'; // React is needed

/**
 * Renders a group of buttons that allow the user to select different earthquake feed periods or types.
 * The selected feed determines the data displayed in other parts of the application (e.g., a list or map).
 * It conditionally renders 14-day and 30-day options based on whether extended data has been loaded.
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {string} props.activeFeedPeriod - The currently active feed period key (e.g., 'last_hour', 'feelable_quakes').
 * @param {function(string): void} props.setActiveFeedPeriod - Callback function to set the new active feed period when a button is clicked.
 * @param {boolean} props.hasAttemptedMonthlyLoad - Flag indicating if an attempt was made to load monthly (extended) earthquake data.
 *   Used to determine if 14-day and 30-day options should be shown.
 * @param {Array<Object>|null} props.allEarthquakes - The array of all earthquakes, typically from the monthly load.
 *   Used in conjunction with `hasAttemptedMonthlyLoad` to confirm data availability for extended periods.
 * @param {number} props.FEELABLE_QUAKE_THRESHOLD - The magnitude threshold for "feelable" quakes, used in a button label.
 * @param {number} props.MAJOR_QUAKE_THRESHOLD - The magnitude threshold for "significant" or "major" quakes, used in a button label.
 * @returns {JSX.Element} The FeedSelector component.
 */
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
        className={`text-xs px-3 py-1.5 font-medium rounded-md transition-colors whitespace-nowrap ${
          activeFeedPeriod === 'last_hour' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500 text-white disabled:opacity-50 disabled:cursor-not-allowed'
        }`}
      >
        Last Hour
      </button>
      <button
        onClick={() => setActiveFeedPeriod('feelable_quakes')}
        className={`text-xs px-3 py-1.5 font-medium rounded-md transition-colors whitespace-nowrap ${
          activeFeedPeriod === 'feelable_quakes' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500 text-white disabled:opacity-50 disabled:cursor-not-allowed'
        }`}
      >
        Feelable (M{FEELABLE_QUAKE_THRESHOLD.toFixed(1)}+)
      </button>
      <button
        onClick={() => setActiveFeedPeriod('significant_quakes')}
        className={`text-xs px-3 py-1.5 font-medium rounded-md transition-colors whitespace-nowrap ${
          activeFeedPeriod === 'significant_quakes' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500 text-white disabled:opacity-50 disabled:cursor-not-allowed'
        }`}
      >
        Significant (M{MAJOR_QUAKE_THRESHOLD.toFixed(1)}+)
      </button>
      <button
        onClick={() => setActiveFeedPeriod('last_24_hours')}
        className={`text-xs px-3 py-1.5 font-medium rounded-md transition-colors whitespace-nowrap ${
          activeFeedPeriod === 'last_24_hours' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500 text-white disabled:opacity-50 disabled:cursor-not-allowed'
        }`}
      >
        Last 24hr
      </button>
      <button
        onClick={() => setActiveFeedPeriod('last_7_days')}
        className={`text-xs px-3 py-1.5 font-medium rounded-md transition-colors whitespace-nowrap ${
          activeFeedPeriod === 'last_7_days' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500 text-white disabled:opacity-50 disabled:cursor-not-allowed'
        }`}
      >
        Last 7day
      </button>
      {/* Conditional rendering for 14-day and 30-day buttons */}
      {hasAttemptedMonthlyLoad && allEarthquakes && allEarthquakes.length > 0 && (
        <React.Fragment key="monthly-feed-buttons">
          <button
            onClick={() => setActiveFeedPeriod('last_14_days')}
            className={`text-xs px-3 py-1.5 font-medium rounded-md transition-colors whitespace-nowrap ${
              activeFeedPeriod === 'last_14_days' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500 text-white disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            14-Day
          </button>
          <button
            onClick={() => setActiveFeedPeriod('last_30_days')}
            className={`text-xs px-3 py-1.5 font-medium rounded-md transition-colors whitespace-nowrap ${
              activeFeedPeriod === 'last_30_days' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500 text-white disabled:opacity-50 disabled:cursor-not-allowed'
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
