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

    // Effect 1: Fetch from worker
    useEffect(() => {
        // console.log(`WRAPPER ${clusterId}: Main useEffect triggered.`); // Removed
        setDynamicCluster(null);
        setErrorMessage('');
        setLoadingPhase('worker_fetch');

        async function fetchAndProcessClusterFromWorker() {
            if (!clusterId) {
                setErrorMessage('No cluster ID specified.');
                setLoadingPhase('done');
                return;
            }
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
    }, [clusterId, formatDate, formatTimeAgo, formatTimeDuration, allEarthquakes, earthquakesLast72Hours, hasAttemptedMonthlyLoad]);


    // Effect 2: Attempt reconstruction from parsed ID if worker fetch failed/incomplete
    useEffect(() => {
        if (loadingPhase === 'reconstruct_from_id_attempt' && !dynamicCluster) {
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
    }, [loadingPhase, clusterId, allEarthquakes, earthquakesLast72Hours, formatDate, formatTimeAgo, formatTimeDuration, hasAttemptedMonthlyLoad, dynamicCluster]);

    // Effect 3: Fallback to overviewClusters prop
    useEffect(() => {
        if (loadingPhase === 'fallback_prop_check_attempt' && !dynamicCluster) {
            // console.log(`WRAPPER ${clusterId}: Phase fallback_prop_check_attempt.`); // Removed
            const clusterFromProp = overviewClusters?.find(c => c.id === clusterId);
            if (clusterFromProp) {
                // console.log(`WRAPPER ${clusterId}: Prop fallback success. dynamicCluster set from overviewClusters.`); // Removed
                setDynamicCluster(clusterFromProp);
                setLoadingPhase('done');
            } else {
                if (isInitialAppLoad || isLoadingWeekly || (hasAttemptedMonthlyLoad && isLoadingMonthly && allEarthquakes.length === 0)) {
                    // console.log(`WRAPPER ${clusterId}: Prop fallback - data still loading. Phase: fallback_loading.`); // Removed
                    setLoadingPhase('fallback_loading');
                } else {
                    const currentErrorMessage = 'Cluster details could not be found after all checks.';
                    setErrorMessage(currentErrorMessage);
                    // console.log(`WRAPPER ${clusterId}: Prop fallback - not found. Error: ${currentErrorMessage}.`); // Removed
                    setLoadingPhase('done');
                }
            }
        }
    }, [loadingPhase, dynamicCluster, overviewClusters, clusterId, isInitialAppLoad, isLoadingWeekly, isLoadingMonthly, hasAttemptedMonthlyLoad, allEarthquakes, errorMessage]);

    const handleClose = () => navigate(-1);
    const canonicalUrl = `https://earthquakeslive.com/cluster/${clusterId}`;

    const isOverallLoading = loadingPhase !== 'done' && !dynamicCluster && !errorMessage;

    if (isOverallLoading) {
        return (
            <>
                <SeoMetadata title="Loading Cluster... | Seismic Monitor" description="Loading earthquake cluster details." pageUrl={canonicalUrl} canonicalUrl={canonicalUrl} />
                <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[60] p-4">
                    <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700 text-center">
                        <svg className="animate-spin h-8 w-8 text-indigo-400 mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <h2 className="text-lg font-semibold text-indigo-300">Loading Cluster Details...</h2>
                        <p className="text-sm text-slate-400">Fetching the latest information (Phase: {loadingPhase}).</p>
                    </div>
                </div>
            </>
        );
    }

    if (loadingPhase === 'done' && !dynamicCluster) {
        return (
            <>
                <SeoMetadata title="Cluster Not Found | Seismic Monitor" description={errorMessage || "The requested earthquake cluster details could not be found."} pageUrl={canonicalUrl} canonicalUrl={canonicalUrl} />
                <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[60] p-4">
                    <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700">
                        <h2 className="text-xl font-semibold text-amber-400 mb-3">Cluster Not Found</h2>
                        <p className="text-sm mb-4">{errorMessage || "The cluster details you are looking for could not be found."}</p>
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
                <SeoMetadata title={pageTitle} description={pageDescription} keywords={keywords} pageUrl={canonicalUrl} canonicalUrl={canonicalUrl} locale="en_US" type="website" />
                <ClusterDetailModal cluster={dynamicCluster} onClose={handleClose} formatDate={formatDate} getMagnitudeColorStyle={getMagnitudeColorStyle} onIndividualQuakeSelect={onIndividualQuakeSelect} />
            </>
        );
    }
    return null;
}
export default ClusterDetailModalWrapper;
