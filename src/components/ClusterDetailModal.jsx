// src/ClusterDetailModal.jsx
import React from 'react';
import ClusterMiniMap from './ClusterMiniMap'; // Added import for the mini-map
import { getMagnitudeColor } from '../utils/utils.js'; // Corrected import for getMagnitudeColor

/**
 * A modal component to display detailed information about an earthquake cluster.
 * @param {object} props - The component's props.
 * @param {object} props.cluster - Data for the cluster to display. Expected structure:
 *   {
 *     locationName: string,
 *     quakeCount: number,
 *     maxMagnitude: number,
 *     timeRange: string, // Formatted time range string
 *     originalQuakes: Array<object> // Array of individual quake objects
 *   }
 * @param {function} props.onClose - Function to call when the modal should be closed.
 * @param {function} props.formatDate - Function to format timestamps.
 * @param {function} props.getMagnitudeColorStyle - Function to get Tailwind CSS color styles for magnitude.
 * @param {function} [props.onIndividualQuakeSelect] - Callback when an individual quake item is selected.
 * @returns {JSX.Element | null} The rendered ClusterDetailModal component or null if no cluster data.
 */
function ClusterDetailModal({ cluster, onClose, formatDate, getMagnitudeColorStyle, onIndividualQuakeSelect }) {
    const modalContentRef = React.useRef(null);
    const closeButtonRef = React.useRef(null);

    // Handle Escape key press & Focus Trapping
    React.useEffect(() => {
        const modalElement = modalContentRef.current;
        if (!modalElement) return;

        const focusableElements = modalElement.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (closeButtonRef.current) {
            closeButtonRef.current.focus();
        } else if (firstElement) {
            firstElement.focus();
        }

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose();
                return;
            }
            if (event.key === 'Tab') {
                if (event.shiftKey) { // Shift + Tab
                    if (document.activeElement === firstElement || document.activeElement === modalElement) {
                        lastElement.focus();
                        event.preventDefault();
                    }
                } else { // Tab
                    if (document.activeElement === lastElement) {
                        firstElement.focus();
                        event.preventDefault();
                    }
                }
            }
        };

        modalElement.addEventListener('keydown', handleKeyDown);
        // Fallback for escape if somehow focus is outside
        const handleGlobalEscape = (event) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleGlobalEscape);

        return () => {
            modalElement.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('keydown', handleGlobalEscape);
        };
    }, [onClose]);


    if (!cluster) {
        return null;
    }

    const {
        locationName,
        quakeCount,
        maxMagnitude,
        timeRange,
        originalQuakes = [] // Default to empty array if not provided
    } = cluster;

    // Sort quakes by time (most recent first)
    const sortedQuakes = [...originalQuakes].sort((a, b) => {
        const timeA = a.properties?.time || 0;
        const timeB = b.properties?.time || 0;
        return timeB - timeA; // Descending order
    });

    // Calculate Depth Range (Optional, as designed)
    let minDepth = Infinity;
    let maxDepth = -Infinity;
    let depthDataAvailable = false;
    originalQuakes.forEach(quake => {
        const depth = quake.geometry?.coordinates?.[2];
        if (typeof depth === 'number') {
            depthDataAvailable = true;
            if (depth < minDepth) minDepth = depth;
            if (depth > maxDepth) maxDepth = depth;
        }
    });
    const depthRangeStr = depthDataAvailable ? `${minDepth.toFixed(1)}km - ${maxDepth.toFixed(1)}km` : 'N/A';

    return (
        <div
            className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-40 p-4 transition-opacity duration-300 ease-in-out"
            onClick={onClose} // Removed backdrop click to close, rely on Esc key and close button
            role="dialog"
            aria-modal="true"
            aria-labelledby="cluster-detail-title"
        >
            <div
                ref={modalContentRef}
                tabIndex="-1" // Make modal container focusable for trap if no inner elements are
                className="bg-slate-800 p-4 sm:p-6 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-700 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-700"
                onClick={e => e.stopPropagation()} // Prevent backdrop click from triggering inside modal
            >
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-700 mb-4">
                    <h2 id="cluster-detail-title" className="text-lg sm:text-xl font-semibold text-indigo-400 truncate pr-2" title={locationName}>
                        Cluster: {locationName || 'Unknown Location'}
                    </h2>
                    <button
                        ref={closeButtonRef}
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded-full hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        aria-label="Close modal"
                    >
                        <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                {/* Summary Statistics */}
                <div className="mb-4 text-xs sm:text-sm space-y-1 text-slate-300">
                    <p><strong>Total Earthquakes:</strong> <span className="text-slate-100">{quakeCount}</span></p>
                    <p><strong>Maximum Magnitude:</strong> <span className="text-slate-100">M {maxMagnitude?.toFixed(1)}</span></p>
                    <p><strong>Active Period:</strong> <span className="text-slate-100">{timeRange}</span></p>
                    <p><strong>Depth Range:</strong> <span className="text-slate-100">{depthRangeStr}</span></p>
                </div>

                {/* Cluster Mini Map */}
                <div className="my-4"> {/* Added margin for spacing */}
                    <ClusterMiniMap cluster={cluster} getMagnitudeColor={getMagnitudeColor} />
                </div>

                {/* Individual Earthquakes List */}
                <h3 className="text-md sm:text-lg font-semibold text-indigo-300 mb-2 pt-2 border-t border-slate-700">
                    Earthquakes in this Cluster
                </h3>
                <div className="flex-grow space-y-2 pr-1">
                    {sortedQuakes.length > 0 ? (
                        sortedQuakes.map(quake => {
                            const handleQuakeKeyDown = (event, q) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    if (onIndividualQuakeSelect) {
                                        onIndividualQuakeSelect(q);
                                    }
                                    event.preventDefault();
                                }
                            };
                            const quakeTitle = `Click to view details for M ${quake.properties?.mag?.toFixed(1) || 'N/A'} - ${quake.properties?.place || 'Unknown Place'}`;
                            const originalClassName = `p-2.5 rounded-md border ${getMagnitudeColorStyle ? getMagnitudeColorStyle(quake.properties?.mag) : 'bg-slate-700 border-slate-600'} hover:border-slate-500 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400`;

                            return (
                            <div
                                key={quake.id}
                                className={originalClassName} // Restored original className
                                onClick={() => onIndividualQuakeSelect && onIndividualQuakeSelect(quake)}
                                onKeyDown={(e) => handleQuakeKeyDown(e, quake)}
                                tabIndex="0"
                                role="button"
                                title={quakeTitle} // Use pre-constructed title string
                            >
                                <div className="flex justify-between items-start mb-0.5">
                                    <p className="text-sm font-semibold">
                                        M {quake.properties?.mag?.toFixed(1) || 'N/A'}
                                    </p>
                                    {/* Optionally, keep a more subtle indicator if a USGS link exists, or remove entirely */}
                                    {/* For now, removing the explicit "USGS Detail ->" link from this spot */}
                                </div>
                                <p className="text-xs text-slate-200 truncate" title={quake.properties?.place}>
                                    {quake.properties?.place || 'Unknown place'}
                                </p>
                                <div className="text-xxs text-slate-400 mt-1 flex justify-between">
                                    <span>
                                        {formatDate ? formatDate(quake.properties?.time) : new Date(quake.properties?.time).toLocaleString() || 'N/A'}
                                    </span>
                                    <span>
                                        Depth: {quake.geometry?.coordinates?.[2]?.toFixed(1) || 'N/A'} km
                                    </span>
                                </div>
                            </div>
                        ); // Restored semicolon for return
                    }) // Restored closing brace for map callback
                    ) : (
                        <p className="text-slate-400 text-sm text-center py-4">No individual earthquake data available for this cluster.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ClusterDetailModal;
