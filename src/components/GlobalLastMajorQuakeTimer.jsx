// src/GlobalLastMajorQuakeTimer.jsx
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx';
import { MAJOR_QUAKE_THRESHOLD } from '../constants/appConstants';
import SkeletonText from './SkeletonText';

/**
 * A React component that displays a timer showing the time since the last major global earthquake.
 * It updates every second. If no major quake is found, it displays a message indicating an extended period without one.
 *
 * @param {object} props - The component's props.
 * @param {function} props.formatTimeDuration - Function to format a duration in milliseconds to a human-readable string (e.g., "1 day, 2 hr, 30 min").
 * @param {function} [props.handleTimerClick] - Optional function to handle clicks on the timer.
 * @returns {JSX.Element} The rendered GlobalLastMajorQuakeTimer component.
 */
const GlobalLastMajorQuakeTimer = ({ formatTimeDuration, handleTimerClick }) => {
    const { lastMajorQuake, isLoadingInitialData } = useEarthquakeDataState();
    const [timeSinceFormatted, setTimeSinceFormatted] = useState(<SkeletonText width="w-1/2 mx-auto" height="h-8" className="bg-slate-600"/>);

    const isClickable = handleTimerClick && lastMajorQuake;

    useEffect(() => {
        if (isLoadingInitialData) {
            setTimeSinceFormatted(<SkeletonText width="w-1/2 mx-auto" height="h-8" className="bg-slate-600"/>);
            return; // Exit early if data is loading
        }

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
    }, [lastMajorQuake, isLoadingInitialData, formatTimeDuration]);

    return (
        <div
            className="absolute bottom-2 left-1/2 transform -translate-x-1/2 z-10 p-2.5 bg-slate-900 bg-opacity-85 text-white rounded-lg shadow-xl text-center backdrop-blur-md border border-slate-700 min-w-[300px] max-w-[90%]"
            onClick={() => {
                if (isClickable) {
                    handleTimerClick(lastMajorQuake); // lastMajorQuake from context
                }
            }}
            onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && isClickable) {
                    handleTimerClick(lastMajorQuake); // lastMajorQuake from context
                }
            }}
            role={isClickable ? "button" : undefined}
            tabIndex={isClickable ? 0 : undefined}
            style={{ cursor: isClickable ? 'pointer' : 'default' }}
        >
            <p className="text-[10px] sm:text-xs uppercase text-slate-400">Time Since Last Major (M{MAJOR_QUAKE_THRESHOLD.toFixed(1)}+) Quake Globally:</p>
            <div className="text-xl sm:text-2xl font-bold text-orange-400 my-0.5">{timeSinceFormatted}</div>
            {lastMajorQuake && lastMajorQuake.properties && ( // lastMajorQuake from context
                <p className="text-[10px] sm:text-xs text-slate-300 truncate">
                    M{lastMajorQuake.properties.mag?.toFixed(1)} - {lastMajorQuake.properties.place}
                </p>
            )}
        </div>
    );
};

GlobalLastMajorQuakeTimer.propTypes = {
    // lastMajorQuake propType removed
    formatTimeDuration: PropTypes.func.isRequired,
    handleTimerClick: PropTypes.func,
};

export default GlobalLastMajorQuakeTimer;