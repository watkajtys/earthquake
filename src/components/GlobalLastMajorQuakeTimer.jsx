// src/GlobalLastMajorQuakeTimer.jsx
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { getMagnitudeColor } from '../utils/utils.js';
import { MAJOR_QUAKE_THRESHOLD } from '../constants/appConstants';
import SkeletonText from './skeletons/SkeletonText';

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
 * @param {function} props.formatTimeDuration - Function to format a duration in milliseconds to a human-readable string (e.g., "1 day, 2 hr, 30 min").
 * @param {function} [props.handleTimerClick] - Optional function to handle clicks on the timer.
 * @returns {JSX.Element} The rendered GlobalLastMajorQuakeTimer component.
 */
const GlobalLastMajorQuakeTimer = ({ lastMajorQuake, formatTimeDuration, handleTimerClick }) => {
    const [timeSinceFormatted, setTimeSinceFormatted] = useState(<SkeletonText width="w-1/2 mx-auto" height="h-8" className="bg-slate-600"/>);

    const isClickable = handleTimerClick && lastMajorQuake;

    const magnitudeColorValue = lastMajorQuake?.properties?.mag ? getMagnitudeColor(lastMajorQuake.properties.mag) : '#FB923C'; // Default to orange-400 hex

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
    }, [lastMajorQuake, formatTimeDuration]);

    return (
        <div
            className="absolute bottom-2 left-1/2 transform -translate-x-1/2 z-10 p-2.5 bg-slate-900 bg-opacity-85 text-white rounded-lg shadow-xl text-center backdrop-blur-md border border-slate-700 min-w-[300px] max-w-[90%]"
            onClick={() => {
                if (isClickable) {
                    handleTimerClick(lastMajorQuake);
                }
            }}
            onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && isClickable) {
                    handleTimerClick(lastMajorQuake);
                }
            }}
            role={isClickable ? "button" : undefined}
            tabIndex={isClickable ? 0 : undefined}
            style={{ cursor: isClickable ? 'pointer' : 'default' }}
        >
            <p className="text-[10px] sm:text-xs uppercase text-slate-400">Time Since Last Major (M{MAJOR_QUAKE_THRESHOLD.toFixed(1)}+) Quake Globally:</p>
            <div className="text-xl sm:text-2xl font-bold my-0.5" style={{ color: magnitudeColorValue }}>{timeSinceFormatted}</div>
            {lastMajorQuake && lastMajorQuake.properties && (
                <p className="text-[10px] sm:text-xs text-slate-300 truncate">
                    M{lastMajorQuake.properties.mag?.toFixed(1)} - {lastMajorQuake.properties.place}
                </p>
            )}
        </div>
    );
};

GlobalLastMajorQuakeTimer.propTypes = {
    lastMajorQuake: PropTypes.shape({
        properties: PropTypes.shape({
            time: PropTypes.number.isRequired,
            place: PropTypes.string,
            mag: PropTypes.number,
        }),
    }),
    formatTimeDuration: PropTypes.func.isRequired,
    handleTimerClick: PropTypes.func,
};

export default GlobalLastMajorQuakeTimer;