// src/GlobalLastMajorQuakeTimer.jsx
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { getMagnitudeColor } from '../utils/utils.js';
import { MAJOR_QUAKE_THRESHOLD } from '../constants/appConstants';
import SkeletonText from './skeletons/SkeletonText';

/**
 * Displays a timer indicating the time elapsed since the last major global earthquake
 * (M{MAJOR_QUAKE_THRESHOLD}+). The timer updates every second.
 * If a `lastMajorQuake` object is provided, it also displays its magnitude and location.
 * If `lastMajorQuake` is null or its time is missing, it shows a message indicating an
 * extended period without such an event.
 * The component is clickable if `handleTimerClick` is provided and a quake exists.
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {Object|null} props.lastMajorQuake - The last major earthquake object. If null, indicates no major quake data is available.
 *   Expected structure if not null:
 *   - `properties` (Object):
 *     - `time` (number): Timestamp of the quake in milliseconds.
 *     - `place` (string, optional): Location string of the quake.
 *     - `mag` (number, optional): Magnitude of the quake.
 * @param {function(number): string} props.formatTimeDuration - Function to format a duration (in milliseconds)
 *   into a human-readable string (e.g., "1 day, 2 hr, 30 min, 5 sec").
 * @param {function(Object): void} [props.handleTimerClick] - Optional callback function invoked when the timer display
 *   is clicked. Receives the `lastMajorQuake` object as an argument.
 * @returns {JSX.Element} The GlobalLastMajorQuakeTimer component.
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
            <p className="text-sm uppercase text-slate-400">Time Since Last Major (M{MAJOR_QUAKE_THRESHOLD.toFixed(1)}+) Quake Globally:</p>
            <div className="text-lg font-bold my-0.5" style={{ color: magnitudeColorValue }}>{timeSinceFormatted}</div>
            {lastMajorQuake && lastMajorQuake.properties && (
                <p className="text-sm text-slate-300 truncate">
                    M<span className="font-bold">{lastMajorQuake.properties.mag?.toFixed(1)}</span>
                    {' - '}
                    {lastMajorQuake.properties.place}
                    {isClickable && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleTimerClick(lastMajorQuake);
                            }}
                            className="ml-1 text-indigo-400 hover:text-indigo-300 underline focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded"
                            aria-label={`View details for M${lastMajorQuake.properties.mag?.toFixed(1)} at ${lastMajorQuake.properties.place}`}
                        >
                            (details)
                        </button>
                    )}
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