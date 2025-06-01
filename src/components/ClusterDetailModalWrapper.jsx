// src/ClusterDetailModalWrapper.jsx
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ClusterDetailModal from './ClusterDetailModal';
import SeoMetadata from './SeoMetadata'; // Import SeoMetadata

/**
 * Wrapper component for ClusterDetailModal to integrate with React Router.
 * It fetches cluster details based on URL parameters and handles navigation.
 * @param {object} props - The component's props.
 * @param {Array<object>} props.overviewClusters - An array of cluster summary objects, used to find the full cluster data. Each object should have an 'id'.
 * @param {function} props.formatDate - Function to format timestamps into human-readable strings.
 * @param {function} props.getMagnitudeColorStyle - Function that returns Tailwind CSS class strings for magnitude-based coloring.
 * @param {function} [props.onIndividualQuakeSelect] - Optional callback function invoked when an individual earthquake within the cluster is selected.
 * @param {string} props.displayedClusterId - The ID of the cluster to display, potentially adjusted by ClusterDetailLoader.
 * @returns {JSX.Element} The rendered ClusterDetailModal or a "not found" message.
 */
function ClusterDetailModalWrapper({ displayedClusterId, overviewClusters, formatDate, getMagnitudeColorStyle, onIndividualQuakeSelect }) {
    // Immediately check if overviewClusters is a valid array
    if (!Array.isArray(overviewClusters)) {
        console.error("ClusterDetailModalWrapper: overviewClusters prop is not an array. Received:", overviewClusters);
        const { clusterId: originalUrlClusterIdForError } = useParams(); // For SEO in error case
        const navigate = useNavigate(); // For the button
        const canonicalUrlOnError = `https://earthquakeslive.com/cluster/${originalUrlClusterIdForError || 'data_error'}`;

        return (
            <>
                <SeoMetadata
                    title="Cluster Data Error | Seismic Monitor"
                    description="Error: Could not display cluster information due to an unexpected data format."
                    pageUrl={canonicalUrlOnError}
                    canonicalUrl={canonicalUrlOnError}
                    locale="en_US"
                />
                <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-50 p-4" role="alertdialog" aria-labelledby="data-error-title">
                    <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700">
                        <h2 id="data-error-title" className="text-xl font-semibold text-red-400 mb-3">Data Error</h2>
                        <p className="text-sm mb-4">An issue occurred with the cluster data. Unable to display details.</p>
                        <button
                            onClick={() => navigate(-1)}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors"
                        >
                            Go Back
                        </button>
                    </div>
                </div>
            </>
        );
    }

    const { clusterId: originalUrlClusterId } = useParams(); // For SEO and canonical URL
    const navigate = useNavigate();

    // Find the cluster data from overviewClusters using the displayedClusterId prop
    const cluster = overviewClusters.find(c => c.id === displayedClusterId);

    const handleClose = () => {
        navigate(-1); // Go back to the previous page
    };

    // Canonical URL should always reflect the URL the user initially visited or shared
    const canonicalUrl = `https://earthquakeslive.com/cluster/${originalUrlClusterId || displayedClusterId || 'unknown'}`;

    if (!cluster) {
        // Even if cluster is not found, set a basic SEO for the error page
        // Use originalUrlClusterId for consistency in the "Not Found" scenario's canonical URL
        const notFoundCanonicalUrl = `https://earthquakeslive.com/cluster/${originalUrlClusterId || 'not_found'}`;
        return (
            <>
                <SeoMetadata
                    title="Cluster Not Found | Seismic Monitor"
                    description="The requested earthquake cluster details could not be found."
                    pageUrl={notFoundCanonicalUrl}
                    canonicalUrl={notFoundCanonicalUrl}
                    locale="en_US"
                />
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
            </>
        );
    }

    const pageTitle = cluster.locationName ? `Active Earthquake Cluster near ${cluster.locationName} | Details & Map` : "Earthquake Cluster Details | Seismic Monitor";
    const pageDescription = `Details for an active earthquake cluster near ${cluster.locationName || 'Unknown Location'}. Includes ${cluster.quakeCount} quakes, max magnitude M ${cluster.maxMagnitude?.toFixed(1)}, active over ${cluster.timeRange}.`;
    const keywords = `earthquake cluster, ${cluster.locationName}, seismic activity, ${cluster.quakeCount} earthquakes, M ${cluster.maxMagnitude?.toFixed(1)}, earthquake swarm`;

    // Construct pageUrl for SeoMetadata using originalUrlClusterId if available, falling back to displayedClusterId
    const pageUrlForMeta = `https://earthquakeslive.com/cluster/${originalUrlClusterId || displayedClusterId}`;

    return (
        <>
            <SeoMetadata
                title={pageTitle}
                description={pageDescription}
                keywords={keywords}
                pageUrl={pageUrlForMeta}
                canonicalUrl={canonicalUrl} // canonicalUrl already uses originalUrlClusterId or fallback
                locale="en_US"
                type="website" // Or "Event" if more appropriate, but website is safe
            />
            <ClusterDetailModal
                cluster={cluster}
                onClose={handleClose}
            formatDate={formatDate}
            getMagnitudeColorStyle={getMagnitudeColorStyle}
            onIndividualQuakeSelect={onIndividualQuakeSelect} // Pass this down
        />
        </>
    );
}

export default ClusterDetailModalWrapper;
