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
            '@type': 'EventSeries',
            name: pageTitle,
            description: pageDescription,
            startDate: earliestTime !== Infinity && earliestTime ? new Date(earliestTime).toISOString() : undefined,
            endDate: latestTime !== -Infinity && latestTime ? new Date(latestTime).toISOString() : undefined,
            location: { '@type': 'Place', name: locationName || 'Unknown Area' },
            url: canonicalPageUrl,
            identifier: idToUse,
            subjectOf: { '@type': 'WebPage', url: canonicalPageUrl },
        };
        // Add representative GeoCoordinates if strongest quake data is easily accessible and makes sense
        // For example, if clusterData contains strongestQuake.geometry.coordinates:
        // if (clusterData.strongestQuake?.geometry?.coordinates) {
        // eventJsonLd.location.geo = {
        // '@type': 'GeoCoordinates',
        // latitude: clusterData.strongestQuake.geometry.coordinates[1],
        // longitude: clusterData.strongestQuake.geometry.coordinates[0],
        //     };
        // }


        return {
            title: pageTitle,
            description: pageDescription,
            keywords: pageKeywords,
            canonicalUrl: canonicalPageUrl,
            pageUrl: canonicalPageUrl,
            eventJsonLd: eventJsonLd,
            type: 'website', // As per requirement for cluster pages
        };
    };

    // Effect 1: Fetch from worker
    useEffect(() => {
        setDynamicCluster(null);
        // setClusterSeoProps(null); // Moved to dedicated SEO effect
        setErrorMessage('');
        setLoadingPhase('worker_fetch');

        async function fetchAndProcessClusterFromWorker() {
            if (!clusterId) {
                setErrorMessage('No cluster ID specified.');
                setLoadingPhase('done');
                return;
            }

            // ---- Start of added ----
            const willLikelyUseMonthly = hasAttemptedMonthlyLoad;

            if (willLikelyUseMonthly && isLoadingMonthly) {
                // console.log(`WRAPPER ${clusterId}: Monthly data is loading. Waiting... (worker_fetch)`);
                return;
            }

            if (!willLikelyUseMonthly && (isLoadingWeekly || isInitialAppLoad)) {
                // console.log(`WRAPPER ${clusterId}: Weekly/Initial data is loading. Waiting... (worker_fetch)`);
                return;
            }
            // console.log(`WRAPPER ${clusterId}: Context data presumed loaded. Proceeding with worker_fetch.`);
            // ---- End of added ----

            // console.log(`WRAPPER ${clusterId}: Calling fetchClusterDefinition.`); // Removed
            try {
                const result = await fetchClusterDefinition(clusterId);
                // console.log(`WRAPPER ${clusterId}: Raw fetch result: `, result); // Removed

                if (result) {
                    const { earthquakeIds, strongestQuakeId: defStrongestQuakeId } = result;
                    const sourceQuakes = (hasAttemptedMonthlyLoad && allEarthquakes.length > 0)
                                         ? allEarthquakes
                                         : earthquakesLast72Hours;
                    if (!sourceQuakes || sourceQuakes.length === 0) {
                        console.warn("Source quakes not available for reconstruction from worker def."); // Kept warn
                        // console.log(`WRAPPER ${clusterId}: Worker data stale/incomplete. Transitioning to reconstruct_from_id_attempt.`); // Removed
                        setLoadingPhase('reconstruct_from_id_attempt');
                        return;
                    }
                    // console.log(`WRAPPER ${clusterId}: Reconstructing from worker data. Found ${earthquakeIds.length} quake IDs in definition.`); // Removed
                    const foundQuakes = earthquakeIds.map(id => sourceQuakes.find(q => q.id === id)).filter(Boolean);

                    if (foundQuakes.length < earthquakeIds.length) {
                        // console.log(`WRAPPER ${clusterId}: Worker data stale/incomplete. Found ${foundQuakes.length} of ${earthquakeIds.length} quakes. Transitioning to reconstruct_from_id_attempt.`); // Removed
                        console.warn(`Cluster ${clusterId}: Worker data may be stale. Found ${foundQuakes.length} of ${earthquakeIds.length} quakes.`); // Kept warn
                        setLoadingPhase('reconstruct_from_id_attempt');
                    } else {
                        let earliestTime = Infinity;
                        let latestTime = -Infinity;
                        foundQuakes.forEach(quake => {
                            if (quake.properties.time < earliestTime) earliestTime = quake.properties.time;
                            if (quake.properties.time > latestTime) latestTime = quake.properties.time;
                        });
                        const strongestQuake = foundQuakes.find(q => q.id === defStrongestQuakeId) || foundQuakes[0];
                        if (!strongestQuake) {
                             // console.log(`WRAPPER ${clusterId}: Could not find strongest quake in fetched worker data. Transitioning to reconstruct_from_id_attempt.`); // Removed
                             setLoadingPhase('reconstruct_from_id_attempt'); return;
                        }
                        const reconstructedClusterData = {
                            id: clusterId,
                            originalQuakes: foundQuakes,
                            quakeCount: foundQuakes.length,
                            strongestQuakeId: strongestQuake.id,
                            maxMagnitude: Math.max(...foundQuakes.map(q => q.properties.mag).filter(m => m !== null && m !== undefined)),
                            locationName: strongestQuake.properties.place || 'Unknown Location',
                            _earliestTimeInternal: earliestTime,
                            _latestTimeInternal: latestTime,
                            timeRange: calculateClusterTimeRange(earliestTime, latestTime, formatDate, formatTimeAgo, formatTimeDuration, foundQuakes.length),
                            _maxMagInternal: Math.max(...foundQuakes.map(q => q.properties.mag).filter(m => m !== null && m !== undefined)),
                            _quakeCountInternal: foundQuakes.length,
                        };
                        // console.log(`WRAPPER ${clusterId}: Success from worker data. dynamicCluster set.`); // Removed
                        setDynamicCluster(reconstructedClusterData);
                        setClusterSeoProps(generateClusterSeoProps(reconstructedClusterData, clusterId));
                        setLoadingPhase('done');
                    }
                } else {
                    // console.log(`WRAPPER ${clusterId}: Worker fetch failed or no definition. Transitioning to reconstruct_from_id_attempt.`); // Removed
                    setLoadingPhase('reconstruct_from_id_attempt');
                }
            } catch (error) {
                console.error(`Error fetching cluster definition ${clusterId} from worker:`, error); // Kept error
                // console.log(`WRAPPER ${clusterId}: Worker fetch failed or no definition. Transitioning to reconstruct_from_id_attempt.`); // Removed
                setLoadingPhase('reconstruct_from_id_attempt');
            }
        }
        fetchAndProcessClusterFromWorker();
    }, [clusterId, formatDate, formatTimeAgo, formatTimeDuration, allEarthquakes, earthquakesLast72Hours, hasAttemptedMonthlyLoad, isLoadingWeekly, isLoadingMonthly, isInitialAppLoad, dynamicCluster]);


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
                // console.log(`WRAPPER ${clusterId}: No sourceQuakes for ID recon. Transitioning to fallback_prop_check_attempt.`); // Removed
                setLoadingPhase('fallback_prop_check_attempt');
                return;
            }

            const strongestQuakeObject = sourceQuakes.find(q => q.id === parsedStrongestQuakeId);
            // console.log(`WRAPPER ${clusterId}: Strongest quake for ID recon (${parsedStrongestQuakeId}) found: ${strongestQuakeObject ? 'Yes' : 'No'}.`); // Removed
            if (!strongestQuakeObject) {
                // console.log(`WRAPPER ${clusterId}: ID Recon no match. Transitioning to fallback_prop_check_attempt.`); // Removed
                setLoadingPhase('fallback_prop_check_attempt');
                return;
            }

            // console.log(`WRAPPER ${clusterId}: Calling findActiveClusters for ID recon. Source length: ${sourceQuakes ? sourceQuakes.length : 0}.`); // Removed
            const allNewlyFormedClusters = findActiveClusters(sourceQuakes, CLUSTER_MAX_DISTANCE_KM, CLUSTER_MIN_QUAKES);
            // console.log(`WRAPPER ${clusterId}: findActiveClusters for ID recon returned ${allNewlyFormedClusters.length} clusters.`); // Removed

            let matchFound = false;
            for (const newClusterArray of allNewlyFormedClusters) {
                if (!newClusterArray || newClusterArray.length === 0) continue;

                const sortedForStrongest = [...newClusterArray].sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0));
                const newStrongestQuakeInCluster = sortedForStrongest[0];

                if (!newStrongestQuakeInCluster) continue;

                const newGeneratedId = `overview_cluster_${newStrongestQuakeInCluster.id}_${newClusterArray.length}`;
                // console.log(`WRAPPER ${clusterId}: ID Recon - Checking newGeneratedId: ${newGeneratedId}.`); // Removed
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
                        maxMagnitude: Math.max(...newClusterArray.map(q => q.properties.mag).filter(m => m !== null && m !== undefined)),
                        locationName: newStrongestQuakeInCluster.properties.place || 'Unknown Location',
                        _earliestTimeInternal: earliestTime,
                        _latestTimeInternal: latestTime,
                        timeRange: calculateClusterTimeRange(earliestTime, latestTime, formatDate, formatTimeAgo, formatTimeDuration, newClusterArray.length),
                        _maxMagInternal: Math.max(...newClusterArray.map(q => q.properties.mag).filter(m => m !== null && m !== undefined)),
                        _quakeCountInternal: newClusterArray.length,
                    };
                    // console.log(`WRAPPER ${clusterId}: ID Recon success! Match found. dynamicCluster set.`); // Removed
                    setDynamicCluster(reconstructedCluster);
                    setClusterSeoProps(generateClusterSeoProps(reconstructedCluster, clusterId));
                    setLoadingPhase('done');
                    matchFound = true;
                    break;
                }
            }
            if (!matchFound) {
                // console.log(`WRAPPER ${clusterId}: ID Recon no match. Transitioning to fallback_prop_check_attempt.`); // Removed
                setLoadingPhase('fallback_prop_check_attempt');
            }
        }
    }, [loadingPhase, clusterId, allEarthquakes, earthquakesLast72Hours, formatDate, formatTimeAgo, formatTimeDuration, hasAttemptedMonthlyLoad, dynamicCluster, isLoadingWeekly, isLoadingMonthly, isInitialAppLoad]);

    // Effect 3: Fallback to overviewClusters prop
    useEffect(() => {
        if (loadingPhase === 'fallback_prop_check_attempt' && !dynamicCluster) {
            // console.log(`WRAPPER ${clusterId}: Phase fallback_prop_check_attempt.`); // Removed
            const clusterFromProp = overviewClusters?.find(c => c.id === clusterId);
            if (clusterFromProp) {
                // console.log(`WRAPPER ${clusterId}: Prop fallback success. dynamicCluster set from overviewClusters.`); // Removed
                setDynamicCluster(clusterFromProp);
                setClusterSeoProps(generateClusterSeoProps(clusterFromProp, clusterId));
                setLoadingPhase('done');
            } else {
                // If not found in props, and data is still loading, wait.
                if (isInitialAppLoad || isLoadingWeekly || (hasAttemptedMonthlyLoad && isLoadingMonthly && !allEarthquakes.length)) {
                    setLoadingPhase('fallback_loading');
                } else {
                    // If data loading is complete and still not found, then it's a genuine "Not Found"
                    const currentErrorMessage = 'Cluster details could not be found after all checks.';
                    setErrorMessage(currentErrorMessage);
                    setLoadingPhase('done');
                }
            }
        }
    }, [loadingPhase, dynamicCluster, overviewClusters, clusterId, isInitialAppLoad, isLoadingWeekly, isLoadingMonthly, hasAttemptedMonthlyLoad, allEarthquakes]); // Removed errorMessage from deps as it's set here

    // Effect to manage SEO props for loading, error, and not found states
    useEffect(() => {
        const currentCanonicalUrl = `https://earthquakeslive.com/cluster/${clusterId}`;
        // Clear SEO props initially on clusterId change or when moving to a loading phase without dynamic data yet
        if (!dynamicCluster || (loadingPhase !== 'done' && loadingPhase !== 'fallback_prop_check_attempt')) {
             setClusterSeoProps(null);
        }

        if (!clusterId) {
            setClusterSeoProps({
                title: "Invalid Cluster Request | Seismic Monitor",
                description: "No cluster ID was provided for the request.",
                canonicalUrl: "https://earthquakeslive.com/clusters", // A sensible fallback
                pageUrl: "https://earthquakeslive.com/clusters",
                noindex: true,
            });
            return; // Stop further processing if no clusterId
        }

        if (loadingPhase !== 'done' && !errorMessage && !dynamicCluster) {
            // Loading state (initial load or fallback_loading)
            setClusterSeoProps({
                title: "Loading Cluster... | Seismic Monitor",
                description: "Loading earthquake cluster details.",
                canonicalUrl: currentCanonicalUrl,
                pageUrl: currentCanonicalUrl,
            });
        } else if (loadingPhase === 'done' && errorMessage && !dynamicCluster) {
            // Error state / Explicit Not Found from errorMessage
            setClusterSeoProps({
                title: "Cluster Not Found | Seismic Monitor",
                description: errorMessage,
                canonicalUrl: currentCanonicalUrl,
                pageUrl: currentCanonicalUrl,
                noindex: true,
            });
        } else if (loadingPhase === 'done' && !dynamicCluster && !errorMessage) {
            // Implicit Not Found (all checks done, no cluster, no specific error message)
            setClusterSeoProps({
                title: "Cluster Not Found | Seismic Monitor",
                description: "The requested earthquake cluster could not be located.",
                canonicalUrl: currentCanonicalUrl,
                pageUrl: currentCanonicalUrl,
                noindex: true,
            });
        }
        // If dynamicCluster is found, its SEO props are set by the effects that found it.
        // This effect primarily handles the non-data states.
    }, [clusterId, loadingPhase, errorMessage, dynamicCluster]); // Added dynamicCluster to dependencies


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
