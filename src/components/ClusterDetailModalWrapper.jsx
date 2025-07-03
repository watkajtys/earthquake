// src/components/ClusterDetailModalWrapper.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ClusterDetailModal from './ClusterDetailModal';
import SeoMetadata from './SeoMetadata';
import { fetchClusterWithQuakes } from '../services/clusterApiService.js'; // Changed fetchClusterDefinition to fetchClusterWithQuakes, removed fetchActiveClusters
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
        const {
            locationName,
            quakeCount,
            maxMagnitude,
            strongestQuake,
            updatedAt,
            _earliestTimeInternal, // For startDate
            _latestTimeInternal   // For endDate and potentially dateModified fallback
        } = clusterData;

        const pageTitle = `Earthquake Cluster: ${locationName || 'Unknown Area'}`;
        const pageDescription = `Explore an earthquake cluster near ${locationName || 'Unknown Area'} with ${quakeCount} events, max magnitude M${maxMagnitude?.toFixed(1)}. View details, map, and activity period.`;
        const pageKeywords = `earthquake cluster, seismic swarm, ${locationName || 'unknown area'}, active seismic zone, earthquake activity, seismic events`;

        const eventJsonLd = {
            '@context': 'https://schema.org',
            '@type': 'EventSeries', // Changed from CollectionPage
            name: pageTitle,
            description: pageDescription,
            url: pageUrl,
            keywords: pageKeywords.toLowerCase(),
            dateModified: updatedAt ? new Date(updatedAt).toISOString() : (_latestTimeInternal !== -Infinity && _latestTimeInternal ? new Date(_latestTimeInternal).toISOString() : undefined),
        };

        // Add startDate and endDate for EventSeries
        if (_earliestTimeInternal && _earliestTimeInternal !== Infinity) {
            try {
                eventJsonLd.startDate = new Date(_earliestTimeInternal).toISOString();
            } catch (e) {
                console.warn("Error formatting _earliestTimeInternal for JSON-LD startDate:", e);
            }
        }
        if (_latestTimeInternal && _latestTimeInternal !== -Infinity) {
            try {
                eventJsonLd.endDate = new Date(_latestTimeInternal).toISOString();
            } catch (e) {
                console.warn("Error formatting _latestTimeInternal for JSON-LD endDate:", e);
            }
        }

        // Add information about the most significant event in the series
        if (strongestQuake?.id && locationName && typeof maxMagnitude === 'number') {
            // 'about' is okay, but 'event' or 'subEvent' might be more specific for EventSeries items.
            // However, 'about' is broadly understood. Let's stick with 'about' for the primary event.
            eventJsonLd.about = {
                "@type": "Event",
                "name": `M ${maxMagnitude.toFixed(1)} - ${locationName}`,
                "identifier": strongestQuake.id
            };
        }

        // Location of the EventSeries (overall area)
        const seriesLocationName = locationName || "Unknown Area";
        const locationObject = {
            "@type": "Place",
            name: seriesLocationName
        };

        // Add GeoCoordinates if available and valid for the strongest quake (representing the series epicenter)
        const coords = strongestQuake?.geometry?.coordinates;
        if (Array.isArray(coords) &&
            coords.length >= 2 &&
            typeof coords[0] === 'number' && // longitude
            typeof coords[1] === 'number') { // latitude
            locationObject.geo = {
                "@type": "GeoCoordinates",
                latitude: coords[1],
                longitude: coords[0]
            };
        }
        eventJsonLd.location = locationObject;

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
        console.log('[DEBUG] Slug parsing effect triggered. fullSlugFromParams:', fullSlugFromParams);
        setDynamicCluster(null);
        setErrorMessage('');
        hasFetchedOrReconstructedClusterRef.current = false;

        if (!fullSlugFromParams) {
            console.log('[DEBUG] No fullSlugFromParams. Setting error.');
            setErrorMessage('No cluster slug specified.');
            setFetchStatus('error');
            return;
        }

        setFetchStatus('parsingSlug');
        console.log('[DEBUG] Set fetchStatus to "parsingSlug".');

        let newParsedEffectiveId = null;
        let newParsedIsOldFormat = false;
        let newParsingErrorMsg = '';

        const newFormatMatch = fullSlugFromParams.match(/-([a-zA-Z0-9]+)$/);
        if (newFormatMatch) {
            newParsedEffectiveId = newFormatMatch[1];
            console.log('[DEBUG] New format slug. effectiveQuakeId:', newParsedEffectiveId);
        } else if (fullSlugFromParams.startsWith('overview_cluster_')) {
            const parts = fullSlugFromParams.split('_');
            if (parts.length === 4 && parts[1] === 'cluster') {
                newParsedEffectiveId = parts[2];
                newParsedIsOldFormat = true;
                console.log('[DEBUG] Old format slug. effectiveQuakeId:', newParsedEffectiveId);
            } else {
                newParsingErrorMsg = "Invalid old cluster URL format.";
                console.log('[DEBUG] Invalid old format slug:', fullSlugFromParams);
            }
        } else {
            newParsingErrorMsg = "Invalid cluster URL format. Does not match known patterns.";
            console.log('[DEBUG] Unknown slug format:', fullSlugFromParams);
        }

        if (newParsingErrorMsg) {
            console.log('[DEBUG] Slug parsing error:', newParsingErrorMsg);
            setErrorMessage(newParsingErrorMsg);
            setEffectiveQuakeId(null);
            setIsOldFormat(false);
            setFetchStatus('error');
        } else {
            console.log('[DEBUG] Slug parsing successful. effectiveQuakeId:', newParsedEffectiveId, 'isOldFormat:', newParsedIsOldFormat);
            setEffectiveQuakeId(newParsedEffectiveId);
            setIsOldFormat(newParsedIsOldFormat);
            setFetchStatus('checkingProps');
            console.log('[DEBUG] Set fetchStatus to "checkingProps".');
        }
    }, [fullSlugFromParams]);


    const [seoProps, setSeoProps] = useState(() => {
        // Initial SEO based on synchronous parsing error, if any.
        // This will be updated by the main effect later.
        // if (parsingErrorMsg) { // parsingErrorMsg is not in scope here
        //      return generateSeo(null, fullSlugFromParams, parsingErrorMsg);
        // }
        // console.log('[DEBUG] Initializing seoProps. Current fullSlugFromParams for SEO:', fullSlugFromParams); // Too early for fullSlugFromParams
        return generateSeo(null, "initial-slug-for-seo", 'Loading cluster details...');
    });


    // Main effect driven by fetchStatus
    useEffect(() => {
        let isMounted = true;
        console.log(`[DEBUG] Main fetch effect. Status: ${fetchStatus}. effectiveQuakeId: ${effectiveQuakeId}. Mounted: ${isMounted}. fullSlug: ${fullSlugFromParams}`);

        const processClusterFetch = async () => {
            if (!isMounted) {
                console.log('[DEBUG] processClusterFetch: Component unmounted. Aborting.');
                return;
            }

            const isLoading = ['parsingSlug', 'checkingProps', 'reconstructingOldFormat', 'needsMonthlyDataCheck', 'waitingForMonthlyData', 'fetchingD1'].includes(fetchStatus);
            setInternalIsLoading(isLoading);
            console.log(`[DEBUG] processClusterFetch: internalIsLoading set to ${isLoading} based on fetchStatus: ${fetchStatus}`);

            if (fetchStatus === 'idle' || fetchStatus === 'parsingSlug') {
                console.log(`[DEBUG] processClusterFetch: Status is '${fetchStatus}'. Waiting for slug parsing or next state.`);
                if (!fullSlugFromParams && isMounted) {
                    console.log('[DEBUG] processClusterFetch: No fullSlugFromParams in idle/parsingSlug. Setting error.');
                    setErrorMessage('No cluster slug specified.');
                    setSeoProps(generateSeo(null, fullSlugFromParams, 'No cluster slug specified.'));
                    setFetchStatus('error');
                }
                return;
            }

            if (fetchStatus === 'error') {
                console.log(`[DEBUG] processClusterFetch: Status is 'error'. ErrorMessage: "${errorMessage}". SEO:`, seoProps);
                if (isMounted) {
                    setInternalIsLoading(false);
                    // No need to update SEO if it's already an error type or if errorMessage is the same.
                    // This check helps prevent loops if generateSeo itself triggers an update.
                    if (!seoProps.noindex || (errorMessage && seoProps.description !== errorMessage)) {
                         setSeoProps(generateSeo(null, fullSlugFromParams, errorMessage || "An unknown error occurred."));
                    }
                }
                return;
            }

            if (fetchStatus === 'success') {
                console.log(`[DEBUG] processClusterFetch: Status is 'success'. DynamicCluster ID: ${dynamicCluster ? dynamicCluster.id : "null"}`);
                 if (isMounted) setInternalIsLoading(false);
                 return;
            }

            if (!effectiveQuakeId && fetchStatus !== 'error' && fetchStatus !== 'idle' && fetchStatus !== 'parsingSlug') {
                if (isMounted) {
                    const msg = 'Cannot fetch cluster: No valid effectiveQuakeId.';
                    console.warn(`[DEBUG] processClusterFetch: ${msg} Current status: ${fetchStatus}`);
                    setErrorMessage(msg);
                    setSeoProps(generateSeo(null, fullSlugFromParams, msg));
                    setFetchStatus('error');
                }
                return;
            }

            // STARTING THE FETCH LOGIC STAGES
            if (fetchStatus === 'checkingProps') {
                 console.log("[DEBUG] processClusterFetch: In 'checkingProps'");
                // ... (rest of checkingProps logic, add logs if needed)
                const initialUpstreamLoad = areParentClustersLoading ||
                    (!hasAttemptedMonthlyLoad && (isLoadingWeekly || isInitialAppLoad) && !earthquakesLast72Hours?.length) ||
                    (hasAttemptedMonthlyLoad && isLoadingMonthly && !allEarthquakes?.length );

                if (initialUpstreamLoad) {
                     console.log("[DEBUG] 'checkingProps': initialUpstreamLoad is true. Waiting for data contexts.");
                    return;
                }

                if (!areParentClustersLoading) {
                    const clusterFromProp = overviewClusters?.find(c =>
                        c.strongestQuakeId === effectiveQuakeId ||
                        (isOldFormat && c.id === fullSlugFromParams)
                    );
                    if (clusterFromProp) {
                        const displayCluster = { ...clusterFromProp, id: fullSlugFromParams };
                        if (isMounted) {
                            console.log("[DEBUG] 'checkingProps': Found cluster in overviewClusters. Transitioning to 'success'.", displayCluster);
                            setDynamicCluster(displayCluster);
                            setSeoProps(generateSeo(displayCluster, fullSlugFromParams));
                            hasFetchedOrReconstructedClusterRef.current = true;
                            setFetchStatus('success');
                        }
                        return;
                    }
                }
                if (isMounted) {
                    let sourceQuakesAvailable = earthquakesLast72Hours?.length > 0 || (hasAttemptedMonthlyLoad && allEarthquakes?.length > 0);
                    console.log(`[DEBUG] 'checkingProps': Not found in props. isOldFormat: ${isOldFormat}, sourceQuakesAvailable: ${sourceQuakesAvailable}, hasAttemptedMonthlyLoad: ${hasAttemptedMonthlyLoad}`);
                    if (isOldFormat && sourceQuakesAvailable) {
                        console.log("[DEBUG] 'checkingProps': Transitioning to 'reconstructingOldFormat'.");
                        setFetchStatus('reconstructingOldFormat');
                    } else if (isOldFormat && !sourceQuakesAvailable && !hasAttemptedMonthlyLoad) {
                        console.log("[DEBUG] 'checkingProps': Old format, no quakes, monthly not tried. Transitioning to 'needsMonthlyDataCheck'.");
                        setFetchStatus('needsMonthlyDataCheck');
                    }
                    else {
                        console.log("[DEBUG] 'checkingProps': Defaulting to 'fetchingD1'.");
                        setFetchStatus('fetchingD1');
                    }
                }
                return;
            }


            if (fetchStatus === 'reconstructingOldFormat') {
                console.log(`[DEBUG] processClusterFetch: In 'reconstructingOldFormat'.`);
                // ... (rest of reconstructingOldFormat logic, add logs if needed)
                 if (!isOldFormat) {
                     if (isMounted) {
                        console.warn("[DEBUG] 'reconstructingOldFormat': Not old format. Transitioning to 'fetchingD1'.");
                        setFetchStatus('fetchingD1');
                     }
                     return;
                }
                // ...
            }

            if (fetchStatus === 'needsMonthlyDataCheck') {
                console.log(`[DEBUG] processClusterFetch: In 'needsMonthlyDataCheck'.`);
                // ... (rest of needsMonthlyDataCheck logic, add logs if needed)
            }

            if (fetchStatus === 'waitingForMonthlyData') {
                console.log(`[DEBUG] processClusterFetch: In 'waitingForMonthlyData'.`);
                // ... (rest of waitingForMonthlyData logic, add logs if needed)
            }

            if (fetchStatus === 'fetchingD1') {
                console.log(`[DEBUG] processClusterFetch: In 'fetchingD1'. effectiveQuakeId: ${effectiveQuakeId}, hasFetchedRef: ${hasFetchedOrReconstructedClusterRef.current}`);
                 if (hasFetchedOrReconstructedClusterRef.current) {
                    if (isMounted) {
                        console.log("[DEBUG] 'fetchingD1': Cluster already found by props/recon. Transitioning to 'success'.");
                        setFetchStatus('success');
                    }
                    return;
                }
                if (!effectiveQuakeId) {
                    if(isMounted) {
                        const msg = "Cannot fetch from D1: No valid ID for 'fetchingD1'.";
                        console.warn(`[DEBUG] 'fetchingD1': ${msg}`);
                        setErrorMessage(msg);
                        setSeoProps(generateSeo(null, fullSlugFromParams, msg));
                        setFetchStatus('error');
                         console.log(`[DEBUG] 'fetchingD1': Set fetchStatus to 'error' due to no effectiveQuakeId.`);
                    }
                    return;
                }

                let apiErrorMessage = null;
                try {
                    console.log(`[DEBUG] 'fetchingD1': Calling fetchClusterWithQuakes for effectiveQuakeId: ${effectiveQuakeId}.`);
                    const clusterDataFromApi = await fetchClusterWithQuakes(effectiveQuakeId);
                    console.log(`[DEBUG] 'fetchingD1': fetchClusterWithQuakes returned. Raw data:`, clusterDataFromApi ? JSON.stringify(clusterDataFromApi) : "null/undefined");

                    if (!isMounted) {
                        console.log("[DEBUG] 'fetchingD1': Component unmounted after fetch. Aborting.");
                        return;
                    }

                    if (clusterDataFromApi) {
                        const {
                            quakes: apiQuakes,
                            strongestQuakeId: apiStrongestQuakeIdFromData, // Renamed to avoid conflict with context/prop
                            // ... other fields
                        } = clusterDataFromApi;
                        console.log(`[DEBUG] 'fetchingD1': Data from API. apiQuakes present: ${!!apiQuakes}, apiStrongestQuakeIdFromData: ${apiStrongestQuakeIdFromData}`);

                        const quakesValid = apiQuakes && Array.isArray(apiQuakes) && apiQuakes.length > 0;
                        console.log(`[DEBUG] 'fetchingD1': Evaluation of 'apiQuakes && Array.isArray(apiQuakes) && apiQuakes.length > 0': ${quakesValid}`);

                        if (quakesValid) {
                            let earliestTime = Infinity, latestTime = -Infinity;
                            apiQuakes.forEach(q => {
                                if (q.properties.time < earliestTime) earliestTime = q.properties.time;
                                if (q.properties.time > latestTime) latestTime = q.properties.time;
                            });

                            // Attempt to find the quake specified by apiStrongestQuakeIdFromData in the apiQuakes list.
                            // This is critical: the cluster definition points to a specific quake as its "strongest" or "defining" quake.
                            const strongestQuakeInList = apiQuakes.find(q => q.id === apiStrongestQuakeIdFromData);
                            console.log(`[DEBUG] 'fetchingD1': Attempted to find quake with id '${apiStrongestQuakeIdFromData}' in apiQuakes. Result:`, strongestQuakeInList ? strongestQuakeInList.id : "not found");

                            if (strongestQuakeInList) {
                                // Successfully found the designated strongest quake in the list.
                                const clusterForDisplay = {
                                    id: fullSlugFromParams,
                                    originalQuakes: apiQuakes,
                                    quakeCount: clusterDataFromApi.quakeCount !== undefined ? clusterDataFromApi.quakeCount : apiQuakes.length,
                                    strongestQuakeId: apiStrongestQuakeIdFromData, // This is from the cluster definition
                                    strongestQuake: strongestQuakeInList,       // This is the actual quake object from the list
                                    maxMagnitude: clusterDataFromApi.maxMagnitude !== undefined ? clusterDataFromApi.maxMagnitude : strongestQuakeInList.properties.mag,
                                    locationName: clusterDataFromApi.locationName !== undefined ? clusterDataFromApi.locationName : (strongestQuakeInList.properties.place || 'Unknown Location'),
                                    title: clusterDataFromApi.title,
                                    description: clusterDataFromApi.description,
                                    _earliestTimeInternal: earliestTime,
                                    _latestTimeInternal: latestTime,
                                    timeRange: calculateClusterTimeRangeForDisplay(earliestTime, latestTime, formatDate, formatTimeAgo, formatTimeDuration, apiQuakes.length),
                                    updatedAt: clusterDataFromApi.updatedAt,
                                    // Pass through other relevant fields from clusterDataFromApi
                                    slugFromApi: clusterDataFromApi.slug,
                                    meanMagnitude: clusterDataFromApi.meanMagnitude,
                                    minMagnitude: clusterDataFromApi.minMagnitude,
                                    depthRange: clusterDataFromApi.depthRange,
                                    centroidLat: clusterDataFromApi.centroidLat,
                                    centroidLon: clusterDataFromApi.centroidLon,
                                    radiusKm: clusterDataFromApi.radiusKm,
                                    apiStartTime: clusterDataFromApi.startTime,
                                    apiEndTime: clusterDataFromApi.endTime,
                                    durationHours: clusterDataFromApi.durationHours,
                                    significanceScore: clusterDataFromApi.significanceScore,
                                    version: clusterDataFromApi.version,
                                };

                                if (isMounted) {
                                    console.log("[DEBUG] 'fetchingD1': Designated strongest quake found. API fetch successful. Setting dynamicCluster and transitioning to 'success'. Cluster to display (partial):", JSON.stringify(clusterForDisplay).substring(0, 500) + "...");
                                    setDynamicCluster(clusterForDisplay);
                                    setSeoProps(generateSeo(clusterForDisplay, fullSlugFromParams));
                                    hasFetchedOrReconstructedClusterRef.current = true;
                                    setFetchStatus('success');
                                    console.log("[DEBUG] 'fetchingD1': Set fetchStatus to 'success'.");
                                    return; // <<<<<<< ADDED RETURN HERE
                                }
                            } else {
                                // This is a data integrity issue: the cluster definition's strongestQuakeId
                                // does not correspond to any quake in its own list of earthquakes.
                                apiErrorMessage = `Data consistency error: The designated strongest earthquake (ID: ${apiStrongestQuakeIdFromData}) was not found within the provided list of earthquakes for this cluster.`;
                                console.warn(`[DEBUG] 'fetchingD1': apiErrorMessage set: ${apiErrorMessage}. apiStrongestQuakeIdFromData: ${apiStrongestQuakeIdFromData}, apiQuakes count: ${apiQuakes ? apiQuakes.length : 'N/A'}`);
                            }
                        } else { // !quakesValid (apiQuakes is missing, not an array, or empty)
                             apiErrorMessage = "Cluster data from API is missing associated earthquake details or the list is empty/invalid.";
                             console.warn(`[DEBUG] 'fetchingD1': apiErrorMessage set: ${apiErrorMessage}. apiQuakes:`, apiQuakes);
                        }
                    } else { // clusterDataFromApi is null
                        apiErrorMessage = "Cluster definition not found via API (fetchClusterWithQuakes returned null).";
                        console.log(`[DEBUG] 'fetchingD1': apiErrorMessage set: ${apiErrorMessage}`);
                    }
                } catch (error) {
                    if (!isMounted) {
                        console.log("[DEBUG] 'fetchingD1': Component unmounted during catch block. Aborting.");
                        return;
                    }
                    console.error(`[DEBUG] 'fetchingD1': Error fetching or processing API cluster data for ${effectiveQuakeId}:`, error);
                    apiErrorMessage = error.message || "Failed to fetch or process cluster details from API.";
                }

                if (isMounted && fetchStatus !== 'success') {
                    const finalMsg = apiErrorMessage || (monthlyError ? `Failed to load extended data: ${monthlyError}. Cluster details may be incomplete.` : "Cluster details could not be found or were incomplete after API attempt.");
                    console.log(`[DEBUG] 'fetchingD1': Processing failed or did not result in success. Final error message: "${finalMsg}". Current fetchStatus: ${fetchStatus}. Transitioning to 'error'.`);
                    setErrorMessage(finalMsg);
                    setSeoProps(generateSeo(null, fullSlugFromParams, finalMsg));
                    if (dynamicCluster !== null) {
                        console.log("[DEBUG] 'fetchingD1': Clearing stale dynamicCluster.");
                        setDynamicCluster(null);
                    }
                    setFetchStatus('error');
                    console.log(`[DEBUG] 'fetchingD1': Set fetchStatus to 'error'. errorMessage: "${finalMsg}"`);
                }
                return;
            }
        };
        processClusterFetch();

        return () => {
            isMounted = false;
            console.log(`[DEBUG] Main fetch effect cleanup. Was processing status: ${fetchStatus}. Mounted set to false.`);
        };

    }, [
        fetchStatus, // Primary driver
        // fullSlugFromParams, // For SEO and initial parsing trigger - REMOVED as per task
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
