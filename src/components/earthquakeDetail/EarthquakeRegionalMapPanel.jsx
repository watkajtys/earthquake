import React, { memo } from 'react';
import EarthquakeMap from '../EarthquakeMap';
import { isValidNumber } from '../../utils/utils.js';

function EarthquakeRegionalMapPanel({
    geometry,
    properties,
    shakemapIntensityImageUrl,
    regionalQuakes,
    detailUrl,
    exhibitPanelClass,
    exhibitTitleClass
}) {
    console.log('[EarthquakeRegionalMapPanel] Received geometry:', JSON.stringify(geometry, null, 2));
    console.log('[EarthquakeRegionalMapPanel] Received properties:', JSON.stringify(properties, null, 2));

    // Main Guard for Centering: Ensure valid coordinates for the map center.
    if (!geometry || !geometry.coordinates ||
        !isValidNumber(geometry.coordinates[1]) ||
        !isValidNumber(geometry.coordinates[0])) {
        // If essential coordinates are missing or invalid, render a fallback UI within the panel structure.
        console.warn("EarthquakeRegionalMapPanel: Cannot render map due to invalid main quake coordinates. Geometry:", geometry);
        return (
            <div className={`${exhibitPanelClass} border-sky-500`}>
                <h2 className={`${exhibitTitleClass} text-sky-800 border-sky-200`}>Regional Map</h2>
                <div className="h-[300px] md:h-[400px] lg:h-[450px] rounded-md overflow-hidden relative mt-2 flex items-center justify-center bg-slate-100 dark:bg-slate-700">
                    <p className="text-slate-500 dark:text-slate-400">Map data is unavailable for this earthquake.</p>
                </div>
            </div>
        );
    }

    const mapCenterLat = geometry.coordinates[1];
    const mapCenterLng = geometry.coordinates[0];
    console.log('[EarthquakeRegionalMapPanel] Derived mapCenterLat:', mapCenterLat, 'mapCenterLng:', mapCenterLng);

    // Conditional Highlight Props:
    // Prepare props for the highlighted quake only if its magnitude is valid.
    // If not, the EarthquakeMap component will use its defaultProps for highlight-related fields,
    // effectively not showing a specific highlight marker if magnitude is invalid.
    let highlightProps = {};
    if (properties && isValidNumber(properties.mag)) {
        highlightProps = {
            highlightQuakeLatitude: mapCenterLat, // In detail view, highlight is the same as center
            highlightQuakeLongitude: mapCenterLng,
            highlightQuakeMagnitude: properties.mag,
            // Ensure a fallback title if properties.title or properties.place is not available.
            highlightQuakeTitle: properties.title || properties.place || 'Earthquake Event',
        };
        console.log('[EarthquakeRegionalMapPanel] Derived highlightProps:', JSON.stringify(highlightProps, null, 2));
    } else {
        // Log a warning if properties or magnitude are missing/invalid, as a highlight was likely intended.
        console.warn("EarthquakeRegionalMapPanel: Invalid or missing magnitude for highlighting. No highlight marker will be shown.", properties);
    }

    return (
        <div className={`${exhibitPanelClass} border-sky-500`}>
            <h2 className={`${exhibitTitleClass} text-sky-800 border-sky-200`}>Regional Map</h2>
            <div className="h-[300px] md:h-[400px] lg:h-[450px] rounded-md overflow-hidden relative mt-2">
                <EarthquakeMap
                    // Dynamic props commented out for debugging:
                    // mapCenterLatitude={mapCenterLat}
                    // mapCenterLongitude={mapCenterLng}
                    // {...highlightProps}
                    // shakeMapUrl={shakemapIntensityImageUrl}
                    // nearbyQuakes={regionalQuakes}
                    // mainQuakeDetailUrl={detailUrl}
                    // fitMapToBounds={regionalQuakes && regionalQuakes.length > 0}

                    // Hardcoded props for testing basic rendering:
                    mapCenterLatitude={34.0522}     // Los Angeles latitude
                    mapCenterLongitude={-118.2437}  // Los Angeles longitude
                    highlightQuakeLatitude={34.0522}
                    highlightQuakeLongitude={-118.2437}
                    highlightQuakeMagnitude={5.0}
                    highlightQuakeTitle="Hardcoded Test Quake"
                    // Other props like nearbyQuakes, fitMapToBounds, defaultZoom, etc.,
                    // will use defaults defined in EarthquakeMap component signature.
                />
            </div>
        </div>
    );
}

export default memo(EarthquakeRegionalMapPanel);
