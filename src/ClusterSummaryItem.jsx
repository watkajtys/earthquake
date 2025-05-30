// src/ClusterSummaryItem.jsx
import React from 'react';

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
    return (
        <li
            className="py-2 px-3 bg-slate-700 rounded-md shadow-sm hover:bg-slate-600 transition-colors duration-150 ease-in-out border border-slate-600 cursor-pointer" // Added cursor-pointer
            onClick={() => onClusterSelect && onClusterSelect(clusterData)} // Call onClusterSelect with clusterData
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
        </li>
    );
}

export default ClusterSummaryItem;
