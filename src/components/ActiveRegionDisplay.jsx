import React from 'react';

/**
 * Displays the most active seismic regions in the last 24 hours.
 *
 * @component
 * @param {Object} props - The component props.
 * @param {Array<Object>} props.topActiveRegionsOverview - An array of objects, each representing an active region with its name and event count.
 * @param {Array<Object>} props.REGIONS - An array of region objects, used to find the color for each region.
 * @param {boolean} props.isLoadingDaily - A boolean indicating if the daily earthquake data is currently loading.
 * @param {Array<Object>} props.earthquakesLast24Hours - An array of earthquake objects from the last 24 hours. Used to determine if data is available.
 * @returns {JSX.Element} The ActiveRegionDisplay component.
 */
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
