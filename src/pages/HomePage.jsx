// src/pages/HomePage.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { useNavigate, useParams } from 'react-router-dom'; // Removed useSearchParams
import { useEarthquakeDataState } from '../context/EarthquakeDataContext.jsx';
import SeoMetadata from '../components/SeoMetadata';
import DesktopSidebar from '../components/DesktopSidebar.jsx'; // Import DesktopSidebar
import InteractiveGlobeView from '../components/InteractiveGlobeView';
import NotableQuakeFeature from '../components/NotableQuakeFeature';
import PreviousNotableQuakeFeature from '../components/PreviousNotableQuakeFeature';
import InfoSnippet from '../components/InfoSnippet';
import coastlineData from '../assets/ne_110m_coastline.json';
import tectonicPlatesData from '../assets/TectonicPlateBoundaries.json';
import GlobalLastMajorQuakeTimer from "../components/GlobalLastMajorQuakeTimer.jsx";
// BottomNav is now in App.jsx
import ClusterSummaryItem from '../components/ClusterSummaryItem';
import ClusterDetailModal from '../components/ClusterDetailModal'; // This is for the cluster map point, not the route component
// import ClusterDetailModalWrapper from '../components/ClusterDetailModalWrapper.jsx'; // This component is now routed in App.jsx

// Import utilities
import {
    calculateDistance, // Already here, used by findActiveClusters if local
    getMagnitudeColor, // Already here, can be used by components directly or passed
    getMagnitudeColorStyle,
    formatDate as formatDateUtil, // Renamed to avoid conflict if context provides one
    formatTimeDuration as formatTimeDurationUtil, // Renamed
    calculateStats as calculateStatsUtil, // Renamed
    getRegionForEarthquake as getRegionForEarthquakeUtil, // Renamed
    findActiveClusters
} from '../utils/utils.js';

// Import newly created components (ensure paths are correct if these were moved or are standard)
import SkeletonText from '../components/SkeletonText';
import SkeletonBlock from '../components/SkeletonBlock';
import SkeletonListItem from '../components/SkeletonListItem';
import SkeletonTableRow from '../components/SkeletonTableRow';
import TimeSinceLastMajorQuakeBanner from '../components/TimeSinceLastMajorQuakeBanner';
import SummaryStatisticsCard from '../components/SummaryStatisticsCard';
// RegionalDistributionList will be lazy loaded
// MagnitudeDistributionSVGChart will be lazy loaded
// EarthquakeTimelineSVGChart will be lazy loaded
// MagnitudeDepthScatterSVGChart will be lazy loaded
// PaginatedEarthquakeTable will be lazy loaded
// FeedsPageLayoutComponent will be lazy loaded
// EarthquakeDetailModalComponent will be lazy loaded
import {
    CLUSTER_MAX_DISTANCE_KM, // For findActiveClusters
    CLUSTER_MIN_QUAKES,      // For findActiveClusters
    FELT_REPORTS_THRESHOLD,
    SIGNIFICANCE_THRESHOLD,
    TOP_N_CLUSTERS_OVERVIEW,
    // REGIONS is now sourced from context or utils
    FEELABLE_QUAKE_THRESHOLD,
    MAJOR_QUAKE_THRESHOLD,
    ALERT_LEVELS,
    // Constants used by hooks are no longer needed here directly
} from '../constants/appConstants';


// Lazy load components used directly by HomePage's JSX (if any were previously route-level components)
// FeedsPageLayoutComponent, EarthquakeDetailModalComponent etc. are now routed in App.jsx

// Lazy load other heavy/conditional components for the sidebar (These are fine)
const RegionalDistributionList = lazy(() => import('../components/RegionalDistributionList'));
const MagnitudeDistributionSVGChart = lazy(() => import('../components/MagnitudeDistributionSVGChart'));
const EarthquakeTimelineSVGChart = lazy(() => import('../components/EarthquakeTimelineSVGChart'));
const MagnitudeDepthScatterSVGChart = lazy(() => import('../components/MagnitudeDepthScatterSVGChart'));
const PaginatedEarthquakeTable = lazy(() => import('../components/PaginatedEarthquakeTable'));

/**
 * Calculates the distance between two geographical coordinates using the Haversine formula.
 * @param {number} lat1 Latitude of the first point.
 * @param {number} lon1 Longitude of the first point.
 * @param {number} lat2 Latitude of the second point.
/**
 * Finds clusters of earthquakes based on proximity and time.
 * @param {Array<object>} earthquakes - Array of earthquake objects. Expected to have `properties.time` and `geometry.coordinates`.
 * @param {number} maxDistanceKm - Maximum distance between quakes to be considered in the same cluster.
 * @param {number} minQuakes - Minimum number of quakes to form a valid cluster.
 */
// function findActiveClusters(earthquakes, maxDistanceKm, minQuakes) { ... } // Removed, to be handled by context or utils

// --- HomePage Component (Previously App) ---
/**
 * The HomePage component for the Global Seismic Activity Monitor.
 * It focuses on displaying the main interactive globe, notable quake features,
 * and related information. Data fetching and global state management are primarily
 * handled by custom hooks, and routing is managed by the parent App component.
 * @returns {JSX.Element} The rendered HomePage component.
 */
function HomePage() {
    // Consume data from context
    const contextState = useEarthquakeDataState();
    const {
        isLoadingDaily, isLoadingWeekly, isLoadingInitialData, error,
        earthquakesLastHour, earthquakesLast24Hours, earthquakesLast72Hours, earthquakesLast7Days,
        prev24HourData, globeEarthquakes, hasRecentTsunamiWarning, highestRecentAlert,
        activeAlertTriggeringQuakes, lastMajorQuake, previousMajorQuake, timeBetweenPreviousMajorQuakes,
        isInitialAppLoad, isLoadingMonthly, hasAttemptedMonthlyLoad, monthlyError, allEarthquakes,
        earthquakesLast14Days, earthquakesLast30Days, // Made available from context
        prev7DayDataForMonthly, prev14DayDataForMonthly, // Made available from context
        loadMonthlyData,
        // Utilities from context (use directly or pass to children)
        formatTimeAgo: formatTimeAgoFromContext,
        formatDate: formatDateFromContext, // Note: context provides one, utils provides one. Decide which to use or ensure consistency.
        formatTimeDuration: formatTimeDurationFromContext,
        // The following are not in context by default, so use utils versions
        // getMagnitudeColor, // From utils
        // getMagnitudeColorStyle, // From utils
        // calculateStats, // From utils
        // getRegionForEarthquake, // From utils
        // REGIONS // From utils (via AppRegions import)
    } = contextState;

    // Use utility functions directly, or from context if provided
    const formatDate = formatDateFromContext || formatDateUtil;
    const formatTimeAgo = formatTimeAgoFromContext || ((ms) => new Date(ms).toLocaleTimeString()); // Basic fallback for formatTimeAgo if not in context
    const formatTimeDuration = formatTimeDurationFromContext || formatTimeDurationUtil;
    // getMagnitudeColor is already imported from utils
    // getMagnitudeColorStyle is already imported from utils
    // calculateStats is already imported from utils as calculateStatsUtil
    // getRegionForEarthquake is already imported from utils as getRegionForEarthquakeUtil


    const [activeFeedPeriod, setActiveFeedPeriod] = useState('last_24_hours');

    // --- Component State ---
    // const [searchParams, setSearchParams] = useSearchParams(); // Moved to DesktopSidebar or not used
    // const [activeSidebarView, setActiveSidebarView] = useState(searchParams.get('sidebarActiveView') || 'overview_panel'); // Moved
    const [globeFocusLng, setGlobeFocusLng] = useState(0); // Remains for globe focus
    const [focusedNotableQuake, setFocusedNotableQuake] = useState(null); // Remains for globe interaction
    const [activeClusters, setActiveClusters] = useState([]); // Remains, calculated from context

    // changeSidebarView is removed as DesktopSidebar manages its own view state.

    const latestFeelableQuakesSnippet = useMemo(() => {
        if (!earthquakesLast24Hours || earthquakesLast24Hours.length === 0) return [];
        return earthquakesLast24Hours
            .filter(q => q.properties.mag !== null && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD)
            .sort((a, b) => b.properties.time - a.properties.time)
            .slice(0, 3);
    }, [earthquakesLast24Hours]);

    const currentFeedData = useMemo(() => {
        const baseDataForFilters = (hasAttemptedMonthlyLoad && allEarthquakes.length > 0) ? allEarthquakes : earthquakesLast7Days;
        switch (activeFeedPeriod) {
            case 'last_hour': return earthquakesLastHour;
            case 'last_24_hours': return earthquakesLast24Hours;
            case 'last_7_days': return earthquakesLast7Days;
            case 'last_14_days': return (hasAttemptedMonthlyLoad && allEarthquakes.length > 0) ? earthquakesLast14Days : null;
            case 'last_30_days': return (hasAttemptedMonthlyLoad && allEarthquakes.length > 0) ? earthquakesLast30Days : null;
            case 'feelable_quakes': return baseDataForFilters ? baseDataForFilters.filter(q => q.properties.mag !== null && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD) : [];
            case 'significant_quakes': return baseDataForFilters ? baseDataForFilters.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD) : [];
            default: return earthquakesLast24Hours;
        }
    }, [activeFeedPeriod, earthquakesLastHour, earthquakesLast24Hours, earthquakesLast7Days,
        earthquakesLast14Days, earthquakesLast30Days, // from useMonthlyEarthquakeData
        allEarthquakes, hasAttemptedMonthlyLoad // from useMonthlyEarthquakeData
    ]);

    const currentFeedTitle = useMemo(() => {
        const filterPeriodSuffix = (hasAttemptedMonthlyLoad && allEarthquakes.length > 0) ? "(Last 30 Days)" : "(Last 7 Days)";
        switch (activeFeedPeriod) {
            case 'last_hour': return "Earthquakes (Last Hour)";
            case 'last_24_hours': return "Earthquakes (Last 24 Hours)";
            case 'last_7_days': return "Earthquakes (Last 7 Days)";
            case 'last_14_days': return "Earthquakes (Last 14 Days)";
            case 'last_30_days': return "Earthquakes (Last 30 Days)";
            case 'feelable_quakes': return `Feelable Quakes (M${FEELABLE_QUAKE_THRESHOLD.toFixed(1)}+) ${filterPeriodSuffix}`;
            case 'significant_quakes': return `Significant Quakes (M${MAJOR_QUAKE_THRESHOLD.toFixed(1)}+) ${filterPeriodSuffix}`;
            default: return "Earthquakes (Last 24 Hours)";
        }
    }, [activeFeedPeriod, hasAttemptedMonthlyLoad, allEarthquakes]);

    const currentFeedisLoading = useMemo(() => {
        if (activeFeedPeriod === 'last_hour') return isLoadingDaily && (!earthquakesLastHour || earthquakesLastHour.length === 0);
        if (activeFeedPeriod === 'last_24_hours') return isLoadingDaily && (!earthquakesLast24Hours || earthquakesLast24Hours.length === 0);
        if (activeFeedPeriod === 'last_7_days') return isLoadingWeekly && (!earthquakesLast7Days || earthquakesLast7Days.length === 0);
        if (activeFeedPeriod === 'feelable_quakes' || activeFeedPeriod === 'significant_quakes') {
            if (hasAttemptedMonthlyLoad && allEarthquakes.length > 0) return isLoadingMonthly && allEarthquakes.length === 0;
            return isLoadingWeekly && (!earthquakesLast7Days || earthquakesLast7Days.length === 0);
        }
        if ((activeFeedPeriod === 'last_14_days' || activeFeedPeriod === 'last_30_days')) {
            return isLoadingMonthly && (!allEarthquakes || allEarthquakes.length === 0);
        }
        return currentFeedData === null;
    }, [activeFeedPeriod, isLoadingDaily, isLoadingWeekly, isLoadingMonthly,
        earthquakesLastHour, earthquakesLast24Hours, earthquakesLast7Days,
        allEarthquakes, hasAttemptedMonthlyLoad, currentFeedData]);

    const previousDataForCurrentFeed = useMemo(() => {
        switch (activeFeedPeriod) {
            case 'last_hour': return earthquakesPriorHour;
            case 'last_24_hours': return prev24HourData; // from useEarthquakeData
            case 'last_7_days': return prev7DayData;     // from useMonthlyEarthquakeData
            case 'last_14_days': return prev14DayData;   // from useMonthlyEarthquakeData
            default: return null;
        }
    }, [activeFeedPeriod, earthquakesPriorHour, prev24HourData, prev7DayData, prev14DayData]);

    // loadMonthlyData is now from context.

    useEffect(() => {
        if (earthquakesLast72Hours && earthquakesLast72Hours.length > 0) {
            const found = findActiveClusters(earthquakesLast72Hours, CLUSTER_MAX_DISTANCE_KM, CLUSTER_MIN_QUAKES, calculateDistance);
            setActiveClusters(found);
        } else {
            setActiveClusters([]);
        }
    }, [earthquakesLast72Hours]);

    useEffect(() => {
        if (lastMajorQuake && lastMajorQuake.geometry && lastMajorQuake.geometry.coordinates && lastMajorQuake.geometry.coordinates.length >= 2) {
            const lng = lastMajorQuake.geometry.coordinates[0];
            if (typeof lng === 'number' && !isNaN(lng)) {
                // setGlobeFocusLat(lat); // Removed
                setGlobeFocusLng(lng);
            }
        }
        // If lastMajorQuake is null, we could reset to defaults here, e.g.:
        // else {
        //   setGlobeFocusLng(0);  // Default longitude
        // }
    }, [lastMajorQuake]);

    // --- UI Calculations & Memos ---
    // showFullScreenLoader is removed.
    // RouteLoadingFallback is removed (now in App.jsx)

    const ChartLoadingFallback = ({ message = "Loading data..." }) => ( // This can stay if used by components within HomePage
        <div className="p-4 text-center text-slate-400">{message}</div>
    );

    // headerTimeDisplay is removed.

    const currentAlertConfig = useMemo(() => {
        if (highestRecentAlert && ALERT_LEVELS[highestRecentAlert.toUpperCase()]) {
            return ALERT_LEVELS[highestRecentAlert.toUpperCase()];
        }
        return null;
    }, [highestRecentAlert]);

    const keyStatsForGlobe = useMemo(() => {
        if (isLoadingInitialData || !earthquakesLast24Hours || !earthquakesLast72Hours) {
            return {
                lastHourCount: <SkeletonText width="w-6" height="h-6" className="inline-block bg-slate-600" />,
                count24h: <SkeletonText width="w-8" height="h-6" className="inline-block bg-slate-600" />,
                count72h: <SkeletonText width="w-8" height="h-6" className="inline-block bg-slate-600" />,
                strongest24h: <SkeletonText width="w-12" height="h-6" className="inline-block bg-slate-600" />,
            };
        }
        const stats24h = calculateStatsUtil(earthquakesLast24Hours, FEELABLE_QUAKE_THRESHOLD);
        const stats72h = calculateStatsUtil(earthquakesLast72Hours, FEELABLE_QUAKE_THRESHOLD);
        return {
            lastHourCount: earthquakesLastHour?.length || 0,
            count24h: stats24h.totalEarthquakes,
            count72h: stats72h.totalEarthquakes,
            strongest24h: stats24h.strongestMagnitude !== 'N/A' ? `M ${stats24h.strongestMagnitude}` : 'N/A',
        };
    }, [earthquakesLastHour, earthquakesLast24Hours, earthquakesLast72Hours, isLoadingInitialData]);

    const recentSignificantQuakesForOverview = useMemo(() => {
        if (!earthquakesLast7Days) return [];
        return earthquakesLast7Days
            .filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD)
            .sort((a, b) => b.properties.time - a.properties.time);
    }, [earthquakesLast7Days]);

    // --- ADDED: Memo for most active region for the overview panel ---
    const topActiveRegionsOverview = useMemo(() => {
        if (!earthquakesLast24Hours || earthquakesLast24Hours.length === 0) {
            return [];
        }
        // REGIONS constant is now imported from appConstants via utils.js (as AppRegions)
        const counts = AppRegions.map(r => ({ ...r, count: 0 }));
        earthquakesLast24Hours.forEach(q => {
            const region = getRegionForEarthquakeUtil(q, AppRegions);
            const regionCounter = counts.find(r => r.name === region.name);
            if (regionCounter) regionCounter.count++;
        });
        const sortedRegions = counts.filter(r => r.count > 0).sort((a, b) => b.count - a.count);
        return sortedRegions.slice(0,2);
    }, [earthquakesLast24Hours]);

    const overviewClusters = useMemo(() => {
        if (!activeClusters || activeClusters.length === 0) return [];

        const processed = activeClusters.map(cluster => {
            if (!cluster || cluster.length === 0) return null;
            let maxMag = -Infinity, earliestTime = Infinity, latestTime = -Infinity, strongestQuakeInCluster = null;
            cluster.forEach(quake => {
                if (quake.properties.mag > maxMag) { maxMag = quake.properties.mag; strongestQuakeInCluster = quake; }
                if (quake.properties.time < earliestTime) earliestTime = quake.properties.time;
                if (quake.properties.time > latestTime) latestTime = quake.properties.time;
            });
            if (!strongestQuakeInCluster) strongestQuakeInCluster = cluster[0];
            const locationName = strongestQuakeInCluster.properties.place || 'Unknown Location';
            let timeRangeStr = 'Time N/A';
            const now = Date.now();
            if (earliestTime !== Infinity) {
                if (now - latestTime < 24 * 36e5 && cluster.length > 1) {
                    const clusterDurationMillis = latestTime - earliestTime;
                    if (clusterDurationMillis < 6e4) timeRangeStr = `Active just now`;
                    else if (clusterDurationMillis < 36e5) timeRangeStr = `Active over ${Math.round(clusterDurationMillis / 6e4)}m`;
                    else timeRangeStr = `Active over ${formatTimeDuration(clusterDurationMillis)}`;
                } else timeRangeStr = `Started ${formatTimeAgo(now - earliestTime)}`;
            }
            return {
                id: `overview_cluster_${strongestQuakeInCluster.id}_${cluster.length}`, locationName,
                quakeCount: cluster.length, maxMagnitude: maxMag, timeRange: timeRangeStr,
                _maxMagInternal: maxMag, _quakeCountInternal: cluster.length, _earliestTimeInternal: earliestTime,
                originalQuakes: cluster,
            };
        }).filter(Boolean);
        processed.sort((a, b) => b._maxMagInternal - a._maxMagInternal || b._quakeCountInternal - a._quakeCountInternal);
        return processed.slice(0, TOP_N_CLUSTERS_OVERVIEW);
    }, [activeClusters, formatTimeDuration, formatTimeAgo, formatDate]); // Use formatters from context/utils

    // --- Event Handlers ---
    const navigate = useNavigate();
    const handleQuakeClick = useCallback((quake) => {
        // --- NEW LOGIC ---
        if (quake?.isCluster && quake?.clusterDetails) {
            // This is a cluster point
            const clusterInfo = quake.clusterDetails;
            const numQuakesDisplay = clusterInfo.quakes.length;
            const maxMagDisplay = quake.properties.mag; // This was set to maxMag of cluster

            let message = `Cluster Information:\n`;
            message += `------------------------\n`;
            message += `Total Earthquakes: ${numQuakesDisplay}\n`;
            message += `Maximum Magnitude: M ${maxMagDisplay?.toFixed(1)}\n`;
            message += `Earthquakes in Cluster (up to 5 shown):\n`;

            clusterInfo.quakes.slice(0, 5).forEach((q, index) => {
                message += `  ${index + 1}. M ${q.mag?.toFixed(1)} - ${q.place}\n`;
            });
            if (clusterInfo.quakes.length > 5) {
                message += `  ...and ${clusterInfo.quakes.length - 5} more.\n`;
            }

            alert(message);
            // Optionally, you could also log to console for more detailed inspection
            console.log("Cluster clicked:", quake);

        } else {
            // Existing logic for individual earthquake clicks
            const detailUrl = quake?.properties?.detail || quake?.properties?.url; // Check both common USGS fields
            if (detailUrl) {
                navigate(`/quake/${encodeURIComponent(detailUrl)}`);
            } else {
                console.warn("No detail URL for individual earthquake:", quake?.id, quake);
                // Fallback alert if no detail URL for a non-cluster point
                alert(`Earthquake: M ${quake?.properties?.mag?.toFixed(1)} - ${quake?.properties?.place || 'Unknown location'}. No further details link available.`);
            }
        }
    }, [navigate]);

    // Helper function for /feeds SEO
    const getFeedPageSeoInfo = (feedTitle, activePeriod) => {
        let periodDescription = "the latest updates";
        let periodKeywords = "earthquake feed, live seismic data";

        switch (activePeriod) {
            case 'last_hour':
                periodDescription = "the last hour";
                periodKeywords = "last hour earthquakes, real-time seismic events";
                break;
            case 'last_24_hours':
                periodDescription = "the last 24 hours";
                periodKeywords = "24 hour earthquakes, daily seismic summary";
                break;
            case 'last_7_days':
                periodDescription = "the last 7 days";
                periodKeywords = "7 day earthquakes, weekly seismic activity";
                break;
            case 'last_14_days':
                periodDescription = "the last 14 days";
                periodKeywords = "14 day earthquakes, biweekly seismic overview";
                break;
            case 'last_30_days':
                periodDescription = "the last 30 days";
                periodKeywords = "30 day earthquakes, monthly seismic analysis";
                break;
            case 'feelable_quakes':
                periodDescription = `feelable quakes (M${FEELABLE_QUAKE_THRESHOLD.toFixed(1)}+)`;
                periodKeywords = "feelable earthquakes, noticeable seismic events";
                break;
            case 'significant_quakes':
                periodDescription = `significant quakes (M${MAJOR_QUAKE_THRESHOLD.toFixed(1)}+)`;
                periodKeywords = "significant earthquakes, major seismic events";
                break;
            default:
                periodDescription = "selected period";
                break;
        }

        const title = feedTitle ? `${feedTitle} | Seismic Monitor` : 'Earthquake Feeds | Seismic Monitor';
        const description = `Explore earthquake data for ${periodDescription}. View lists, statistics, and details of seismic events. Updated with the latest USGS data.`;
        const keywords = `earthquake feed, live seismic data, earthquake list, ${periodKeywords}, seismic monitor, USGS earthquake data`;
        // Ensure activePeriod is a string and doesn't contain characters that would break a URL query parameter.
        const safeActivePeriod = String(activePeriod).replace(/[^a-zA-Z0-9_.-]/g, '');
        const canonicalUrl = `https://earthquakeslive.com/feeds?activeFeedPeriod=${safeActivePeriod}`;

        return { title, description, keywords, pageUrl: canonicalUrl, canonicalUrl, locale: "en_US" };
    };

    // const handleCloseDetail = useCallback(() => setSelectedDetailUrl(null), []); // Removed
    const handleNotableQuakeSelect = useCallback((quakeFromFeature) => {
        setFocusedNotableQuake(quakeFromFeature);
        const detailUrl = quakeFromFeature?.properties?.detail || quakeFromFeature?.properties?.url || quakeFromFeature?.url;
        if (detailUrl) {
            navigate(`/quake/${encodeURIComponent(detailUrl)}`);
        } else {
            alert(`Featured Quake: ${quakeFromFeature.name || quakeFromFeature.properties?.place}\n${quakeFromFeature.description || ''}`);
        }
    }, [navigate]);

    const handleClusterSummaryClick = useCallback((clusterData) => {
        navigate(`/cluster/${clusterData.id}`);
    }, [navigate]); // Added navigate to dependencies

    const initialDataLoaded = useMemo(() => earthquakesLastHour || earthquakesLast24Hours || earthquakesLast72Hours || earthquakesLast7Days, [earthquakesLastHour, earthquakesLast24Hours, earthquakesLast72Hours, earthquakesLast7Days]);

    // --- Full Screen Loader is removed ---

    // --- Main Render for HomePage ---
    // The main div with flex flex-col h-[100svh] is removed as it's in App.jsx
    // Header is removed as it's in App.jsx
    // BottomNav is removed as it's in App.jsx
    // The main <div className="flex flex-1 overflow-hidden pb-16 lg:pb-0"> is also part of App.jsx structure

    // HomePage now returns the content for the "/" path, primarily the globe and its overlays,
    // and the desktop sidebar which is contextually part of this main view.
    // The <main> tag and its direct children <Suspense> and <Routes> are removed from here.
    // Those are now in App.jsx. This component will render what was inside the original <Route path="/" element={...}>

    return (
        <>
            <SeoMetadata
                title="Global Seismic Activity Monitor | Real-time Earthquake Data & Maps"
                description="Track live earthquakes worldwide with our interactive globe and detailed maps. Get real-time USGS data, view significant quake details, and explore seismic activity trends and statistics."
                keywords="earthquakes, seismic activity, live earthquakes, earthquake map, global earthquakes, real-time data, seismology, USGS, earthquake statistics, seismic monitor"
                pageUrl="https://earthquakeslive.com/"
                canonicalUrl="https://earthquakeslive.com/"
                locale="en_US"
                type="website"
            />
            {/* This div now represents the content for the main page, fitting into App.jsx's <main> tag */}
            <div className="flex flex-1 overflow-hidden h-full"> {/* Ensure HomePage content can take full height of main */}
                 {/* MAIN CONTENT AREA for HomePage (Globe) */}
                <div className="flex-1 relative bg-slate-900 lg:bg-black w-full overflow-y-auto">
                    <div className="lg:block h-full w-full">
                        <InteractiveGlobeView
                            earthquakes={globeEarthquakes}
                            defaultFocusLat={20}
                            defaultFocusLng={globeFocusLng}
                            onQuakeClick={handleQuakeClick}
                                        getMagnitudeColorFunc={getMagnitudeColor} // Imported from utils
                            allowUserDragRotation={true}
                            enableAutoRotation={true}
                            globeAutoRotateSpeed={0.1}
                            coastlineGeoJson={coastlineData}
                            tectonicPlatesGeoJson={tectonicPlatesData}
                                        highlightedQuakeId={lastMajorQuake?.id}
                                        latestMajorQuakeForRing={lastMajorQuake}
                                        previousMajorQuake={previousMajorQuake}
                                        activeClusters={activeClusters}
                        />
                        <div className="absolute top-2 left-2 z-10 space-y-2">
                            <NotableQuakeFeature
                                            dynamicFeaturedQuake={lastMajorQuake}
                                            isLoadingDynamicQuake={isLoadingInitialData}
                                onNotableQuakeSelect={handleNotableQuakeSelect}
                                            getMagnitudeColorFunc={getMagnitudeColor} // Imported from utils
                            />
                            <div className="hidden md:block">
                                <PreviousNotableQuakeFeature
                                                previousMajorQuake={previousMajorQuake}
                                                isLoadingPreviousQuake={isLoadingInitialData}
                                    onNotableQuakeSelect={handleNotableQuakeSelect}
                                                getMagnitudeColorFunc={getMagnitudeColor} // Imported from utils
                                />
                            </div>
                            <div className="p-2 sm:p-2.5 bg-slate-800 bg-opacity-80 text-white rounded-lg shadow-xl max-w-full sm:max-w-[220px] backdrop-blur-sm border border-slate-700">
                                <h3 className="text-[10px] sm:text-xs font-semibold mb-0.5 sm:mb-1 text-indigo-300 uppercase">Live Statistics</h3>
                                <p className="text-[10px] sm:text-xs">Last Hour: <span className="font-bold text-sm sm:text-md text-sky-300">{keyStatsForGlobe.lastHourCount}</span></p>
                                <p className="text-[10px] sm:text-xs">24h Total: <span className="font-bold text-sm sm:text-md text-sky-300">{keyStatsForGlobe.count24h}</span></p>
                                <p className="text-[10px] sm:text-xs">72h Total: <span className="font-bold text-sm sm:text-md text-sky-300">{keyStatsForGlobe.count72h}</span></p>
                                <p className="text-[10px] sm:text-xs">24h Strongest: <span className="font-bold text-sm sm:text-md text-sky-300">{keyStatsForGlobe.strongest24h}</span></p>
                            </div>
                        </div>
                        <GlobalLastMajorQuakeTimer
                            lastMajorQuake={lastMajorQuake}
                            formatTimeDuration={formatTimeDuration}
                            handleTimerClick={handleQuakeClick}
                            // SkeletonText is now imported by GlobalLastMajorQuakeTimer
                        />
                    </div>
                </div>

                {/* DESKTOP SIDEBAR - Replaced with DesktopSidebar component */}
                <DesktopSidebar />
            </div>
        </>
    );
}

// Removed definition of EarthquakeDetailModal as it's now imported.

export default HomePage;
// Utility functions previously defined here (formatDate, formatTimeAgo, etc.)
// are expected to be available from context or imported from a shared utils file
// if they are still needed directly by components rendered within HomePage.
// For now, their direct definitions are removed from this file.
// Similarly, constants like REGIONS are also expected from context or shared utils.