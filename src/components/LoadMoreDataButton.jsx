import React, { memo } from 'react';

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
