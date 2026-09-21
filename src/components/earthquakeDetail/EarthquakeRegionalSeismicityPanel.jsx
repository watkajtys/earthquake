import React, { memo } from 'react';
import RegionalSeismicityChart from '../RegionalSeismicityChart'; // Adjusted path

function EarthquakeRegionalSeismicityPanel({
    detailData, // Will be passed as currentEarthquake to RegionalSeismicityChart
    broaderEarthquakeData, // Will be passed as nearbyEarthquakesData to RegionalSeismicityChart
    dataSourceTimespanDays,
    isLoadingMonthly,         // Added
    monthlyHasLoaded,
    monthlyError,
    onRetryMonthly,
    dataSourceGeneratedAtMs,
    exhibitPanelClass
}) {
    // Guard condition based on the original rendering logic
    if (!detailData) {
        return null; // Or some fallback UI if currentEarthquake data is not available
    }

    return (
        <div className={`${exhibitPanelClass} border-cyan-500`}>
            {monthlyError && <div role="alert" className="mb-3 text-sm text-amber-800">
                <p>{monthlyHasLoaded ? 'The 30-day regional data could not refresh. Previously loaded data is shown.' : 'The 30-day regional data could not load. Showing the available 7-day feed.'}</p>
                {onRetryMonthly && <button type="button" disabled={isLoadingMonthly} onClick={onRetryMonthly} className="mt-2 rounded bg-slate-700 px-3 py-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">Retry 30-day regional data</button>}
            </div>}
            {isLoadingMonthly && <p role="status" className="text-sm text-slate-600">{monthlyHasLoaded ? 'Refreshing 30-day regional data…' : 'Loading 30-day regional data; showing the available 7-day feed…'}</p>}
            <RegionalSeismicityChart
                currentEarthquake={detailData}
                nearbyEarthquakesData={broaderEarthquakeData}
                dataSourceTimespanDays={monthlyHasLoaded === false ? 7 : dataSourceTimespanDays}
                dataSourceGeneratedAtMs={dataSourceGeneratedAtMs}
                isLoadingMonthly={isLoadingMonthly}         // Added
            />
        </div>
    );
}

export default memo(EarthquakeRegionalSeismicityPanel);
