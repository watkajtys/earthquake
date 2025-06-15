// src/components/ClusterDetailModalWrapper.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ClusterDetailModal from './ClusterDetailModal';
import SeoMetadata from './SeoMetadata';
import { fetchClusterDefinition } from '../services/clusterApiService.js';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx';
import { findActiveClusters } from '../utils/clusterUtils.js';
import { CLUSTER_MAX_DISTANCE_KM, CLUSTER_MIN_QUAKES } from '../constants/appConstants.js';

/**
 * Calculates a human-readable string representing the active time range of an earthquake cluster.
 * It prioritizes short, user-friendly descriptions like "Active just now" or "Active over Xm/Xh"
 * if the cluster is recent. Otherwise, it shows when the cluster started.
 *
 * @param {number} earliestTime - Timestamp of the earliest earthquake in the cluster.
 * @param {number} latestTime - Timestamp of the latest earthquake in the cluster.
 * @param {function} formatDate - Function to format a full date string. (Currently unused in this specific logic but kept for potential future use)
 * @param {function} formatTimeAgo - Function to format a duration as "X time ago".
 * @param {function} formatTimeDuration - Function to format a duration into a compact string (e.g., "2h 30m").
 * @param {number} [clusterLength=0] - The number of earthquakes in the cluster.
 * @returns {string} A string describing the cluster's active time range.
 */
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

/**
 * Wrapper component responsible for fetching, processing, and displaying details for a specific earthquake cluster.
 * It handles routing parameters to identify the cluster, manages loading and error states,
 * generates SEO metadata, and then renders the `ClusterDetailModal` with the cluster data.
 * It attempts to find cluster data from various sources:
 * 1. `overviewClusters` prop (if available).
 * 2. Reconstructing from `earthquakesLast72Hours` or `allEarthquakes` from `EarthquakeDataContext`.
 * 3. Fetching a persisted cluster definition via `fetchClusterDefinition` (e.g., from a D1 store).
 * It also handles cases where data might need to be loaded on-demand (e.g., monthly data).
 *
 * @component
 * @param {Object} props - The component props.
 * @param {Array<Object>} [props.overviewClusters] - Array of pre-calculated cluster objects, typically from an overview page.
 * @param {function} props.formatDate - Function to format timestamps into date strings.
 * @param {function} props.getMagnitudeColorStyle - Function to get Tailwind CSS color styles for magnitude.
 * @param {function} [props.onIndividualQuakeSelect] - Callback when an individual quake item within the modal is selected.
 * @param {function} props.formatTimeAgo - Function to format a duration as "X time ago".
 * @param {function} props.formatTimeDuration - Function to format a duration into a compact string (e.g., "2h 30m").
 * @param {boolean} props.areParentClustersLoading - Boolean indicating if the parent component providing `overviewClusters` is still loading.
 * @returns {JSX.Element} The ClusterDetailModalWrapper, rendering either a loading state, error message, or the ClusterDetailModal.
 */
function ClusterDetailModalWrapper({
    overviewClusters,
    formatDate,
    getMagnitudeColorStyle,
    onIndividualQuakeSelect,
    formatTimeAgo,
    formatTimeDuration,
    areParentClustersLoading
}) {
    const { clusterId: fullSlugFromParams } = useParams(); // Renamed to avoid confusion
    const navigate = useNavigate();

    // State for managing loading status specific to this wrapper
    const [internalIsLoading, setInternalIsLoading] = useState(true);
    // Extracted strongest quake ID from the new URL format
    const [extractedStrongestQuakeId, setExtractedStrongestQuakeId] = useState(null);
    // State for the dynamically found or fetched cluster data
    const [dynamicCluster, setDynamicCluster] = useState(null);
    // State for displaying any error messages during data fetching or processing
    const [errorMessage, setErrorMessage] = useState('');
    // State for SEO properties, generated based on cluster data or error state
    const [seoProps, setSeoProps] = useState({});
    // State to track if the component is waiting for monthly data to be loaded by EarthquakeDataContext
    const [isWaitingForMonthlyData, setIsWaitingForMonthlyData] = useState(false);

    const {
        allEarthquakes,
        earthquakesLast72Hours,
        isLoadingWeekly,
        isLoadingMonthly,
        isInitialAppLoad,
        hasAttemptedMonthlyLoad,
        loadMonthlyData,
        monthlyError
    } = useEarthquakeDataState();

    /**
     * Generates SEO metadata (title, description, keywords, JSON-LD) for the cluster detail page.
     * Adapts content based on whether cluster data is available or an error has occurred.
     * @param {Object|null} clusterData - The cluster data object, or null if not found/error.
     * @param {string|null} currentId - The ID of the current cluster.
     * @param {string} [errorMsg=''] - An optional error message if the cluster could not be loaded.
     * @returns {Object} An object containing SEO properties (title, description, canonicalUrl, etc.).
     */
    const generateSeo = useCallback((clusterData, slug, errorMsg = '') => { // currentId changed to slug for clarity
        const pageUrl = `https://earthquakeslive.com/cluster/${slug || 'unknown'}`;
        if (errorMsg || !clusterData) {
            return {
                title: "Cluster Not Found | Earthquakes Live",
                description: errorMsg || "The requested earthquake cluster could not be located.",
                canonicalUrl: pageUrl, pageUrl, noindex: true,
            };
        }
        const { locationName, quakeCount, maxMagnitude, strongestQuake, updatedAt, _latestTimeInternal } = clusterData;
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

    /**
     * Main effect hook for fetching and setting cluster data.
     * This effect runs when the component mounts or when its dependencies change.
     * It tries to find the cluster data from various sources in a specific order:
     * 1. From `overviewClusters` prop.
     * 2. By reconstructing from `earthquakesLast72Hours` (or `allEarthquakes` if monthly data is loaded)
     *    using `findActiveClusters` if the `clusterId` seems to be a generated one.
     * 3. If monthly data hasn't been loaded and is needed, it triggers `loadMonthlyData`.
     * 4. As a fallback, it attempts to fetch a persisted cluster definition using `fetchClusterDefinition`.
     * It manages loading states (`internalIsLoading`, `isWaitingForMonthlyData`) and error messages (`errorMessage`).
     * It also generates SEO properties using `generateSeo` based on the outcome.
     */
    useEffect(() => {
        // let isMounted = true; // Unused variable
        // let d1FetchAttempted = false; // Unused variable

        // Parse the clusterId from URL to extract strongest quake ID
        if (fullSlugFromParams) {
            const match = fullSlugFromParams.match(/-([a-zA-Z0-9]+)$/);
            const newExtractedId = match ? match[1] : null;
            if (newExtractedId !== extractedStrongestQuakeId) { // Avoid infinite loop if parsing logic is complex
                 setExtractedStrongestQuakeId(newExtractedId);
            }
        } else {
            if (extractedStrongestQuakeId !== null) { // Avoid infinite loop
                setExtractedStrongestQuakeId(null);
            }
        }
        // This effect should re-run if fullSlugFromParams changes, then extractedStrongestQuakeId is set,
        // then the main findAndSetCluster logic runs.
    }, [fullSlugFromParams, extractedStrongestQuakeId]);


    useEffect(() => {
        let isMounted = true; // This one IS used in the return of useEffect
        // let d1FetchAttempted = false; // Unused variable

        const findAndSetCluster = async () => {
            if (!isMounted) return;
            // Initial loading set and error clear MOVED DOWN
            // to after slug validation.

            if (!fullSlugFromParams) {
                if (isMounted) {
                    setErrorMessage('No cluster slug specified.');
                    setInternalIsLoading(false);
                    setSeoProps(generateSeo(null, null, 'No cluster slug specified.'));
                }
                return;
            }

            if (!extractedStrongestQuakeId && fullSlugFromParams) { // Check if parsing failed for a non-empty slug
                if (isMounted) {
                    const errMsg = "Invalid cluster URL format. Could not extract quake ID.";
                    setErrorMessage(errMsg);
                    setInternalIsLoading(false);
                    setSeoProps(generateSeo(null, fullSlugFromParams, errMsg));
                }
                return;
            }

            if (!extractedStrongestQuakeId) { // Should be caught by above, but as a safeguard
                 if (isMounted) {
                    setErrorMessage('Could not determine cluster quake ID.');
                    setInternalIsLoading(false);
                    setSeoProps(generateSeo(null, fullSlugFromParams, 'Could not determine cluster quake ID.'));
                }
                return;
            }

            // If we've passed all slug/ID validations, then proceed to set loading state
            // and clear any previous non-validation errors.
            setInternalIsLoading(true);
            if (!isWaitingForMonthlyData) {
                setErrorMessage('');
            }

            const initialUpstreamLoad = areParentClustersLoading ||
                                       (!hasAttemptedMonthlyLoad && (isLoadingWeekly || isInitialAppLoad) && !earthquakesLast72Hours?.length) ||
                                       (hasAttemptedMonthlyLoad && isLoadingMonthly && !allEarthquakes?.length && !isWaitingForMonthlyData);

            if (initialUpstreamLoad && !dynamicCluster) {
                if (isMounted) setSeoProps(generateSeo(null, fullSlugFromParams, 'Loading cluster details...'));
                // If upstream is loading, and we don't have a cluster yet, it's appropriate to show loading.
                // The function will be re-called when upstream loading finishes.
                // We must ensure internalIsLoading is true here. It was set above.
                return;
            }

            if (!dynamicCluster && !areParentClustersLoading) {
                // Try to find in overviewClusters using the extracted strongestQuakeId
                const clusterFromProp = overviewClusters?.find(c => c.strongestQuakeId === extractedStrongestQuakeId);
                if (clusterFromProp) {
                    // IMPORTANT: Ensure the `id` of clusterFromProp matches the new slug format if we want to use it directly
                    // For now, we reconstruct a cluster object for display that uses the fullSlugFromParams as its `id`
                    // to match what generateSeo expects if it were using dynamicCluster.id
                     const displayCluster = {
                        ...clusterFromProp,
                        id: fullSlugFromParams, // Use the slug from URL as the ID for this display instance
                    };
                    if (isMounted) {
                        setDynamicCluster(displayCluster);
                        setSeoProps(generateSeo(displayCluster, fullSlugFromParams));
                        setInternalIsLoading(false);
                    }
                    return;
                }
            }

            let sourceQuakesForReconstruction = earthquakesLast72Hours;
            if (hasAttemptedMonthlyLoad && allEarthquakes?.length > 0) {
                sourceQuakesForReconstruction = allEarthquakes;
            }

            // The old reconstruction logic based on 'overview_cluster_...' format ID might not be relevant
            // if all navigation now uses the new slug format.
            // We will primarily rely on fetchClusterDefinition if not found in overviewClusters.
            // Keeping the structure but it likely won't match `fullSlugFromParams`.
            if (!dynamicCluster && sourceQuakesForReconstruction?.length > 0) {
                const parts = fullSlugFromParams.split('_'); // This won't match new format
                if (parts.length === 4 && parts[0] === 'overview' && parts[1] === 'cluster') {
                    // This block is for the OLD ID format, less likely to be hit with new URL structure
                    const parsedStrongestQuakeIdFromOldFormat = parts[2];
                    // Only proceed if somehow an old ID format is being processed and it matches the extracted ID
                    if (parsedStrongestQuakeIdFromOldFormat && parsedStrongestQuakeIdFromOldFormat === extractedStrongestQuakeId) {
                        const allNewlyFormedClusters = findActiveClusters(sourceQuakesForReconstruction, CLUSTER_MAX_DISTANCE_KM, CLUSTER_MIN_QUAKES);
                        for (const newClusterArray of allNewlyFormedClusters) {
                            if (!newClusterArray || newClusterArray.length === 0) continue;
                            const sortedForStrongest = [...newClusterArray].sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0));
                            const newStrongestQuakeInCluster = sortedForStrongest[0];
                            if (!newStrongestQuakeInCluster) continue;

                            // Check if this re-formed cluster matches our target extractedStrongestQuakeId
                            if (newStrongestQuakeInCluster.id === extractedStrongestQuakeId) {
                                let earliestTime = Infinity, latestTime = -Infinity;
                                newClusterArray.forEach(q => {
                                    if (q.properties.time < earliestTime) earliestTime = q.properties.time;
                                    if (q.properties.time > latestTime) latestTime = q.properties.time;
                                });
                                const reconstructed = {
                                    id: fullSlugFromParams, // Use current slug for this instance
                                    originalQuakes: newClusterArray, quakeCount: newClusterArray.length,
                                    strongestQuakeId: newStrongestQuakeInCluster.id, strongestQuake: newStrongestQuakeInCluster,
                                    maxMagnitude: Math.max(...newClusterArray.map(q => q.properties.mag).filter(m => m != null)),
                                    locationName: newStrongestQuakeInCluster.properties.place || 'Unknown Location',
                                    _earliestTimeInternal: earliestTime, _latestTimeInternal: latestTime,
                                    timeRange: calculateClusterTimeRangeForDisplay(earliestTime, latestTime, formatDate, formatTimeAgo, formatTimeDuration, newClusterArray.length),
                                };
                                if (isMounted) {
                                    setDynamicCluster(reconstructed);
                                    setSeoProps(generateSeo(reconstructed, fullSlugFromParams));
                                    setInternalIsLoading(false);
                                    setIsWaitingForMonthlyData(false);
                                }
                                return;
                            }
                        }
                    }
                }
            }

            if (!dynamicCluster && !hasAttemptedMonthlyLoad && !isWaitingForMonthlyData) {
                if (isMounted) {
                    loadMonthlyData();
                    setIsWaitingForMonthlyData(true);
                }
                return;
            }

            if (isWaitingForMonthlyData && !isLoadingMonthly) {
                 if(isMounted) setIsWaitingForMonthlyData(false);
                 // After monthly data attempt, ensure we re-evaluate internalIsLoading,
                 // findAndSetCluster will run again due to context changes.
                 // If monthly data loaded, sourceQuakesForReconstruction will be updated.
                 // No explicit setInternalIsLoading(true) here, let the next pass handle it.
                 return;
            }

            if (isWaitingForMonthlyData && isLoadingMonthly) {
                // internalIsLoading is likely already true or will be set at start of next pass.
                return;
            }

            let finalErrorMessage = null;

            if (!dynamicCluster && extractedStrongestQuakeId) { // Only fetch if we have an ID
                // d1FetchAttempted = true; // Unused assignment removed
                try {
                    // Use extractedStrongestQuakeId for fetching
                    const workerResult = await fetchClusterDefinition(extractedStrongestQuakeId);
                    if (!isMounted) return;

                    if (workerResult && sourceQuakesForReconstruction?.length > 0) {
                        const { earthquakeIds, strongestQuakeId: defStrongestQuakeIdFromWorker, updatedAt: kvUpdatedAt } = workerResult;

                        // Ensure the strongestQuakeId from worker matches our extracted one, or if it's primary key
                        if (defStrongestQuakeIdFromWorker !== extractedStrongestQuakeId && workerResult.clusterId !== extractedStrongestQuakeId) {
                             console.warn(`D1 ClusterDefinition for ${extractedStrongestQuakeId} returned data for ${defStrongestQuakeIdFromWorker}. Mismatch.`);
                             // finalErrorMessage = "Mismatch in fetched cluster data.";
                             // We might still try to use it if earthquakeIds are present and seem relevant
                        }

                        const foundQuakes = earthquakeIds.map(id => sourceQuakesForReconstruction.find(q => q.id === id)).filter(Boolean);

                        if (foundQuakes.length === earthquakeIds.length) { // All quakes found
                            let earliestTime = Infinity, latestTime = -Infinity;
                            foundQuakes.forEach(q => {
                                if (q.properties.time < earliestTime) earliestTime = q.properties.time;
                                if (q.properties.time > latestTime) latestTime = q.properties.time;
                            });
                            // The strongest quake in the definition should be one of the foundQuakes
                            const strongestQuakeInList = foundQuakes.find(q => q.id === defStrongestQuakeIdFromWorker) ||
                                                         (extractedStrongestQuakeId ? foundQuakes.find(q => q.id === extractedStrongestQuakeId) : null) ||
                                                         foundQuakes.sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0))[0];

                            if (strongestQuakeInList) {
                                const reconstructed = {
                                    id: fullSlugFromParams, // Use the slug from URL as the ID for this display instance
                                    originalQuakes: foundQuakes, quakeCount: foundQuakes.length,
                                    strongestQuakeId: strongestQuakeInList.id, // This should match extractedStrongestQuakeId or defStrongestQuakeIdFromWorker
                                    strongestQuake: strongestQuakeInList,
                                    maxMagnitude: Math.max(...foundQuakes.map(q => q.properties.mag).filter(m => m != null)),
                                    locationName: strongestQuakeInList.properties.place || 'Unknown Location',
                                    _earliestTimeInternal: earliestTime, _latestTimeInternal: latestTime,
                                    timeRange: calculateClusterTimeRangeForDisplay(earliestTime, latestTime, formatDate, formatTimeAgo, formatTimeDuration, foundQuakes.length),
                                    updatedAt: kvUpdatedAt,
                                };
                                setDynamicCluster(reconstructed);
                                setSeoProps(generateSeo(reconstructed, fullSlugFromParams));
                            } else {
                                console.warn(`D1 ClusterDefinition for ${extractedStrongestQuakeId}: Strongest quake ID ${defStrongestQuakeIdFromWorker} not found in its own list of ${foundQuakes.length} quakes.`);
                                finalErrorMessage = "Error processing fetched cluster data (strongest quake mismatch).";
                            }
                        } else if (earthquakeIds && earthquakeIds.length > 0) {
                            console.warn(`D1 ClusterDefinition for ${extractedStrongestQuakeId} is stale or its quakes are not fully available in current client data. Found ${foundQuakes.length} of ${earthquakeIds.length}.`);
                            finalErrorMessage = "Cluster data found, but some quakes are no longer in recent records. Display may be incomplete.";
                            // Potentially still try to display with what was found if foundQuakes.length > 0
                        } else {
                             // Worker result was empty or didn't lead to found quakes
                             // No finalErrorMessage here, let it fall through to "not found" if nothing else set it
                        }
                    } else if (workerResult && sourceQuakesForReconstruction?.length === 0) {
                        console.warn(`D1 ClusterDefinition for ${extractedStrongestQuakeId} received, but no source quakes available on client to reconstruct. Ignoring D1 result.`);
                    }
                    // If workerResult is null, this block is skipped

                } catch (error) {
                    if (!isMounted) return;
                    console.error(`Error fetching cluster definition ${extractedStrongestQuakeId} from worker:`, error);
                    finalErrorMessage = "Failed to fetch cluster details.";
                }
            }

            // Final determination of state if still no dynamicCluster
            if (isMounted) {
                if (!dynamicCluster) {
                    const message = finalErrorMessage || (monthlyError ? `Failed to load extended data: ${monthlyError}. Cluster details may be incomplete.` : "Cluster details could not be found or were incomplete.");
                    setErrorMessage(message);
                    setSeoProps(generateSeo(null, fullSlugFromParams, message));
                }
                setInternalIsLoading(false);
            }
        };

        // Reset dynamicCluster if the main identifier (fullSlugFromParams or extractedStrongestQuakeId) changes and we had old data
        if (dynamicCluster && (dynamicCluster.id !== fullSlugFromParams)) {
            setDynamicCluster(null);
        }

        // Simplified condition: always call findAndSetCluster if essential params change.
        // The internal logic of findAndSetCluster should handle all states including errors.
        findAndSetCluster();
        // else if (fullSlugFromParams && !extractedStrongestQuakeId && !internalIsLoading && !errorMessage) {
            // This block is removed as its conditions should be handled by the initial checks within findAndSetCluster.
            // const errMsg = "Invalid cluster URL format. Could not extract quake ID.";
            // setErrorMessage(errMsg);
            // setInternalIsLoading(false);
            // setSeoProps(generateSeo(null, fullSlugFromParams, errMsg));
        // }


        return () => { isMounted = false; };

    }, [
        fullSlugFromParams, extractedStrongestQuakeId, // Main identifiers
        overviewClusters, areParentClustersLoading,
        allEarthquakes, earthquakesLast72Hours,
        isLoadingWeekly, isLoadingMonthly, isInitialAppLoad, hasAttemptedMonthlyLoad, loadMonthlyData, monthlyError,
        isWaitingForMonthlyData,
        formatDate, formatTimeAgo, formatTimeDuration, generateSeo,
        dynamicCluster,
        errorMessage, // Added
        internalIsLoading // Added
    ]);

    const handleClose = () => navigate(-1);

    if (internalIsLoading) {
        return (
            <>
                <SeoMetadata {...(seoProps || generateSeo(null, fullSlugFromParams, 'Loading cluster details...'))} />
                <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[60] p-4">
                    <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700 text-center">
                        <svg aria-hidden="true" className="animate-spin h-8 w-8 text-indigo-400 mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <h2 className="text-lg font-semibold text-indigo-300">Loading Cluster Details...</h2>
                        <p className="text-sm text-slate-400">Please wait while we fetch the information.{isWaitingForMonthlyData ? " (Checking extended data...)" : ""}</p>
                    </div>
                </div>
            </>
        );
    }

    if (errorMessage) {
        return (
            <>
                <SeoMetadata {...(seoProps || generateSeo(null, fullSlugFromParams, errorMessage))} />
                <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[60] p-4">
                    <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700">
                        <h2 className="text-xl font-semibold text-amber-400 mb-3">{seoProps?.title?.split('|')[0].trim() || "Error"}</h2>
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
                <SeoMetadata {...(seoProps || generateSeo(dynamicCluster, fullSlugFromParams))} />
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

    // Fallback for when not loading, no error, but no dynamic cluster (e.g. parsing just finished, waiting for findAndSetCluster effect)
    // Or if all attempts in findAndSetCluster failed silently and didn't set an error message (should be rare).
    return (
         <>
            <SeoMetadata {...(seoProps || generateSeo(null, fullSlugFromParams, "Preparing cluster information..."))} />
            <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[60] p-4">
                <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700 text-center">
                     <h2 className="text-lg font-semibold text-indigo-300">Preparing Cluster Information...</h2>
                     <p className="text-sm text-slate-400">This should only take a moment.</p>
                 </div>
             </div>
        </>
    );
}
export default ClusterDetailModalWrapper;
