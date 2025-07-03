import React, { memo } from 'react';
import RegionalSeismicityChart from '../RegionalSeismicityChart'; // Adjusted path
import RegionalSeismicityDescription from '../RegionalSeismicityDescription'; // Import seismicity analysis

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

    // Extract coordinates for seismicity analysis
    const earthquakeLat = detailData?.geometry?.coordinates?.[1];
    const earthquakeLng = detailData?.geometry?.coordinates?.[0];

    return (
        <div className={`${exhibitPanelClass} border-cyan-500`}>
            <RegionalSeismicityChart
                currentEarthquake={detailData}
                nearbyEarthquakesData={broaderEarthquakeData}
                dataSourceTimespanDays={dataSourceTimespanDays}
                isLoadingMonthly={isLoadingMonthly}         // Added
                hasAttemptedMonthlyLoad={hasAttemptedMonthlyLoad}  // Added
            />
            
            {/* Regional Seismicity Context */}
            {typeof earthquakeLat === 'number' && typeof earthquakeLng === 'number' && (
                <div className="mt-4">
                    <RegionalSeismicityDescription 
                        centerLat={earthquakeLat}
                        centerLng={earthquakeLng}
                        regionalQuakes={broaderEarthquakeData || []}
                        radiusKm={200}
                        expanded={false}
                    />
                </div>
            )}
        </div>
    );
}

export default memo(EarthquakeRegionalSeismicityPanel);
