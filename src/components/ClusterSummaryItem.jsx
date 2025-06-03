// src/ClusterSummaryItem.jsx
import React, { memo } from 'react';

/**
 * Renders a summary for a single earthquake cluster.
 * @param {object} props - The component's props.
 * @param {object} props.clusterData - Data for the cluster to display.
 * Expected structure:
 *   {
 *     id: string, // Unique ID for key prop
 *     locationName: string,
 *     quakeCount: number,
 *     maxMagnitude: number,
 *     timeRange: string
 *   }
 * @param {function} [props.onClusterSelect] - Optional callback when the item is clicked.
 * @returns {JSX.Element} The rendered ClusterSummaryItem component.
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

    return (
        <li className="border border-slate-600 rounded-md shadow-sm"> {/* Basic li styling, no interaction here */}
            <button
                type="button" // Explicitly type as button
                className="w-full text-left py-2 px-3 bg-slate-700 hover:bg-slate-600 transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-md"
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
