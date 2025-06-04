import React, { memo } from 'react';
import EarthquakeMap from '../EarthquakeMap'; // Adjusted path
import { isValidNumber } from '../../utils/utils.js'; // Assuming this path

function EarthquakeRegionalMapPanel({
    geometry,
    properties,
    shakemapIntensityImageUrl,
    regionalQuakes,
    detailUrl,
    // isValidNumber, // Helper function - now imported
    exhibitPanelClass, // Style class
    exhibitTitleClass  // Style class
}) {
    // Guard condition based on the original rendering logic
    if (!geometry || !geometry.coordinates || !isValidNumber(geometry.coordinates[1]) || !isValidNumber(geometry.coordinates[0])) { // isValidNumber is now imported
        return null; // Or some fallback UI if the map cannot be displayed
    }

    return (
        <div className={`${exhibitPanelClass} border-sky-500`}>
            <h2 className={`${exhibitTitleClass} text-sky-800 border-sky-200`}>Regional Map</h2>
            <div className="h-[300px] md:h-[400px] lg:h-[450px] rounded-md overflow-hidden relative mt-2">
                <EarthquakeMap
                    mapCenterLatitude={geometry.coordinates[1]}
                    mapCenterLongitude={geometry.coordinates[0]}
                    highlightQuakeLatitude={geometry.coordinates[1]}
                    highlightQuakeLongitude={geometry.coordinates[0]}
                    highlightQuakeMagnitude={properties.mag}
                    highlightQuakeTitle={properties.title}
                    shakeMapUrl={shakemapIntensityImageUrl}
                    nearbyQuakes={regionalQuakes}
                    mainQuakeDetailUrl={detailUrl}
                    fitMapToBounds={regionalQuakes && regionalQuakes.length > 0}
                />
            </div>
        </div>
    );
}

export default memo(EarthquakeRegionalMapPanel);
