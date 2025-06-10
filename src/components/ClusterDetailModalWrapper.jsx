// src/components/ClusterDetailModalWrapper.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ClusterDetailModal from './ClusterDetailModal';
import SeoMetadata from './SeoMetadata';
import { fetchClusterDefinition } from '../services/clusterApiService.js';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx';
import { calculateDistance } from '../utils/utils.js'; // Corrected path for client-side reconstruction
import {
    CLUSTER_MAX_DISTANCE_KM,
    CLUSTER_MIN_QUAKES,
    CLUSTER_MAX_TIME_DIFFERENCE_MS // Import for client-side reconstruction
} from '../constants/appConstants.js';

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

    // Client-side cluster reconstruction function
    function findClientSideCluster(baseQuake, searchQuakes, maxDistanceKm, minQuakesRequired, maxTimeDifferenceMsToUse) {
        if (!baseQuake || !searchQuakes || searchQuakes.length === 0) return null;

        const newCluster = [baseQuake];
        const baseLat = baseQuake.geometry.coordinates[1];
        const baseLon = baseQuake.geometry.coordinates[0];
        const baseTime = baseQuake.properties.time;

        for (const otherQuake of searchQuakes) {
            if (otherQuake.id === baseQuake.id) continue;

            const dist = calculateDistance(
                baseLat,
                baseLon,
                otherQuake.geometry.coordinates[1],
                otherQuake.geometry.coordinates[0]
            );
            const timeDifference = Math.abs(otherQuake.properties.time - baseTime);

            if (dist <= maxDistanceKm && timeDifference <= maxTimeDifferenceMsToUse) {
                newCluster.push(otherQuake);
            }
        }
        return newCluster.length >= minQuakesRequired ? newCluster : null;
    }

    const [rawClusterDefinition, setRawClusterDefinition] = useState(null); // Stores direct API response
    const [dynamicCluster, setDynamicCluster] = useState(null); // Progressively built cluster
    const [clusterSeoProps, setClusterSeoProps] = useState(null);
    const [loadingPhase, setLoadingPhase] = useState('fetching_definition'); // Initial phase
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

    // Effect 1: Fetch cluster definition from D1
    useEffect(() => {
        setDynamicCluster(null);
        setRawClusterDefinition(null);
        setErrorMessage('');
        setLoadingPhase('fetching_definition');

        async function fetchInitialClusterDefinition() {
            if (!clusterId) {
                setErrorMessage('No cluster ID specified.');
                setLoadingPhase('error'); // Use 'error' for clearer state
                return;
            }
            // No need to wait for context data loading here for the initial definition fetch.

            try {
                const definition = await fetchClusterDefinition(clusterId);

                if (definition && definition.earthquakeIds) {
                    setRawClusterDefinition(definition);

                    const initialClusterData = {
                        id: definition.clusterId,
                        locationName: definition.strongestQuakePlace || 'Details Loading...',
                        quakeCount: definition.earthquakeIds.length,
                        maxMagnitude: definition.strongestQuakeMag, // Might be null
                        originalQuakes: [], // Will be hydrated
                        strongestQuakeId: definition.strongestQuakeId,
                        updatedAt: definition.updatedAt,
                         // _earliestTimeInternal, _latestTimeInternal, timeRange, strongestQuake will be set/updated after hydration
                    };
                    setDynamicCluster(initialClusterData);
                    setClusterSeoProps(generateClusterSeoProps(initialClusterData, clusterId)); // Set SEO props early
                    setLoadingPhase('hydrating_quakes');
                } else {
                    setErrorMessage(`Cluster definition for ${clusterId} not found or is invalid.`);
                    setLoadingPhase('fallback_prop_check_attempt');
                }
            } catch (error) {
                console.error(`Error fetching cluster definition ${clusterId}:`, error);
                setErrorMessage(`Failed to fetch definition for cluster ${clusterId}.`);
                setLoadingPhase('fallback_prop_check_attempt');
            }
        }
        fetchInitialClusterDefinition();
    }, [clusterId]); // generateClusterSeoProps is stable if its definition doesn't change based on these deps

    // Effect 2: Hydrate full earthquake details
    useEffect(() => {
        if (loadingPhase === 'hydrating_quakes' && rawClusterDefinition && rawClusterDefinition.earthquakeIds) {
            const sourceQuakes = (hasAttemptedMonthlyLoad && allEarthquakes.length > 0)
                                 ? allEarthquakes
                                 : earthquakesLast72Hours;

            // Determine if sourceQuakes are ready for hydration
            const areSourceQuakesLoading = (hasAttemptedMonthlyLoad && isLoadingMonthly && !allEarthquakes.length) ||
                                           (!hasAttemptedMonthlyLoad && (isLoadingWeekly || isInitialAppLoad) && (!earthquakesLast72Hours || earthquakesLast72Hours.length === 0));

            if (areSourceQuakesLoading) {
                // console.log(`Cluster ${clusterId}: Hydration waiting for sourceQuakes...`);
                return; // Wait for sourceQuakes to be loaded
            }

            if (!sourceQuakes || sourceQuakes.length === 0) {
                 console.warn(`Cluster ${clusterId}: Source quakes for hydration/reconstruction are empty even after load checks.`);
                 // Attempt client-side reconstruction if D1 definition exists and has a strongest quake ID
                 if (rawClusterDefinition && rawClusterDefinition.strongestQuakeId) {
                    setLoadingPhase('client_reconstruction_attempt');
                 } else {
                    setErrorMessage(prev => prev || 'Could not load earthquake details for the cluster.');
                    setLoadingPhase('error');
                 }
                 return;
            }

            const foundQuakes = rawClusterDefinition.earthquakeIds
                .map(id => sourceQuakes.find(q => q.id === id))
                .filter(Boolean);

            // Condition for attempting client-side reconstruction:
            // 1. D1 definition existed.
            // 2. Either not all quakes from D1 definition were found in context (stale data).
            // 3. Or the D1 definition was missing place/mag initially (so initialDynamicCluster was partial).
            const needsReconstructionAttempt = rawClusterDefinition &&
                (foundQuakes.length < rawClusterDefinition.earthquakeIds.length ||
                 !rawClusterDefinition.strongestQuakePlace ||
                 rawClusterDefinition.strongestQuakeMag === null);

            if (foundQuakes.length === 0 && rawClusterDefinition.earthquakeIds.length > 0 && !needsReconstructionAttempt) {
                 console.error(`Cluster ${clusterId}: No quakes found for hydration, and reconstruction not triggered. Using D1 summary.`);
                 setErrorMessage(prev => prev || 'Failed to load individual earthquake details. Displaying summary.');
                 setLoadingPhase('done'); // dynamicCluster has D1 summary
                 return;
            }

            if (needsReconstructionAttempt && rawClusterDefinition.strongestQuakeId) {
                console.log(`Cluster ${clusterId}: Hydration incomplete or D1 data was partial. Attempting client-side reconstruction.`);
                setLoadingPhase('client_reconstruction_attempt');
                return; // Let the new effect handle reconstruction
            }

            // If full hydration possible and no need for reconstruction from this path:
            let earliestTime = Infinity;
            let latestTime = -Infinity;
            let calculatedMaxMag = -Infinity;
            let hydratedStrongestQuake = null;

            if (foundQuakes.length > 0) {
                foundQuakes.forEach(quake => {
                    if (quake.properties.time < earliestTime) earliestTime = quake.properties.time;
                    if (quake.properties.time > latestTime) latestTime = quake.properties.time;
                    if (quake.properties.mag > calculatedMaxMag) {
                        calculatedMaxMag = quake.properties.mag;
                        hydratedStrongestQuake = quake;
                    }
                });
                if (!hydratedStrongestQuake && foundQuakes.length > 0) hydratedStrongestQuake = foundQuakes[0];
            } else { // Should not happen if previous check for foundQuakes.length === 0 is hit
                earliestTime = null;
                latestTime = null;
                calculatedMaxMag = rawClusterDefinition.strongestQuakeMag;
            }

            const finalStrongestQuake = hydratedStrongestQuake || (dynamicCluster?.strongestQuakeId ? { id: dynamicCluster.strongestQuakeId, properties: { place: dynamicCluster.locationName, mag: dynamicCluster.maxMagnitude } } : null);

            const hydratedCluster = {
                ...dynamicCluster, // Spread initial data (ID, D1 place/mag, updatedAt)
                originalQuakes: foundQuakes,
                quakeCount: foundQuakes.length || rawClusterDefinition.earthquakeIds.length,
                maxMagnitude: foundQuakes.length > 0 ? calculatedMaxMag : (rawClusterDefinition.strongestQuakeMag || null),
                strongestQuakeId: finalStrongestQuake?.id || rawClusterDefinition.strongestQuakeId,
                strongestQuake: finalStrongestQuake, // Full object
                locationName: finalStrongestQuake?.properties?.place || dynamicCluster.locationName, // Prefer hydrated, fallback to initial
                _earliestTimeInternal: earliestTime,
                _latestTimeInternal: latestTime,
                timeRange: calculateClusterTimeRange(earliestTime, latestTime, formatDate, formatTimeAgo, formatTimeDuration, foundQuakes.length),
            };

            setDynamicCluster(hydratedCluster);
            // Update SEO props if location or magnitude significantly changed from initial D1 data
            if (hydratedCluster.locationName !== dynamicCluster.locationName || hydratedCluster.maxMagnitude !== dynamicCluster.maxMagnitude) {
                 setClusterSeoProps(generateClusterSeoProps(hydratedCluster, clusterId));
            }
            setLoadingPhase('done');
        }
    }, [
        loadingPhase, rawClusterDefinition, allEarthquakes, earthquakesLast72Hours,
        hasAttemptedMonthlyLoad, isLoadingMonthly, isLoadingWeekly, isInitialAppLoad,
        clusterId, formatDate, formatTimeAgo, formatTimeDuration, dynamicCluster // generateClusterSeoProps is stable
    ]);

    // Effect 3: Client-side reconstruction attempt (if hydration was incomplete or D1 data was partial)
    useEffect(() => {
        if (loadingPhase === 'client_reconstruction_attempt' && rawClusterDefinition && rawClusterDefinition.strongestQuakeId) {
            const sourceQuakes = (hasAttemptedMonthlyLoad && allEarthquakes.length > 0)
                                 ? allEarthquakes
                                 : earthquakesLast72Hours;

            if (!sourceQuakes || sourceQuakes.length === 0) {
                console.warn(`Cluster ${clusterId}: Source quakes for client reconstruction are not available.`);
                setLoadingPhase('fallback_prop_check_attempt'); // Try props
                return;
            }

            const baseQuakeForReconstruction = sourceQuakes.find(q => q.id === rawClusterDefinition.strongestQuakeId);

            if (!baseQuakeForReconstruction) {
                console.warn(`Cluster ${clusterId}: Base quake for reconstruction (ID: ${rawClusterDefinition.strongestQuakeId}) not found.`);
                setLoadingPhase('fallback_prop_check_attempt'); // Try props
                return;
            }

            const reconstructedClusterQuakes = findClientSideCluster(
                baseQuakeForReconstruction,
                sourceQuakes,
                CLUSTER_MAX_DISTANCE_KM,
                CLUSTER_MIN_QUAKES,
                CLUSTER_MAX_TIME_DIFFERENCE_MS
            );

            if (reconstructedClusterQuakes && reconstructedClusterQuakes.length > 0) {
                let earliestTime = Infinity;
                let latestTime = -Infinity;
                let maxMag = -Infinity;
                let strongestQuakeInCalc = baseQuakeForReconstruction;

                reconstructedClusterQuakes.forEach(quake => {
                    if (quake.properties.time < earliestTime) earliestTime = quake.properties.time;
                    if (quake.properties.time > latestTime) latestTime = quake.properties.time;
                    if (quake.properties.mag > maxMag) {
                        maxMag = quake.properties.mag;
                        strongestQuakeInCalc = quake;
                    }
                });
                 if (maxMag === -Infinity && reconstructedClusterQuakes.length > 0) maxMag = reconstructedClusterQuakes[0].properties.mag;


                const reconstructedData = {
                    id: clusterId, // Keep original clusterId from URL/D1
                    originalQuakes: reconstructedClusterQuakes,
                    quakeCount: reconstructedClusterQuakes.length,
                    strongestQuakeId: strongestQuakeInCalc.id,
                    strongestQuake: strongestQuakeInCalc,
                    maxMagnitude: maxMag,
                    locationName: strongestQuakeInCalc.properties.place || 'Unknown Location',
                    _earliestTimeInternal: earliestTime,
                    _latestTimeInternal: latestTime,
                    timeRange: calculateClusterTimeRange(earliestTime, latestTime, formatDate, formatTimeAgo, formatTimeDuration, reconstructedClusterQuakes.length),
                    updatedAt: rawClusterDefinition.updatedAt, // Keep D1 updatedAt if available
                };
                setDynamicCluster(reconstructedData);
                setClusterSeoProps(generateClusterSeoProps(reconstructedData, clusterId));
                setLoadingPhase('done');
            } else {
                console.warn(`Cluster ${clusterId}: Client-side reconstruction did not yield a valid cluster.`);
                // If dynamicCluster still has partial data from D1, keep it. Otherwise, try props.
                if (dynamicCluster && dynamicCluster.locationName !== 'Details Loading...') {
                    setLoadingPhase('done'); // Keep partial D1 data
                } else {
                    setLoadingPhase('fallback_prop_check_attempt'); // Try props
                }
            }
        }
    }, [
        loadingPhase, rawClusterDefinition, allEarthquakes, earthquakesLast72Hours,
        hasAttemptedMonthlyLoad, clusterId, formatDate, formatTimeAgo, formatTimeDuration, dynamicCluster
        // CLUSTER_MAX_DISTANCE_KM, CLUSTER_MIN_QUAKES, CLUSTER_MAX_TIME_DIFFERENCE_MS are constants, no need in deps
    ]);

    // Effect 4: Fallback to overviewClusters prop
    useEffect(() => {
        if (loadingPhase === 'fallback_prop_check_attempt' && !dynamicCluster) { // only run if dynamicCluster isn't already set
            const clusterFromProp = overviewClusters?.find(c => c.id === clusterId);
            if (clusterFromProp) {
                // This data is likely already fully hydrated if coming from overviewClusters
                setDynamicCluster(clusterFromProp);
                setClusterSeoProps(generateClusterSeoProps(clusterFromProp, clusterId));
                setLoadingPhase('done');
            } else {
                 // If still loading context data that might be needed for overviewClusters
                if (isInitialAppLoad || isLoadingWeekly || (hasAttemptedMonthlyLoad && isLoadingMonthly && !allEarthquakes.length)) {
                    setLoadingPhase('fallback_loading'); // A phase to indicate we are waiting for data for this fallback
                } else {
                    // All data sources exhausted
                    setErrorMessage(prev => prev || 'Cluster details could not be found from any source.');
                    setLoadingPhase('error');
                }
            }
        }
    }, [loadingPhase, dynamicCluster, overviewClusters, clusterId, isInitialAppLoad, isLoadingWeekly, isLoadingMonthly, hasAttemptedMonthlyLoad, allEarthquakes, errorMessage]);

    // Effect 5: Manage SEO props based on loadingPhase and error states
    useEffect(() => {
        const currentCanonicalUrl = clusterId ? `https://earthquakeslive.com/cluster/${clusterId}` : "https://earthquakeslive.com/clusters";

        if (!clusterId) { // Handles invalid ID case first
            setClusterSeoProps({
                title: "Invalid Cluster Request | Earthquakes Live",
                description: "No cluster ID was provided for the request.",
                canonicalUrl: currentCanonicalUrl,
                pageUrl: currentCanonicalUrl,
                noindex: true,
            });
            setLoadingPhase('error'); // Ensure this leads to error display
            setErrorMessage('No cluster ID specified.');
            return;
        }

        // If dynamicCluster exists (even partially from D1), generate SEO props from it.
        // generateClusterSeoProps is designed to handle potentially incomplete data.
        if (dynamicCluster) {
            setClusterSeoProps(generateClusterSeoProps(dynamicCluster, clusterId));
        }

        // Further refine SEO based on loading/error states, potentially overriding above if still loading or error occurred
        if (loadingPhase === 'fetching_definition' || loadingPhase === 'hydrating_quakes' ||
            (loadingPhase === 'fallback_loading' && !dynamicCluster)) { // Still actively loading
            setClusterSeoProps({ // Set or override to loading SEO
                title: `Loading Cluster ${clusterId}... | Earthquakes Live`,
                description: `Loading details for earthquake cluster ${clusterId}.`,
                canonicalUrl: currentCanonicalUrl,
                pageUrl: currentCanonicalUrl,
            });
        } else if (loadingPhase === 'error' || (loadingPhase === 'done' && !dynamicCluster && errorMessage)) {
            // Final error state or 'done' but with no usable cluster and an error message
            setClusterSeoProps({
                title: "Cluster Not Found | Earthquakes Live",
                description: errorMessage || `The earthquake cluster with ID ${clusterId} could not be located or loaded.`,
                canonicalUrl: currentCanonicalUrl,
                pageUrl: currentCanonicalUrl,
                noindex: true,
            });
        }
        // If loadingPhase is 'done' and dynamicCluster IS available, its specific SEO props
        // (set by the `if (dynamicCluster)` block above) should generally be maintained.
    }, [clusterId, loadingPhase, errorMessage, dynamicCluster]); // generateClusterSeoProps is stable


    const handleClose = () => navigate(-1);

    // Determine if we are in a final loading state (waiting for context data for fallbacks)
    const isContextDataStillLoadingForFallback = isInitialAppLoad || isLoadingWeekly || (hasAttemptedMonthlyLoad && isLoadingMonthly && !allEarthquakes.length);

    // Centralized rendering logic
    // 1. Success case: dynamicCluster is populated, loading is 'done', no error
    if (dynamicCluster && loadingPhase === 'done' && !errorMessage) {
        return (
            <>
                {clusterSeoProps && <SeoMetadata {...clusterSeoProps} />}
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
    // 2. Loading states: fetching_definition, hydrating_quakes, or fallback_loading (if context data is also still loading)
    //    Also includes initial render before any effect sets specific SEO props.
    else if (loadingPhase === 'fetching_definition' ||
             loadingPhase === 'hydrating_quakes' ||
             (loadingPhase === 'fallback_loading' && isContextDataStillLoadingForFallback) ||
             !clusterSeoProps // Catches very initial render before SEO effect for loading runs
            ) {
        return (
            <>
                {clusterSeoProps ? <SeoMetadata {...clusterSeoProps} /> : <SeoMetadata title={`Loading Cluster ${clusterId || ''}...`} description="Loading earthquake cluster details." />}
                <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[60] p-4">
                    <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700 text-center">
                        <svg aria-hidden="true" className="animate-spin h-8 w-8 text-indigo-400 mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <h2 className="text-lg font-semibold text-indigo-300">Loading Cluster Details...</h2>
                        <p className="text-sm text-slate-400">Fetching information (Phase: {loadingPhase}).</p>
                    </div>
                </div>
            </>
        );
    }
    // 3. Error/Not Found states: loadingPhase is 'error', or ('done' but no dynamicCluster and an errorMessage exists).
    //    Relies on clusterSeoProps potentially having been set to an error/noindex state by the SEO effect.
    else if (loadingPhase === 'error' || (loadingPhase === 'done' && !dynamicCluster && errorMessage)) {
        return (
            <>
                {clusterSeoProps ? <SeoMetadata {...clusterSeoProps} /> : <SeoMetadata title="Cluster Not Found" description="The requested cluster could not be found." noindex={true} />}
                <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[60] p-4">
                    <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700">
                        <h2 className="text-xl font-semibold text-amber-400 mb-3">
                            {clusterSeoProps?.title?.split('|')[0].trim() || "Cluster Error"}
                        </h2>
                        <p className="text-sm mb-4">
                            {errorMessage || clusterSeoProps?.description || "The cluster could not be loaded."}
                        </p>
                        <button onClick={handleClose} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors">
                            Go Back
                        </button>
                    </div>
                </div>
            </>
        );
    }

    // Fallback for any truly unhandled state (should ideally not be reached if logic above is sound)
    return (
        <>
            <SeoMetadata title="Loading Information..." description="Please wait while we load the details." noindex={true} />
            <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[60] p-4">
                <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700 text-center">
                     <h2 className="text-lg font-semibold text-indigo-300">Preparing Details...</h2>
                 </div>
             </div>
        </>
    );
}
export default ClusterDetailModalWrapper;
