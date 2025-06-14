// src/NotableQuakeFeature.jsx
import React, { useState, useEffect, memo } from 'react';
import { getMagnitudeColor as getMagnitudeColorUtil } from '../utils/utils.js'; // Renamed to avoid conflict if prop is also named getMagnitudeColor
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext'; // Import context

/**
 * A module-level constant array of curated historically significant earthquake objects.
 * This list is used as a fallback or secondary display when no recent dynamic featured quake
 * (i.e., `lastMajorQuake` from context) is available.
 * Each object in the array contains:
 * - `id` (string): A unique identifier for the historical quake.
 * - `name` (string): The common name or location of the earthquake.
 * - `year` (number): The year the earthquake occurred.
 * - `mag` (number): The magnitude of the earthquake.
 * - `source` (string): Indicates the source, typically 'Historical'.
 * - `url` (string): A URL to a page with more information about the quake.
 * - `description` (string): A brief description of the earthquake's significance.
 * @const {Array<Object>} historicalNotableQuakes
 */
const historicalNotableQuakes = [
    { id: 'nqh1', name: "Valdivia, Chile", year: 1960, mag: 9.5, source: 'Historical', url: 'https://earthquake.usgs.gov/earthquakes/eventpage/official19600522191120_30/executive', description: "Most powerful earthquake ever recorded." },
    { id: 'nqh2', name: "Anchorage, Alaska", year: 1964, mag: 9.2, source: 'Historical', url: 'https://earthquake.usgs.gov/earthquakes/eventpage/official19640328033616_26/executive', description: "Second largest instrumentally recorded quake." },
    { id: 'nqh3', name: "Sumatra, Indonesia", year: 2004, mag: 9.1, source: 'Historical', url: 'https://earthquake.usgs.gov/earthquakes/eventpage/official20041226005853_20/executive', description: "Generated one of the deadliest tsunamis." },
    { id: 'nqh4', name: "Tōhoku, Japan", year: 2011, mag: 9.1, source: 'Historical', url: 'https://earthquake.usgs.gov/earthquakes/eventpage/official20110311054624120_30/executive', description: "Caused a massive tsunami and nuclear disaster." },
];

/**
 * Displays a feature card for a notable earthquake. This component is memoized using `React.memo`.
 * It prioritizes displaying the `lastMajorQuake` from `EarthquakeDataContext` if available and not loading.
 * If no recent major quake is found, or if data is still loading, it falls back to cycling through
 * a predefined list of `historicalNotableQuakes`.
 * Internal state manages which quake to display (`displayQuake`) and the cycling mechanism for historical quakes.
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {function(Object):void} props.onNotableQuakeSelect - Callback function triggered when the feature card (button) is clicked.
 *   It receives the full data object of the displayed quake (either the recent one from context or an object from `historicalNotableQuakes`).
 * @param {function(number):string} [props.getMagnitudeColorFunc] - Optional function to determine the color for the magnitude display.
 *   If not provided, a default utility function (`getMagnitudeColorUtil`) is used.
 * @returns {JSX.Element} The NotableQuakeFeature component, or a loading/empty state placeholder.
 */
const NotableQuakeFeature = ({
    onNotableQuakeSelect,
    getMagnitudeColorFunc
}) => {
    const { lastMajorQuake: dynamicFeaturedQuake, isLoadingInitialData: isLoadingDynamicQuake } = useEarthquakeDataState();
    const [displayQuake, setDisplayQuake] = useState(null);
    const [historicalIndex, setHistoricalIndex] = useState(0);
    const [isCyclingHistorical, setIsCyclingHistorical] = useState(false);

    useEffect(() => {
        if (isLoadingDynamicQuake) {
            setDisplayQuake(null); // Show loading or nothing
            setIsCyclingHistorical(false);
            return;
        }

        if (dynamicFeaturedQuake && dynamicFeaturedQuake.properties) {
            setDisplayQuake({
                id: dynamicFeaturedQuake.id || `dyn-${dynamicFeaturedQuake.properties.time}`,
                name: dynamicFeaturedQuake.properties.place || "Unknown Location",
                mag: parseFloat(dynamicFeaturedQuake.properties.mag),
                year: new Date(dynamicFeaturedQuake.properties.time).getFullYear(),
                time: dynamicFeaturedQuake.properties.time, // Keep time for freshness check
                description: `Latest significant (M${dynamicFeaturedQuake.properties.mag?.toFixed(1)}) earthquake.`,
                url: dynamicFeaturedQuake.properties.url || dynamicFeaturedQuake.properties.detail,
                source: 'Recent',
                originalQuake: dynamicFeaturedQuake // Pass the full original object for onNotableQuakeSelect
            });
            setIsCyclingHistorical(false); // Stop cycling historical if a recent major is found
        } else if (historicalNotableQuakes.length > 0) {
            // No recent dynamic quake, or it's invalid, so start cycling historical ones
            setIsCyclingHistorical(true);
            const currentHistorical = historicalNotableQuakes[historicalIndex];
            const colorFunc = getMagnitudeColorFunc || getMagnitudeColorUtil;
            setDisplayQuake({
                ...currentHistorical,
                color: colorFunc(currentHistorical.mag)
            });
        } else {
            setDisplayQuake(null);
            setIsCyclingHistorical(false);
        }
    }, [dynamicFeaturedQuake, isLoadingDynamicQuake, historicalIndex, getMagnitudeColorFunc]);

    // Timer to cycle through historical quakes ONLY if isCyclingHistorical is true
    useEffect(() => {
        let timer;
        if (isCyclingHistorical && historicalNotableQuakes.length > 0) {
            timer = setInterval(() => {
                setHistoricalIndex(prevIndex => (prevIndex + 1) % historicalNotableQuakes.length);
            }, 15000); // Rotate historical every 15 seconds
        }
        return () => clearInterval(timer);
    }, [isCyclingHistorical]); // Removed historicalNotableQuakes as it's a module-level constant


    if (isLoadingDynamicQuake && !dynamicFeaturedQuake) { // Show loading state only if dynamic quake is loading and not yet available
        return (
            <div className="p-2.5 bg-slate-800 bg-opacity-80 text-white rounded-lg shadow-xl max-w-[220px] backdrop-blur-sm border border-slate-700 animate-pulse">
                <div className="h-3 bg-slate-700 rounded w-3/4 mb-1.5"></div> {/* Title placeholder */}
                <div className="h-4 bg-slate-700 rounded w-1/2 mb-1"></div>   {/* Mag placeholder */}
                <div className="h-3 bg-slate-700 rounded w-full mb-2"></div>  {/* Description placeholder */}
                <div className="h-6 bg-slate-700 rounded w-full"></div>      {/* Button placeholder */}
            </div>
        );
    }

    if (!displayQuake) { // If no quake to display after loading checks
        return (
            <div className="p-2.5 bg-slate-800 bg-opacity-70 text-slate-400 text-xs rounded-lg shadow-xl max-w-[220px] backdrop-blur-sm border border-slate-700 text-center">
                No featured earthquake at this time.
            </div>
        );
    }

    const colorFunc = getMagnitudeColorFunc || getMagnitudeColorUtil;
    const quakeColor = displayQuake?.mag !== undefined ? colorFunc(displayQuake.mag) : '#FFFFFF';

    return (
        <div className="p-2.5 bg-slate-800 bg-opacity-80 text-white rounded-lg shadow-xl max-w-[220px] backdrop-blur-sm border border-slate-700">
            <h2 className="text-xs font-bold mb-0.5 text-amber-300 uppercase tracking-wide">
                {displayQuake.source === 'Recent' ? 'Latest Significant Quake' : 'Featured Historical Quake'}
            </h2>
            <p className="text-sm font-semibold leading-tight truncate" title={displayQuake.name}>
                {displayQuake.name} {displayQuake.year ? `(${displayQuake.year})` : ''}
            </p>
            <p className="text-md font-bold" style={{ color: quakeColor }}>
                M {displayQuake.mag?.toFixed(1)}
            </p>
            <p className="text-[10px] mb-1 line-clamp-2 h-7 overflow-hidden" title={displayQuake.description}>
                {displayQuake.description}
            </p>
            <button
                onClick={() => onNotableQuakeSelect(displayQuake.source === 'Recent' ? displayQuake.originalQuake : displayQuake)}
                className="text-xs bg-slate-600 hover:bg-slate-500 focus:bg-slate-700 text-white font-medium py-1.5 px-3 rounded-md w-full transition-colors mt-0.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {/* Adjust button text based on source or if URL exists */}
                {(displayQuake.url || displayQuake.originalQuake?.properties?.detail) ? 'View Details' : 'More Info'}
            </button>
        </div>
    );
};

export default memo(NotableQuakeFeature);