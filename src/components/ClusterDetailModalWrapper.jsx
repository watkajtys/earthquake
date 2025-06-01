// src/components/ClusterDetailModalWrapper.jsx
import React, { useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEarthquakeDataState } from '../context/EarthquakeDataContext.jsx'; // Corrected path
import ClusterDetailModal from './ClusterDetailModal';
import SeoMetadata from './SeoMetadata';
import {
    findActiveClusters,
    formatDate as formatDateUtil,
    getMagnitudeColorStyle as getMagnitudeColorStyleUtil,
    formatTimeAgo as formatTimeAgoUtil,
    formatTimeDuration as formatTimeDurationUtil
} from '../utils/utils.js';
import { CLUSTER_MAX_DISTANCE_KM, CLUSTER_MIN_QUAKES, TOP_N_CLUSTERS_OVERVIEW } from '../constants/appConstants.js'; // Corrected path


// This function re-processes raw clusters into a format similar to the old `overviewClusters`
// This is crucial for ID matching and providing consistent data to ClusterDetailModal.
const processSingleClusterForDetail = (rawCluster, formatDateFn, formatTimeAgoFn, formatTimeDurationFn) => {
    if (!rawCluster || rawCluster.length === 0) return null;

    let maxMag = -Infinity;
    let earliestTime = Infinity;
    let latestTime = -Infinity;
    let strongestQuakeInCluster = null;

    rawCluster.forEach(quake => {
        if (quake.properties.mag > maxMag) {
            maxMag = quake.properties.mag;
            strongestQuakeInCluster = quake;
        }
        if (quake.properties.time < earliestTime) earliestTime = quake.properties.time;
        if (quake.properties.time > latestTime) latestTime = quake.properties.time;
    });

    if (!strongestQuakeInCluster) strongestQuakeInCluster = rawCluster[0];
    const locationName = strongestQuakeInCluster.properties.place || 'Unknown Location';

    let timeRangeStr = 'Time N/A';
    const now = Date.now();
    if (earliestTime !== Infinity) {
        if (now - latestTime < 24 * 36e5 && rawCluster.length > 1) {
            const clusterDurationMillis = latestTime - earliestTime;
            if (clusterDurationMillis < 6e4) timeRangeStr = `Active just now`;
            else if (clusterDurationMillis < 36e5) timeRangeStr = `Active over ${Math.round(clusterDurationMillis / 6e4)}m`;
            else timeRangeStr = `Active over ${formatTimeDurationFn(clusterDurationMillis)}`;
        } else {
            timeRangeStr = `Started ${formatTimeAgoFn(now - earliestTime)}`;
        }
    }

    return {
        id: `overview_cluster_${strongestQuakeInCluster.id}_${rawCluster.length}`,
        locationName,
        quakeCount: rawCluster.length,
        maxMagnitude: maxMag,
        timeRange: timeRangeStr,
        originalQuakes: rawCluster,
        // Add any other fields ClusterDetailModal might expect from the original overviewClusters structure
        _maxMagInternal: maxMag, // For potential internal use if sorting/filtering were done here
        _quakeCountInternal: rawCluster.length,
        _earliestTimeInternal: earliestTime,
    };
};


const ClusterDetailModalWrapper = () => {
    const { clusterId } = useParams();
    const navigate = useNavigate();
    const {
        earthquakesLast72Hours, // Source data for clusters
        formatDate: formatDateFromContext,
        formatTimeAgo: formatTimeAgoFromContext,
        formatTimeDuration: formatTimeDurationFromContext,
    } = useEarthquakeDataState();

    // Use utility functions, preferring context versions if available, otherwise from utils.js
    const formatDate = formatDateFromContext || formatDateUtil;
    const formatTimeAgo = formatTimeAgoFromContext || formatTimeAgoUtil;
    const formatTimeDuration = formatTimeDurationFromContext || formatTimeDurationUtil;


    const activeClustersRaw = useMemo(() => {
        if (!earthquakesLast72Hours || earthquakesLast72Hours.length === 0) return [];
        return findActiveClusters(earthquakesLast72Hours, CLUSTER_MAX_DISTANCE_KM, CLUSTER_MIN_QUAKES);
    }, [earthquakesLast72Hours]);

    const targetCluster = useMemo(() => {
        if (!clusterId || !activeClustersRaw) return null;
        // Find the raw cluster that would generate this ID.
        // This requires iterating and partially processing each raw cluster to match the ID format.
        for (const rawCluster of activeClustersRaw) {
            if (!rawCluster || rawCluster.length === 0) continue;
            let sQuake = rawCluster[0]; // Simplified assumption for ID generation
            rawCluster.forEach(q => { if(q.properties.mag > (sQuake.properties.mag || -Infinity)) sQuake = q});
            const generatedId = `overview_cluster_${sQuake.id}_${rawCluster.length}`;
            if (generatedId === clusterId) {
                // If found, fully process this specific cluster
                return processSingleClusterForDetail(rawCluster, formatDate, formatTimeAgo, formatTimeDuration);
            }
        }
        return null; // Cluster not found
    }, [clusterId, activeClustersRaw, formatDate, formatTimeAgo, formatTimeDuration]);

    const handleIndividualQuakeSelect = useCallback((quake) => {
        const detailUrl = quake?.properties?.detail || quake?.properties?.url;
        if (detailUrl) {
            navigate(`/quake/${encodeURIComponent(detailUrl)}`);
        } else {
            console.warn("No detail URL for quake:", quake);
            alert(`Quake: M ${quake?.properties?.mag?.toFixed(1)} - ${quake?.properties?.place}`);
        }
    }, [navigate]);

    const handleClose = () => {
        navigate(-1); // Go back to the previous page
    };

    const canonicalUrl = `https://earthquakeslive.com/cluster/${clusterId}`;

    if (!targetCluster) {
        return (
            <>
                <SeoMetadata
                    title="Cluster Not Found | Seismic Monitor"
                    description="The requested earthquake cluster details could not be found."
                    pageUrl={canonicalUrl}
                    canonicalUrl={canonicalUrl}
                    locale="en_US"
                />
                <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700">
                        <h2 className="text-xl font-semibold text-amber-400 mb-3">Cluster Not Found</h2>
                        <p className="text-sm mb-4">The cluster details could not be found. It might have expired, or the data is still loading.</p>
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

    const pageTitle = targetCluster.locationName ? `Active Earthquake Cluster near ${targetCluster.locationName} | Details & Map` : "Earthquake Cluster Details | Seismic Monitor";
    const pageDescription = `Details for an active earthquake cluster near ${targetCluster.locationName || 'Unknown Location'}. Includes ${targetCluster.quakeCount} quakes, max magnitude M ${targetCluster.maxMagnitude?.toFixed(1)}, active over ${targetCluster.timeRange}.`;
    const keywords = `earthquake cluster, ${targetCluster.locationName}, seismic activity, ${targetCluster.quakeCount} earthquakes, M ${targetCluster.maxMagnitude?.toFixed(1)}, earthquake swarm`;

    return (
        <>
            <SeoMetadata
                title={pageTitle}
                description={pageDescription}
                keywords={keywords}
                pageUrl={canonicalUrl}
                canonicalUrl={canonicalUrl}
                locale="en_US"
                type="website"
            />
            <ClusterDetailModal
                cluster={targetCluster}
                onClose={handleClose}
                formatDate={formatDate} // Pass the resolved formatDate
                getMagnitudeColorStyle={getMagnitudeColorStyleUtil} // Use imported util
                onIndividualQuakeSelect={handleIndividualQuakeSelect}
            />
        </>
    );
};

export default ClusterDetailModalWrapper;
