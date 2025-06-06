// src/components/ClusterDetailModalWrapper.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ClusterDetailModal from './ClusterDetailModal';
import SeoMetadata from './SeoMetadata';
import { fetchClusterDefinition } from '../services/clusterApiService.js';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx';
import { findActiveClusters } from '../utils/clusterUtils.js';
import { CLUSTER_MAX_DISTANCE_KM, CLUSTER_MIN_QUAKES } from '../constants/appConstants.js';

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
    formatTimeAgo,
    formatTimeDuration
}) {
    const { clusterId } = useParams();
    const navigate = useNavigate();

    const [dynamicCluster, setDynamicCluster] = useState(null);
    const [clusterSeoProps, setClusterSeoProps] = useState(null); // Added state for SEO props
    const [loadingPhase, setLoadingPhase] = useState('worker_fetch');
    const [errorMessage, setErrorMessage] = useState('');

    const {
        allEarthquakes,
        earthquakesLast72Hours,
        isLoadingWeekly,
        isLoadingMonthly,
        isInitialAppLoad,
        hasAttemptedMonthlyLoad
    } = useEarthquakeDataState();

    // Helper function to generate SEO props for a cluster
    const generateClusterSeoProps = (clusterData, currentClusterId) => {
        if (!clusterData) return null;

        const { locationName, quakeCount, maxMagnitude, originalQuakes } = clusterData;
        // Use clusterData.id if available (it should be), otherwise fallback to currentClusterId
        const idToUse = clusterData.id || currentClusterId;

        const pageTitle = `Earthquake Cluster: ${locationName || 'Unknown Area'}`;
        const pageDescription = `Explore details of an earthquake cluster near ${locationName || 'Unknown Area'}, featuring ${quakeCount} seismic events with a maximum magnitude of M${maxMagnitude?.toFixed(1)}. View quake list, map, and activity period.`;
        const pageKeywords = `earthquake cluster, seismic swarm, ${locationName || 'unknown area'}, active seismic zone, earthquake activity, seismic events`;
        const canonicalPageUrl = `https://earthquakeslive.com/cluster/${idToUse}`;

        let earliestTime = clusterData._earliestTimeInternal;
        let latestTime = clusterData._latestTimeInternal;

        if (earliestTime === Infinity || latestTime === -Infinity || !earliestTime || !latestTime) {
            earliestTime = Infinity;
            latestTime = -Infinity;
            if (originalQuakes && originalQuakes.length > 0) {
                originalQuakes.forEach(quake => {
                    const time = quake.properties?.time;
                    if (time) {
                        if (time < earliestTime) earliestTime = time;
                        if (time > latestTime) latestTime = time;
                    }
                });
            }
        }

        const eventJsonLd = {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage', // Changed from EventSeries
            name: pageTitle,
            description: pageDescription,
            url: canonicalPageUrl,
            keywords: pageKeywords.toLowerCase(), // Added keywords
            // datePublished: earliestTime !== Infinity && earliestTime ? new Date(earliestTime).toISOString() : undefined, // Optional: if CollectionPage has a start
            dateModified: clusterData.updatedAt ? new Date(clusterData.updatedAt).toISOString() : (latestTime !== -Infinity && latestTime ? new Date(latestTime).toISOString() : undefined),
            // Optional: mainEntity or hasPart if we want to list some items, for now 'about' is simpler
        };

        // Add 'about' if strongest quake info is available
        if (clusterData.strongestQuakeId && locationName && maxMagnitude) {
            eventJsonLd.about = {
                "@type": "Event", // Describing the main event defining the cluster
                "name": `M ${maxMagnitude.toFixed(1)} - ${locationName}`,
                "identifier": clusterData.strongestQuakeId,
                // Potentially add "startDate" for the strongest quake if its specific time is easily available here
                // "location": { "@type": "Place", "name": locationName } // Or even GeoCoordinates if available
            };
        }

        // Add location with GeoCoordinates if strongest quake details are available and parsed
        // This part depends on how `strongestQuakeDetails` would be populated and passed to this function.
        // For now, assuming `clusterData.strongestQuake` might hold these if fetched by parent.
        // If `clusterData.strongestQuake` (an object with geometry) is part of `clusterData`:
        if (clusterData.strongestQuake?.geometry?.coordinates) {
             eventJsonLd.location = {
                 "@type": "Place",
                 "name": locationName || "Unknown Area",
                 "geo": {
                     "@type": "GeoCoordinates",
                     "latitude": clusterData.strongestQuake.geometry.coordinates[1],
                     "longitude": clusterData.strongestQuake.geometry.coordinates[0]
                 }
             };
        } else if (locationName) {
            eventJsonLd.location = { "@type": "Place", "name": locationName || 'Unknown Area' };
        }


        return {
            title: pageTitle,
            description: pageDescription,
            keywords: pageKeywords,
            canonicalUrl: canonicalPageUrl,
            pageUrl: canonicalPageUrl,
            eventJsonLd: eventJsonLd,
            type: 'website',
        };
    };

    // Effect 1: Fetch from worker
    useEffect(() => {
        setDynamicCluster(null);
        setErrorMessage('');
        setLoadingPhase('worker_fetch');

        async function fetchAndProcessClusterFromWorker() {
            if (!clusterId) {
                setErrorMessage('No cluster ID specified.');
                setLoadingPhase('done');
                return;
            }

            const willLikelyUseMonthly = hasAttemptedMonthlyLoad;
            if (willLikelyUseMonthly && isLoadingMonthly) return;
            if (!willLikelyUseMonthly && (isLoadingWeekly || isInitialAppLoad)) return;

            try {
                const result = await fetchClusterDefinition(clusterId); // result includes { earthquakeIds, strongestQuakeId, updatedAt }

                if (result) {
                    const { earthquakeIds, strongestQuakeId: defStrongestQuakeId, updatedAt: kvUpdatedAt } = result;
                    const sourceQuakes = (hasAttemptedMonthlyLoad && allEarthquakes.length > 0)
                                         ? allEarthquakes
                                         : earthquakesLast72Hours;
                    if (!sourceQuakes || sourceQuakes.length === 0) {
                        console.warn("Source quakes not available for reconstruction from worker def.");
                        setLoadingPhase('reconstruct_from_id_attempt');
                        return;
                    }
                    const foundQuakes = earthquakeIds.map(id => sourceQuakes.find(q => q.id === id)).filter(Boolean);

                    if (foundQuakes.length < earthquakeIds.length) {
                        console.warn(`Cluster ${clusterId}: Worker data may be stale. Found ${foundQuakes.length} of ${earthquakeIds.length} quakes.`);
                        setLoadingPhase('reconstruct_from_id_attempt');
                    } else {
                        let earliestTime = Infinity;
                        let latestTime = -Infinity;
                        foundQuakes.forEach(quake => {
                            if (quake.properties.time < earliestTime) earliestTime = quake.properties.time;
                            if (quake.properties.time > latestTime) latestTime = quake.properties.time;
                        });
                        const strongestQuakeInList = foundQuakes.find(q => q.id === defStrongestQuakeId) || foundQuakes[0];
                        if (!strongestQuakeInList) {
                             setLoadingPhase('reconstruct_from_id_attempt'); return;
                        }
                        const reconstructedClusterData = {
                            id: clusterId,
                            originalQuakes: foundQuakes,
                            quakeCount: foundQuakes.length,
                            strongestQuakeId: strongestQuakeInList.id,
                            strongestQuake: strongestQuakeInList, // Keep the strongest quake object for geo coords
                            maxMagnitude: Math.max(...foundQuakes.map(q => q.properties.mag).filter(m => m !== null && m !== undefined)),
                            locationName: strongestQuakeInList.properties.place || 'Unknown Location',
                            _earliestTimeInternal: earliestTime,
                            _latestTimeInternal: latestTime,
                            timeRange: calculateClusterTimeRange(earliestTime, latestTime, formatDate, formatTimeAgo, formatTimeDuration, foundQuakes.length),
                            updatedAt: kvUpdatedAt, // Store the KV updatedAt
                        };
                        setDynamicCluster(reconstructedClusterData);
                        setClusterSeoProps(generateClusterSeoProps(reconstructedClusterData, clusterId));
                        setLoadingPhase('done');
                    }
                } else {
                    setLoadingPhase('reconstruct_from_id_attempt');
                }
            } catch (error) {
                console.error(`Error fetching cluster definition ${clusterId} from worker:`, error);
                setLoadingPhase('reconstruct_from_id_attempt');
            }
        }
        fetchAndProcessClusterFromWorker();
    }, [clusterId, formatDate, formatTimeAgo, formatTimeDuration, allEarthquakes, earthquakesLast72Hours, hasAttemptedMonthlyLoad, isLoadingWeekly, isLoadingMonthly, isInitialAppLoad]); // Removed generateClusterSeoProps from deps


    // Effect 2: Attempt reconstruction from parsed ID if worker fetch failed/incomplete
    useEffect(() => {
        if (loadingPhase === 'reconstruct_from_id_attempt' && !dynamicCluster) {
            // ---- Start of added ----
            const willLikelyUseMonthly = hasAttemptedMonthlyLoad;

            if (willLikelyUseMonthly && isLoadingMonthly) {
                // console.log(`WRAPPER ${clusterId}: Monthly data is loading. Waiting... (reconstruct_from_id_attempt)`);
                return;
            }
            if (!willLikelyUseMonthly && (isLoadingWeekly || isInitialAppLoad)) {
                // console.log(`WRAPPER ${clusterId}: Weekly/Initial data is loading. Waiting... (reconstruct_from_id_attempt)`);
                return;
            }
            // console.log(`WRAPPER ${clusterId}: Context data presumed loaded. Proceeding with reconstruct_from_id_attempt.`);
            // ---- End of added ----

            // console.log(`WRAPPER ${clusterId}: Phase reconstruct_from_id_attempt.`); // Removed
            const parts = clusterId ? clusterId.split('_') : [];
            let parsedStrongestQuakeId = null;
            // let parsedExpectedCount = null; // Not directly used in logic, so removed log for it
            if (parts.length === 4 && parts[0] === 'overview' && parts[1] === 'cluster') {
                parsedStrongestQuakeId = parts[2];
                // const count = parseInt(parts[3], 10); // Not directly used
                // if (!isNaN(count)) parsedExpectedCount = count;
            }
            // console.log(`WRAPPER ${clusterId}: Parsed ID - strongestQuakeId: ${parsedStrongestQuakeId}, expectedCount: ${parsedExpectedCount}.`); // Removed

            if (!parsedStrongestQuakeId) {
                // console.log(`WRAPPER ${clusterId}: Invalid parsed ID. Transitioning to fallback_prop_check_attempt.`); // Removed
                setLoadingPhase('fallback_prop_check_attempt');
                return;
            }

            const sourceQuakes = (hasAttemptedMonthlyLoad && allEarthquakes.length > 0)
                                 ? allEarthquakes
                                 : earthquakesLast72Hours;

            if (!sourceQuakes || sourceQuakes.length === 0) {
                setLoadingPhase('fallback_prop_check_attempt');
                return;
            }

            const strongestQuakeObjectFromId = sourceQuakes.find(q => q.id === parsedStrongestQuakeId);
            if (!strongestQuakeObjectFromId) {
                setLoadingPhase('fallback_prop_check_attempt');
                return;
            }

            const allNewlyFormedClusters = findActiveClusters(sourceQuakes, CLUSTER_MAX_DISTANCE_KM, CLUSTER_MIN_QUAKES);
            let matchFound = false;
            for (const newClusterArray of allNewlyFormedClusters) {
                if (!newClusterArray || newClusterArray.length === 0) continue;

                const sortedForStrongest = [...newClusterArray].sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0));
                const newStrongestQuakeInCluster = sortedForStrongest[0];

                if (!newStrongestQuakeInCluster) continue;

                const newGeneratedId = `overview_cluster_${newStrongestQuakeInCluster.id}_${newClusterArray.length}`;
                if (newGeneratedId === clusterId) {
                    let earliestTime = Infinity;
                    let latestTime = -Infinity;
                    newClusterArray.forEach(quake => {
                        if (quake.properties.time < earliestTime) earliestTime = quake.properties.time;
                        if (quake.properties.time > latestTime) latestTime = quake.properties.time;
                    });

                    const reconstructedCluster = {
                        id: clusterId,
                        originalQuakes: newClusterArray,
                        quakeCount: newClusterArray.length,
                        strongestQuakeId: newStrongestQuakeInCluster.id,
                        strongestQuake: newStrongestQuakeInCluster, // Keep the strongest quake object
                        maxMagnitude: Math.max(...newClusterArray.map(q => q.properties.mag).filter(m => m !== null && m !== undefined)),
                        locationName: newStrongestQuakeInCluster.properties.place || 'Unknown Location',
                        _earliestTimeInternal: earliestTime,
                        _latestTimeInternal: latestTime,
                        timeRange: calculateClusterTimeRange(earliestTime, latestTime, formatDate, formatTimeAgo, formatTimeDuration, newClusterArray.length),
                        // No kvUpdatedAt available for this reconstruction method
                    };
                    setDynamicCluster(reconstructedCluster);
                    setClusterSeoProps(generateClusterSeoProps(reconstructedCluster, clusterId));
                    setLoadingPhase('done');
                    matchFound = true;
                    break;
                }
            }
            if (!matchFound) {
                setLoadingPhase('fallback_prop_check_attempt');
            }
        }
    }, [loadingPhase, clusterId, allEarthquakes, earthquakesLast72Hours, formatDate, formatTimeAgo, formatTimeDuration, hasAttemptedMonthlyLoad, isLoadingWeekly, isLoadingMonthly, isInitialAppLoad]); // Removed generateClusterSeoProps from deps

    // Effect 3: Fallback to overviewClusters prop
    useEffect(() => {
        if (loadingPhase === 'fallback_prop_check_attempt' && !dynamicCluster) {
            const clusterFromProp = overviewClusters?.find(c => c.id === clusterId);
            if (clusterFromProp) {
                setDynamicCluster(clusterFromProp); // This clusterFromProp might not have 'strongestQuake' object or 'updatedAt'
                setClusterSeoProps(generateClusterSeoProps(clusterFromProp, clusterId));
                setLoadingPhase('done');
            } else {
                if (isInitialAppLoad || isLoadingWeekly || (hasAttemptedMonthlyLoad && isLoadingMonthly && !allEarthquakes.length)) {
                    setLoadingPhase('fallback_loading');
                } else {
                    const currentErrorMessage = 'Cluster details could not be found after all checks.';
                    setErrorMessage(currentErrorMessage);
                    setLoadingPhase('done');
                }
            }
        }
    }, [loadingPhase, dynamicCluster, overviewClusters, clusterId, isInitialAppLoad, isLoadingWeekly, isLoadingMonthly, hasAttemptedMonthlyLoad, allEarthquakes]); // Removed generateClusterSeoProps & errorMessage

    // Effect to manage SEO props for loading, error, and not found states
    useEffect(() => {
        const currentCanonicalUrl = clusterId ? `https://earthquakeslive.com/cluster/${clusterId}` : "https://earthquakeslive.com/clusters";

        if (!clusterId) {
            setClusterSeoProps({
                title: "Invalid Cluster Request | Earthquakes Live",
                description: "No cluster ID was provided for the request.",
                canonicalUrl: currentCanonicalUrl,
                pageUrl: currentCanonicalUrl,
                noindex: true, // Good to add noindex for invalid requests
            });
            return;
        }

        // If dynamicCluster is already set, its specific SEO props should have been generated.
        // This effect handles states where dynamicCluster is NOT yet set or an error occurred.
        if (!dynamicCluster) {
            if (loadingPhase !== 'done' && !errorMessage) {
                // Loading state
                setClusterSeoProps({
                    title: "Loading Cluster... | Earthquakes Live",
                    description: "Loading earthquake cluster details.",
                    canonicalUrl: currentCanonicalUrl,
                    pageUrl: currentCanonicalUrl,
                });
            } else if (errorMessage || (loadingPhase === 'done' && !dynamicCluster)) {
                // Error state or Not Found
                setClusterSeoProps({
                    title: "Cluster Not Found | Earthquakes Live",
                    description: errorMessage || "The requested earthquake cluster could not be located.",
                    canonicalUrl: currentCanonicalUrl,
                    pageUrl: currentCanonicalUrl,
                    noindex: true,
                });
            }
        }
        // If dynamicCluster IS set, generateClusterSeoProps has already been called by the effect that set it.
        // No need to call setClusterSeoProps(generateClusterSeoProps(dynamicCluster, clusterId)) here again,
        // as it would create a loop if generateClusterSeoProps is a dependency.

    }, [clusterId, loadingPhase, errorMessage, dynamicCluster]);


    const handleClose = () => navigate(-1);

    // Centralized rendering logic based on current state (clusterSeoProps, dynamicCluster, loadingPhase)
    if (clusterSeoProps && dynamicCluster && loadingPhase === 'done' && !errorMessage) {
        // SUCCESS: Cluster data and its specific SEO props are ready
        return (
            <>
                <SeoMetadata {...clusterSeoProps} />
                <ClusterDetailModal
                    cluster={dynamicCluster}
                    onClose={handleClose}
                    formatDate={formatDate}
                    getMagnitudeColorStyle={getMagnitudeColorStyle}
                    onIndividualQuakeSelect={onIndividualQuakeSelect}
                />
            </>
        );
    } else if (clusterSeoProps && (loadingPhase !== 'done' || (isInitialAppLoad || isLoadingWeekly || (hasAttemptedMonthlyLoad && isLoadingMonthly && !allEarthquakes.length)))) {
        // LOADING: Show loading UI, SeoMetadata should be "Loading Cluster..."
        return (
            <>
                <SeoMetadata {...clusterSeoProps} />
                <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[60] p-4">
                    <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700 text-center">
                        <svg aria-hidden="true" className="animate-spin h-8 w-8 text-indigo-400 mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <h2 className="text-lg font-semibold text-indigo-300">Loading Cluster Details...</h2>
                        <p className="text-sm text-slate-400">Fetching the latest information (Phase: {loadingPhase}).</p>
                    </div>
                </div>
            </>
        );
    } else if (clusterSeoProps && clusterSeoProps.noindex && loadingPhase === 'done') {
        // NOT FOUND / ERROR: Show error UI, SeoMetadata should be "Cluster Not Found" or specific error
        return (
            <>
                <SeoMetadata {...clusterSeoProps} />
                <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[60] p-4">
                    <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700">
                        <h2 className="text-xl font-semibold text-amber-400 mb-3">{clusterSeoProps.title?.split('|')[0].trim() || "Error"}</h2>
                        <p className="text-sm mb-4">{clusterSeoProps.description || "An unexpected error occurred."}</p>
                        <button onClick={handleClose} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors">
                            Go Back
                        </button>
                    </div>
                </div>
            </>
        );
    }

    // Fallback for any other unhandled state, or if clusterSeoProps is null when it shouldn't be.
    // This could be a brief moment before the SEO effect for loading/error kicks in.
    // Rendering a minimal, non-indexed SEO tag and a simple loading or null.
    const defaultSeoTitle = !clusterId ? "Invalid Request" : "Loading Information...";
    return (
        <>
            <SeoMetadata title={defaultSeoTitle} description="Loading earthquake cluster information." noindex={!clusterId ? true : undefined} />
            {/* Can show a minimal loading indicator here or return null if preferred for brief transitions */}
             <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[60] p-4">
                <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700 text-center">
                     <h2 className="text-lg font-semibold text-indigo-300">{defaultSeoTitle}</h2>
                 </div>
             </div>
        </>
    );
}
export default ClusterDetailModalWrapper;
