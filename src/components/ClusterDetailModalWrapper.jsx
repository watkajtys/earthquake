// src/components/ClusterDetailModalWrapper.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ClusterDetailModal from './ClusterDetailModal';
import SeoMetadata from './SeoMetadata';
import { fetchClusterDefinition, fetchActiveClusters } from '../services/clusterApiService.js'; // Added fetchActiveClusters
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx';
// import { findActiveClusters } from '../utils/clusterUtils.js'; // Removed
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
    const [internalIsLoading, setInternalIsLoading] = useState(!parsingErrorMsg && !!parsedEffectiveId);
    const [dynamicCluster, setDynamicCluster] = useState(null);
    const [errorMessage, setErrorMessage] = useState(parsingErrorMsg);
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
    // This useEffect updates effectiveQuakeId and isOldFormat if the slug changes after initial mount.
    useEffect(() => {
        let newParsedEffectiveId = null;
        let newParsedIsOldFormat = false;
        let newParsingErrorMsg = '';
        if (fullSlugFromParams) {
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
        } else {
            newParsingErrorMsg = 'No cluster slug specified.';
        }
        setEffectiveQuakeId(newParsedEffectiveId);
        setIsOldFormat(newParsedIsOldFormat);
        setErrorMessage(newParsingErrorMsg); // Update error message based on new slug
        setInternalIsLoading(!newParsingErrorMsg && !!newParsedEffectiveId); // Reset loading state
        setDynamicCluster(null); // Reset cluster data when slug changes
    }, [fullSlugFromParams]);


    const [seoProps, setSeoProps] = useState(() => {
        if (parsingErrorMsg) { // Use the parsing error message for initial SEO
            return generateSeo(null, fullSlugFromParams, parsingErrorMsg);
        }
        return {};
    });

    useEffect(() => {
        let isMounted = true;
        const findAndSetCluster = async () => {
            if (!isMounted) return;

            // If there was an initial parsing error, or effectiveQuakeId is null, don't proceed.
            // The errorMessage state would already be set by initial parsing or the effect above.
            if (errorMessage || !effectiveQuakeId) {
                if (isMounted && internalIsLoading) setInternalIsLoading(false); // Stop loading if it was true
                // Update SEO for error if not already set by parsing error
                if (!seoProps.noindex && errorMessage) setSeoProps(generateSeo(null, fullSlugFromParams, errorMessage));
                else if (!seoProps.noindex && !errorMessage && !effectiveQuakeId) {
                    // This case handles if parsingErrorMsg was empty but effectiveQuakeId is still null.
                    const msg = 'Could not determine a valid cluster quake ID from the URL.';
                    setErrorMessage(msg);
                    setSeoProps(generateSeo(null, fullSlugFromParams, msg));
                }
                return;
            }

            // If we have an effectiveQuakeId and no parsing error, ensure loading is true
            if (isMounted && !internalIsLoading) setInternalIsLoading(true);


            const initialUpstreamLoad = areParentClustersLoading ||
                                       (!hasAttemptedMonthlyLoad && (isLoadingWeekly || isInitialAppLoad) && !earthquakesLast72Hours?.length) ||
                                       (hasAttemptedMonthlyLoad && isLoadingMonthly && !allEarthquakes?.length && !isWaitingForMonthlyData);

            if (initialUpstreamLoad && !dynamicCluster) {
                if (isMounted) setSeoProps(generateSeo(null, fullSlugFromParams, 'Loading cluster details...'));
                return;
            }

            if (!dynamicCluster && !areParentClustersLoading) {
                const clusterFromProp = overviewClusters?.find(c =>
                    c.strongestQuakeId === effectiveQuakeId ||
                    (isOldFormat && c.id === fullSlugFromParams)
                );
                if (clusterFromProp) {
                    // to match what generateSeo expects if it were using dynamicCluster.id
                    const displayCluster = { ...clusterFromProp, id: fullSlugFromParams };
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

            if (isOldFormat && !dynamicCluster && sourceQuakesForReconstruction?.length > 0) {
                try {
                    const allNewlyFormedClusters = await fetchActiveClusters(sourceQuakesForReconstruction, CLUSTER_MAX_DISTANCE_KM, CLUSTER_MIN_QUAKES);
                    if (!isMounted) return;

                    let foundMatchingCluster = false;
                    for (const newClusterArray of allNewlyFormedClusters) {
                        if (!newClusterArray || newClusterArray.length === 0) continue;
                        const sortedForStrongest = [...newClusterArray].sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0));
                        const newStrongestQuakeInCluster = sortedForStrongest[0];
                        if (!newStrongestQuakeInCluster) continue;

                        if (newStrongestQuakeInCluster.id === effectiveQuakeId) { // Use effectiveQuakeId
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
                                setDynamicCluster(reconstructed);
                                setSeoProps(generateSeo(reconstructed, fullSlugFromParams));
                                setInternalIsLoading(false);
                                setIsWaitingForMonthlyData(false);
                                foundMatchingCluster = true;
                            }
                            break;
                        }
                    }
                    if (foundMatchingCluster) return;

                } catch (error) {
                    if (isMounted) {
                        console.warn(`Cluster reconstruction via fetchActiveClusters (old ID path) failed: ${error.message}`);
                        // Fall through to fetchClusterDefinition
                    }
                }
            }


            if (!dynamicCluster && !hasAttemptedMonthlyLoad && !isWaitingForMonthlyData) {
                if (isMounted) {
                    // console.log("[Wrapper Log] Triggering loadMonthlyData. isWaiting:", isWaitingForMonthlyData);
                    loadMonthlyData(); // This is a synchronous call that likely dispatches an action
                    setIsWaitingForMonthlyData(true);
                }
                return; // Return here to wait for monthly data context update to re-trigger useEffect
            }

            // If waiting for monthly data and it's still loading, wait.
            if (isWaitingForMonthlyData && isLoadingMonthly) {
                return;
            }
            // If was waiting, and monthly load finished (isLoadingMonthly is false now)
            if (isWaitingForMonthlyData && !isLoadingMonthly) {
                if(isMounted) setIsWaitingForMonthlyData(false); // Reset waiting flag
                // Data sources might have updated, so effect will re-run.
                // No need to proceed further in this specific run if data just arrived.
                // The re-run of useEffect will use the updated sourceQuakesForReconstruction.
                // If it's already loading, let it continue. Otherwise, ensure it is.
                if(isMounted && !internalIsLoading) setInternalIsLoading(true);
                return;
            }

            let finalErrorMessage = null;

            // This block is for new format slugs OR if old format reconstruction failed and now trying D1.
            // For old format, fetchClusterDefinition would be called with the extracted ID part.
            if (!isOldFormat && !dynamicCluster && effectiveQuakeId) { // Primary path for new slugs or D1 fallback for old
                try {
                    const d1Definition = await fetchClusterDefinition(effectiveQuakeId);
                    if (!isMounted) return;

                    if (d1Definition && sourceQuakesForReconstruction?.length > 0) {
                        const { earthquakeIds, strongestQuakeId: defStrongestQuakeIdFromD1, updatedAt: d1UpdatedAt, title: d1Title, description: d1Description, locationName: d1LocationName, maxMagnitude: d1MaxMagnitude } = d1Definition;

                        if (defStrongestQuakeIdFromD1 !== effectiveQuakeId && d1Definition.clusterId !== effectiveQuakeId) {
                             console.warn(`D1 ClusterDefinition for ${effectiveQuakeId} returned data for ${defStrongestQuakeIdFromD1}. Mismatch.`);
                        }

                        const foundQuakes = (JSON.parse(earthquakeIds || "[]")).map(id => sourceQuakesForReconstruction.find(q => q.id === id)).filter(Boolean);

                        if (foundQuakes.length === (JSON.parse(earthquakeIds || "[]")).length) {
                            let earliestTime = Infinity, latestTime = -Infinity;
                            foundQuakes.forEach(q => {
                                if (q.properties.time < earliestTime) earliestTime = q.properties.time;
                                if (q.properties.time > latestTime) latestTime = q.properties.time;
                            });
                            const strongestQuakeInList = foundQuakes.find(q => q.id === defStrongestQuakeIdFromD1) ||
                                                         (effectiveQuakeId ? foundQuakes.find(q => q.id === effectiveQuakeId) : null) ||
                                                         foundQuakes.sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0))[0];

                            if (strongestQuakeInList) {
                                const reconstructed = {
                                    id: fullSlugFromParams,
                                    originalQuakes: foundQuakes, quakeCount: foundQuakes.length,
                                    strongestQuakeId: strongestQuakeInList.id,
                                    strongestQuake: strongestQuakeInList,
                                    maxMagnitude: d1MaxMagnitude ?? Math.max(...foundQuakes.map(q => q.properties.mag).filter(m => m != null)),
                                    locationName: d1LocationName ?? (strongestQuakeInList.properties.place || 'Unknown Location'),
                                    title: d1Title, description: d1Description, // Use D1 title/desc if available
                                    _earliestTimeInternal: earliestTime, _latestTimeInternal: latestTime,
                                    timeRange: calculateClusterTimeRangeForDisplay(earliestTime, latestTime, formatDate, formatTimeAgo, formatTimeDuration, foundQuakes.length),
                                    updatedAt: d1UpdatedAt,
                                };
                                setDynamicCluster(reconstructed);
                                setSeoProps(generateSeo(reconstructed, fullSlugFromParams));
                            } else {
                                console.warn(`D1 ClusterDefinition for ${effectiveQuakeId}: Strongest quake ID ${defStrongestQuakeIdFromD1} not found in its own list.`);
                                finalErrorMessage = "Error processing D1 cluster data (strongest quake mismatch).";
                            }
                        } else if (JSON.parse(earthquakeIds || "[]").length > 0) {
                            console.warn(`D1 ClusterDefinition for ${effectiveQuakeId} is stale or quakes not in client data. Found ${foundQuakes.length} of ${JSON.parse(earthquakeIds).length}.`);
                            finalErrorMessage = "Cluster data found, but some quakes are not in recent records.";
                        } else {
                            // D1 result was empty or didn't lead to found quakes
                             finalErrorMessage = "Cluster definition found but no quakes could be matched.";
                        }
                    } else if (d1Definition && sourceQuakesForReconstruction?.length === 0) {
                        console.warn(`D1 ClusterDefinition for ${effectiveQuakeId} received, but no source quakes available on client.`);
                        finalErrorMessage = "Cluster definition found, but source quakes unavailable for full display.";
                    } else if (!d1Definition) {
                         finalErrorMessage = "Cluster definition not found in D1.";
                    }
                } catch (error) {
                    if (!isMounted) return;
                    console.error(`Error fetching or processing D1 cluster definition ${effectiveQuakeId}:`, error);
                    finalErrorMessage = "Failed to fetch or process cluster details from D1.";
                }
            }


            if (isMounted) {
                if (!dynamicCluster) { // If, after all attempts, dynamicCluster is still not set
                    const message = finalErrorMessage || (monthlyError ? `Failed to load extended data: ${monthlyError}. Cluster details may be incomplete.` : "Cluster details could not be found or were incomplete.");
                    setErrorMessage(message);
                    setSeoProps(generateSeo(null, fullSlugFromParams, message));
                }
                setInternalIsLoading(false);
            }
        };

        // This effect should re-run if fullSlugFromParams changes, which then updates effectiveQuakeId/isOldFormat via their own effect.
        // The primary data fetching logic is triggered by changes in effectiveQuakeId or the data sources.
        if (!errorMessage) {
            findAndSetCluster().finally(() => {
                if (isMounted) {
                    setInternalIsLoading(false);
                }
            });
        } else if (internalIsLoading && errorMessage) { // Also stop loading if there's an error message already
             if(isMounted) setInternalIsLoading(false);
        }

        return () => { isMounted = false; };

    }, [
        fullSlugFromParams,
        effectiveQuakeId,
        isOldFormat,
        overviewClusters,
        areParentClustersLoading,
        allEarthquakes,
        earthquakesLast72Hours,
        isLoadingWeekly,
        isLoadingMonthly,
        isInitialAppLoad,
        hasAttemptedMonthlyLoad,
        loadMonthlyData,
        monthlyError,
        isWaitingForMonthlyData,
        formatDate,
        formatTimeAgo,
        formatTimeDuration,
        generateSeo,
        dynamicCluster,
        errorMessage,
        internalIsLoading
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
