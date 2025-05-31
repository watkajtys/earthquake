// src/GlobalLastMajorQuakeTimer.jsx
import React, { useState, useEffect } from 'react';

/**
 * A React component that displays a timer showing the time since the last major global earthquake.
 * It updates every second. If no major quake is found, it displays a message indicating an extended period without one.
 *
 * @param {object} props - The component's props.
 * @param {object | null} props.lastMajorQuake - The last major earthquake object. Can be null if no such quake is found.
 * @param {object} [props.lastMajorQuake.properties] - Properties of the last major earthquake. Required if lastMajorQuake is not null.
 * @param {number} props.lastMajorQuake.properties.time - Timestamp of the last major quake in milliseconds.
 * @param {string} [props.lastMajorQuake.properties.place] - Location of the last major quake.
 * @param {number} [props.lastMajorQuake.properties.mag] - Magnitude of the last major quake.
 * @param {number} props.MAJOR_QUAKE_THRESHOLD - The magnitude threshold defined as a major quake.
 * @param {function} props.formatTimeDuration - Function to format a duration in milliseconds to a human-readable string (e.g., "1 day, 2 hr, 30 min").
 * @param {React.ElementType} props.SkeletonText - A skeleton loader component for text, used during initial state or loading.
 * @returns {JSX.Element} The rendered GlobalLastMajorQuakeTimer component.
 */
const GlobalLastMajorQuakeTimer = ({ lastMajorQuake, MAJOR_QUAKE_THRESHOLD, formatTimeDuration, SkeletonText }) => {
    const [timeSinceFormatted, setTimeSinceFormatted] = useState(<SkeletonText width="w-1/2 mx-auto" height="h-8" className="bg-slate-600"/>);

    useEffect(() => {
        if (!lastMajorQuake?.properties?.time) {
            setTimeSinceFormatted("Extended period without M" + MAJOR_QUAKE_THRESHOLD.toFixed(1) + "+.");
            return;
        }

        const startTime = lastMajorQuake.properties.time;
        let intervalId = null;

        const updateDisplay = () => {
            setTimeSinceFormatted(formatTimeDuration(Date.now() - startTime));
        };

        updateDisplay(); // Initial update
        intervalId = setInterval(updateDisplay, 1000); // Update every second

        return () => clearInterval(intervalId); // Cleanup
    }, [lastMajorQuake, MAJOR_QUAKE_THRESHOLD, formatTimeDuration]);

    return (
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 z-10 p-2.5 bg-slate-900 bg-opacity-85 text-white rounded-lg shadow-xl text-center backdrop-blur-md border border-slate-700 min-w-[300px] max-w-[90%]">
            <p className="text-[10px] sm:text-xs uppercase text-slate-400">Time Since Last Major (M{MAJOR_QUAKE_THRESHOLD.toFixed(1)}+) Quake Globally:</p>
            <div className="text-xl sm:text-2xl font-bold text-orange-400 my-0.5">{timeSinceFormatted}</div>
            {lastMajorQuake && lastMajorQuake.properties && (
                <p className="text-[10px] sm:text-xs text-slate-300 truncate">
                    M{lastMajorQuake.properties.mag?.toFixed(1)} - {lastMajorQuake.properties.place}
                </p>
            )}
        </div>
    );
};

export default GlobalLastMajorQuakeTimer;