import React, { memo } from 'react';

/**
 * A button component that allows users to load more extensive earthquake data (e.g., 14-day and 30-day archives).
 * It displays different states based on whether the extended data load has been attempted or is in progress.
 * This component is memoized using `React.memo` for performance optimization.
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {boolean} props.hasAttemptedMonthlyLoad - Flag indicating if an attempt to load the monthly (extended) data has already been made.
 * @param {boolean} props.isLoadingMonthly - Flag indicating if the monthly (extended) data is currently being loaded.
 * @param {function(): void} props.loadMonthlyData - Callback function to trigger the loading of monthly (extended) data.
 * @returns {JSX.Element} The LoadMoreDataButton component, or a loading message, or null if data has been loaded.
 */
const LoadMoreDataButton = ({ hasAttemptedMonthlyLoad, isLoadingMonthly, loadMonthlyData }) => {
  return (
    <>
      {!hasAttemptedMonthlyLoad && (
        <div className="text-center py-3 mt-3 border-t border-slate-700">
          <button 
            onClick={loadMonthlyData} 
            disabled={isLoadingMonthly} 
            className="w-full bg-indigo-600 hover:bg-indigo-500 focus:bg-indigo-700 text-white px-4 py-2 text-sm font-medium rounded-md transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingMonthly ? 'Loading Extended Data...' : 'Load 14 & 30-Day Data'}
          </button>
        </div>
      )}
      {hasAttemptedMonthlyLoad && isLoadingMonthly && (
        <p className="text-xs text-slate-400 text-center py-3 animate-pulse">Loading extended data archives...</p>
      )}
    </>
  );
};

export default memo(LoadMoreDataButton);
