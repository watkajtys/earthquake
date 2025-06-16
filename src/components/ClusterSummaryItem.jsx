// src/ClusterSummaryItem.jsx
import React, { memo } from 'react';
import { getMagnitudeColorStyle } from '../utils/utils.js';

/**
 * Renders a summary card for a single earthquake cluster, typically for display in a list.
 * This component is memoized for performance optimization.
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {Object} props.clusterData - Data object for the cluster to display.
 *   Expected structure:
 *   - `id` (string|number): Unique identifier for the cluster (used for keys in lists).
 *   - `locationName` (string): The geographical name of the cluster's location.
 *   - `quakeCount` (number): The total number of earthquakes in this cluster.
 *   - `maxMagnitude` (number): The maximum magnitude recorded in this cluster.
 *   - `timeRange` (string): A human-readable string describing the cluster's active period.
 * @param {function} [props.onClusterSelect] - Optional callback function that is triggered when the cluster item is clicked.
 *   Receives the `clusterData` object as an argument.
 * @returns {JSX.Element|null} The ClusterSummaryItem component, or null if `clusterData` is not provided.
 */
function ClusterSummaryItem({ clusterData, onClusterSelect }) {
    if (!clusterData) {
        return null; // Or some fallback UI for empty data
    }

    const {
        locationName,
        quakeCount,
        maxMagnitude,
        timeRange
    } = clusterData;

    // Basic styling - can be adjusted to match app's theme
    // This assumes it will be part of a list, hence <li>.
    // Could also be a div if used differently.

    // No custom handleKeyDown needed if using a native button,
    // as it handles Enter/Space presses by default for onClick.

    const magnitudeColorStyle = getMagnitudeColorStyle(maxMagnitude);

    return (
        <li className="border border-slate-600 rounded-md shadow-sm"> {/* Basic li styling, no interaction here */}
            <button
                type="button" // Explicitly type as button
                className={`w-full text-left py-2 px-3 ${magnitudeColorStyle} transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-md`}
                onClick={() => onClusterSelect && onClusterSelect(clusterData)}
                // title attribute can remain on the button or be moved to a specific element if more appropriate
            >
                <h4 className="text-sm font-semibold truncate" title={locationName}>
                    {locationName || 'Unknown Cluster Location'}
                </h4>
                <p className="text-xs mt-0.5">
                    Quakes: <span className="font-medium">{quakeCount}</span> |
                    Max Mag: <span className="font-medium">M {maxMagnitude?.toFixed(1) || 'N/A'}</span>
                </p>
                <p className="text-xs mt-0.5">
                    {typeof timeRange === 'object' && timeRange !== null ? (
                        <>
                            {timeRange.prefix}
                            <span className="font-medium">{timeRange.value}</span>
                            {timeRange.suffix}
                        </>
                    ) : (
                        'Time information unavailable'
                    )}
                </p>
            </button>
        </li>
    );
}

export default memo(ClusterSummaryItem);
