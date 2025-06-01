// src/NotableQuakeFeature.jsx
import React, { useState, useEffect } from 'react';
import { getMagnitudeColor as getMagnitudeColorUtil } from '../utils/utils.js'; // Renamed to avoid conflict if prop is also named getMagnitudeColor

/**
 * @const {Array<object>} historicalNotableQuakes
 * A curated list of historically significant earthquakes, used as a fallback or secondary display
 * when no recent dynamic featured quake is available. Each object contains:
 * @property {string} id - A unique identifier for the historical quake.
 * @property {string} name - The common name or location of the earthquake.
 * @property {number} year - The year the earthquake occurred.
 * @property {number} mag - The magnitude of the earthquake.
 * @property {string} source - Indicates the source as 'Historical'.
 * @property {string} url - A URL to a page with more information about the quake.
 * @property {string} description - A brief description of the earthquake's significance.
 */
const historicalNotableQuakes = [
    { id: 'nqh1', name: "Valdivia, Chile", year: 1960, mag: 9.5, source: 'Historical', url: 'https://earthquake.usgs.gov/earthquakes/eventpage/official19600522191120_30/executive', description: "Most powerful earthquake ever recorded." },
    { id: 'nqh2', name: "Anchorage, Alaska", year: 1964, mag: 9.2, source: 'Historical', url: 'https://earthquake.usgs.gov/earthquakes/eventpage/official19640328033616_26/executive', description: "Second largest instrumentally recorded quake." },
    { id: 'nqh3', name: "Sumatra, Indonesia", year: 2004, mag: 9.1, source: 'Historical', url: 'https://earthquake.usgs.gov/earthquakes/eventpage/official20041226005853_20/executive', description: "Generated one of the deadliest tsunamis." },
    { id: 'nqh4', name: "Tōhoku, Japan", year: 2011, mag: 9.1, source: 'Historical', url: 'https://earthquake.usgs.gov/earthquakes/eventpage/official20110311054624120_30/executive', description: "Caused a massive tsunami and nuclear disaster." },
];

/**
 * A React component that displays a feature card for a notable earthquake.
 * It can show a dynamically provided recent significant quake or cycle through a predefined list of historical quakes if no dynamic quake is available.
 * @param {object} props - The component's props.
 * @param {object | null} props.dynamicFeaturedQuake - The dynamically fetched latest significant earthquake object.
 * @param {boolean} props.isLoadingDynamicQuake - Flag indicating if the dynamic quake data is currently loading.
 * @param {function(object):void} props.onNotableQuakeSelect - Callback function triggered when the feature card is clicked. Receives the quake data object.
 * @param {function(number):string} [props.getMagnitudeColorFunc] - Optional: Function that returns a color string based on earthquake magnitude. If not provided, util is used.
 * @returns {JSX.Element} The rendered NotableQuakeFeature component.
 */
const NotableQuakeFeature = ({
                                 dynamicFeaturedQuake,
                                 isLoadingDynamicQuake,
                                 onNotableQuakeSelect,
                                 getMagnitudeColorFunc // Optional prop
                             }) => {
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
    }, [isCyclingHistorical, historicalNotableQuakes.length]);


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
            <h3 className="text-xs font-bold mb-0.5 text-amber-300 uppercase tracking-wide">
                {displayQuake.source === 'Recent' ? 'Latest Significant Quake' : 'Featured Historical Quake'}
            </h3>
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
                className="text-[10px] bg-indigo-500 hover:bg-indigo-400 text-white font-semibold py-1 px-1.5 rounded w-full transition-colors mt-0.5"
            >
                {/* Adjust button text based on source or if URL exists */}
                {(displayQuake.url || displayQuake.originalQuake?.properties?.detail) ? 'View Details' : 'More Info'}
            </button>
        </div>
    );
};

export default NotableQuakeFeature;