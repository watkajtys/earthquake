// src/components/ClusterDetailModalWrapper.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ClusterDetailModal from './ClusterDetailModal';
import SeoMetadata from './SeoMetadata';
import { fetchClusterDefinition } from '../services/clusterApiService.js';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx';
import { findActiveClusters } from '../utils/clusterUtils.js';
import { CLUSTER_MAX_DISTANCE_KM, CLUSTER_MIN_QUAKES } from '../constants/appConstants.js';

// Helper function (can be outside component if it doesn't need props/state from it directly)
function calculateClusterTimeRangeForDisplay(earliestTime, latestTime, formatDate, formatTimeAgo, formatTimeDuration, clusterLength = 0) {
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
    formatTimeAgo,
    formatTimeDuration,
    areParentClustersLoading // New prop
}) {
    const { clusterId } = useParams();
    const navigate = useNavigate();

    const [internalIsLoading, setInternalIsLoading] = useState(true);
    const [dynamicCluster, setDynamicCluster] = useState(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [seoProps, setSeoProps] = useState({});

    const {
        allEarthquakes, // Used for 30-day data if available
        earthquakesLast72Hours, // Fallback for recent data
        isLoadingWeekly, // For 72h/7day data
        isLoadingMonthly, // For 30-day data
        isInitialAppLoad, // Overall initial load
        hasAttemptedMonthlyLoad
    } = useEarthquakeDataState();

    const generateSeo = useCallback((clusterData, currentId, errorMsg = '') => {
        const pageUrl = `https://earthquakeslive.com/cluster/${currentId || 'unknown'}`;
        if (errorMsg || !clusterData) {
            return {
                title: "Cluster Not Found | Earthquakes Live",
                description: errorMsg || "The requested earthquake cluster could not be located.",
                canonicalUrl: pageUrl, pageUrl, noindex: true,
            };
        }
        const { locationName, quakeCount, maxMagnitude, _earliestTimeInternal, _latestTimeInternal, strongestQuake, updatedAt } = clusterData;
        const pageTitle = `Earthquake Cluster: ${locationName || 'Unknown Area'}`;
        const pageDescription = `Explore an earthquake cluster near ${locationName || 'Unknown Area'} with ${quakeCount} events, max magnitude M${maxMagnitude?.toFixed(1)}. View details, map, and activity period.`;
        const pageKeywords = `earthquake cluster, seismic swarm, ${locationName || 'unknown area'}, active seismic zone, earthquake activity, seismic events`;

        const eventJsonLd = {
            '@context': 'https://schema.org', '@type': 'CollectionPage',
            name: pageTitle, description: pageDescription, url: pageUrl, keywords: pageKeywords.toLowerCase(),
            dateModified: updatedAt ? new Date(updatedAt).toISOString() : (_latestTimeInternal !== -Infinity && _latestTimeInternal ? new Date(_latestTimeInternal).toISOString() : undefined),
        };
        if (strongestQuake?.id && locationName && maxMagnitude) {
            eventJsonLd.about = { "@type": "Event", "name": `M ${maxMagnitude.toFixed(1)} - ${locationName}`, "identifier": strongestQuake.id };
        }
        if (strongestQuake?.geometry?.coordinates) {
             eventJsonLd.location = { "@type": "Place", name: locationName || "Unknown Area", geo: { "@type": "GeoCoordinates", latitude: strongestQuake.geometry.coordinates[1], longitude: strongestQuake.geometry.coordinates[0] }};
        } else if (locationName) {
            eventJsonLd.location = { "@type": "Place", name: locationName || 'Unknown Area' };
        }
        return { title: pageTitle, description: pageDescription, keywords: pageKeywords, canonicalUrl: pageUrl, pageUrl, eventJsonLd, type: 'website' };
    }, []);

    useEffect(() => {
        let isMounted = true;
        setInternalIsLoading(true);
        setErrorMessage('');
        setDynamicCluster(null); // Reset on ID change

        if (!clusterId) {
            if (isMounted) {
                setErrorMessage('No cluster ID specified.');
                setInternalIsLoading(false);
                setSeoProps(generateSeo(null, null, 'No cluster ID specified.'));
            }
            return;
        }

        // Initial Loading Gate
        const sourceDataAvailable = (hasAttemptedMonthlyLoad && allEarthquakes?.length > 0) || (!hasAttemptedMonthlyLoad && earthquakesLast72Hours?.length > 0);
        const stillLoadingUpstream =
            areParentClustersLoading ||
            (hasAttemptedMonthlyLoad && isLoadingMonthly && !allEarthquakes?.length) ||
            (!hasAttemptedMonthlyLoad && (isLoadingWeekly || isInitialAppLoad) && !earthquakesLast72Hours?.length);

        if (stillLoadingUpstream && !sourceDataAvailable) {
            // console.log(`ClusterDetailWrapper (${clusterId}): Waiting for upstream data or parent clusters.`);
            if (isMounted) {
                 setSeoProps(generateSeo(null, clusterId, 'Loading cluster details...')); // Initial loading SEO
            }
            // Do not setInternalIsLoading(false) here, wait for re-render when props change
            return;
        }

        // Attempt 1: Find in overviewClusters prop
        const clusterFromProp = overviewClusters?.find(c => c.id === clusterId);
        if (clusterFromProp) {
            if (isMounted) {
                // console.log(`ClusterDetailWrapper (${clusterId}): Found in overviewClusters prop.`);
                setDynamicCluster(clusterFromProp);
                setSeoProps(generateSeo(clusterFromProp, clusterId));
                setInternalIsLoading(false);
            }
            return;
        }

        // Determine source quakes for reconstruction attempts
        const sourceQuakesForReconstruction = (hasAttemptedMonthlyLoad && allEarthquakes?.length > 0)
            ? allEarthquakes
            : earthquakesLast72Hours;

        // Attempt 2: Reconstruct from clusterId (overview_cluster_...)
        const parts = clusterId.split('_');
        if (parts.length === 4 && parts[0] === 'overview' && parts[1] === 'cluster') {
            const parsedStrongestQuakeId = parts[2];
            if (parsedStrongestQuakeId && sourceQuakesForReconstruction?.length > 0) {
                // console.log(`ClusterDetailWrapper (${clusterId}): Attempting reconstruction from ID.`);
                const allNewlyFormedClusters = findActiveClusters(sourceQuakesForReconstruction, CLUSTER_MAX_DISTANCE_KM, CLUSTER_MIN_QUAKES);
                for (const newClusterArray of allNewlyFormedClusters) {
                    if (!newClusterArray || newClusterArray.length === 0) continue;
                    const sortedForStrongest = [...newClusterArray].sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0));
                    const newStrongestQuakeInCluster = sortedForStrongest[0];
                    if (!newStrongestQuakeInCluster) continue;
                    const newGeneratedId = `overview_cluster_${newStrongestQuakeInCluster.id}_${newClusterArray.length}`;

                    if (newGeneratedId === clusterId) {
                        let earliestTime = Infinity, latestTime = -Infinity;
                        newClusterArray.forEach(q => {
                            if (q.properties.time < earliestTime) earliestTime = q.properties.time;
                            if (q.properties.time > latestTime) latestTime = q.properties.time;
                        });
                        const reconstructed = {
                            id: clusterId, originalQuakes: newClusterArray, quakeCount: newClusterArray.length,
                            strongestQuakeId: newStrongestQuakeInCluster.id, strongestQuake: newStrongestQuakeInCluster,
                            maxMagnitude: Math.max(...newClusterArray.map(q => q.properties.mag).filter(m => m != null)),
                            locationName: newStrongestQuakeInCluster.properties.place || 'Unknown Location',
                            _earliestTimeInternal: earliestTime, _latestTimeInternal: latestTime,
                            timeRange: calculateClusterTimeRangeForDisplay(earliestTime, latestTime, formatDate, formatTimeAgo, formatTimeDuration, newClusterArray.length),
                        };
                        if (isMounted) {
                            setDynamicCluster(reconstructed);
                            setSeoProps(generateSeo(reconstructed, clusterId));
                            setInternalIsLoading(false);
                        }
                        return;
                    }
                }
            }
        }

        // Attempt 3: fetchClusterDefinition (Worker/KV store)
        // console.log(`ClusterDetailWrapper (${clusterId}): Attempting fetch from worker.`);
        fetchClusterDefinition(clusterId)
            .then(workerResult => {
                if (!isMounted) return;
                if (workerResult && sourceQuakesForReconstruction?.length > 0) {
                    const { earthquakeIds, strongestQuakeId: defStrongestQuakeId, updatedAt: kvUpdatedAt } = workerResult;
                    const foundQuakes = earthquakeIds.map(id => sourceQuakesForReconstruction.find(q => q.id === id)).filter(Boolean);

                    if (foundQuakes.length === earthquakeIds.length) {
                        let earliestTime = Infinity, latestTime = -Infinity;
                        foundQuakes.forEach(q => {
                            if (q.properties.time < earliestTime) earliestTime = q.properties.time;
                            if (q.properties.time > latestTime) latestTime = q.properties.time;
                        });
                        const strongestQuakeInList = foundQuakes.find(q => q.id === defStrongestQuakeId) || foundQuakes[0];
                        if (strongestQuakeInList) {
                            const reconstructed = {
                                id: clusterId, originalQuakes: foundQuakes, quakeCount: foundQuakes.length,
                                strongestQuakeId: strongestQuakeInList.id, strongestQuake: strongestQuakeInList,
                                maxMagnitude: Math.max(...foundQuakes.map(q => q.properties.mag).filter(m => m != null)),
                                locationName: strongestQuakeInList.properties.place || 'Unknown Location',
                                _earliestTimeInternal: earliestTime, _latestTimeInternal: latestTime,
                                timeRange: calculateClusterTimeRangeForDisplay(earliestTime, latestTime, formatDate, formatTimeAgo, formatTimeDuration, foundQuakes.length),
                                updatedAt: kvUpdatedAt,
                            };
                            setDynamicCluster(reconstructed);
                            setSeoProps(generateSeo(reconstructed, clusterId));
                        } else {
                             setErrorMessage("Cluster details found but strongest quake data missing.");
                             setSeoProps(generateSeo(null, clusterId, "Cluster details found but strongest quake data missing."));
                        }
                    } else {
                        setErrorMessage("Cluster definition found, but some earthquake data is missing or stale.");
                        setSeoProps(generateSeo(null, clusterId, "Cluster definition found, but some earthquake data is missing or stale."));
                    }
                } else {
                    setErrorMessage("Cluster details could not be found.");
                    setSeoProps(generateSeo(null, clusterId, "Cluster details could not be found."));
                }
            })
            .catch(error => {
                if (!isMounted) return;
                console.error(`Error fetching cluster definition ${clusterId} from worker:`, error);
                setErrorMessage("Failed to fetch cluster details.");
                setSeoProps(generateSeo(null, clusterId, "Failed to fetch cluster details."));
            })
            .finally(() => {
                if (isMounted) setInternalIsLoading(false);
            });

        return () => { isMounted = false; };

    }, [
        clusterId, overviewClusters, areParentClustersLoading,
        allEarthquakes, earthquakesLast72Hours,
        isLoadingWeekly, isLoadingMonthly, isInitialAppLoad, hasAttemptedMonthlyLoad,
        formatDate, formatTimeAgo, formatTimeDuration, generateSeo // generateSeo is useCallback now
    ]);

    const handleClose = () => navigate(-1);

    if (internalIsLoading) {
        return (
            <>
                <SeoMetadata {...seoProps} /> {/* Will show "Loading Cluster..." or similar */}
                <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[60] p-4">
                    <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700 text-center">
                        <svg aria-hidden="true" className="animate-spin h-8 w-8 text-indigo-400 mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <h2 className="text-lg font-semibold text-indigo-300">Loading Cluster Details...</h2>
                        <p className="text-sm text-slate-400">Please wait while we fetch the information.</p>
                    </div>
                </div>
            </>
        );
    }

    if (errorMessage) {
        return (
            <>
                <SeoMetadata {...seoProps} /> {/* Will show "Cluster Not Found" or error title */}
                <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[60] p-4">
                    <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700">
                        <h2 className="text-xl font-semibold text-amber-400 mb-3">{seoProps.title?.split('|')[0].trim() || "Error"}</h2>
                        <p className="text-sm mb-4">{errorMessage}</p>
                        <button onClick={handleClose} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors">
                            Go Back
                        </button>
                    </div>
                </div>
            </>
        );
    }

    if (dynamicCluster) {
        return (
            <>
                <SeoMetadata {...seoProps} />
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

    // Fallback if somehow none of the above states are met (should be rare)
    // This also covers the brief moment before the main useEffect sets an error or loading state for the first time.
    return (
         <>
            <SeoMetadata title="Cluster Information" description="Details about a specific earthquake cluster." noindex={true} />
            <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[60] p-4">
                <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700 text-center">
                     <h2 className="text-lg font-semibold text-indigo-300">Preparing Cluster Information...</h2>
                 </div>
             </div>
        </>
    );
}
export default ClusterDetailModalWrapper;
