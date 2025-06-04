import React, { memo } from 'react';
import RegionalSeismicityChart from '../RegionalSeismicityChart'; // Adjusted path

function EarthquakeRegionalSeismicityPanel({
    detailData, // Will be passed as currentEarthquake to RegionalSeismicityChart
    broaderEarthquakeData, // Will be passed as nearbyEarthquakesData to RegionalSeismicityChart
    dataSourceTimespanDays,
    isLoadingMonthly,         // Added
    hasAttemptedMonthlyLoad,  // Added
    exhibitPanelClass
}) {
    // Guard condition based on the original rendering logic
    if (!detailData) {
        return null; // Or some fallback UI if currentEarthquake data is not available
    }

    return (
        <div className={`${exhibitPanelClass} border-cyan-500`}>
            <RegionalSeismicityChart
                currentEarthquake={detailData}
                nearbyEarthquakesData={broaderEarthquakeData}
                dataSourceTimespanDays={dataSourceTimespanDays}
                isLoadingMonthly={isLoadingMonthly}         // Added
                hasAttemptedMonthlyLoad={hasAttemptedMonthlyLoad}  // Added
            />
        </div>
    );
}

export default memo(EarthquakeRegionalSeismicityPanel);
