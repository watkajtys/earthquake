// src/components/ClusterDetailModalWrapper.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ClusterDetailModal from './ClusterDetailModal';
import SeoMetadata from './SeoMetadata';
import { fetchClusterDefinition } from '../../services/clusterApiService.js';
import { useEarthquakeDataState } from '../../contexts/EarthquakeDataContext.jsx';

// Helper for time range calculation (adapted from HomePage.jsx)
function calculateClusterTimeRange(earliestTime, latestTime, formatDate, formatTimeAgo, formatTimeDuration, clusterLength = 0) {
    if (earliestTime === Infinity || latestTime === -Infinity || !earliestTime || !latestTime) return 'Time N/A';

    const now = Date.now();
    const durationSinceEarliest = now - earliestTime;

    if (now - latestTime < 24 * 60 * 60 * 1000 && clusterLength > 1) {
        const clusterDurationMillis = latestTime - earliestTime;
        if (clusterDurationMillis < 60 * 1000) return `Active just now`;
        if (clusterDurationMillis < 60 * 60 * 1000) return `Active over ${Math.round(clusterDurationMillis / (60 * 1000))}m`;
        return `Active over ${formatTimeDuration(clusterDurationMillis)}`;
    }
    return `Started ${formatTimeAgo(durationSinceEarliest)}`;
}

function ClusterDetailModalWrapper({
    overviewClusters,
    formatDate,
    getMagnitudeColorStyle,
    onIndividualQuakeSelect,
    formatTimeAgo,      // Ensure this is passed from HomePage
    formatTimeDuration  // Ensure this is passed from HomePage
}) {
    const { clusterId } = useParams();
    const navigate = useNavigate();

    const [dynamicCluster, setDynamicCluster] = useState(null);
    const [loadingPhase, setLoadingPhase] = useState('worker_fetch'); // 'worker_fetch', 'fallback_attempt', 'fallback_loading', 'done'
    const [errorMessage, setErrorMessage] = useState('');

    const {
        allEarthquakes,
        earthquakesLast72Hours,
        isLoadingWeekly, // For earthquakesLast72Hours
        isLoadingMonthly, // For allEarthquakes (if it relies on monthly load)
        isInitialAppLoad, // Broader loading state
        hasAttemptedMonthlyLoad
    } = useEarthquakeDataState();

    useEffect(() => {
        setDynamicCluster(null);
        setErrorMessage('');
        setLoadingPhase('worker_fetch');

        async function fetchAndProcessCluster() {
            if (!clusterId) {
                setErrorMessage('No cluster ID specified.');
                setLoadingPhase('done');
                return;
            }
            try {
                const result = await fetchClusterDefinition(clusterId);

                if (result) {
                    const { earthquakeIds, strongestQuakeId: defStrongestQuakeId } = result;
                    const sourceQuakes = (hasAttemptedMonthlyLoad && allEarthquakes.length > 0)
                                         ? allEarthquakes
                                         : earthquakesLast72Hours;

                    if (!sourceQuakes || sourceQuakes.length === 0) {
                         console.warn("Source quakes (allEarthquakes or 72hr) not available for reconstruction.");
                         setLoadingPhase('fallback_attempt'); // No data to reconstruct from
                         return;
                    }

                    const foundQuakes = earthquakeIds.map(id => sourceQuakes.find(q => q.id === id)).filter(Boolean);

                    if (foundQuakes.length < earthquakeIds.length) {
                        console.warn(`Cluster ${clusterId}: Not all quakes found from worker definition. Stale or incomplete. Found ${foundQuakes.length}/${earthquakeIds.length}`);
                        setLoadingPhase('fallback_attempt'); // Definition is stale/incomplete
                    } else {
                        let earliestTime = Infinity;
                        let latestTime = -Infinity;
                        foundQuakes.forEach(quake => {
                            if (quake.properties.time < earliestTime) earliestTime = quake.properties.time;
                            if (quake.properties.time > latestTime) latestTime = quake.properties.time;
                        });

                        const strongestQuake = foundQuakes.find(q => q.id === defStrongestQuakeId) || foundQuakes[0];
                        if (!strongestQuake) { // Should not happen if foundQuakes is not empty
                            console.error("Could not determine strongest quake for reconstruction");
                            setLoadingPhase('fallback_attempt');
                            return;
                        }


                        const reconstructedClusterData = {
                            id: clusterId,
                            originalQuakes: foundQuakes,
                            quakeCount: foundQuakes.length,
                            strongestQuakeId: strongestQuake.id,
                            maxMagnitude: Math.max(...foundQuakes.map(q => q.properties.mag).filter(m => m !== null && m !== undefined)),
                            locationName: strongestQuake.properties.place || 'Unknown Location',
                            _earliestTimeInternal: earliestTime, // For potential sorting/internal use
                            _latestTimeInternal: latestTime,     // For potential sorting/internal use
                            timeRange: calculateClusterTimeRange(earliestTime, latestTime, formatDate, formatTimeAgo, formatTimeDuration, foundQuakes.length),
                            // Ensure all properties expected by ClusterDetailModal are present
                            _maxMagInternal: Math.max(...foundQuakes.map(q => q.properties.mag).filter(m => m !== null && m !== undefined)), // for sorting if used by modal directly
                            _quakeCountInternal: foundQuakes.length, // for sorting if used by modal directly
                        };
                        setDynamicCluster(reconstructedClusterData);
                        setLoadingPhase('done');
                    }
                } else {
                    setLoadingPhase('fallback_attempt');
                }
            } catch (error) {
                console.error(`Error fetching cluster definition ${clusterId} from worker:`, error);
                setLoadingPhase('fallback_attempt'); // Proceed to fallback on any error
            }
        }

        fetchAndProcessCluster();
    }, [clusterId, formatDate, formatTimeAgo, formatTimeDuration, allEarthquakes, earthquakesLast72Hours, hasAttemptedMonthlyLoad]); // Dependencies are key

    useEffect(() => {
        if (loadingPhase === 'fallback_attempt' && !dynamicCluster) {
            const clusterFromProp = overviewClusters?.find(c => c.id === clusterId);
            if (clusterFromProp) {
                setDynamicCluster(clusterFromProp);
                setLoadingPhase('done');
            } else {
                // Check if data relevant to overviewClusters is still loading
                // isLoadingWeekly is for earthquakesLast72Hours which forms overviewClusters
                // isInitialAppLoad is a broader flag
                if (isInitialAppLoad || isLoadingWeekly || (hasAttemptedMonthlyLoad && isLoadingMonthly && allEarthquakes.length === 0)) {
                    setLoadingPhase('fallback_loading'); // Show general loading UI
                } else {
                    setErrorMessage('Cluster details could not be found.');
                    setLoadingPhase('done');
                }
            }
        }
    }, [loadingPhase, dynamicCluster, overviewClusters, clusterId, isInitialAppLoad, isLoadingWeekly, isLoadingMonthly, hasAttemptedMonthlyLoad, allEarthquakes]);

    const handleClose = () => {
        navigate(-1); // Go back to the previous page
    };

    const canonicalUrl = `https://earthquakeslive.com/cluster/${clusterId}`;

    if (loadingPhase === 'worker_fetch' || loadingPhase === 'fallback_loading' || (loadingPhase === 'fallback_attempt' && !dynamicCluster) ) {
        return (
            <>
                <SeoMetadata title="Loading Cluster... | Seismic Monitor" description="Loading earthquake cluster details." pageUrl={canonicalUrl} canonicalUrl={canonicalUrl} />
                <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[60] p-4"> {/* Ensure z-index is high */}
                    <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700 text-center">
                        <svg className="animate-spin h-8 w-8 text-indigo-400 mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <h2 className="text-lg font-semibold text-indigo-300">Loading Cluster Details...</h2>
                        <p className="text-sm text-slate-400">Fetching the latest information.</p>
                    </div>
                </div>
            </>
        );
    }

    if (loadingPhase === 'done' && !dynamicCluster) {
        return (
            <>
                <SeoMetadata title="Cluster Not Found | Seismic Monitor" description={errorMessage || "The requested earthquake cluster details could not be found."} pageUrl={canonicalUrl} canonicalUrl={canonicalUrl} />
                <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[60] p-4"> {/* Ensure z-index is high */}
                    <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700">
                        <h2 className="text-xl font-semibold text-amber-400 mb-3">Cluster Not Found</h2>
                        <p className="text-sm mb-4">{errorMessage || "The cluster details you are looking for could not be found. It might have expired, the link may be incorrect, or the data is not currently available."}</p>
                        <button onClick={handleClose} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors">
                            Go Back
                        </button>
                    </div>
                </div>
            </>
        );
    }

    if (dynamicCluster) {
        const pageTitle = dynamicCluster.locationName ? `Active Earthquake Cluster near ${dynamicCluster.locationName} | Details & Map` : "Earthquake Cluster Details | Seismic Monitor";
        const pageDescription = `Details for an active earthquake cluster near ${dynamicCluster.locationName || 'Unknown Location'}. Includes ${dynamicCluster.quakeCount} quakes, max magnitude M ${dynamicCluster.maxMagnitude?.toFixed(1)}, active over ${dynamicCluster.timeRange}.`;
        const keywords = `earthquake cluster, ${dynamicCluster.locationName}, seismic activity, ${dynamicCluster.quakeCount} earthquakes, M ${dynamicCluster.maxMagnitude?.toFixed(1)}, earthquake swarm`;

        return (
            <>
                <SeoMetadata
                    title={pageTitle}
                    description={pageDescription}
                    keywords={keywords}
                    pageUrl={canonicalUrl}
                    canonicalUrl={canonicalUrl}
                    locale="en_US"
                    type="website"
                />
                <ClusterDetailModal
                    cluster={dynamicCluster}
                    onClose={handleClose}
                    formatDate={formatDate}
                    getMagnitudeColorStyle={getMagnitudeColorStyle}
                    onIndividualQuakeSelect={onIndividualQuakeSelect}
                />
            </>
        );
    }

    return null; // Should be covered by loading/error states
}

export default ClusterDetailModalWrapper;
