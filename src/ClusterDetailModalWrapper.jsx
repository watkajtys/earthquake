// src/ClusterDetailModalWrapper.jsx
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ClusterDetailModal from './ClusterDetailModal';

/**
 * Wrapper component for ClusterDetailModal to integrate with React Router.
 * It fetches cluster details based on URL parameters and handles navigation.
 * @param {object} props - The component's props.
 * @param {Array<object>} props.overviewClusters - An array of cluster summary objects, used to find the full cluster data. Each object should have an 'id'.
 * @param {function} props.formatDate - Function to format timestamps into human-readable strings.
 * @param {function} props.getMagnitudeColorStyle - Function that returns Tailwind CSS class strings for magnitude-based coloring.
 * @param {function} [props.onIndividualQuakeSelect] - Optional callback function invoked when an individual earthquake within the cluster is selected.
 * @returns {JSX.Element} The rendered ClusterDetailModal or a "not found" message.
 */
function ClusterDetailModalWrapper({ overviewClusters, formatDate, getMagnitudeColorStyle, onIndividualQuakeSelect }) {
    const { clusterId } = useParams();
    const navigate = useNavigate();

    // Find the cluster data from overviewClusters using clusterId
    // Note: overviewClusters is expected to be an array of cluster objects,
    // each having an 'id' property.
    const cluster = overviewClusters?.find(c => c.id === clusterId);

    const handleClose = () => {
        navigate(-1); // Go back to the previous page
    };

    if (!cluster) {
        // Handle case where cluster is not found, e.g., show a message or redirect
        // For now, returning null or a simple message.
        // Consider navigating back or to a not-found page in a real app.
        return (
            <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
                <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700">
                    <h2 className="text-xl font-semibold text-amber-400 mb-3">Cluster Not Found</h2>
                    <p className="text-sm mb-4">The cluster details you are looking for could not be found. It might have expired or the link may be incorrect.</p>
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    return (
        <ClusterDetailModal
            cluster={cluster}
            onClose={handleClose}
            formatDate={formatDate}
            getMagnitudeColorStyle={getMagnitudeColorStyle}
            onIndividualQuakeSelect={onIndividualQuakeSelect} // Pass this down
        />
    );
}

export default ClusterDetailModalWrapper;
