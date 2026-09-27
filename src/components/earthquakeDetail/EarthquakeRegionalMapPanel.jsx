import React, { memo } from 'react';
import EarthquakeMap from '../EarthquakeMap';
import { isValidNumber } from '../../utils/utils.js';
import { FAULT_MAP_CATEGORIES } from '../../utils/faultMapUtils.js';

function EarthquakeRegionalMapPanel({
    geometry,
    properties,
    shakemapIntensityImageUrl,
    regionalQuakes,
    detailUrl,
    exhibitPanelClass,
    exhibitTitleClass
}) {
    console.log("--- [EarthquakeRegionalMapPanel] START ---");
    try {
        console.log("[EarthquakeRegionalMapPanel] Received geometry:", JSON.stringify(geometry, null, 2));
        console.log("[EarthquakeRegionalMapPanel] Received properties:", JSON.stringify(properties, null, 2));
        console.log("[EarthquakeRegionalMapPanel] Received regionalQuakes:", JSON.stringify(regionalQuakes, null, 2));
        console.log("[EarthquakeRegionalMapPanel] Received shakemapIntensityImageUrl:", shakemapIntensityImageUrl);
        console.log("[EarthquakeRegionalMapPanel] Received detailUrl:", detailUrl);
    } catch (e) {
        console.error("[EarthquakeRegionalMapPanel] Error stringifying initial props:", e);
        console.log("[EarthquakeRegionalMapPanel] Received geometry (raw):", geometry);
        console.log("[EarthquakeRegionalMapPanel] Received properties (raw):", properties);
        console.log("[EarthquakeRegionalMapPanel] Received regionalQuakes (raw):", regionalQuakes);
    }


    // Main Guard for Centering: Ensure valid coordinates for the map center.
    if (!geometry || !geometry.coordinates ||
        !isValidNumber(geometry.coordinates[1]) ||
        !isValidNumber(geometry.coordinates[0])) {
        // If essential coordinates are missing or invalid, render a fallback UI within the panel structure.
        console.warn("EarthquakeRegionalMapPanel: Cannot render map due to invalid main quake coordinates. Geometry:", geometry);
        console.log("--- [EarthquakeRegionalMapPanel] END (guard fail) ---");
        return (
            <div className={`${exhibitPanelClass} border-sky-500`}>
                <h2 className={`${exhibitTitleClass} text-sky-800 border-sky-200`}>Regional Map</h2>
                <div className="h-[250px] sm:h-[300px] md:h-[400px] lg:h-[450px] rounded-md overflow-hidden relative mt-2 flex items-center justify-center bg-slate-100 dark:bg-slate-700">
                    <p className="text-slate-500 dark:text-slate-400">Map data is unavailable for this earthquake.</p>
                </div>
            </div>
        );
    }

    const mapCenterLat = geometry.coordinates[1];
    const mapCenterLng = geometry.coordinates[0];
    console.log(`[EarthquakeRegionalMapPanel] Calculated mapCenterLat: ${mapCenterLat} (type: ${typeof mapCenterLat})`);
    console.log(`[EarthquakeRegionalMapPanel] Calculated mapCenterLng: ${mapCenterLng} (type: ${typeof mapCenterLng})`);

    // Conditional Highlight Props:
    // Prepare props for the highlighted quake only if its magnitude is valid.
    let highlightProps = {};
    if (properties && isValidNumber(properties.mag)) {
        highlightProps = {
            highlightQuakeLatitude: mapCenterLat,
            highlightQuakeLongitude: mapCenterLng,
            highlightQuakeMagnitude: properties.mag,
            highlightQuakeTitle: properties.title || properties.place || 'Earthquake Event',
        };
        try {
            console.log("[EarthquakeRegionalMapPanel] Populated highlightProps:", JSON.stringify(highlightProps, null, 2));
        } catch (e) {
            console.error("[EarthquakeRegionalMapPanel] Error stringifying highlightProps:", e);
            console.log("[EarthquakeRegionalMapPanel] Populated highlightProps (raw):", highlightProps);
        }
    } else {
        console.warn("EarthquakeRegionalMapPanel: Invalid or missing magnitude for highlighting. No highlight marker will be shown.", properties);
        console.log("[EarthquakeRegionalMapPanel] Skipping highlightProps due to invalid/missing properties or magnitude.");
    }

    // const fitMap = false; // Unused variable removed
    const finalMapProps = {
        mapCenterLatitude: mapCenterLat,
        mapCenterLongitude: mapCenterLng,
        ...highlightProps,
        shakeMapUrl: shakemapIntensityImageUrl,
        nearbyQuakes: regionalQuakes,
        mainQuakeDetailUrl: detailUrl,
        fitMapToBounds: false,
        // defaultZoom is handled by EarthquakeMap's defaults
    };

    console.log("--- [EarthquakeRegionalMapPanel] Props being passed to EarthquakeMap ---");
    Object.entries(finalMapProps).forEach(([key, value]) => {
        try {
            const valueString = typeof value === 'object' ? JSON.stringify(value) : value;
            console.log(`[EarthquakeMap Prop] ${key}:`, valueString, `(type: ${typeof value})`);
        } catch (e) {
            console.error(`[EarthquakeMap Prop] Error stringifying ${key}:`, e);
            console.log(`[EarthquakeMap Prop] ${key} (raw):`, value, `(type: ${typeof value})`);
        }
    });
    console.log("--- [EarthquakeRegionalMapPanel] END (rendering map) ---");

    return (
        <div className={`${exhibitPanelClass} border-sky-500`}>
            <h2 className={`${exhibitTitleClass} text-sky-800 border-sky-200`}>Regional Map</h2>
            <div className="h-[250px] sm:h-[300px] md:h-[400px] lg:h-[450px] rounded-md overflow-hidden relative mt-2">
                <EarthquakeMap {...finalMapProps} />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-xs text-slate-600" aria-label="Mapped fault and structure legend">
                {Object.entries(FAULT_MAP_CATEGORIES).map(([key, category]) => (
                    <span key={key} className="inline-flex items-center gap-1">
                        <span aria-hidden="true" className="inline-block w-4 border-t-[3px]" style={{ borderColor: category.color }} />
                        {category.label}
                    </span>
                ))}
            </div>
            <p className="text-xs text-slate-600 mt-2">Thicker lines show catalogued faults and other mapped structures; thin lines show plate boundaries. Nearby traces provide regional context. Proximity alone does not identify the fault that ruptured, and the mapped catalogue is incomplete.</p>
            <p className="text-xs mt-1"><a className="text-blue-700 underline" href="https://github.com/GEMScienceTools/gem-global-active-faults" target="_blank" rel="noopener noreferrer">GEM Global Active Faults Database</a></p>
        </div>
    );
}

export default memo(EarthquakeRegionalMapPanel);
