import React from 'react';

const ActiveRegionDisplay = ({ topActiveRegionsOverview, REGIONS, isLoadingDaily, earthquakesLast24Hours }) => {
  return (
    <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md text-sm">
      <h3 className="text-md font-semibold mb-1 text-indigo-400">Most Active Region (Last 24h)</h3>
      {isLoadingDaily && !earthquakesLast24Hours ? (
        <p>Loading...</p>
      ) : (
        topActiveRegionsOverview && topActiveRegionsOverview.length > 0 ? (
          topActiveRegionsOverview.map((region, index) => {
            const regionColor = REGIONS.find(r => r.name === region.name)?.color || '#9CA3AF';
            return (
              <p key={region.name} className={`text-slate-300 ${index > 0 ? 'mt-0.5' : ''}`}>
                <span className="font-semibold" style={{ color: regionColor }}>
                  {index + 1}. {region.name}
                </span>
                {region.count > 0 ? ` - ${region.count} events` : ''}
              </p>
            );
          })
        ) : (
          <p className="text-slate-300 text-xs">(No significant regional activity in the last 24 hours)</p>
        )
      )}
    </div>
  );
};

export default ActiveRegionDisplay;
