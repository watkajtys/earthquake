// src/ClusterSummaryItem.jsx
import React, { memo } from 'react';

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
 * @param {function} props.getMagnitudeColorStyle - Function to get the color style based on magnitude.
 * @returns {JSX.Element|null} The ClusterSummaryItem component, or null if `clusterData` is not provided.
 */
function ClusterSummaryItem({ clusterData, onClusterSelect, getMagnitudeColorStyle }) {
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

    return (
        <li className="text-xs border-b border-slate-600 last:border-b-0 rounded">
            <button
                type="button" // Explicitly type as button
                className={`w-full text-left p-2 hover:bg-slate-600 focus:bg-slate-500 transition-colors rounded focus:outline-none focus:ring-1 focus:ring-indigo-400 ${getMagnitudeColorStyle(maxMagnitude)}`}
                onClick={() => onClusterSelect && onClusterSelect(clusterData)}
                // title attribute can remain on the button or be moved to a specific element if more appropriate
            >
                <h4 className="text-sm font-semibold text-sky-300 truncate" title={locationName}>
                    {locationName || 'Unknown Cluster Location'}
                </h4>
                <p className="text-xs text-slate-300 mt-0.5">
                    Quakes: <span className="font-medium text-slate-100">{quakeCount}</span> |
                    Max Mag: <span className="font-medium text-slate-100">M {maxMagnitude?.toFixed(1) || 'N/A'}</span>
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                    {timeRange || 'Time information unavailable'}
                </p>
            </button>
        </li>
    );
}

export default memo(ClusterSummaryItem);
