// src/MobileTimerBanner.jsx
import React, { useState, useEffect } from 'react';

const MobileTimerBanner = ({ lastMajorQuake, MAJOR_QUAKE_THRESHOLD, formatTimeDuration }) => {
    const [timeSinceFormatted, setTimeSinceFormatted] = useState('Calculating...');
    const [contextualQuakeInfo, setContextualQuakeInfo] = useState('');

    useEffect(() => {
        if (!lastMajorQuake?.properties?.time) {
            setTimeSinceFormatted("No M" + MAJOR_QUAKE_THRESHOLD.toFixed(1) + "+ quakes recently");
            setContextualQuakeInfo('');
            return;
        }

        const startTime = lastMajorQuake.properties.time;
        let intervalId = null;

        const updateDisplay = () => {
            setTimeSinceFormatted(formatTimeDuration(Date.now() - startTime));
        };

        updateDisplay(); // Initial update
        intervalId = setInterval(updateDisplay, 1000); // Update every second

        // Set contextual info
        const magValue = lastMajorQuake.properties.mag;
        const magDisplay = typeof magValue === 'number' ? magValue.toFixed(1) : 'N/A';
        const place = lastMajorQuake.properties.place || 'Unknown Location';
        setContextualQuakeInfo(`(M${magDisplay} - ${place})`);

        return () => clearInterval(intervalId); // Cleanup
    }, [lastMajorQuake, MAJOR_QUAKE_THRESHOLD, formatTimeDuration]);

    return (
        <div className="bg-slate-700 text-white py-2 px-3 text-center lg:hidden w-full border-t border-slate-600">
            <div className="text-[10px] sm:text-xs uppercase text-indigo-300 font-semibold tracking-wider mb-0.5">
                TIME SINCE LAST M{MAJOR_QUAKE_THRESHOLD.toFixed(1)}+ QUAKE
            </div>
            <div className="text-3xl sm:text-4xl font-bold text-sky-400 my-1">
                {timeSinceFormatted}
            </div>
            {contextualQuakeInfo && (
                <div className="text-xs text-slate-400 truncate mt-0.5">
                    {contextualQuakeInfo}
                </div>
            )}
        </div>
    );
};

export default MobileTimerBanner;
