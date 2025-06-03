import React from 'react';

const LoadMoreDataButton = ({ hasAttemptedMonthlyLoad, isLoadingMonthly, loadMonthlyData }) => {
  return (
    <>
      {!hasAttemptedMonthlyLoad && (
        <div className="text-center py-3 mt-3 border-t border-slate-700">
          <button 
            onClick={loadMonthlyData} 
            disabled={isLoadingMonthly} 
            className="w-full bg-teal-600 hover:bg-teal-500 p-2.5 rounded-md text-white font-semibold transition-colors text-xs shadow-md disabled:opacity-60"
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

export default LoadMoreDataButton;
