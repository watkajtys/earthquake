// src/ClusterDetailModalWrapper.jsx
import React, { useState, useEffect, useCallback } from 'react'; // Added useCallback
import { useParams, useNavigate } from 'react-router-dom';
import ClusterDetailModal from './ClusterDetailModal';
import SeoMetadata from './SeoMetadata'; // Import SeoMetadata
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx';
import { regenerateClusterAroundQuake } from '../utils/clusterUtils.js';
import { calculateDistance } from '../utils/utils.js';
import { CLUSTER_MAX_DISTANCE_KM, CLUSTER_MIN_QUAKES } from '../constants/appConstants.js';

// Helper functions for time formatting (adapted from HomePage.jsx)
// These are defined outside the component as they don't depend on component state/props directly.
const formatTimeAgoInternal = (milliseconds) => {
    if (milliseconds === null || milliseconds < 0) return 'N/A';
    if (milliseconds < 30000) return 'just now'; // 30 seconds
    const seconds = Math.floor(milliseconds / 1000);
    if (seconds < 60) return `${seconds} sec ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
};

const formatTimeDurationInternal = (milliseconds) => {
    if (milliseconds === null || milliseconds < 0) return 'N/A';
    const totalSeconds = Math.floor(milliseconds / 1000);
    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    // const seconds = totalSeconds % 60; // Not typically shown for longer durations in this context
    let parts = [];
    if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hr${hours > 1 ? 's' : ''}`);
    if (minutes > 0 && days === 0) parts.push(`${minutes} min${minutes > 1 ? 's' : ''}`); // Show minutes if no days
    if (parts.length === 0 && totalSeconds >= 0) { // Handle very short durations
        if (totalSeconds < 60) return `${totalSeconds} sec`;
        return `${minutes} min`; // Should have been caught by minutes > 0 if days === 0
    }
    if (parts.length === 0) return "0 sec"; // If input was 0
    return parts.join(', ');
};


/**
 * Formats a raw cluster (array of quakes) into the display format.
 * @param {Array<object>|null} rawCluster - The array of earthquake objects.
 * @param {string} originalClusterIdFromUrl - The cluster ID from the URL params.
 * @returns {object|null} The formatted cluster object or null.
 */
const formatRawClusterForDisplay = (rawCluster, originalClusterIdFromUrl) => {
    if (!rawCluster || rawCluster.length === 0) {
        return null;
    }

    let maxMag = -Infinity;
    let earliestTime = Infinity;
    let latestTime = -Infinity;
    let strongestQuakeInCluster = rawCluster[0]; // Fallback

    rawCluster.forEach(quake => {
        const mag = quake.properties?.mag;
        const time = quake.properties?.time;

        if (typeof mag === 'number' && mag > maxMag) {
            maxMag = mag;
            strongestQuakeInCluster = quake;
        }
        if (typeof time === 'number') {
            if (time < earliestTime) earliestTime = time;
            if (time > latestTime) latestTime = time;
        }
    });

    // Ensure strongestQuakeInCluster is set, even if all magnitudes were null
    if (maxMag === -Infinity && rawCluster.length > 0) {
        maxMag = null; // Explicitly null if no valid mag found
        strongestQuakeInCluster = rawCluster.find(q => q.id === originalClusterIdFromUrl.split('_')[2]) || rawCluster[0];
    }


    const locationName = strongestQuakeInCluster?.properties?.place || 'Unknown Location';
    const quakeCount = rawCluster.length;

    let timeRangeStr = 'Time N/A';
    if (earliestTime !== Infinity && latestTime !== Infinity) {
        const now = Date.now();
        // If the cluster's quakes are all very recent (e.g., within last 24 hours from now)
        // and there's more than one quake to define a duration for the cluster activity itself
        if (now - latestTime < 24 * 60 * 60 * 1000 && quakeCount > 1) {
            const clusterEventDurationMillis = latestTime - earliestTime;
            if (clusterEventDurationMillis < 60 * 1000) { // less than a minute
                timeRangeStr = `Active just now`;
            } else if (clusterEventDurationMillis < 60 * 60 * 1000) { // less than an hour
                 timeRangeStr = `Active over ${Math.round(clusterEventDurationMillis / (60 * 1000))}m`;
            } else { // more than an hour
                 timeRangeStr = `Active over ${formatTimeDurationInternal(clusterEventDurationMillis)}`;
            }
        } else { // Older clusters or single quake "clusters"
            timeRangeStr = `Started ${formatTimeAgoInternal(now - earliestTime)}`;
        }
    }

    return {
        id: originalClusterIdFromUrl, // Use the original clusterId from URL for consistency
        locationName,
        quakeCount,
        maxMagnitude: (typeof maxMag === 'number' ? maxMag : null), // Ensure null if not a number
        timeRange: timeRangeStr,
        originalQuakes: rawCluster,
        // These internal fields might be useful if sorting/filtering directly regenerated clusters later
        _maxMagInternal: (typeof maxMag === 'number' ? maxMag : -Infinity),
        _quakeCountInternal: quakeCount,
        _earliestTimeInternal: earliestTime,
    };
};


/**
 * Wrapper component for ClusterDetailModal to integrate with React Router.
 * It fetches cluster details based on URL parameters and handles navigation.
 * @param {object} props - The component's props.
 * @param {Array<object>} props.overviewClusters - An array of cluster summary objects, used to find the full cluster data. Each object should have an 'id'.
 * @param {function} props.formatDate - Function to format timestamps into human-readable strings.
 * @param {function} props.getMagnitudeColorStyle - Function that returns Tailwind CSS class strings for magnitude-based coloring.
 * @param {function} [props.onIndividualQuakeSelect] - Optional callback function invoked when an individual earthquake within the cluster is selected.
 * @returns {JSX.Element} The rendered ClusterDetailModal or a "not found" message.
 */
function ClusterDetailModalWrapper({ overviewClusters, formatDate, getMagnitudeColorStyle, onIndividualQuakeSelect }) {
    const { clusterId } = useParams();
    const navigate = useNavigate();

    const {
        allEarthquakes,
        earthquakesLast72Hours,
        isLoading: isLoadingContextMonthly, // Renaming to avoid conflict with component's isLoading
        isLoadingDaily,
        isLoadingWeekly,
        loadMonthlyData,
        hasAttemptedMonthlyLoad
    } = useEarthquakeDataState();

    const [localCluster, setLocalCluster] = useState(null);
    const [isLoading, setIsLoading] = useState(false); // Component-level loading for this wrapper's operations
    const [error, setError] = useState(null);
    const [primaryEarthquakeIdForLookup, setPrimaryEarthquakeIdForLookup] = useState(null);
    const [regenerationAttempted, setRegenerationAttempted] = useState(false);

    // Effect 1: Initial check for existing cluster or parse ID for lookup
    useEffect(() => {
        setLocalCluster(null);
        setError(null);
        setPrimaryEarthquakeIdForLookup(null);
        setRegenerationAttempted(false);

        if (!clusterId) {
            setError("No cluster ID provided.");
            setIsLoading(false);
            return;
        }
        if (typeof clusterId !== 'string') {
            setError("Invalid Cluster ID: Must be a string.");
            setIsLoading(false);
            return;
        }

        const existingCluster = overviewClusters?.find(c => c.id === clusterId);
        if (existingCluster) {
            setLocalCluster(existingCluster);
            setIsLoading(false); // Found in overview, no further loading needed from this component
        } else {
            // Not in overviewClusters, try to parse ID for potential regeneration
            console.log(`Cluster ID ${clusterId} not found in overviewClusters. Attempting to parse for direct lookup.`);
            const primaryEarthquakeIdMatch = clusterId.match(/^overview_cluster_([a-zA-Z0-9]+)_\d+$/);
            if (primaryEarthquakeIdMatch && primaryEarthquakeIdMatch[1]) {
                const parsedPrimaryId = primaryEarthquakeIdMatch[1];
                console.log("Parsed primaryEarthquakeId for lookup:", parsedPrimaryId);
                setPrimaryEarthquakeIdForLookup(parsedPrimaryId);
                setIsLoading(true); // Signal that we are now in a lookup/regeneration phase
                // Error and localCluster are already nullified at the start of this effect
            } else {
                setError(`Invalid cluster ID format for direct lookup: ${clusterId}`);
                setIsLoading(false); // Parsing failed, stop loading
            }
        }
    }, [clusterId, overviewClusters]);

    // Effect 2: Data checking and regeneration attempt
    useEffect(() => {
        if (!primaryEarthquakeIdForLookup || isLoading === false) {
            // Do not run if no ID to lookup, or if the first effect hasn't set isLoading to true for lookup,
            // or if any regeneration process has completed (isLoading set to false).
            // This check `isLoading === false` is crucial to prevent running when Effect 1 found an existing cluster.
            // Effectively, this effect only runs when primaryEarthquakeIdForLookup is set AND Effect 1 has set isLoading to true.
            if (primaryEarthquakeIdForLookup && isLoading === false && !localCluster && !error && !regenerationAttempted) {
                 // This condition means Effect 1 parsed an ID, but then something else (like this effect previously)
                 // set isLoading to false without finding a cluster or setting an error from this effect.
                 // This can happen if data wasn't ready, then data becomes ready.
                 // We might need to re-trigger loading IF data dependencies changed.
                 // For simplicity in this step, we'll mostly rely on primaryEarthquakeIdForLookup change or initial isLoading=true.
            } else {
                 return; // Main early exit path if no ID, or Effect 1 not loading, or lookup completed.
            }
        }

        // At this point, primaryEarthquakeIdForLookup is set, and component's isLoading is true.
        // This means Effect 1 has initiated a lookup.

        // Check if any relevant earthquake data sources from context are still actively loading.
        if (isLoadingContextMonthly || isLoadingDaily || isLoadingWeekly) {
            console.log("Context data is still loading (monthly, daily, or weekly). Deferring regeneration check for:", primaryEarthquakeIdForLookup);
            // Component's isLoading remains true. Effect will re-run when context loading states change.
            return;
        }

        // Scenario 1: Check if primary quake is in allEarthquakes (if available and loaded)
        if (allEarthquakes && allEarthquakes.length > 0) {
            const primaryQuakeInDataSource = allEarthquakes.find(q => q.id === primaryEarthquakeIdForLookup);
            if (primaryQuakeInDataSource) {
                console.log("Primary quake found in allEarthquakes. Attempting regeneration with allEarthquakes as source for:", primaryEarthquakeIdForLookup);
                const rawRegeneratedCluster = regenerateClusterAroundQuake(
                    primaryQuakeInDataSource,
                    allEarthquakes,
                    CLUSTER_MAX_DISTANCE_KM,
                    CLUSTER_MIN_QUAKES,
                    calculateDistance
                );

                setRegenerationAttempted(true);
                if (rawRegeneratedCluster) {
                    console.log("Successfully regenerated raw cluster with N quakes:", rawRegeneratedCluster.length, "from allEarthquakes");
                    const formattedCluster = formatRawClusterForDisplay(rawRegeneratedCluster, clusterId);
                    if (formattedCluster) {
                        setLocalCluster(formattedCluster);
                        setError(null);
                    } else {
                        setError(`Failed to format regenerated cluster for ${primaryEarthquakeIdForLookup} from allEarthquakes.`);
                        setLocalCluster(null);
                    }
                } else {
                    setError(`Could not regenerate a cluster around earthquake ${primaryEarthquakeIdForLookup} using allEarthquakes (not enough quakes or invalid primary).`);
                    setLocalCluster(null);
                }
                setIsLoading(false);
                return;
            }
            // Quake not in allEarthquakes.
            // If monthly load was attempted and finished, this is a final failure for the monthly data source.
            if (hasAttemptedMonthlyLoad && !isLoadingContextMonthly) {
                console.log("Primary quake ${primaryEarthquakeIdForLookup} not found in allEarthquakes after monthly load attempt.");
                setError(`Primary earthquake ${primaryEarthquakeIdForLookup} not found in loaded monthly data.`);
                setIsLoading(false);
                setRegenerationAttempted(true);
                return;
            }
        }

        // Scenario 2: Need to Load Monthly Data
        // This condition is met if allEarthquakes is not populated (or empty) AND monthly load hasn't been attempted AND it's not currently loading.
        if ((!allEarthquakes || allEarthquakes.length === 0) && !hasAttemptedMonthlyLoad && !isLoadingContextMonthly) {
            console.log("allEarthquakes not populated or quake not found yet. Attempting to load monthly data for:", primaryEarthquakeIdForLookup);
            loadMonthlyData();
            // isLoading (component state) remains true. regenerationAttempted remains false. Effect will re-run when isLoadingContextMonthly changes.
            return;
        }

        // Scenario 4 (continued): Monthly Data Load Attempted but allEarthquakes is still empty
        // This implies the load finished (isLoadingContextMonthly is false) but resulted in no data.
        if (hasAttemptedMonthlyLoad && !isLoadingContextMonthly && (!allEarthquakes || allEarthquakes.length === 0)) {
            console.log("Monthly data load attempted, but allEarthquakes is empty for:", primaryEarthquakeIdForLookup);
            setError(`Failed to load monthly data, or it was empty, for primary quake ${primaryEarthquakeIdForLookup}.`);
            setIsLoading(false);
            setRegenerationAttempted(true);
            return;
        }

        // Scenario 3: Check earthquakesLast72Hours if not found/processed via allEarthquakes.
        // This is relevant if allEarthquakes isn't populated and monthly load isn't pending or has failed.
        if (earthquakesLast72Hours && earthquakesLast72Hours.length > 0) {
            const primaryQuakeInDataSource = earthquakesLast72Hours.find(q => q.id === primaryEarthquakeIdForLookup);
            if (primaryQuakeInDataSource) {
                console.log("Primary quake found in earthquakesLast72Hours. Attempting regeneration with 72-hour data as source for:", primaryEarthquakeIdForLookup);
                const rawRegeneratedCluster = regenerateClusterAroundQuake(
                    primaryQuakeInDataSource,
                    earthquakesLast72Hours,
                    CLUSTER_MAX_DISTANCE_KM,
                    CLUSTER_MIN_QUAKES,
                    calculateDistance
                );

                setRegenerationAttempted(true);
                if (rawRegeneratedCluster) {
                    console.log("Successfully regenerated raw cluster with N quakes:", rawRegeneratedCluster.length, "from 72-hour data");
                    const formattedCluster = formatRawClusterForDisplay(rawRegeneratedCluster, clusterId);
                    if (formattedCluster) {
                        setLocalCluster(formattedCluster);
                        setError(null);
                    } else {
                        setError(`Failed to format regenerated cluster for ${primaryEarthquakeIdForLookup} from 72-hour data.`);
                        setLocalCluster(null);
                    }
                } else {
                    setError(`Could not regenerate a cluster around earthquake ${primaryEarthquakeIdForLookup} using 72-hour data (not enough quakes or invalid primary).`);
                    setLocalCluster(null);
                }
                setIsLoading(false);
                return;
            }
        }

        // Scenario 5: Fallback / Exhausted options
        // If we've reached here, it means:
        // - Quake not in allEarthquakes (or allEarthquakes empty and monthly load cycle complete).
        // - Monthly load not triggered (e.g. already attempted or conditions not met).
        // - Quake not in 72-hour data (or 72-hour data empty).
        // - And not yet set regenerationAttempted from one of the direct failure paths above for this cycle.
        if (!regenerationAttempted) {
             console.log("Primary quake ${primaryEarthquakeIdForLookup} not found in any available datasets or data loading paths exhausted.");
            setError(`Primary earthquake ${primaryEarthquakeIdForLookup} could not be found in available datasets after checking all sources.`);
            setIsLoading(false);
            setRegenerationAttempted(true);
        }

    }, [
        primaryEarthquakeIdForLookup,
        isLoading, // Component's own loading state
        allEarthquakes,
        earthquakesLast72Hours,
        isLoadingContextMonthly,
        isLoadingDaily,
        isLoadingWeekly,
        regenerationAttempted,
        loadMonthlyData,
        hasAttemptedMonthlyLoad
    ]);

    const handleClose = () => {
        navigate(-1); // Go back to the previous page
    };

    const canonicalUrl = `https://earthquakeslive.com/cluster/${clusterId}`;

    if (isLoading) {
        return (
            <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
                <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700">
                    Loading cluster details...
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <>
                <SeoMetadata
                    title="Error Loading Cluster | Seismic Monitor"
                    description={error} // Use the error message in SEO description
                    pageUrl={canonicalUrl}
                    canonicalUrl={canonicalUrl}
                    locale="en_US"
                />
                <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700">
                        <h2 className="text-xl font-semibold text-red-400 mb-3">Error</h2>
                        <p className="text-sm mb-4">{error}</p>
                        <button
                            onClick={handleClose}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors"
                        >
                            Go Back
                        </button>
                    </div>
                </div>
            </>
        );
    }

    if (!localCluster) {
        // This case handles when not loading, no error, but cluster is null (e.g. not found after simulated fetch)
        return (
            <>
                <SeoMetadata
                    title="Cluster Not Found | Seismic Monitor"
                    description="The requested earthquake cluster details could not be found after checking all sources."
                    pageUrl={canonicalUrl}
                    canonicalUrl={canonicalUrl}
                    locale="en_US"
                />
                <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700">
                        <h2 className="text-xl font-semibold text-amber-400 mb-3">Cluster Not Found</h2>
                        <p className="text-sm mb-4">The cluster details for ID '{clusterId}' could not be found. It might have expired, the link may be incorrect, or direct lookup failed.</p>
                        <button
                            onClick={handleClose}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors"
                        >
                            Go Back
                        </button>
                    </div>
                </div>
            </>
        );
    }

    const pageTitle = localCluster.locationName ? `Active Earthquake Cluster near ${localCluster.locationName} | Details & Map` : "Earthquake Cluster Details | Seismic Monitor";
    const pageDescription = `Details for an active earthquake cluster near ${localCluster.locationName || 'Unknown Location'}. Includes ${localCluster.quakeCount} quakes, max magnitude M ${localCluster.maxMagnitude?.toFixed(1)}, active over ${localCluster.timeRange}.`;
    const keywords = `earthquake cluster, ${localCluster.locationName}, seismic activity, ${localCluster.quakeCount} earthquakes, M ${localCluster.maxMagnitude?.toFixed(1)}, earthquake swarm`;

    return (
        <>
            <SeoMetadata
                title={pageTitle}
                description={pageDescription}
                keywords={keywords}
                pageUrl={canonicalUrl}
                canonicalUrl={canonicalUrl}
                locale="en_US"
                type="website" // Or "Event" if more appropriate, but website is safe
            />
            <ClusterDetailModal
                cluster={localCluster}
                onClose={handleClose}
            formatDate={formatDate}
            getMagnitudeColorStyle={getMagnitudeColorStyle}
            onIndividualQuakeSelect={onIndividualQuakeSelect} // Pass this down
        />
        </>
    );
}

export default ClusterDetailModalWrapper;
