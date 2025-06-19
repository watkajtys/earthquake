// src/components/ClusterDetailModalWrapper.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ClusterDetailModal from './ClusterDetailModal';
import SeoMetadata from './SeoMetadata';
import { fetchClusterWithQuakes, fetchActiveClusters } from '../services/clusterApiService.js'; // Changed fetchClusterDefinition to fetchClusterWithQuakes
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx';
// import { findActiveClusters } from '../utils/clusterUtils.js'; // Removed
import { CLUSTER_MAX_DISTANCE_KM, CLUSTER_MIN_QUAKES } from '../constants/appConstants.js';

// Main wrapper component for displaying cluster details, orchestrating data fetching and state management.
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
 * @returns {Object} An object with {prefix, value, suffix} describing the cluster's active time range.
 */
function calculateClusterTimeRangeForDisplay(earliestTime, latestTime, formatDate, formatTimeAgo, formatTimeDuration, clusterLength = 0) {
    if (earliestTime === Infinity || latestTime === -Infinity || !earliestTime || !latestTime) {
        return { prefix: "", value: "Time N/A", suffix: "" };
    }
    const now = Date.now();
    const durationSinceEarliest = now - earliestTime;
    if (now - latestTime < 24 * 60 * 60 * 1000 && clusterLength > 1) {
        const clusterDurationMillis = latestTime - earliestTime;
        if (clusterDurationMillis < 60 * 1000) { // less than a minute
            return { prefix: "Active ", value: "just now", suffix: "" };
        }
        if (clusterDurationMillis < 60 * 60 * 1000) { // less than an hour
            return { prefix: "Active over ", value: `${Math.round(clusterDurationMillis / (60 * 1000))}m`, suffix: "" };
        }
        return { prefix: "Active over ", value: formatTimeDuration(clusterDurationMillis), suffix: "" };
    }
    return { prefix: "Started ", value: formatTimeAgo(durationSinceEarliest), suffix: "" };
}

/**
 * Wrapper component responsible for fetching, processing, and displaying details for a specific earthquake cluster.
 * It handles routing parameters to identify the cluster, manages loading and error states,
 * generates SEO metadata, and then renders the `ClusterDetailModal` with the cluster data.
 * It attempts to find cluster data from various sources:
 * 1. From the `overviewClusters` prop if a matching cluster is found.
 * 2. For specific older ID formats (e.g., "overview_cluster_..."), it attempts reconstruction using
 *    `fetchActiveClusters` from `clusterApiService.js`. This service, in turn, tries to fetch
 *    server-calculated clusters and falls back to local client-side calculation if needed.
 * 3. As a primary fallback or for current ID formats, it fetches a persisted cluster definition
 *    via `fetchClusterDefinition` from `clusterApiService.js` (e.g., from a D1 store).
 * It also handles cases where data might need to be loaded on-demand (e.g., monthly data from `EarthquakeDataContext`).
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
    const { clusterId: fullSlugFromParams } = useParams();
    const navigate = useNavigate();

    // Determine initial effective ID, format type, and any parsing errors
    let parsedEffectiveId = null;
    let parsedIsOldFormat = false;
    let parsingErrorMsg = '';

    if (fullSlugFromParams) {
        const newFormatMatch = fullSlugFromParams.match(/-([a-zA-Z0-9]+)$/);
        if (newFormatMatch) {
            parsedEffectiveId = newFormatMatch[1];
        } else if (fullSlugFromParams.startsWith('overview_cluster_')) {
            const parts = fullSlugFromParams.split('_');
            if (parts.length === 4 && parts[1] === 'cluster') {
                parsedEffectiveId = parts[2]; // e.g., 'reconTargetID'
                parsedIsOldFormat = true;
            } else {
                parsingErrorMsg = "Invalid old cluster URL format.";
            }
        } else {
            parsingErrorMsg = "Invalid cluster URL format. Does not match known patterns.";
        }
    } else {
        parsingErrorMsg = 'No cluster slug specified.';
    }

    const [effectiveQuakeId, setEffectiveQuakeId] = useState(parsedEffectiveId);
    const [isOldFormat, setIsOldFormat] = useState(parsedIsOldFormat);
    // Define fetch status states
    // 'idle': Initial state or after slug change, before parsing.
    // 'parsingSlug': Slug is being parsed.
    // 'checkingProps': Checking if cluster exists in `overviewClusters` prop.
    // 'reconstructingOldFormat': Attempting to reconstruct cluster for old format IDs.
    // 'needsMonthlyDataCheck': Determining if monthly data load is needed.
    // 'waitingForMonthlyData': Monthly data is being loaded.
    // 'fetchingD1': Fetching cluster definition from D1.
    // 'success': Cluster data successfully obtained.
    // 'error': An error occurred.
    const [fetchStatus, setFetchStatus] = useState('idle');

    const [internalIsLoading, setInternalIsLoading] = useState(!parsingErrorMsg && !!parsedEffectiveId);
    const [dynamicCluster, setDynamicCluster] = useState(null);
    const [errorMessage, setErrorMessage] = useState(parsingErrorMsg);
    // const [isWaitingForMonthlyData, setIsWaitingForMonthlyData] = useState(false); // Replaced by fetchStatus
    const hasFetchedOrReconstructedClusterRef = useRef(false);

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
 * This effect runs when the component mounts or when its dependencies (like `fullSlugFromParams`) change.
     * It tries to find the cluster data from various sources in a specific order:
 * 1. From the `overviewClusters` prop, if provided and a match is found.
 * 2. If the `clusterId` (derived from `fullSlugFromParams`) matches an older format (e.g., "overview_cluster_..."),
 *    it attempts to reconstruct the cluster using `fetchActiveClusters` from the `clusterApiService.js`.
 *    This service aims for server-side calculation first, with a client-side fallback.
 * 3. If monthly data (which might contain the necessary earthquakes for reconstruction or for a D1 definition)
 *    hasn't been loaded and seems necessary, it triggers `loadMonthlyData`.
 * 4. As a primary fallback (especially for current ID formats not found in props or if reconstruction fails/is skipped),
 *    it attempts to fetch a persisted cluster definition using `fetchClusterDefinition` from `clusterApiService.js`.
     * It manages loading states (`internalIsLoading`, `isWaitingForMonthlyData`) and error messages (`errorMessage`).
     * It also generates SEO properties using `generateSeo` based on the outcome.
     */
    // Effect for parsing slug and initializing states
    useEffect(() => {
        setDynamicCluster(null);
        setErrorMessage('');
        hasFetchedOrReconstructedClusterRef.current = false;
        // setInternalIsLoading(true); // Will be controlled by fetchStatus transitions

        if (!fullSlugFromParams) {
            setErrorMessage('No cluster slug specified.');
            setFetchStatus('error');
            return;
        }

        setFetchStatus('parsingSlug'); // Initial status to trigger the main effect

        let newParsedEffectiveId = null;
        let newParsedIsOldFormat = false;
        let newParsingErrorMsg = '';

        const newFormatMatch = fullSlugFromParams.match(/-([a-zA-Z0-9]+)$/);
        if (newFormatMatch) {
            newParsedEffectiveId = newFormatMatch[1];
        } else if (fullSlugFromParams.startsWith('overview_cluster_')) {
            const parts = fullSlugFromParams.split('_');
            if (parts.length === 4 && parts[1] === 'cluster') {
                newParsedEffectiveId = parts[2];
                newParsedIsOldFormat = true;
            } else {
                newParsingErrorMsg = "Invalid old cluster URL format.";
            }
        } else {
            newParsingErrorMsg = "Invalid cluster URL format. Does not match known patterns.";
        }

        if (newParsingErrorMsg) {
            setErrorMessage(newParsingErrorMsg);
            setEffectiveQuakeId(null); // Ensure ID is null on error
            setIsOldFormat(false);
            setFetchStatus('error');
        } else {
            setEffectiveQuakeId(newParsedEffectiveId);
            setIsOldFormat(newParsedIsOldFormat);
            // Transition to the next step in the main effect after successful parsing
            setFetchStatus('checkingProps');
        }
    }, [fullSlugFromParams]);


    const [seoProps, setSeoProps] = useState(() => {
        // Initial SEO based on synchronous parsing error, if any.
        // This will be updated by the main effect later.
        if (parsingErrorMsg) {
             return generateSeo(null, fullSlugFromParams, parsingErrorMsg);
        }
        return generateSeo(null, fullSlugFromParams, 'Loading cluster details...');
    });


    // Main effect driven by fetchStatus
    useEffect(() => {
        let isMounted = true;

        const processClusterFetch = async () => {
            if (!isMounted) return;

            // Update internalIsLoading based on fetchStatus
            const isLoading = ['parsingSlug', 'checkingProps', 'reconstructingOldFormat', 'needsMonthlyDataCheck', 'waitingForMonthlyData', 'fetchingD1'].includes(fetchStatus);
            setInternalIsLoading(isLoading);

            if (fetchStatus === 'idle' || fetchStatus === 'parsingSlug') {
                // Parsing is handled by the first useEffect. If still in 'parsingSlug', it means it's transitioning.
                // If it became 'idle' due to some reset, the first effect should pick it up if fullSlugFromParams is present.
                // If no fullSlugFromParams, first effect sets error.
                // Essentially, this state means we are waiting for the slug parsing effect to complete and set a new status.
                if (!fullSlugFromParams && isMounted) { // Should have been caught by slug parser effect
                    setErrorMessage('No cluster slug specified.');
                    setSeoProps(generateSeo(null, fullSlugFromParams, 'No cluster slug specified.'));
                    setFetchStatus('error');
                }
                return;
            }

            if (fetchStatus === 'error') {
                // Error message should already be set. Ensure loading is false.
                if (isMounted) {
                    // console.log(`[Wrapper Status] fetchStatus: error. Message: ${errorMessage}`); // DEBUG
                    setInternalIsLoading(false);
                    // Update SEO for error state if not already reflecting an error
                    if (!seoProps.noindex || seoProps.title === "Cluster Not Found | Earthquakes Live") { // Check if SEO already error
                        setSeoProps(generateSeo(null, fullSlugFromParams, errorMessage || "An unknown error occurred."));
                    }
                }
                return;
            }

            if (fetchStatus === 'success') {
                 if (isMounted) {
                    // console.log(`[Wrapper Status] fetchStatus: success. Cluster ID: ${dynamicCluster ? dynamicCluster.id : "null"}, HasFetchedRef: ${hasFetchedOrReconstructedClusterRef.current}`); // DEBUG
                    setInternalIsLoading(false);
                 }
                 // dynamicCluster should be set, SEO should be set.
                 return;
            }

            // Guard against running fetch logic if no effectiveQuakeId (e.g., parsing failed)
            if (!effectiveQuakeId && fetchStatus !== 'error' && fetchStatus !== 'idle' && fetchStatus !== 'parsingSlug') {
                if (isMounted) {
                    const msg = 'Cannot fetch cluster: No valid ID.';
                    // console.warn(`[Wrapper Status] ${msg} Current status: ${fetchStatus}`); // DEBUG - this is a warn, keep
                    setErrorMessage(msg);
                    setSeoProps(generateSeo(null, fullSlugFromParams, msg));
                    setFetchStatus('error');
                }
                return;
            }

            // console.log(`[Wrapper Status] Cycle Start. Current fetchStatus: ${fetchStatus}, effectiveQuakeId: ${effectiveQuakeId}, isOldFormat: ${isOldFormat}, HasFetchedRef: ${hasFetchedOrReconstructedClusterRef.current}, DynamicCluster: ${dynamicCluster ? dynamicCluster.id : "null"}`); // DEBUG

            // STARTING THE FETCH LOGIC STAGES
            if (fetchStatus === 'checkingProps') {
                // console.log("[Wrapper Status] In 'checkingProps'"); // DEBUG
                const initialUpstreamLoad = areParentClustersLoading ||
                    (!hasAttemptedMonthlyLoad && (isLoadingWeekly || isInitialAppLoad) && !earthquakesLast72Hours?.length) ||
                    (hasAttemptedMonthlyLoad && isLoadingMonthly && !allEarthquakes?.length );

                if (initialUpstreamLoad) {
                    // console.log("[Wrapper Status] 'checkingProps': initialUpstreamLoad is true. Waiting for data contexts."); // DEBUG
                    // Still waiting for parent data contexts to load, stay in this state or a sub-loading state.
                    // SEO already set to 'Loading cluster details...' initially or by slug parser.
                    // No status change, effect will re-run when context data changes.
                    return;
                }

                if (!areParentClustersLoading) { // Ensure parent is not loading before checking its props
                    const clusterFromProp = overviewClusters?.find(c =>
                        c.strongestQuakeId === effectiveQuakeId ||
                        (isOldFormat && c.id === fullSlugFromParams)
                    );
                    if (clusterFromProp) {
                        const displayCluster = { ...clusterFromProp, id: fullSlugFromParams };
                        if (isMounted) {
                            // console.log("[Wrapper Status] 'checkingProps': Found cluster in overviewClusters. Transitioning to 'success'.", displayCluster); // DEBUG
                            setDynamicCluster(displayCluster);
                            setSeoProps(generateSeo(displayCluster, fullSlugFromParams));
                            hasFetchedOrReconstructedClusterRef.current = true;
                            setFetchStatus('success');
                        }
                        return;
                    }
                }
                // If not found in props, decide next step
                if (isMounted) {
                    let sourceQuakesAvailable = earthquakesLast72Hours?.length > 0 || (hasAttemptedMonthlyLoad && allEarthquakes?.length > 0);
                    // console.log(`[Wrapper Status] 'checkingProps': Not found in props. isOldFormat: ${isOldFormat}, sourceQuakesAvailable: ${sourceQuakesAvailable}, hasAttemptedMonthlyLoad: ${hasAttemptedMonthlyLoad}`); // DEBUG
                    if (isOldFormat && sourceQuakesAvailable) {
                        // console.log("[Wrapper Status] 'checkingProps': Transitioning to 'reconstructingOldFormat'."); // DEBUG
                        setFetchStatus('reconstructingOldFormat');
                    } else if (isOldFormat && !sourceQuakesAvailable && !hasAttemptedMonthlyLoad) {
                        // console.log("[Wrapper Status] 'checkingProps': Old format, no quakes, monthly not tried. Transitioning to 'needsMonthlyDataCheck'."); // DEBUG
                        setFetchStatus('needsMonthlyDataCheck');
                    }
                    else {
                        // console.log("[Wrapper Status] 'checkingProps': Defaulting to 'fetchingD1'."); // DEBUG
                        setFetchStatus('fetchingD1');
                    }
                }
                return;
            }

            let sourceQuakesForReconstruction = earthquakesLast72Hours;
            if (hasAttemptedMonthlyLoad && allEarthquakes?.length > 0) {
                sourceQuakesForReconstruction = allEarthquakes;
            }


            if (fetchStatus === 'reconstructingOldFormat') {
                // console.log(`[Wrapper Status] In 'reconstructingOldFormat'. isOldFormat: ${isOldFormat}, sourceQuakes length: ${sourceQuakesForReconstruction?.length}`); // DEBUG
                if (!isOldFormat) {
                     if (isMounted) {
                        // console.warn("[Wrapper Status] 'reconstructingOldFormat': Not old format. Transitioning to 'fetchingD1'."); // DEBUG - this is a warn
                        setFetchStatus('fetchingD1');
                     }
                     return;
                }
                if (!sourceQuakesForReconstruction?.length) {
                    if (isMounted) {
                        if (!hasAttemptedMonthlyLoad) {
                            // console.log("[Wrapper Status] 'reconstructingOldFormat': No source quakes, monthly not attempted. Transitioning to 'needsMonthlyDataCheck'."); // DEBUG
                            setFetchStatus('needsMonthlyDataCheck');
                        } else {
                            // console.warn("[Wrapper Status] 'reconstructingOldFormat': No source quakes after monthly load attempt. Falling to D1. Transitioning to 'fetchingD1'."); // DEBUG - this is a warn
                            setFetchStatus('fetchingD1');
                        }
                    }
                    return;
                }

                try {
                    // console.log("[Wrapper Status] 'reconstructingOldFormat': Calling fetchActiveClusters."); // DEBUG
                    const allNewlyFormedClusters = await fetchActiveClusters(sourceQuakesForReconstruction, CLUSTER_MAX_DISTANCE_KM, CLUSTER_MIN_QUAKES);
                    if (!isMounted) return;
                    // console.log("[Wrapper Status] 'reconstructingOldFormat': fetchActiveClusters returned:", allNewlyFormedClusters ? `${allNewlyFormedClusters.length} potential groups` : "null/undefined"); // DEBUG

                    let foundMatchingCluster = false;
                    if (allNewlyFormedClusters) {
                        for (const newClusterArray of allNewlyFormedClusters) {
                            if (!newClusterArray || newClusterArray.length === 0) continue;
                            const sortedForStrongest = [...newClusterArray].sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0));
                            const newStrongestQuakeInCluster = sortedForStrongest[0];
                            if (!newStrongestQuakeInCluster) continue;

                            // console.log(`[Wrapper Status] 'reconstructingOldFormat': Comparing newStrongestQuakeInCluster.id "${newStrongestQuakeInCluster.id}" vs effectiveQuakeId "${effectiveQuakeId}"`); // DEBUG
                            if (newStrongestQuakeInCluster.id === effectiveQuakeId) {
                                let earliestTime = Infinity, latestTime = -Infinity;
                                newClusterArray.forEach(q => {
                                    if (q.properties.time < earliestTime) earliestTime = q.properties.time;
                                    if (q.properties.time > latestTime) latestTime = q.properties.time;
                                });
                                const reconstructed = {
                                    id: fullSlugFromParams,
                                    originalQuakes: newClusterArray, quakeCount: newClusterArray.length,
                                    strongestQuakeId: newStrongestQuakeInCluster.id, strongestQuake: newStrongestQuakeInCluster,
                                    maxMagnitude: Math.max(...newClusterArray.map(q => q.properties.mag).filter(m => m != null)),
                                    locationName: newStrongestQuakeInCluster.properties.place || 'Unknown Location',
                                    _earliestTimeInternal: earliestTime, _latestTimeInternal: latestTime,
                                    timeRange: calculateClusterTimeRangeForDisplay(earliestTime, latestTime, formatDate, formatTimeAgo, formatTimeDuration, newClusterArray.length),
                                };
                                if (isMounted) {
                                    // console.log("[Wrapper Status] 'reconstructingOldFormat': Match found! Transitioning to 'success'.", reconstructed); // DEBUG
                                    setDynamicCluster(reconstructed);
                                    setSeoProps(generateSeo(reconstructed, fullSlugFromParams));
                                    hasFetchedOrReconstructedClusterRef.current = true;
                                    setFetchStatus('success');
                                    foundMatchingCluster = true;
                                }
                                break;
                            }
                        }
                    }
                    if (foundMatchingCluster) return;

                    if (isMounted) {
                         // console.warn(`[Wrapper Status] 'reconstructingOldFormat': Old format ID ${effectiveQuakeId} not found. Transitioning to 'fetchingD1'.`); // DEBUG - this is a warn
                         setFetchStatus('fetchingD1');
                    }

                } catch (error) {
                    if (isMounted) {
                        // console.warn(`[Wrapper Status] 'reconstructingOldFormat': Error during fetchActiveClusters for old ID path: ${error.message}. Transitioning to 'fetchingD1'.`); // DEBUG - this is a warn
                        setFetchStatus('fetchingD1');
                    }
                }
                return;
            }

            if (fetchStatus === 'needsMonthlyDataCheck') {
                // console.log(`[Wrapper Status] In 'needsMonthlyDataCheck'. hasFetchedOrReconstructedClusterRef: ${hasFetchedOrReconstructedClusterRef.current}, hasAttemptedMonthlyLoad: ${hasAttemptedMonthlyLoad}`); // DEBUG
                if (hasFetchedOrReconstructedClusterRef.current) {
                    if (isMounted) {
                        // console.log("[Wrapper Status] 'needsMonthlyDataCheck': Cluster already found. Transitioning to 'success'."); // DEBUG
                        setFetchStatus('success');
                    }
                    return;
                }
                if (!hasAttemptedMonthlyLoad) {
                    if (isMounted) {
                        // console.log("[Wrapper Status] 'needsMonthlyDataCheck': Triggering loadMonthlyData. Transitioning to 'waitingForMonthlyData'."); // DEBUG
                        loadMonthlyData();
                        setFetchStatus('waitingForMonthlyData');
                    }
                } else {
                    if (isMounted) {
                        // console.log("[Wrapper Status] 'needsMonthlyDataCheck': Monthly data already attempted. Transitioning to 'fetchingD1'."); // DEBUG
                        setFetchStatus('fetchingD1');
                    }
                }
                return;
            }

            if (fetchStatus === 'waitingForMonthlyData') {
                // console.log(`[Wrapper Status] In 'waitingForMonthlyData'. isLoadingMonthly: ${isLoadingMonthly}`); // DEBUG
                if (isLoadingMonthly) {
                    return;
                }
                if (isMounted) {
                    // console.log(`[Wrapper Status] 'waitingForMonthlyData': Finished. isOldFormat: ${isOldFormat}, hasFetchedRef: ${hasFetchedOrReconstructedClusterRef.current}, allEarthquakes length: ${allEarthquakes?.length}`); // DEBUG
                    if (isOldFormat && !hasFetchedOrReconstructedClusterRef.current && allEarthquakes?.length > 0) {
                         // console.log("[Wrapper Status] 'waitingForMonthlyData': Monthly data loaded, re-attempting old format reconstruction. Transitioning to 'reconstructingOldFormat'."); // DEBUG
                         setFetchStatus('reconstructingOldFormat');
                    } else {
                         // console.log("[Wrapper Status] 'waitingForMonthlyData': Conditions for recon not met or not old format. Transitioning to 'fetchingD1'."); // DEBUG
                         setFetchStatus('fetchingD1');
                    }
                }
                return;
            }
            if (fetchStatus === 'fetchingD1') {
                // console.log(`[Wrapper Status] In 'fetchingD1'. hasFetchedRef: ${hasFetchedOrReconstructedClusterRef.current}, effectiveQuakeId: ${effectiveQuakeId}`); // DEBUG
                 if (hasFetchedOrReconstructedClusterRef.current) {
                    if (isMounted) {
                        // console.log("[Wrapper Status] 'fetchingD1': Cluster already found by props/recon. Transitioning to 'success'."); // DEBUG
                        setFetchStatus('success');
                    }
                    return;
                }
                if (!effectiveQuakeId) {
                    if(isMounted) {
                        const msg = "Cannot fetch from D1: No valid ID.";
                        // console.warn(`[Wrapper Status] 'fetchingD1': ${msg}`); // DEBUG - this is a warn
                        setErrorMessage(msg);
                        setSeoProps(generateSeo(null, fullSlugFromParams, msg));
                        setFetchStatus('error');
                    }
                    return;
                }

                let apiErrorMessage = null;
                try {
                    // console.log(`[Wrapper Status] 'fetchingD1': Calling fetchClusterWithQuakes for ${effectiveQuakeId}.`); // DEBUG
                    const clusterDataFromApi = await fetchClusterWithQuakes(effectiveQuakeId);
                    if (!isMounted) return;
                    // console.log(`[Wrapper Status] 'fetchingD1': fetchClusterWithQuakes returned:`, clusterDataFromApi ? "data" : "null/undefined"); // DEBUG

                    if (clusterDataFromApi) {
                        // The API now returns the full cluster definition including the 'quakes' array (GeoJSON features)
                        const {
                            quakes: apiQuakes, // This is the array of GeoJSON quake objects
                            quakeCount: apiQuakeCount,
                            strongestQuakeId: apiStrongestQuakeId,
                            maxMagnitude: apiMaxMagnitude,
                            locationName: apiLocationName,
                            title: apiTitle,
                            description: apiDescription,
                            updatedAt: apiUpdatedAt,
                            // other fields like slug, meanMagnitude, minMagnitude, depthRange, centroidLat/Lon, radiusKm, startTime, endTime, durationHours, significanceScore, version
                            // are available directly on clusterDataFromApi if needed by ClusterDetailModal or generateSeo
                        } = clusterDataFromApi;

                        if (apiQuakes && Array.isArray(apiQuakes) && apiQuakes.length > 0) {
                            let earliestTime = Infinity, latestTime = -Infinity;
                            apiQuakes.forEach(q => {
                                if (q.properties.time < earliestTime) earliestTime = q.properties.time;
                                if (q.properties.time > latestTime) latestTime = q.properties.time;
                            });

                            const strongestQuakeInList = apiQuakes.find(q => q.id === apiStrongestQuakeId) ||
                                [...apiQuakes].sort((a, b) => (b.properties.mag || 0) - (a.properties.mag || 0))[0];

                            if (strongestQuakeInList) {
                                const clusterForDisplay = {
                                    id: fullSlugFromParams, // Use slug from URL as the display ID/key
                                    originalQuakes: apiQuakes,
                                    quakeCount: apiQuakeCount !== undefined ? apiQuakeCount : apiQuakes.length,
                                    strongestQuakeId: apiStrongestQuakeId,
                                    strongestQuake: strongestQuakeInList,
                                    maxMagnitude: apiMaxMagnitude !== undefined ? apiMaxMagnitude : strongestQuakeInList.properties.mag,
                                    locationName: apiLocationName !== undefined ? apiLocationName : (strongestQuakeInList.properties.place || 'Unknown Location'),
                                    title: apiTitle, // Use title from API if available
                                    description: apiDescription, // Use description from API
                                    _earliestTimeInternal: earliestTime,
                                    _latestTimeInternal: latestTime,
                                    timeRange: calculateClusterTimeRangeForDisplay(earliestTime, latestTime, formatDate, formatTimeAgo, formatTimeDuration, apiQuakes.length),
                                    updatedAt: apiUpdatedAt, // Use updatedAt from API
                                    // Pass through other fields from clusterDataFromApi as needed by generateSeo or ClusterDetailModal
                                    slugFromApi: clusterDataFromApi.slug, // example
                                    meanMagnitude: clusterDataFromApi.meanMagnitude,
                                    minMagnitude: clusterDataFromApi.minMagnitude,
                                    depthRange: clusterDataFromApi.depthRange,
                                    centroidLat: clusterDataFromApi.centroidLat,
                                    centroidLon: clusterDataFromApi.centroidLon,
                                    radiusKm: clusterDataFromApi.radiusKm,
                                    apiStartTime: clusterDataFromApi.startTime, // distinguish from calculated earliestTime if necessary
                                    apiEndTime: clusterDataFromApi.endTime,
                                    durationHours: clusterDataFromApi.durationHours,
                                    significanceScore: clusterDataFromApi.significanceScore,
                                    version: clusterDataFromApi.version,
                                };

                                if (isMounted) {
                                    // console.log("[Wrapper Status] 'fetchingD1': API fetch successful. Transitioning to 'success'.", clusterForDisplay); // DEBUG
                                    setDynamicCluster(clusterForDisplay);
                                    setSeoProps(generateSeo(clusterForDisplay, fullSlugFromParams));
                                    hasFetchedOrReconstructedClusterRef.current = true;
                                    setFetchStatus('success');
                                }
                            } else {
                                apiErrorMessage = "Error processing API cluster data (strongest quake issue or empty quakes array).";
                                // console.warn(`[Wrapper Status] 'fetchingD1': ${apiErrorMessage}`); // DEBUG
                            }
                        } else {
                             apiErrorMessage = "Cluster data from API is missing earthquake details or has an empty quakes array.";
                             // console.warn(`[Wrapper Status] 'fetchingD1': ${apiErrorMessage}`); // DEBUG
                        }
                    } else { // clusterDataFromApi is null (implies 404 from fetchClusterWithQuakes)
                        apiErrorMessage = "Cluster definition not found via API.";
                        // console.log(`[Wrapper Status] 'fetchingD1': ${apiErrorMessage}`); // DEBUG
                    }
                } catch (error) { // Catches errors from fetchClusterWithQuakes (non-404 server errors, network errors, JSON parsing errors)
                    if (!isMounted) return;
                    // console.error(`[Wrapper Status] 'fetchingD1': Error fetching or processing API cluster data for ${effectiveQuakeId}:`, error); // DEBUG
                    apiErrorMessage = error.message || "Failed to fetch or process cluster details from API.";
                }

                if (isMounted && fetchStatus !== 'success') {
                    const finalMsg = apiErrorMessage || (monthlyError ? `Failed to load extended data: ${monthlyError}. Cluster details may be incomplete.` : "Cluster details could not be found or were incomplete after API attempt.");
                    // console.log(`[Wrapper Status] 'fetchingD1': Failed. Error: ${finalMsg}. Transitioning to 'error'.`); // DEBUG
                    setErrorMessage(finalMsg);
                    setSeoProps(generateSeo(null, fullSlugFromParams, finalMsg));
                    if (dynamicCluster !== null) setDynamicCluster(null); // Clear any stale cluster data
                    setFetchStatus('error');
                }
                return;
            }
        };

        // Add a log before calling processClusterFetch
        // Add a log before calling processClusterFetch
        // console.log(`[Wrapper Status] Effect run. Initial fetchStatus: ${fetchStatus}, effectiveQuakeId: ${effectiveQuakeId}, mounted: ${isMounted}`); // DEBUG
        processClusterFetch(); // New location

        return () => { isMounted = false; };

    }, [
        fetchStatus, // Primary driver
        fullSlugFromParams, // For SEO and initial parsing trigger
        effectiveQuakeId, // Core ID for fetching
        isOldFormat,      // Affects logic paths
        overviewClusters,
        areParentClustersLoading,
        allEarthquakes,
        earthquakesLast72Hours,
        isLoadingWeekly,
        isLoadingMonthly,
        isInitialAppLoad,
        hasAttemptedMonthlyLoad,
        loadMonthlyData, // function ref
        monthlyError,
        formatDate, formatTimeAgo, formatTimeDuration, generateSeo // function refs
        // Removed: errorMessage, internalIsLoading (managed within effect or by fetchStatus)
        // Removed: seoProps (read via getState but not a trigger for re-running logic, set within effect)
        // hasFetchedOrReconstructedClusterRef is a ref, not state, so not in deps.
    ]);

    const handleClose = () => navigate(-1);

    // Update loading message based on fetchStatus
    let loadingMessage = "Please wait while we fetch the information.";
    if (fetchStatus === 'waitingForMonthlyData') {
        loadingMessage = "Checking extended data...";
    } else if (fetchStatus === 'reconstructingOldFormat') {
        loadingMessage = "Attempting to reconstruct cluster data...";
    } else if (fetchStatus === 'fetchingD1') {
        loadingMessage = "Fetching definition from database...";
    }


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
                        <p className="text-sm text-slate-400">{loadingMessage}</p>
                    </div>
                </div>
            </>
        );
    }

    if (fetchStatus === 'error' && errorMessage) {
        return (
            <>
                <SeoMetadata {...seoProps} />
                <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[60] p-4">
                    <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700">
                        <h2 className="text-xl font-semibold text-amber-400 mb-3">{seoProps?.title?.split('|')[0].trim() || "Error Loading Cluster"}</h2>
                        <p className="text-sm mb-4">{errorMessage}</p>
                        <button onClick={handleClose} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors">
                            Go Back
                        </button>
                    </div>
                </div>
            </>
        );
    }

    if (fetchStatus === 'success' && dynamicCluster) {
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

    // Fallback for any state not explicitly handled (e.g., 'idle' before slug parsing effect kicks in,
    // or if somehow no other condition is met). This should ideally not be shown for long.
    // If fetchStatus is error but errorMessage is empty, show generic error.
    if (fetchStatus === 'error' && !errorMessage) {
         return (
            <>
                <SeoMetadata {...(seoProps || generateSeo(null, fullSlugFromParams, "An unexpected error occurred."))}/>
                <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[60] p-4">
                    <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700 text-center">
                        <h2 className="text-lg font-semibold text-red-400">Unexpected Error</h2>
                        <p className="text-sm text-slate-400">Could not load cluster details due to an unexpected issue.</p>
                        <button onClick={handleClose} className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors">
                            Go Back
                        </button>
                    </div>
                </div>
            </>
        );
    }

    // Default "Preparing" state for initial render or brief transitions.
    // Should be covered by internalIsLoading usually.
    return (
         <>
            <SeoMetadata {...(seoProps || generateSeo(null, fullSlugFromParams, "Preparing cluster information..."))} />
            <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[60] p-4">
                <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700 text-center">
                     <h2 className="text-lg font-semibold text-indigo-300">Preparing Cluster Information...</h2>
                     <p className="text-sm text-slate-400">This should only take a moment. Current status: {fetchStatus}</p>
                 </div>
             </div>
        </>
    );
}
export default ClusterDetailModalWrapper;
