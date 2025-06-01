// src/PreviousNotableQuakeFeature.jsx
import React, { useState, useEffect } from 'react';
import { getMagnitudeColor as getMagnitudeColorUtil } from '../utils/utils.js'; // Renamed to avoid conflict

/**
 * A React component that displays a feature card for the second most recent significant earthquake.
 * This component is intended to show the major quake that occurred before the one currently highlighted as 'latest'.
 * @param {object} props - The component's props.
 * @param {object | null} props.previousMajorQuake - The data object for the previously recorded significant earthquake.
 * @param {boolean} props.isLoadingPreviousQuake - Flag indicating if the data for the previous quake is currently loading.
 * @param {function(object):void} props.onNotableQuakeSelect - Callback function triggered when the feature card is clicked. Receives the quake data object.
 * @param {function(number):string} [props.getMagnitudeColorFunc] - Optional: Function that returns a color string based on earthquake magnitude.
 * @returns {JSX.Element} The rendered PreviousNotableQuakeFeature component.
 */
const PreviousNotableQuakeFeature = ({
                                 previousMajorQuake,
                                 isLoadingPreviousQuake,
                                 onNotableQuakeSelect,
                                 getMagnitudeColorFunc
                             }) => {
    const [displayQuake, setDisplayQuake] = useState(null);

    useEffect(() => {
        if (isLoadingPreviousQuake) {
            setDisplayQuake(null); // Show loading or nothing
            return;
        }

        if (previousMajorQuake && previousMajorQuake.properties) {
            setDisplayQuake({
                id: previousMajorQuake.id || `prev-dyn-${previousMajorQuake.properties.time}`,
                name: previousMajorQuake.properties.place || "Unknown Location",
                mag: parseFloat(previousMajorQuake.properties.mag),
                year: new Date(previousMajorQuake.properties.time).getFullYear(),
                time: previousMajorQuake.properties.time,
                description: `Second most recent M${previousMajorQuake.properties.mag?.toFixed(1)}+ event.`,
                url: previousMajorQuake.properties.url || previousMajorQuake.properties.detail,
                source: 'PreviousSignificant',
                originalQuake: previousMajorQuake // Pass the full original object
            });
        } else {
            setDisplayQuake(null); // No quake to display
        }
    }, [previousMajorQuake, isLoadingPreviousQuake]);


    if (isLoadingPreviousQuake && !previousMajorQuake) {
        return (
            <div className="p-2.5 bg-slate-800 bg-opacity-80 text-white rounded-lg shadow-xl max-w-[220px] backdrop-blur-sm border border-slate-700 animate-pulse">
                <div className="h-3 bg-slate-700 rounded w-3/4 mb-1.5"></div> {/* Title placeholder */}
                <div className="h-4 bg-slate-700 rounded w-1/2 mb-1"></div>   {/* Mag placeholder */}
                <div className="h-3 bg-slate-700 rounded w-full mb-2"></div>  {/* Description placeholder */}
                <div className="h-6 bg-slate-700 rounded w-full"></div>      {/* Button placeholder */}
            </div>
        );
    }

    if (!displayQuake) {
        return (
            <div className="p-2.5 bg-slate-800 bg-opacity-70 text-slate-400 text-xs rounded-lg shadow-xl max-w-[220px] backdrop-blur-sm border border-slate-700 text-center">
                No previous significant quake data.
            </div>
        );
    }

    const colorFunc = getMagnitudeColorFunc || getMagnitudeColorUtil;
    const quakeColor = displayQuake?.mag !== undefined ? colorFunc(displayQuake.mag) : '#FFFFFF';

    return (
        <div className="p-2.5 bg-slate-800 bg-opacity-80 text-white rounded-lg shadow-xl max-w-[220px] backdrop-blur-sm border border-slate-600"> {/* Slightly different border for distinction if desired */}
            <h3 className="text-xs font-bold mb-0.5 text-sky-300 uppercase tracking-wide"> {/* Different title color */}
                Previous Significant Quake
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
                onClick={() => onNotableQuakeSelect(displayQuake.originalQuake)}
                className="text-[10px] bg-sky-600 hover:bg-sky-500 text-white font-semibold py-1 px-1.5 rounded w-full transition-colors mt-0.5" // Slightly different button color
            >
                {(displayQuake.url) ? 'View Details' : 'More Info'}
            </button>
        </div>
    );
};

export default PreviousNotableQuakeFeature;
