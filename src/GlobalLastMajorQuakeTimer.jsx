// src/GlobalLastMajorQuakeTimer.jsx
import React, { useState, useEffect } from 'react';

// Assuming MAJOR_QUAKE_THRESHOLD and formatTimeDuration are passed or defined here
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