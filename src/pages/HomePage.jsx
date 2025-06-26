// src/pages/HomePage.jsx
import React, { useEffect, useMemo, useCallback, lazy, Suspense, useState } from 'react'; // Add back useState for appCurrentTime, removed useRef
import { Routes, Route, useNavigate, Outlet } from 'react-router-dom'; // Removed useParams, Added Outlet
import SeoMetadata from '../components/SeoMetadata';
import ErrorBoundary from '../components/ErrorBoundary'; // Import ErrorBoundary
// EarthquakeDetailView is likely part of EarthquakeDetailModalComponent, removing direct import from HomePage
// import InteractiveGlobeView from '../components/InteractiveGlobeView'; // Will be lazy loaded
import NotableQuakeFeature from '../components/NotableQuakeFeature';
import PreviousNotableQuakeFeature from '../components/PreviousNotableQuakeFeature';
import InfoSnippet from '../components/InfoSnippet';
// import coastlineData from '../assets/ne_110m_coastline.json'; // Removed for dynamic import
// import tectonicPlatesData from '../assets/TectonicPlateBoundaries.json'; // Removed for dynamic import
import GlobalLastMajorQuakeTimer from "../components/GlobalLastMajorQuakeTimer.jsx";
import BottomNav from "../components/BottomNav.jsx";
import ClusterSummaryItem from '../components/ClusterSummaryItem';
import ClusterDetailModal from '../components/ClusterDetailModal'; // This is for the cluster map point, not the route component
// import ClusterDetailModalWrapper from '../components/ClusterDetailModalWrapper.jsx'; // Removed static import, will use lazy loaded
import { getMagnitudeColor, getMagnitudeColorStyle } from '../utils/utils.js';
// import { findActiveClusters } from '../utils/clusterUtils.js'; // Import findActiveClusters - REMOVED

// Import newly created components
import SkeletonText from '../components/skeletons/SkeletonText';
import SkeletonBlock from '../components/skeletons/SkeletonBlock';
import SkeletonListItem from '../components/skeletons/SkeletonListItem';
import SkeletonTableRow from '../components/skeletons/SkeletonTableRow';
import AlertDisplay from '../components/AlertDisplay';
import TimeSinceLastMajorQuakeBanner from '../components/TimeSinceLastMajorQuakeBanner';
import SummaryStatisticsCard from '../components/SummaryStatisticsCard';
// RegionalDistributionList will be lazy loaded
// MagnitudeDistributionSVGChart will be lazy loaded
// EarthquakeTimelineSVGChart will be lazy loaded
// MagnitudeDepthScatterSVGChart will be lazy loaded
// PaginatedEarthquakeTable will be lazy loaded
// FeedsPageLayoutComponent will be lazy loaded
// EarthquakeDetailModalComponent will be lazy loaded
const InteractiveGlobeView = lazy(() => import('../components/InteractiveGlobeView'));
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx'; // Import the context hook
import { useUIState } from '../contexts/UIStateContext.jsx';
import { registerClusterDefinition, fetchActiveClusters } from '../services/clusterApiService.js';
import {
    CLUSTER_MAX_DISTANCE_KM,
    CLUSTER_MIN_QUAKES,
    FELT_REPORTS_THRESHOLD, // Directly used in PaginatedEarthquakeTable, not here
    SIGNIFICANCE_THRESHOLD, // Directly used in PaginatedEarthquakeTable, not here
    HEADER_TIME_UPDATE_INTERVAL_MS,
    // TOP_N_CLUSTERS_OVERVIEW, // Used in App component
    REGIONS, // Used in App component
    FEELABLE_QUAKE_THRESHOLD, // Used in App component
    MAJOR_QUAKE_THRESHOLD, // Used in App component
    ALERT_LEVELS, // Used in App component
    LOADING_MESSAGE_INTERVAL_MS,
    INITIAL_LOADING_MESSAGES
} from '../constants/appConstants';

// Lazy load route components
const FeedsPageLayoutComponent = lazy(() => import('../components/FeedsPageLayout'));
const EarthquakeDetailModalComponent = lazy(() => import('../components/EarthquakeDetailModalComponent'));
const ClusterDetailModalWrapper = lazy(() => import('../components/ClusterDetailModalWrapper'));
const OverviewPage = lazy(() => import('./OverviewPage'));
const LearnPage = lazy(() => import('./LearnPage'));
const MagnitudeVsIntensityPage = lazy(() => import('./learn/MagnitudeVsIntensityPage'));
const MeasuringEarthquakesPage = lazy(() => import('./learn/MeasuringEarthquakesPage'));
const PlateTectonicsPage = lazy(() => import('./learn/PlateTectonicsPage'));

// Lazy load other heavy/conditional components for the sidebar
const RegionalDistributionList = lazy(() => import('../components/RegionalDistributionList'));
const MagnitudeDistributionSVGChart = lazy(() => import('../components/MagnitudeDistributionSVGChart'));
const EarthquakeTimelineSVGChart = lazy(() => import('../components/EarthquakeTimelineSVGChart'));
const MagnitudeDepthScatterSVGChart = lazy(() => import('../components/MagnitudeDepthScatterSVGChart'));
const PaginatedEarthquakeTable = lazy(() => import('../components/PaginatedEarthquakeTable'));

/**
 * Internal component responsible for laying out the main globe view and its fixed UI overlays.
 * This includes the interactive globe itself, notable quake features, live statistics,
 * and the global timer for the last major quake. It also renders an `<Outlet />` for modal routes.
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {number} props.globeFocusLng - Longitude for the globe's camera focus.
 * @param {function(Object):void} props.handleQuakeClick - Callback for when a quake on the globe is clicked.
 * @param {function(number):string} props.getMagnitudeColor - Function to get color based on magnitude.
 * @param {Object|null} props.coastlineData - GeoJSON data for coastlines.
 * @param {Object|null} props.tectonicPlatesData - GeoJSON data for tectonic plates.
 * @param {boolean} props.areGeoJsonAssetsLoading - Loading state for GeoJSON map assets.
 * @param {Array<Object>} props.activeClusters - Array of active earthquake clusters to display.
 * @param {Object|null} props.lastMajorQuake - Data for the last major earthquake.
 * @param {function(number):string} props.formatTimeDuration - Function to format time durations.
 * @param {function(Object):void} props.handleNotableQuakeSelect - Callback for when a notable quake feature is selected.
 * @param {Object} props.keyStatsForGlobe - Object containing key statistics for display on the globe overlay.
 * @param {boolean} props.areClustersLoading - Loading state for earthquake cluster data.
 * @returns {JSX.Element} The GlobeLayout component.
 */
const GlobeLayout = (props) => {
  const {
    globeFocusLng,
    handleQuakeClick,
    getMagnitudeColor,
    activeClusters,
    lastMajorQuake,
    formatTimeDuration,
    handleNotableQuakeSelect,
    keyStatsForGlobe,
    coastlineData,
    tectonicPlatesData,
    areGeoJsonAssetsLoading
    // areClustersLoading // Prop removed from destructuring
  } = props;

  const [globeContainerSize, setGlobeContainerSize] = useState({ width: 0, height: 0 });
  const globeContainerRef = useRef(null);

  useEffect(() => {
    const container = globeContainerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      if (globeContainerRef.current) {
        const newWidth = globeContainerRef.current.offsetWidth;
        const newHeight = globeContainerRef.current.offsetHeight;
        if (newWidth > 50 && newHeight > 50) {
          setGlobeContainerSize(prevSize => {
            if (prevSize.width !== newWidth || prevSize.height !== newHeight) {
              return { width: newWidth, height: newHeight };
            }
            return prevSize;
          });
        }
      }
    };

    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(container);

    // Initial measurement attempts
    const timeoutId1 = setTimeout(updateDimensions, 300);
    const timeoutId2 = setTimeout(updateDimensions, 700);

    // Optional: pageshow listener for very late measurement
    // const handlePageShow = () => updateDimensions();
    // window.addEventListener('pageshow', handlePageShow);

    return () => {
      resizeObserver.unobserve(container);
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
      // window.removeEventListener('pageshow', handlePageShow);
    };
  }, []); // Empty dependency array, runs once on mount

  return (
    <div ref={globeContainerRef} className="block h-full w-full">
      <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-slate-500">Loading Globe Components...</div>}>
        {(areGeoJsonAssetsLoading || !coastlineData || !tectonicPlatesData) ? (
           <div className="w-full h-full flex items-center justify-center text-slate-500">Loading Map Data...</div>
        ) : (globeContainerSize.width > 50 && globeContainerSize.height > 50) ? (
          <InteractiveGlobeView
            width={globeContainerSize.width}
            height={globeContainerSize.height}
            defaultFocusLat={20}
            defaultFocusLng={globeFocusLng}
            onQuakeClick={handleQuakeClick}
            getMagnitudeColorFunc={getMagnitudeColor}
            allowUserDragRotation={true}
            enableAutoRotation={true}
            globeAutoRotateSpeed={0.1}
            coastlineGeoJson={coastlineData}
            tectonicPlatesGeoJson={tectonicPlatesData}
            activeClusters={activeClusters}
          />
        )}
      </Suspense>

      <div className="absolute top-2 left-2 z-10 space-y-2">
        <NotableQuakeFeature
            onNotableQuakeSelect={handleNotableQuakeSelect}
            getMagnitudeColorFunc={getMagnitudeColor}
        />
        <div className="hidden md:block">
            <PreviousNotableQuakeFeature
                onNotableQuakeSelect={handleNotableQuakeSelect}
                getMagnitudeColorFunc={getMagnitudeColor}
            />
        </div>
        <div className="p-2 sm:p-2.5 bg-slate-800 bg-opacity-80 text-white rounded-lg shadow-xl max-w-full sm:max-w-xs backdrop-blur-sm border border-slate-700">
            <h3 className="text-xs sm:text-sm font-semibold mb-0.5 sm:mb-1 text-indigo-300 uppercase">Live Statistics</h3>
            <div className="text-xs sm:text-sm">Last Hour: <span className="font-bold text-sm sm:text-base text-sky-300">{keyStatsForGlobe.lastHourCount}</span></div>
            <div className="text-xs sm:text-sm">24h Total: <span className="font-bold text-sm sm:text-base text-sky-300">{keyStatsForGlobe.count24h}</span></div>
            <div className="text-xs sm:text-sm">72h Total: <span className="font-bold text-sm sm:text-base text-sky-300">{keyStatsForGlobe.count72h}</span></div>
            <div className="text-xs sm:text-sm">
                24h Strongest: <span className="font-bold text-sm sm:text-base" style={{ color: getMagnitudeColor(keyStatsForGlobe.strongest24hRawMagnitude) }}>
                    {keyStatsForGlobe.strongest24hDisplayString}
                </span>
            </div>
            <div className="text-xs sm:text-sm">
                72h Strongest: <span className="font-bold text-sm sm:text-base" style={{ color: getMagnitudeColor(keyStatsForGlobe.strongest72hRawMagnitude) }}>
                    {keyStatsForGlobe.strongest72hDisplayString}
                </span>
            </div>
        </div>
      </div>

      <GlobalLastMajorQuakeTimer
        lastMajorQuake={lastMajorQuake}
        formatTimeDuration={formatTimeDuration}
        handleTimerClick={handleQuakeClick}
      />
      <Outlet />
    </div>
  );
};

/**
 * Main application component for the Global Seismic Activity Monitor.
 * This component serves as the root of the application, orchestrating data fetching,
 * state management, routing, and the overall layout.
 *
 * It utilizes `EarthquakeDataContext` for earthquake data and `UIStateContext` for UI-related states.
 * Features include:
 * - Displaying an interactive globe with earthquake data (`GlobeLayout`).
 * - Providing navigation to different pages like Overview, Feeds, and Learn sections.
 * - Lazy loading of page components and heavy UI elements for performance.
 * - Handling modals for detailed earthquake and cluster views through nested routes.
 * - Displaying a dynamic sidebar with various informational panels and data views.
 * - Showing global statistics and timers for significant seismic events.
 *
 * The component defines several callback functions for formatting data, handling user interactions,
 * and deriving memoized values for performance. It takes no direct props itself.
 *
 * @component
 * @returns {JSX.Element} The rendered App component.
 */
function App() {
    const {
        activeSidebarView, setActiveSidebarView,
        // activeFeedPeriod, // Unused variable removed
        globeFocusLng, setGlobeFocusLng,
        setFocusedNotableQuake
    } = useUIState();

    // const [registeredIdsThisSession, setRegisteredIdsThisSession] = useState(new Set()); // Removed

    /**
     * Formats a timestamp into a human-readable date and time string (e.g., "Jan 1, 10:00 AM").
     * @param {number} timestamp - The Unix timestamp in milliseconds.
     * @returns {string} The formatted date and time string, or 'N/A' if the timestamp is invalid.
     */
    const formatDate = useCallback((timestamp) => {
        if (!timestamp) return 'N/A';
        return new Date(timestamp).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
    }, []);

    /**
     * Formats a duration in milliseconds into a human-readable "time ago" string.
     * Handles durations from "just now" up to days.
     * @param {number | null} milliseconds - The duration in milliseconds.
     * @returns {string} The formatted time ago string (e.g., "5 min ago", "1 day ago", "just now") or 'N/A' if input is invalid or negative.
     */
    const formatTimeAgo = useCallback((milliseconds) => {
        if (milliseconds === null || milliseconds < 0) return 'N/A';
        if (milliseconds < 30000) return 'just now';
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hr${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
        return `${seconds} sec${seconds !== 1 ? 's' : ''} ago`;
    }, []);

    /**
     * Formats a duration in milliseconds into a human-readable string (e.g., "1 day, 2 hr, 30 min").
     * @param {number | null} milliseconds - The duration in milliseconds.
     * @returns {string} The formatted time duration string or 'N/A' if input is invalid. Returns "0 sec" if milliseconds is 0.
     */
    const formatTimeDuration = useCallback((milliseconds) => {
        if (milliseconds === null || milliseconds < 0) return 'N/A';
        const totalSeconds = Math.floor(milliseconds / 1000);
        const days = Math.floor(totalSeconds / (3600 * 24));
        const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        let parts = [];
        if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
        if (hours > 0) parts.push(`${hours} hr${hours > 1 ? 's' : ''}`);
        if (minutes > 0) parts.push(`${minutes} min${minutes > 1 ? 's' : ''}`);
        if (seconds >= 0 && parts.length < 3) parts.push(`${seconds} sec${seconds !== 1 ? 's' : ''}`);
        if (parts.length === 0 && milliseconds >= 0) return "0 sec";
        return parts.join(', ');
    }, []);

    // getMagnitudeColor is imported from utils.js and passed directly.
    // getMagnitudeColorStyle is imported from utils.js and passed directly.

    /**
     * Memoized array of predefined geographic regions for classifying earthquake locations.
     * Each region object includes name, latitude/longitude boundaries, and a display color.
     * @type {Array<{name: string, latMin: number, latMax: number, lonMin: number, lonMax: number, color: string}>}
     */
    const REGIONS = useMemo(() => [
        { name: "Alaska & W. Canada", latMin: 50, latMax: 72, lonMin: -170, lonMax: -125, color: "#A78BFA" },
        { name: "California & W. USA", latMin: 30, latMax: 50, lonMin: -125, lonMax: -110, color: "#F472B6" },
        { name: "Japan & Kuril Isl.", latMin: 25, latMax: 50, lonMin: 125, lonMax: 155, color: "#34D399" },
        { name: "Indonesia & Philippines", latMin: -10, latMax: 25, lonMin: 95, lonMax: 140, color: "#F59E0B" },
        { name: "S. America (Andes)", latMin: -55, latMax: 10, lonMin: -80, lonMax: -60, color: "#60A5FA" },
        { name: "Mediterranean", latMin: 30, latMax: 45, lonMin: -10, lonMax: 40, color: "#818CF8" },
        { name: "Central America", latMin: 5, latMax: 30, lonMin: -118, lonMax: -77, color: "#FBBF24" },
        { name: "New Zealand & S. Pacific", latMin: -55, latMax: -10, lonMin: 160, lonMax: -150, color: "#C4B5FD" },
        { name: "Other / Oceanic", latMin: -90, latMax: 90, lonMin: -180, lonMax: 180, color: "#9CA3AF" } // Fallback region
    ], []);

    /**
     * Determines the geographic region for a given earthquake based on its coordinates
     * and the predefined `REGIONS` array.
     * @param {Object} quake - An earthquake GeoJSON feature object with `geometry.coordinates`.
     * @returns {Object} The region object from `REGIONS` that the earthquake falls into. Defaults to "Other / Oceanic".
     */
    const getRegionForEarthquake = useCallback((quake) => {
        const lon = quake.geometry?.coordinates?.[0];
        const lat = quake.geometry?.coordinates?.[1];
        if (lon === null || lat === null || lon === undefined || lat === undefined) return REGIONS[REGIONS.length - 1];
        for (let i = 0; i < REGIONS.length - 1; i++) {
            const region = REGIONS[i];
            if (lat >= region.latMin && lat <= region.latMax && lon >= region.lonMin && lon <= region.lonMax) return region;
        }
        return REGIONS[REGIONS.length - 1];
    }, [REGIONS]);

    /**
     * Calculates various summary statistics from an array of earthquake objects.
     * Includes total count, average/strongest magnitude, counts of feelable/significant quakes,
     * average/deepest depth, average significance score, and the highest PAGER alert level observed.
     * @param {Array<Object>} earthquakes - An array of earthquake GeoJSON feature objects.
     * @returns {Object} An object containing calculated statistics (e.g., `totalEarthquakes`, `averageMagnitude`).
     *   Returns base statistics with 'N/A' or 0 for values if input is empty or invalid.
     */
    const calculateStats = useCallback((earthquakes) => {
        const baseStats = { totalEarthquakes: 0, averageMagnitude: 'N/A', strongestMagnitude: 'N/A', strongestMagnitudeRaw: null, significantEarthquakes: 0, feelableEarthquakes: 0, averageDepth: 'N/A', deepestEarthquake: 'N/A', averageSignificance: 'N/A', highestAlertLevel: null };
        if (!earthquakes || earthquakes.length === 0) return baseStats;
        const totalEarthquakes = earthquakes.length;
        const mags = earthquakes.map(q => q.properties.mag).filter(m => m !== null && typeof m === 'number');
        const avgMag = mags.length > 0 ? (mags.reduce((a, b) => a + b, 0) / mags.length) : null;
        const strongMag = mags.length > 0 ? Math.max(...mags) : null;
        const depths = earthquakes.map(q => q.geometry?.coordinates?.[2]).filter(d => d !== null && typeof d === 'number');
        const avgDepth = depths.length > 0 ? (depths.reduce((a, b) => a + b, 0) / depths.length) : null;
        const deepQuake = depths.length > 0 ? Math.max(...depths) : null;
        const sigQuakes = earthquakes.filter(q => q.properties.mag !== null && q.properties.mag >= 4.5).length;
        const feelQuakes = earthquakes.filter(q => q.properties.mag !== null && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD).length;
        const sigs = earthquakes.map(q => q.properties.sig).filter(s => s !== null && typeof s === 'number');
        const avgSig = sigs.length > 0 ? Math.round(sigs.reduce((a, b) => a + b, 0) / sigs.length) : null;
        const alerts = earthquakes.map(q => q.properties.alert).filter(a => a && a !== 'green');
        const highAlert = alerts.length > 0 ? alerts.sort((a,b) => { const order = { 'red':0, 'orange':1, 'yellow':2 }; return order[a] - order[b]; })[0] : null;
        return { totalEarthquakes, averageMagnitude: avgMag?.toFixed(2) || "N/A", strongestMagnitude: strongMag !== null ? `M ${strongMag.toFixed(1)}` : "N/A", strongestMagnitudeRaw: strongMag, significantEarthquakes: sigQuakes, feelableEarthquakes: feelQuakes, averageDepth: avgDepth?.toFixed(1) || "N/A", deepestEarthquake: deepQuake?.toFixed(1) || "N/A", averageSignificance: avgSig || "N/A", highestAlertLevel: highAlert };
    }, []);

    // --- State Hooks ---
    const [appCurrentTime, setAppCurrentTime] = useState(Date.now()); // Kept local
    // activeSidebarView, globeFocusLng, focusedNotableQuake are from useUIState()
    const [calculatedClusters, setCalculatedClusters] = useState([]); // NEW state for API fetched clusters
    // const [areClustersLoading, setAreClustersLoading] = useState(false); // Ensured this is removed

    // State for GeoJSON data
    const [coastlineData, setCoastlineData] = useState(null);
    const [tectonicPlatesData, setTectonicPlatesData] = useState(null);
    const [areGeoJsonAssetsLoading, setAreGeoJsonAssetsLoading] = useState(true);

    // Define localStorage keys for GeoJSON assets
    const CACHE_KEY_COASTLINE = 'cachedNe110mCoastline';
    const CACHE_KEY_TECTONIC = 'cachedTectonicPlates';
    const GEOJSON_CACHE_VERSION = '1.0';

    // --- Data Fetching Callbacks ---
    // fetchDataCb is removed as it's now centralized in EarthquakeDataContext

    // Use the EarthquakeDataContext
    const {
        isLoadingDaily,
        isLoadingWeekly,
        isLoadingInitialData,
        error,
        dataFetchTime,
        lastUpdated,
        earthquakesLastHour,
        earthquakesPriorHour,
        earthquakesLast24Hours,
        earthquakesLast72Hours,
        earthquakesLast7Days,
        prev24HourData,
        // globeEarthquakes, // Removed, used by context in InteractiveGlobeView
        hasRecentTsunamiWarning,
        highestRecentAlert,
        activeAlertTriggeringQuakes,
        lastMajorQuake, // Setters (setLastMajorQuake, etc.) are managed by context
        // previousMajorQuake, // Removed, used by context in TimeSinceLastMajorQuakeBanner
        // timeBetweenPreviousMajorQuakes, // Removed, used by context in TimeSinceLastMajorQuakeBanner
        currentLoadingMessage,
        isInitialAppLoad,
        isLoadingMonthly,
        hasAttemptedMonthlyLoad,
        monthlyError,
        allEarthquakes,
        earthquakesLast14Days,
        earthquakesLast30Days,
        prev7DayData,
        prev14DayData,
        loadMonthlyData
        // New pre-filtered lists (removed as they became unused)
        // feelableQuakes7Days_ctx,
        // significantQuakes7Days_ctx,
        // feelableQuakes30Days_ctx,
        // significantQuakes30Days_ctx
    } = useEarthquakeDataState();

    // Unused currentFeedTitle, currentFeedisLoading, previousDataForCurrentFeed useMemo hooks will be removed below

    const latestFeelableQuakesSnippet = useMemo(() => {
        if (!earthquakesLast24Hours || earthquakesLast24Hours.length === 0) return [];
        return earthquakesLast24Hours
            .filter(q => q.properties.mag !== null && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD)
            .sort((a, b) => b.properties.time - a.properties.time)
            .slice(0, 3);
    }, [earthquakesLast24Hours]);

    // const currentFeedData = useMemo(() => { // Unused variable removed
        // const baseDataForFilters = (hasAttemptedMonthlyLoad && allEarthquakes.length > 0) ? allEarthquakes : earthquakesLast7Days; // Removed
        // switch (activeFeedPeriod) {
            // case 'last_hour': return earthquakesLastHour; // Part of removed useMemo
            // case 'last_24_hours': return earthquakesLast24Hours; // Part of removed useMemo
            // case 'last_7_days': return earthquakesLast7Days; // Part of removed useMemo
            // case 'last_14_days': return (hasAttemptedMonthlyLoad && allEarthquakes.length > 0) ? earthquakesLast14Days : null; // Part of removed useMemo
            // case 'last_30_days': return (hasAttemptedMonthlyLoad && allEarthquakes.length > 0) ? earthquakesLast30Days : null; // Part of removed useMemo
            // // Updated cases to use pre-filtered lists from context
            // case 'feelable_quakes':  // Part of removed useMemo
                // return (hasAttemptedMonthlyLoad && allEarthquakes.length > 0) ? feelableQuakes30Days_ctx : feelableQuakes7Days_ctx;
            // case 'significant_quakes':  // Part of removed useMemo
                // return (hasAttemptedMonthlyLoad && allEarthquakes.length > 0) ? significantQuakes30Days_ctx : significantQuakes7Days_ctx;
            // default: return earthquakesLast24Hours; // Part of removed useMemo
        // } // Part of removed useMemo
    // }, [ // Part of removed useMemo
        // activeFeedPeriod, earthquakesLastHour, earthquakesLast24Hours, earthquakesLast7Days, // activeFeedPeriod was unused here
        // earthquakesLast14Days, earthquakesLast30Days,
        // allEarthquakes, hasAttemptedMonthlyLoad, // Still needed for the conditional logic
        // // Added new context dependencies
        // feelableQuakes7Days_ctx, significantQuakes7Days_ctx, // These were unused here
        // // feelableQuakes30Days_ctx, significantQuakes30Days_ctx // These were unused here
    // ]);

    // const currentFeedTitle = useMemo(() => { // Unused variable
    //     const filterPeriodSuffix = (hasAttemptedMonthlyLoad && allEarthquakes.length > 0) ? "(Last 30 Days)" : "(Last 7 Days)";
    //     switch (activeFeedPeriod) {
    //         case 'last_hour': return "Earthquakes (Last Hour)";
    //         case 'last_24_hours': return "Earthquakes (Last 24 Hours)";
    //         case 'last_7_days': return "Earthquakes (Last 7 Days)";
    //         case 'last_14_days': return "Earthquakes (Last 14 Days)";
    //         case 'last_30_days': return "Earthquakes (Last 30 Days)";
    //         case 'feelable_quakes': return `Feelable Quakes (M${FEELABLE_QUAKE_THRESHOLD.toFixed(1)}+) ${filterPeriodSuffix}`;
    //         case 'significant_quakes': return `Significant Quakes (M${MAJOR_QUAKE_THRESHOLD.toFixed(1)}+) ${filterPeriodSuffix}`;
    //         default: return "Earthquakes (Last 24 Hours)";
    //     }
    // }, [activeFeedPeriod, hasAttemptedMonthlyLoad, allEarthquakes]);

    // const currentFeedisLoading = useMemo(() => { // Unused variable
    //     if (activeFeedPeriod === 'last_hour') return isLoadingDaily && (!earthquakesLastHour || earthquakesLastHour.length === 0);
    //     if (activeFeedPeriod === 'last_24_hours') return isLoadingDaily && (!earthquakesLast24Hours || earthquakesLast24Hours.length === 0);
    //     if (activeFeedPeriod === 'last_7_days') return isLoadingWeekly && (!earthquakesLast7Days || earthquakesLast7Days.length === 0);
    //     if (activeFeedPeriod === 'feelable_quakes' || activeFeedPeriod === 'significant_quakes') {
    //         if (hasAttemptedMonthlyLoad && allEarthquakes.length > 0) return isLoadingMonthly && allEarthquakes.length === 0;
    //         return isLoadingWeekly && (!earthquakesLast7Days || earthquakesLast7Days.length === 0);
    //     }
    //     if ((activeFeedPeriod === 'last_14_days' || activeFeedPeriod === 'last_30_days')) {
    //         return isLoadingMonthly && (!allEarthquakes || allEarthquakes.length === 0);
    //     }
    //     return currentFeedData === null;
    // }, [activeFeedPeriod, isLoadingDaily, isLoadingWeekly, isLoadingMonthly,
    //     earthquakesLastHour, earthquakesLast24Hours, earthquakesLast7Days,
    //     allEarthquakes, hasAttemptedMonthlyLoad, currentFeedData]);

    // const previousDataForCurrentFeed = useMemo(() => { // Unused variable
    //     switch (activeFeedPeriod) {
    //         case 'last_hour': return earthquakesPriorHour;
    //         case 'last_24_hours': return prev24HourData; // from useEarthquakeData
    //         case 'last_7_days': return prev7DayData;     // from useMonthlyEarthquakeData
    //         case 'last_14_days': return prev14DayData;   // from useMonthlyEarthquakeData
    //         default: return null;
    //     }
    // }, [activeFeedPeriod, earthquakesPriorHour, prev24HourData, prev7DayData, prev14DayData]);

    // Old handleLoadMonthlyData is removed. `loadMonthlyData` from the hook is used instead.

    // Effect to fetch active clusters from the API
    useEffect(() => {
        if (earthquakesLast7Days && earthquakesLast7Days.length > 0) {
            fetchActiveClusters(earthquakesLast7Days, CLUSTER_MAX_DISTANCE_KM, CLUSTER_MIN_QUAKES)
                .then(clusters => {
                    setCalculatedClusters(clusters);
                })
                .catch(error => {
                    console.error("Error fetching active clusters:", error);
                    setCalculatedClusters([]);
                });
        } else {
            setCalculatedClusters([]);
        }
    }, [earthquakesLast7Days]); // Dependency: earthquakesLast7Days

    // Use calculatedClusters for the activeClusters memo
    const activeClusters = useMemo(() => {
        return calculatedClusters;
    }, [calculatedClusters]);

    // Effect to load GeoJSON assets
    useEffect(() => {
      let isMounted = true;
      const loadGeoJsonAssets = async () => {
        if (isMounted) {
          setAreGeoJsonAssetsLoading(true);
        }

        let coastlineJson = null;
        let tectonicJson = null;
        let loadedFromCache = false;

        try {
            const cachedCoastline = localStorage.getItem(CACHE_KEY_COASTLINE);
            const cachedTectonic = localStorage.getItem(CACHE_KEY_TECTONIC);

            if (cachedCoastline && cachedTectonic) {
                console.log('GeoJSON assets found in localStorage. Attempting to parse and validate version...');
                const parsedCoastlineWrapper = JSON.parse(cachedCoastline);
                const parsedTectonicWrapper = JSON.parse(cachedTectonic);

                if (parsedCoastlineWrapper && parsedCoastlineWrapper.version === GEOJSON_CACHE_VERSION && parsedCoastlineWrapper.data &&
                    parsedTectonicWrapper && parsedTectonicWrapper.version === GEOJSON_CACHE_VERSION && parsedTectonicWrapper.data) {

                    coastlineJson = parsedCoastlineWrapper.data;
                    tectonicJson = parsedTectonicWrapper.data;

                    // Basic validation of the actual data can remain if necessary
                    if (typeof coastlineJson === 'object' && typeof tectonicJson === 'object') {
                        if (isMounted) {
                            setCoastlineData(coastlineJson);
                            setTectonicPlatesData(tectonicJson);
                            setAreGeoJsonAssetsLoading(false); // Crucial: set loading to false
                            console.log('GeoJSON assets successfully loaded from localStorage (version match).');
                        }
                        loadedFromCache = true;
                        // return; // This return was part of the previous subtask, ensure it's still here if logic relies on it.
                    } else {
                        console.warn('Cached GeoJSON data (within versioned object) is invalid/unexpected type. Fetching from source.');
                        localStorage.removeItem(CACHE_KEY_COASTLINE);
                        localStorage.removeItem(CACHE_KEY_TECTONIC);
                    }
                } else {
                    // This handles version mismatch OR if the object doesn't have 'version'/'data' (e.g. old cache format)
                    console.log('Cache version mismatch, old format, or data integrity issue. Invalidating cache and fetching from source.');
                    localStorage.removeItem(CACHE_KEY_COASTLINE);
                    localStorage.removeItem(CACHE_KEY_TECTONIC);
                    // loadedFromCache remains false, so it will proceed to fetch from source
                }
            }
        } catch (error) {
            console.error("Error reading or parsing GeoJSON from localStorage:", error);
            // Clear potentially corrupted cache items
            try {
                localStorage.removeItem(CACHE_KEY_COASTLINE);
                localStorage.removeItem(CACHE_KEY_TECTONIC);
            } catch (e) {
                console.error("Error removing items from localStorage after parse failure:", e);
            }
        }

        if (loadedFromCache) {
            // If data was loaded from cache and states were set, ensure loading is false.
            // The 'setAreGeoJsonAssetsLoading(false)' above handles this if parsing was successful.
            // If isMounted became false during async parsing, this return prevents further work.
            if (isMounted && !areGeoJsonAssetsLoading) {
                 // This means it was set to false because cache loading was successful
            } else if (isMounted) {
                // This case might occur if parsing failed but component is still mounted
                // setAreGeoJsonAssetsLoading(false); // Decided against this here, finally block handles it
            }
            return; // Exit if successfully loaded from cache
        }

        // Fetch and store if not in localStorage or if parsing failed
        try {
          const [coastlineModule, tectonicModule] = await Promise.all([
            import('../assets/ne_110m_coastline.json'),
            import('../assets/TectonicPlateBoundaries.json')
          ]);

          const coastlineDataToStore = coastlineModule.default;
          const tectonicDataToStore = tectonicModule.default;

          // Create wrapper objects with version and data
          const coastlineCacheObject = {
              version: GEOJSON_CACHE_VERSION,
              data: coastlineDataToStore
          };
          const tectonicCacheObject = {
              version: GEOJSON_CACHE_VERSION,
              data: tectonicDataToStore
          };

          if (isMounted) {
            setCoastlineData(coastlineDataToStore); // Set state with actual data, not the wrapper
            setTectonicPlatesData(tectonicDataToStore);
          }

          try {
            localStorage.setItem(CACHE_KEY_COASTLINE, JSON.stringify(coastlineCacheObject));
            localStorage.setItem(CACHE_KEY_TECTONIC, JSON.stringify(tectonicCacheObject));
            console.log('GeoJSON assets fetched and saved to localStorage with version.');
          } catch (error) {
            console.error("Error saving versioned GeoJSON to localStorage:", error);
          }
        } catch (error) {
          console.error("Error loading GeoJSON assets from source:", error);
          // Optionally, set error state here if needed
        } finally {
          if (isMounted) {
            setAreGeoJsonAssetsLoading(false);
          }
        }
      };

      loadGeoJsonAssets();

      return () => {
        isMounted = false;
      };
    }, []); // Empty dependency array to run once on mount

    useEffect(() => {
        const timerId = setInterval(() => setAppCurrentTime(Date.now()), HEADER_TIME_UPDATE_INTERVAL_MS);
        return () => clearInterval(timerId);
    }, []);

    useEffect(() => {
        if (lastMajorQuake && lastMajorQuake.geometry && lastMajorQuake.geometry.coordinates && lastMajorQuake.geometry.coordinates.length >= 2) {
            const lng = lastMajorQuake.geometry.coordinates[0];
            if (typeof lng === 'number' && !isNaN(lng)) {
                setGlobeFocusLng(lng); // Use setter from UIStateContext
            }
        }
        // If lastMajorQuake is null, we could reset to defaults here, e.g.:
        // else {
        //   setGlobeFocusLng(0);  // Default longitude
        // }
    }, [lastMajorQuake, setGlobeFocusLng]); // Added setGlobeFocusLng to dependencies

    // --- UI Calculations & Memos ---
    // showFullScreenLoader now uses isLoadingInitialData from the hook
    const showFullScreenLoader = useMemo(() => isLoadingInitialData, [isLoadingInitialData]);

    // Fallback UI for Suspense
    const RouteLoadingFallback = () => (
        <div className="flex items-center justify-center h-screen w-full bg-slate-900"> {/* Ensure it covers the area */}
            <div className="text-center">
                <svg className="animate-spin h-10 w-10 text-indigo-400 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-xl font-semibold text-indigo-300">Loading Page...</p>
                <p className="text-sm text-slate-400">Please wait a moment.</p>
            </div>
        </div>
    );

    const ChartLoadingFallback = ({ message = "Loading data..." }) => (
        <div className="p-4 text-center text-slate-400">{message}</div>
    );

    // headerTimeDisplay now uses isInitialAppLoad (value) from the hook
    const headerTimeDisplay = useMemo(() => {
        const connectingMsg = "Connecting to Seismic Network...";
        const awaitingMsg = "Awaiting Initial Data...";
        if (isInitialAppLoad && (isLoadingDaily || isLoadingWeekly) && !dataFetchTime) {
            return <span role="status" aria-live="polite">{connectingMsg}</span>;
        }
        if (!dataFetchTime) {
            return <span role="status" aria-live="polite">{awaitingMsg}</span>;
        }
        const timeSinceFetch = appCurrentTime - dataFetchTime;
        return `Live Data (7-day): ${timeSinceFetch < 30000 ? 'just now' : formatTimeAgo(timeSinceFetch)} | USGS Feed Updated: ${lastUpdated || 'N/A'}`;
    }, [isLoadingDaily, isLoadingWeekly, dataFetchTime, appCurrentTime, lastUpdated, isInitialAppLoad, formatTimeAgo]);

    const currentAlertConfig = useMemo(() => {
        if (highestRecentAlert && ALERT_LEVELS[highestRecentAlert.toUpperCase()]) {
            return ALERT_LEVELS[highestRecentAlert.toUpperCase()];
        }
        return null;
    }, [highestRecentAlert]);

    const keyStatsForGlobe = useMemo(() => {
        if ((isLoadingDaily || isLoadingWeekly) || !earthquakesLast24Hours || !earthquakesLast72Hours) { // Check loading state from hook
            return {
                lastHourCount: <SkeletonText width="w-6" height="h-6" className="inline-block bg-slate-600" />,
                count24h: <SkeletonText width="w-8" height="h-6" className="inline-block bg-slate-600" />,
                count72h: <SkeletonText width="w-8" height="h-6" className="inline-block bg-slate-600" />,
                strongest24hDisplayString: <SkeletonText width="w-12" height="h-6" className="inline-block bg-slate-600" />,
                strongest24hRawMagnitude: null,
                strongest72hDisplayString: <SkeletonText width="w-12" height="h-6" className="inline-block bg-slate-600" />,
                strongest72hRawMagnitude: null,
            };
        }
        const stats24h = calculateStats(earthquakesLast24Hours);
        const stats72h = calculateStats(earthquakesLast72Hours);
        return {
            lastHourCount: earthquakesLastHour?.length || 0,
            count24h: stats24h.totalEarthquakes,
            count72h: stats72h.totalEarthquakes,
            strongest24hDisplayString: stats24h.strongestMagnitude, // Already formatted "M X.X" or "N/A"
            strongest24hRawMagnitude: stats24h.strongestMagnitudeRaw, // Raw number or null
            strongest72hDisplayString: stats72h.strongestMagnitude, // Already formatted "M X.X" or "N/A"
            strongest72hRawMagnitude: stats72h.strongestMagnitudeRaw, // Raw number or null
        };
    }, [earthquakesLastHour, earthquakesLast24Hours, earthquakesLast72Hours, isLoadingDaily, isLoadingWeekly, calculateStats]);

    // --- ADDED: Memo for recent significant quakes for the overview panel ---
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
        const counts = REGIONS.map(r => ({ ...r, count: 0 }));
        earthquakesLast24Hours.forEach(q => {
            const region = getRegionForEarthquake(q);
            const regionCounter = counts.find(r => r.name === region.name);
            if (regionCounter) regionCounter.count++;
        });
        const sortedRegions = counts.filter(r => r.count > 0).sort((a, b) => b.count - a.count);
        return sortedRegions.slice(0,2);
    }, [earthquakesLast24Hours, REGIONS, getRegionForEarthquake]);

    const overviewClusters = useMemo(() => {
        if (!activeClusters || activeClusters.length === 0) {
            return [];
        }

        const processed = activeClusters.map(cluster => {
            if (!cluster || cluster.length === 0) {
                return null;
            }

            let maxMag = -Infinity;
            let earliestTime = Infinity;
            let latestTime = -Infinity;
            let strongestQuakeInCluster = null;

            cluster.forEach(quake => {
                if (quake.properties.mag > maxMag) {
                    maxMag = quake.properties.mag;
                    strongestQuakeInCluster = quake;
                }
                if (quake.properties.time < earliestTime) {
                    earliestTime = quake.properties.time;
                }
                if (quake.properties.time > latestTime) {
                    latestTime = quake.properties.time;
                }
            });

            if (!strongestQuakeInCluster) strongestQuakeInCluster = cluster[0]; // Fallback if all mags are null/equal

            const locationName = strongestQuakeInCluster.properties.place || 'Unknown Location';

            // Determine time range object
            let timeRange = { prefix: "", value: "Time N/A", suffix: "" };
            const now = Date.now();
            const durationMillis = now - earliestTime; // Duration since the earliest quake in cluster started

            if (earliestTime !== Infinity) {
                // If the cluster's quakes are all very recent (e.g., within last 24 hours from now)
                if (now - latestTime < 24 * 60 * 60 * 1000 && cluster.length > 1) {
                    const clusterDurationMillis = latestTime - earliestTime;
                    if (clusterDurationMillis < 60 * 1000) { // less than a minute
                        timeRange = { prefix: "Active ", value: "just now", suffix: "" };
                    } else if (clusterDurationMillis < 60 * 60 * 1000) { // less than an hour
                        timeRange = { prefix: "Active over ", value: `${Math.round(clusterDurationMillis / (60 * 1000))}m`, suffix: "" };
                    } else {
                        timeRange = { prefix: "Active over ", value: formatTimeDuration(clusterDurationMillis), suffix: "" };
                    }
                } else { // Older clusters or single quake "clusters" (if minQuakes was 1)
                    timeRange = { prefix: "Started ", value: formatTimeAgo(durationMillis), suffix: "" };
                }
            }
            // A simpler alternative for timeRange (if chosen):
            // if (earliestTime !== Infinity && latestTime !== Infinity) {
            //    timeRange = { prefix: "Active: ", value: `${formatDate(earliestTime)} - ${formatDate(latestTime)}`, suffix: "" };
            // }

            return {
                id: `overview_cluster_${strongestQuakeInCluster.id}_${cluster.length}`, // Create a somewhat unique ID
                locationName,
                quakeCount: cluster.length,
                maxMagnitude: maxMag,
                timeRange: timeRange, // Assign the object here
                // For sorting and potential future use:
                _maxMagInternal: maxMag,
                _quakeCountInternal: cluster.length,
                _earliestTimeInternal: earliestTime,
                _latestTimeInternal: latestTime, // **** ADDED _latestTimeInternal ****
                originalQuakes: cluster,
                strongestQuakeId: strongestQuakeInCluster.id,
            };
        }).filter(Boolean); // Remove any nulls if a cluster was empty

        // Sort clusters:
        processed.sort((a, b) => {
            // Primary sort: by latest time in cluster (descending - most recent first)
            if (b._latestTimeInternal !== a._latestTimeInternal) {
                return b._latestTimeInternal - a._latestTimeInternal;
            }
            // Secondary sort: by max magnitude (descending - strongest first)
            if (b._maxMagInternal !== a._maxMagInternal) {
                return b._maxMagInternal - a._maxMagInternal;
            }
            // Tertiary sort: by quake count (descending) for further tie-breaking
            return b._quakeCountInternal - a._quakeCountInternal;
        });

        // Filter clusters to include only those with a max magnitude >= MAJOR_QUAKE_THRESHOLD
        const significantClusters = processed.filter(cluster => cluster._maxMagInternal >= MAJOR_QUAKE_THRESHOLD);

        // Temporary debug logs - REMOVE AFTER DEBUGGING
        // console.log("----------- DEBUG: Processed Clusters (before sort) -----------");
        // activeClusters.map(clusterRaw => { // Renamed to avoid conflict
        //     // Simplified reconstruction for logging - this is NOT the full component logic
        //     if (!clusterRaw || clusterRaw.length === 0) return null;
        //     let maxMag = -Infinity, earliestTime = Infinity, latestTime = -Infinity, strongestQuakeInCluster = null;
        //     clusterRaw.forEach(quake => {
        //         if (quake.properties.mag > maxMag) maxMag = quake.properties.mag;
        //         if (quake.properties.time < earliestTime) earliestTime = quake.properties.time;
        //         if (quake.properties.time > latestTime) latestTime = quake.properties.time;
        //     });
        //     strongestQuakeInCluster = clusterRaw.sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0))[0] || clusterRaw[0];
        //     return { id: `overview_cluster_${strongestQuakeInCluster?.id}_${clusterRaw.length}`, _latestTimeInternal: latestTime, _maxMagInternal: maxMag, _quakeCountInternal: clusterRaw.length };
        // }).filter(Boolean)
        //   .forEach(p => console.log(p.id, p._latestTimeInternal, p._maxMagInternal, p._quakeCountInternal));
        // console.log("----------- DEBUG: Processed Clusters (after sort) -----------");
        // processed.forEach(p => console.log(p.id, p._latestTimeInternal, p._maxMagInternal, p._quakeCountInternal));
        // console.log("----------- DEBUG: Significant Clusters (after filter) -----------");
        // significantClusters.forEach(p => console.log(p.id, p._latestTimeInternal, p._maxMagInternal, p._quakeCountInternal));


        return significantClusters;

    }, [activeClusters, formatTimeAgo, formatTimeDuration]);

    // Removed useEffect hook for registering cluster definitions

    // --- Event Handlers ---
    const navigate = useNavigate();

    // Slugify helper function
    const slugify = useCallback((text) => {
        if (!text) return 'unknown-location';
        return text
            .toString()
            .toLowerCase()
            .replace(/\s+/g, '-') // Replace spaces with -
            .replace(/[^\w-]+/g, '') // Remove all non-word chars except -
            .replace(/--+/g, '-') // Replace multiple - with single -
            .replace(/^-+/, '') // Trim - from start of text
            .replace(/-+$/, ''); // Trim - from end of text
    }, []);

    const handleQuakeClick = useCallback((quake) => {
        if (quake?.isCluster && quake?.clusterDetails) {
            // This is a cluster point (existing logic seems fine for clusters)
            const clusterInfo = quake.clusterDetails;
            const numQuakesDisplay = clusterInfo.quakes.length;
            const maxMagDisplay = quake.properties.mag;

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
            console.log("Cluster clicked:", quake);

        } else {
            // Logic for individual earthquake clicks
            const props = quake?.properties;
            const id = quake?.id;
            if (props && id) {
                const mag = typeof props.mag === 'number' ? props.mag.toFixed(1) : 'unknown';
                const place = props.place || 'Unknown Location';
                const locationSlug = slugify(place);
                // Construct the new URL: /quake/m[magnitude]-[location-slug]-[usgs-id]
                const newDetailPath = `/quake/m${mag}-${locationSlug}-${id}`;
                navigate(newDetailPath);
            } else {
                console.warn("Missing properties or id for individual earthquake:", quake);
                alert(`Earthquake: M ${props?.mag?.toFixed(1) || 'N/A'} - ${props?.place || 'Unknown location'}. Insufficient data to show details.`);
            }
        }
    }, [navigate, slugify]); // Added slugify to dependencies

    // Helper function for /feeds SEO
    const getFeedPageSeoInfo = useCallback((feedTitle, activePeriod) => {
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
    }, []); // Empty dependency array as function definition does not change

    // const handleCloseDetail = useCallback(() => setSelectedDetailUrl(null), []); // Removed
    const handleNotableQuakeSelect = useCallback((quakeFromFeature) => {
        setFocusedNotableQuake(quakeFromFeature); // Use setter from UIStateContext
        const props = quakeFromFeature?.properties;
        const id = quakeFromFeature?.id;

        if (props && id) {
            const mag = typeof props.mag === 'number' ? props.mag.toFixed(1) : 'unknown';
            const place = props.place || quakeFromFeature.name || 'Unknown Location'; // Use quakeFromFeature.name as fallback for place
            const locationSlug = slugify(place);
            // Construct the new URL: /quake/m[magnitude]-[location-slug]-[usgs-id]
            const newDetailPath = `/quake/m${mag}-${locationSlug}-${id}`;
            navigate(newDetailPath);
        } else {
            console.warn("Missing properties or id for notable earthquake:", quakeFromFeature);
            alert(`Featured Quake: ${props?.place || quakeFromFeature?.name || 'N/A'}\nInsufficient data to show details.`);
        }
    }, [navigate, setFocusedNotableQuake, slugify]); // Added slugify and setFocusedNotableQuake

    const handleClusterSummaryClick = useCallback((clusterData) => {
        const count = clusterData.quakeCount;
        // Use the component's slugify utility for consistency
        const locationSlug = slugify(clusterData.locationName);
        const maxMagnitude = parseFloat(clusterData.maxMagnitude).toFixed(1);
        const strongestQuakeId = clusterData.strongestQuakeId;

        const newUrl = `/cluster/${count}-quakes-near-${locationSlug}-up-to-m${maxMagnitude}-${strongestQuakeId}`;
        navigate(newUrl);
    }, [navigate, slugify]); // Added slugify to dependencies

    const initialDataLoaded = useMemo(() => earthquakesLastHour || earthquakesLast24Hours || earthquakesLast72Hours || earthquakesLast7Days, [earthquakesLastHour, earthquakesLast24Hours, earthquakesLast72Hours, earthquakesLast7Days]);

    // --- Sidebar onClick Handlers ---
    const handleSetSidebarOverview = useCallback(() => setActiveSidebarView('overview_panel'), [setActiveSidebarView]);
    const handleSetSidebarDetails1hr = useCallback(() => setActiveSidebarView('details_1hr'), [setActiveSidebarView]);
    const handleSetSidebarDetails24hr = useCallback(() => setActiveSidebarView('details_24hr'), [setActiveSidebarView]);
    const handleSetSidebarDetails7day = useCallback(() => setActiveSidebarView('details_7day'), [setActiveSidebarView]);
    const handleSetSidebarDetails14day = useCallback(() => setActiveSidebarView('details_14day'), [setActiveSidebarView]);
    const handleSetSidebarDetails30day = useCallback(() => setActiveSidebarView('details_30day'), [setActiveSidebarView]);
    const handleSetSidebarLearnMore = useCallback(() => setActiveSidebarView('learn_more'), [setActiveSidebarView]);

    // --- Full Screen Loader ---
    if (showFullScreenLoader) { // Uses isLoadingInitialData from hook
        return (
            <div
                className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white antialiased"
                role="status"
                aria-live="polite"
            >
                <svg className="animate-spin h-12 w-12 text-indigo-400 mb-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg>
                <p className="text-2xl font-light text-indigo-300 mb-3">{currentLoadingMessage}</p>
                <div className="w-1/3 h-1 bg-indigo-700 rounded-full overflow-hidden mt-2"> <div className="h-full bg-indigo-400 animate-pulse-short" style={{ animationDuration: `${LOADING_MESSAGE_INTERVAL_MS * INITIAL_LOADING_MESSAGES.length / 1000}s`}}></div> </div>
                <style>{`@keyframes pulseShort{0%{width:0%}100%{width:100%}}.animate-pulse-short{animation:pulseShort linear infinite}`}</style>
                <p className="text-xs text-slate-500 mt-10">Seismic Data Visualization</p>
            </div>
        );
    }

    // --- Main Render ---

    return (
        <div className="flex flex-col h-[100svh] font-sans bg-slate-900 text-slate-100 antialiased">
            <header className="bg-slate-800 text-white pt-2 sm:pt-4 pb-1 sm:pb-2 px-2 shadow-lg z-40 border-b border-slate-700">
                <div className="mx-auto flex flex-col sm:flex-row justify-between items-center px-3">
                    <h1 className="text-base sm:text-lg md:text-xl font-bold text-indigo-400">Global Seismic Activity Monitor</h1>
                    <p className="text-[0.7rem] sm:text-xs sm:text-sm text-slate-400 mt-0.5 sm:mt-0">{headerTimeDisplay}</p>
                </div>
            </header>

            {/* This main flex container now has padding-bottom for mobile to avoid overlap with BottomNav */}
            <div className="flex flex-1 overflow-hidden pb-16 lg:pb-0">

                {/* MAIN CONTENT AREA - This will now adapt based on activeMobileView */}
                {/* On mobile, only ONE of its direct children should be 'block', others 'hidden' */}
                {/* On desktop (lg:), the globe wrapper is 'lg:block' and mobile content sections are 'lg:hidden' */}
                <main className="flex-1 relative bg-slate-900 lg:bg-black w-full min-w-0 overflow-y-auto">
                    <ErrorBoundary>
                        <Suspense fallback={<RouteLoadingFallback />}>
                            <Routes>
                              <Route
                                path="/"
                                element={
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
                                    <GlobeLayout
                                      globeFocusLng={globeFocusLng}
                                      handleQuakeClick={handleQuakeClick}
                                      getMagnitudeColor={getMagnitudeColor}
                                      // Pass new state for GeoJSON
                                      coastlineData={coastlineData}
                                      tectonicPlatesData={tectonicPlatesData}
                                      areGeoJsonAssetsLoading={areGeoJsonAssetsLoading}
                                      activeClusters={activeClusters} // This now uses calculatedClusters
                                      lastMajorQuake={lastMajorQuake}
                                      formatTimeDuration={formatTimeDuration}
                                      handleNotableQuakeSelect={handleNotableQuakeSelect}
                                      keyStatsForGlobe={keyStatsForGlobe}
                                      // areClustersLoading prop removed
                                    />
                                  </>
                                }
                              >
                                {/* Child routes for modals correctly nested HERE */}
                                <Route
                                  path="quake/*"
                                  element={<EarthquakeDetailModalComponent />}
                                />
                                <Route
                                  path="cluster/:clusterId"
                                  element={
                                    <ClusterDetailModalWrapper
                                      overviewClusters={overviewClusters}
                                      formatDate={formatDate}
                                      getMagnitudeColorStyle={getMagnitudeColorStyle}
                                      onIndividualQuakeSelect={handleQuakeClick}
                                      formatTimeAgo={formatTimeAgo}
                                      formatTimeDuration={formatTimeDuration}
                                      areParentClustersLoading={false} // Pass static false
                                    />
                                  }
                                />
                              </Route> {/* End of main "/" route and its children */}

                              {/* Other top-level routes as siblings */}
                              <Route path="/overview" element={
                                  <OverviewPage
                                    ALERT_LEVELS={ALERT_LEVELS}
                                    getMagnitudeColor={getMagnitudeColor}
                                    formatDate={formatDate}
                                    handleQuakeClick={handleQuakeClick}
                                    latestFeelableQuakesSnippet={latestFeelableQuakesSnippet}
                                    formatTimeAgo={formatTimeAgo}
                                    formatTimeDuration={formatTimeDuration}
                                    getRegionForEarthquake={getRegionForEarthquake}
                                    calculateStats={calculateStats}
                                    overviewClusters={overviewClusters}
                                    handleClusterSummaryClick={handleClusterSummaryClick}
                                    topActiveRegionsOverview={topActiveRegionsOverview}
                                    REGIONS={REGIONS}
                                    navigate={navigate}
                                  />
                              } />
                              <Route path="/feeds" element={
                                  <FeedsPageLayoutComponent
                                    handleQuakeClick={handleQuakeClick}
                                    getFeedPageSeoInfo={getFeedPageSeoInfo}
                                    calculateStats={calculateStats}
                                    getMagnitudeColorStyle={getMagnitudeColorStyle}
                                    formatTimeAgo={formatTimeAgo}
                                    formatDate={formatDate}
                                  />
                              } />
                              <Route path="/learn" element={<LearnPage />} />
                              <Route path="/learn/magnitude-vs-intensity" element={<MagnitudeVsIntensityPage />} />
                              <Route path="/learn/measuring-earthquakes" element={<MeasuringEarthquakesPage />} />
                              <Route path="/learn/plate-tectonics" element={<PlateTectonicsPage />} />

                            </Routes>
                </Suspense>
            </ErrorBoundary>
                </main>

                {/* DESKTOP SIDEBAR (hidden on small screens, flex on large) */}
                {/* The desktop sidebar's visibility is controlled by CSS (hidden lg:flex) */}
                <aside className="hidden lg:flex w-[480px] bg-slate-800 p-0 flex-col border-l border-slate-700 shadow-2xl z-20">
                    <div className="p-3 border-b border-slate-700"> <h2 className="text-md font-semibold text-indigo-400">Detailed Earthquake Analysis</h2> </div>
                    <div className="flex-shrink-0 p-2 space-x-1 border-b border-slate-700 whitespace-nowrap overflow-x-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-700">
                        <button onClick={handleSetSidebarOverview} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'overview_panel' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>Overview</button>
                        <button onClick={handleSetSidebarDetails1hr} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'details_1hr' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>Last Hour</button>
                        <button onClick={handleSetSidebarDetails24hr} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'details_24hr' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>Last 24hr</button>
                        <button onClick={handleSetSidebarDetails7day} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'details_7day' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>Last 7day</button>
                        {hasAttemptedMonthlyLoad && !isLoadingMonthly && allEarthquakes.length > 0 && ( <> <button onClick={handleSetSidebarDetails14day} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'details_14day' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>14-Day</button> <button onClick={handleSetSidebarDetails30day} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'details_30day' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>30-Day</button> </> )}
                        <button onClick={handleSetSidebarLearnMore} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'learn_more' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>Learn</button>
                    </div>
                    {/*
                        PERFORMANCE NOTE:
                        The 'key' prop was previously used on this div and tied to 'activeSidebarView'.
                        This caused the entire sidebar content to re-mount on every view change, leading to performance issues.
                        It has been removed. Child components below are now responsible for their own rendering optimization,
                        primarily through `React.memo` and ensuring their props are stable or memoized.
                        Avoid re-introducing a 'key' here that changes frequently unless absolutely necessary and the performance
                        implications are understood and accepted.
                    */}
                    <div className="flex-1 p-2 space-y-3 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800">
                        {error && !showFullScreenLoader && (
                            <div
                                className="bg-red-700 bg-opacity-40 border border-red-600 text-red-200 px-3 py-2 rounded-md text-xs"
                                role="alert"
                                aria-live="assertive"
                            >
                                <strong className="font-bold">Data Error:</strong> {error} Some data might be unavailable.
                            </div>
                        )}
                        {activeSidebarView === 'overview_panel' && (
                            <>
                            <AlertDisplay
                                currentAlertConfig={currentAlertConfig}
                                hasRecentTsunamiWarning={hasRecentTsunamiWarning}
                                ALERT_LEVELS={ALERT_LEVELS}
                            />
                            {(currentAlertConfig && activeAlertTriggeringQuakes && activeAlertTriggeringQuakes.length > 0 && (
                                <Suspense fallback={<ChartLoadingFallback message="Loading alert quakes table..." />}>
                                    <PaginatedEarthquakeTable
                                        title={`Alert Triggering Quakes (${currentAlertConfig.text})`}
                                        earthquakes={activeAlertTriggeringQuakes}
                                        isLoading={false} // Assuming data is loaded if activeAlertTriggeringQuakes is populated
                                        onQuakeClick={handleQuakeClick}
                                        itemsPerPage={3}
                                        periodName="alerting"
                                        getMagnitudeColorStyle={getMagnitudeColorStyle}
                                        formatTimeAgo={formatTimeAgo}
                                        formatDate={formatDate}
                                        SkeletonText={SkeletonText} // Pass SkeletonText
                                        SkeletonTableRow={SkeletonTableRow} // Pass SkeletonTableRow
                                    />
                                </Suspense>
                            ))}
                            <TimeSinceLastMajorQuakeBanner
                                    // Props sourced from context are removed
                                formatTimeDuration={formatTimeDuration}
                                getRegionForEarthquake={getRegionForEarthquake}
                                handleQuakeClick={handleQuakeClick}
                                getMagnitudeColor={getMagnitudeColor}
                            />
                            {/*
                                PERFORMANCE NOTE: SummaryStatisticsCard is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <SummaryStatisticsCard
                                title="Overview (Last 24 Hours)"
                                currentPeriodData={earthquakesLast24Hours}
                                previousPeriodData={prev24HourData} // Ensure trends are shown on desktop too
                                isLoading={isLoadingDaily || (isLoadingWeekly && !earthquakesLast24Hours)}
                                calculateStats={calculateStats}
                                // FEELABLE_QUAKE_THRESHOLD is imported by SummaryStatisticsCard
                            />
                            <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md text-sm">
                                <h3 className="text-md font-semibold mb-1 text-indigo-400">Most Active Region (Last 24h)</h3>
                                {isLoadingDaily && !earthquakesLast24Hours ? (
                                    <SkeletonText width="w-full" height="h-5" className="bg-slate-600"/>
                                ) : (
                                    topActiveRegionsOverview.length > 0 ? (
                                                                topActiveRegionsOverview.map((region, index) => (
                                                                    <p key={region.name} className={`text-slate-300 ${index > 0 ? 'mt-0.5' : ''}`}>
                                                                            <span className="font-semibold" style={{color: region.color || '#9CA3AF'}}>
                                                                            {index + 1}. {region.name}
                                                                            </span>
                                                                        {region.count > 0 ? ` - ${region.count} events` : ''}
                                                                    </p>
                                                                ))
                                                            ) : (
                                                                <p className="text-slate-400 text-xs">(No significant regional activity in the last 24 hours)</p>
                                                            )
                                )}
                            </div>

                                {/* Active Earthquake Clusters Section - Desktop Sidebar */}
                                <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md mt-3">
                                <h3 className="text-md font-semibold mb-2 text-indigo-300"> Active Earthquake Clusters </h3>
                                {overviewClusters && overviewClusters.length > 0 ? (
                                    <ul className="space-y-2"> {overviewClusters.map(cluster => ( <ClusterSummaryItem clusterData={cluster} key={cluster.id} onClusterSelect={handleClusterSummaryClick} /> ))} </ul>
                                ) : ( <p className="text-xs text-slate-400 text-center py-2"> No significant active clusters detected. </p> )}
                                </div>

                            {recentSignificantQuakesForOverview.length > 0 && (
                                <Suspense fallback={<ChartLoadingFallback message="Loading significant quakes table..." />}>
                                    {/*
                                        PERFORMANCE NOTE: PaginatedEarthquakeTable is memoized.
                                        Ensure any new complex props (objects, functions, arrays) passed to it
                                        are memoized using useMemo or useCallback in this component (HomePage)
                                        to prevent unnecessary re-renders.
                                        (Example: onQuakeClick, getMagnitudeColorStyle, formatTimeAgo, formatDate are already useCallback'd or stable).
                                    */}
                                    <PaginatedEarthquakeTable
                                        title={`Recent Significant Quakes (M${MAJOR_QUAKE_THRESHOLD.toFixed(1)}+)`}
                                        earthquakes={recentSignificantQuakesForOverview}
                                        isLoading={isLoadingWeekly && !earthquakesLast7Days}
                                        onQuakeClick={handleQuakeClick}
                                        itemsPerPage={10}
                                        defaultSortKey="time"
                                        initialSortDirection="descending"
                                        periodName="last 7 days"
                                        getMagnitudeColorStyle={getMagnitudeColorStyle}
                                        formatTimeAgo={formatTimeAgo}
                                        formatDate={formatDate}
                                    />
                                </Suspense>
                            )}
                            {isLoadingWeekly && recentSignificantQuakesForOverview.length === 0 && !earthquakesLast7Days &&
                                <div className="bg-slate-700 p-3 rounded-lg mt-4 border border-slate-600 shadow-md">
                                    <h3 className="text-md font-semibold mb-2 text-indigo-400">Recent Significant Quakes (M{MAJOR_QUAKE_THRESHOLD.toFixed(1)}+)</h3>
                                    <SkeletonListItem /> <SkeletonListItem />
                                </div>
                            }
                            <div className="bg-slate-700 p-2 rounded-lg border border-slate-600 shadow-md">
                                <h3 className="text-md font-semibold mb-1 text-indigo-400">Did You Know?</h3>
                                <InfoSnippet topic="magnitude" />
                            </div>
                            <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md text-sm">
                                <h3 className="text-md font-semibold mb-1 text-indigo-400">Earthquakes & Tectonic Plates</h3>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                    Most earthquakes occur along the edges of tectonic plates... {/* Truncated for brevity */}
                                </p>
                            </div>
                        </> )}
                        {activeSidebarView === 'learn_more' && ( <div className="p-2 bg-slate-700 rounded-md"> <h3 className="text-md font-semibold text-indigo-400 mb-2">Learn About Earthquakes</h3> <InfoSnippet topic="magnitude" /> <InfoSnippet topic="depth" /> <InfoSnippet topic="intensity" /> <InfoSnippet topic="alerts" /> <InfoSnippet topic="strike"/> <InfoSnippet topic="dip"/> <InfoSnippet topic="rake"/> <InfoSnippet topic="stressAxes"/> <InfoSnippet topic="beachball"/> <InfoSnippet topic="stationsUsed"/> <InfoSnippet topic="azimuthalGap"/> <InfoSnippet topic="rmsError"/> </div> )}

                        {/* ... (rest of your desktop sidebar logic for details_1hr, details_24hr, etc. This part of your code was already handling these views) ... */}
                        {activeSidebarView === 'details_1hr' && !isLoadingDaily && earthquakesLastHour && ( <div className="space-y-3">
                            {/*
                                PERFORMANCE NOTE: SummaryStatisticsCard is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <SummaryStatisticsCard title="Summary (Last Hour)" currentPeriodData={earthquakesLastHour} previousPeriodData={earthquakesPriorHour} isLoading={isLoadingDaily} calculateStats={calculateStats} />
                            {/*
                                PERFORMANCE NOTE: MagnitudeDistributionSVGChart is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <Suspense fallback={<ChartLoadingFallback />}><MagnitudeDistributionSVGChart earthquakes={earthquakesLastHour} titleSuffix="(Last Hour)" isLoading={isLoadingDaily} getMagnitudeColor={getMagnitudeColor} /></Suspense>
                            {/*
                                PERFORMANCE NOTE: MagnitudeDepthScatterSVGChart is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <Suspense fallback={<ChartLoadingFallback />}><MagnitudeDepthScatterSVGChart earthquakes={earthquakesLastHour} titleSuffix="(Last Hour)" isLoading={isLoadingDaily} getMagnitudeColor={getMagnitudeColor} /></Suspense>
                            {/*
                                PERFORMANCE NOTE: RegionalDistributionList is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <Suspense fallback={<ChartLoadingFallback message="Loading list..." />}><RegionalDistributionList earthquakes={earthquakesLastHour} titleSuffix="(Last Hour)" isLoading={isLoadingDaily} getRegionForEarthquake={getRegionForEarthquake} /></Suspense>
                            {/*
                                PERFORMANCE NOTE: PaginatedEarthquakeTable is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                                (Example: onQuakeClick, getMagnitudeColorStyle, formatTimeAgo, formatDate are already useCallback'd or stable).
                            */}
                            <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}><PaginatedEarthquakeTable title="Earthquakes (Last Hour)" earthquakes={earthquakesLastHour} isLoading={isLoadingDaily} onQuakeClick={handleQuakeClick} itemsPerPage={10} periodName="last hour" getMagnitudeColorStyle={getMagnitudeColorStyle} formatTimeAgo={formatTimeAgo} formatDate={formatDate} /></Suspense>
                        </div> )}
                        {activeSidebarView === 'details_24hr' && !isLoadingWeekly && earthquakesLast24Hours && ( <div className="space-y-3">
                            {/*
                                PERFORMANCE NOTE: SummaryStatisticsCard is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <SummaryStatisticsCard title="Summary (Last 24 Hours)" currentPeriodData={earthquakesLast24Hours} previousPeriodData={prev24HourData} isLoading={isLoadingWeekly || (isLoadingDaily && !prev24HourData) } calculateStats={calculateStats} />
                            {/*
                                PERFORMANCE NOTE: MagnitudeDistributionSVGChart is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <Suspense fallback={<ChartLoadingFallback />}><MagnitudeDistributionSVGChart earthquakes={earthquakesLast24Hours} titleSuffix="(Last 24 Hours)" isLoading={isLoadingDaily} getMagnitudeColor={getMagnitudeColor} /></Suspense>
                            {/*
                                PERFORMANCE NOTE: MagnitudeDepthScatterSVGChart is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <Suspense fallback={<ChartLoadingFallback />}><MagnitudeDepthScatterSVGChart earthquakes={earthquakesLast24Hours} titleSuffix="(Last 24 Hours)" isLoading={isLoadingDaily} getMagnitudeColor={getMagnitudeColor} /></Suspense>
                            {/*
                                PERFORMANCE NOTE: RegionalDistributionList is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <Suspense fallback={<ChartLoadingFallback message="Loading list..." />}><RegionalDistributionList earthquakes={earthquakesLast24Hours} titleSuffix="(Last 24 Hours)" isLoading={isLoadingDaily} getRegionForEarthquake={getRegionForEarthquake} /></Suspense>
                            {/*
                                PERFORMANCE NOTE: PaginatedEarthquakeTable is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                                (Example: onQuakeClick, getMagnitudeColorStyle, formatTimeAgo, formatDate are already useCallback'd or stable).
                            */}
                            <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}><PaginatedEarthquakeTable title="Earthquakes (Last 24 Hours)" earthquakes={earthquakesLast24Hours} isLoading={isLoadingDaily} onQuakeClick={handleQuakeClick} periodName="last 24 hours" getMagnitudeColorStyle={getMagnitudeColorStyle} formatTimeAgo={formatTimeAgo} formatDate={formatDate} /></Suspense>
                        </div> )}
                        {activeSidebarView === 'details_7day' && !isLoadingWeekly && earthquakesLast7Days && ( <div className="space-y-3">
                            {/*
                                PERFORMANCE NOTE: SummaryStatisticsCard is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <SummaryStatisticsCard title="Summary (Last 7 Days)" currentPeriodData={earthquakesLast7Days} previousPeriodData={prev7DayData} isLoading={isLoadingWeekly || (isLoadingMonthly && hasAttemptedMonthlyLoad && !prev7DayData) } calculateStats={calculateStats} />
                            {/*
                                PERFORMANCE NOTE: MagnitudeDistributionSVGChart is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <Suspense fallback={<ChartLoadingFallback />}><MagnitudeDistributionSVGChart earthquakes={earthquakesLast7Days} titleSuffix="(Last 7 Days)" isLoading={isLoadingWeekly} getMagnitudeColor={getMagnitudeColor} /></Suspense>
                            {/*
                                PERFORMANCE NOTE: MagnitudeDepthScatterSVGChart is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <Suspense fallback={<ChartLoadingFallback />}><MagnitudeDepthScatterSVGChart earthquakes={earthquakesLast7Days} titleSuffix="(Last 7 Days)" isLoading={isLoadingWeekly} getMagnitudeColor={getMagnitudeColor} /></Suspense>
                            {/*
                                PERFORMANCE NOTE: EarthquakeTimelineSVGChart is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <Suspense fallback={<ChartLoadingFallback />}><EarthquakeTimelineSVGChart earthquakes={earthquakesLast7Days} days={7} titleSuffix="(Last 7 Days)" isLoading={isLoadingWeekly} /></Suspense>
                            {/*
                                PERFORMANCE NOTE: RegionalDistributionList is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <Suspense fallback={<ChartLoadingFallback message="Loading list..." />}><RegionalDistributionList earthquakes={earthquakesLast7Days} titleSuffix="(Last 7 Days)" isLoading={isLoadingWeekly} getRegionForEarthquake={getRegionForEarthquake} /></Suspense>
                            {/*
                                PERFORMANCE NOTE: PaginatedEarthquakeTable is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                                (Example: onQuakeClick, getMagnitudeColorStyle, formatTimeAgo, formatDate are already useCallback'd or stable).
                            */}
                            <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}><PaginatedEarthquakeTable title="Earthquakes (Last 7 Days)" earthquakes={earthquakesLast7Days} isLoading={isLoadingWeekly} onQuakeClick={handleQuakeClick} periodName="last 7 days" getMagnitudeColorStyle={getMagnitudeColorStyle} formatTimeAgo={formatTimeAgo} formatDate={formatDate} /></Suspense>
                        </div> )}

                        {activeSidebarView !== 'overview_panel' && activeSidebarView !== 'learn_more' && !hasAttemptedMonthlyLoad && ( <div className="text-center py-3 mt-3 border-t border-slate-700"> <button onClick={loadMonthlyData} disabled={isLoadingMonthly} className="w-full bg-indigo-600 hover:bg-indigo-500 focus:bg-indigo-700 text-white px-4 py-2 text-sm font-medium rounded-md transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"> {isLoadingMonthly ? 'Loading Historical Data...' : 'Load Full 14 & 30-Day Analysis'} </button> </div> )}
                        {hasAttemptedMonthlyLoad && isLoadingMonthly && <p className="text-xs text-slate-400 text-center py-3 animate-pulse">Loading extended data archives...</p>}
                        {hasAttemptedMonthlyLoad && monthlyError && !isLoadingMonthly && <p className="text-red-300 text-xs text-center py-1">Error loading monthly data: {monthlyError}</p>}

                        {activeSidebarView === 'details_14day' && hasAttemptedMonthlyLoad && !isLoadingMonthly && !monthlyError && allEarthquakes.length > 0 && ( <div className="space-y-3">
                            {/*
                                PERFORMANCE NOTE: SummaryStatisticsCard is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <SummaryStatisticsCard title="Summary (Last 14 Days)" currentPeriodData={earthquakesLast14Days} previousPeriodData={prev14DayData} isLoading={isLoadingMonthly} calculateStats={calculateStats} />
                            {/*
                                PERFORMANCE NOTE: MagnitudeDistributionSVGChart is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <Suspense fallback={<ChartLoadingFallback />}><MagnitudeDistributionSVGChart earthquakes={earthquakesLast14Days} titleSuffix="(Last 14 Days)" isLoading={isLoadingMonthly} getMagnitudeColor={getMagnitudeColor} /></Suspense>
                            {/*
                                PERFORMANCE NOTE: MagnitudeDepthScatterSVGChart is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <Suspense fallback={<ChartLoadingFallback />}><MagnitudeDepthScatterSVGChart earthquakes={earthquakesLast14Days} titleSuffix="(Last 14 Days)" isLoading={isLoadingMonthly} getMagnitudeColor={getMagnitudeColor} /></Suspense>
                            {/*
                                PERFORMANCE NOTE: EarthquakeTimelineSVGChart is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <Suspense fallback={<ChartLoadingFallback />}><EarthquakeTimelineSVGChart earthquakes={earthquakesLast14Days} days={14} titleSuffix="(Last 14 Days)" isLoading={isLoadingMonthly}/></Suspense>
                            {/*
                                PERFORMANCE NOTE: PaginatedEarthquakeTable is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                                (Example: onQuakeClick, getMagnitudeColorStyle, formatTimeAgo, formatDate are already useCallback'd or stable).
                            */}
                            <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}><PaginatedEarthquakeTable title="All Earthquakes (Last 14 Days)" earthquakes={earthquakesLast14Days} isLoading={isLoadingMonthly} onQuakeClick={handleQuakeClick} itemsPerPage={10} defaultSortKey="time" initialSortDirection="descending" getMagnitudeColorStyle={getMagnitudeColorStyle} formatTimeAgo={formatTimeAgo} formatDate={formatDate}/></Suspense>
                        </div> )}
                        {activeSidebarView === 'details_30day' && hasAttemptedMonthlyLoad && !isLoadingMonthly && !monthlyError && allEarthquakes.length > 0 && ( <div className="space-y-3">
                            {/*
                                PERFORMANCE NOTE: SummaryStatisticsCard is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <SummaryStatisticsCard title="Summary (Last 30 Days)" currentPeriodData={earthquakesLast30Days} isLoading={isLoadingMonthly} calculateStats={calculateStats} />
                            {/*
                                PERFORMANCE NOTE: MagnitudeDistributionSVGChart is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <Suspense fallback={<ChartLoadingFallback />}><MagnitudeDistributionSVGChart earthquakes={allEarthquakes} titleSuffix="(Last 30 Days)" isLoading={isLoadingMonthly} getMagnitudeColor={getMagnitudeColor}/></Suspense>
                            {/*
                                PERFORMANCE NOTE: MagnitudeDepthScatterSVGChart is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <Suspense fallback={<ChartLoadingFallback />}><MagnitudeDepthScatterSVGChart earthquakes={allEarthquakes} titleSuffix="(Last 30 Days)" isLoading={isLoadingMonthly} getMagnitudeColor={getMagnitudeColor}/></Suspense>
                            {/*
                                PERFORMANCE NOTE: RegionalDistributionList is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                            */}
                            <Suspense fallback={<ChartLoadingFallback message="Loading list..." />}><RegionalDistributionList earthquakes={allEarthquakes} titleSuffix="(Last 30 Days)" isLoading={isLoadingMonthly} getRegionForEarthquake={getRegionForEarthquake}/></Suspense>
                            <div className="grid grid-cols-1 gap-3">
                                {/*
                                    PERFORMANCE NOTE: PaginatedEarthquakeTable is memoized.
                                    Ensure any new complex props (objects, functions, arrays) passed to it
                                    are memoized using useMemo or useCallback in this component (HomePage)
                                    to prevent unnecessary re-renders.
                                    (Example: onQuakeClick, getMagnitudeColorStyle, formatTimeAgo, formatDate are already useCallback'd or stable).
                                */}
                                <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}><PaginatedEarthquakeTable title="Top 10 Strongest (30d)" earthquakes={allEarthquakes} isLoading={isLoadingMonthly} onQuakeClick={handleQuakeClick} itemsPerPage={10} defaultSortKey="mag" initialSortDirection="descending" getMagnitudeColorStyle={getMagnitudeColorStyle} formatTimeAgo={formatTimeAgo} formatDate={formatDate}/></Suspense>
                                {/*
                                    PERFORMANCE NOTE: PaginatedEarthquakeTable is memoized.
                                    Ensure any new complex props (objects, functions, arrays) passed to it
                                    are memoized using useMemo or useCallback in this component (HomePage)
                                    to prevent unnecessary re-renders.
                                    (Example: onQuakeClick, getMagnitudeColorStyle, formatTimeAgo, formatDate are already useCallback'd or stable).
                                */}
                                <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}><PaginatedEarthquakeTable title="Most Widely Felt (30d)" earthquakes={allEarthquakes} isLoading={isLoadingMonthly} onQuakeClick={handleQuakeClick} itemsPerPage={5} defaultSortKey="felt" initialSortDirection="descending" filterPredicate={q => q.properties.felt !== null && typeof q.properties.felt === 'number' && q.properties.felt > FELT_REPORTS_THRESHOLD} getMagnitudeColorStyle={getMagnitudeColorStyle} formatTimeAgo={formatTimeAgo} formatDate={formatDate}/></Suspense>
                                {/*
                                    PERFORMANCE NOTE: PaginatedEarthquakeTable is memoized.
                                    Ensure any new complex props (objects, functions, arrays) passed to it
                                    are memoized using useMemo or useCallback in this component (HomePage)
                                    to prevent unnecessary re-renders.
                                    (Example: onQuakeClick, getMagnitudeColorStyle, formatTimeAgo, formatDate are already useCallback'd or stable).
                                */}
                                <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}><PaginatedEarthquakeTable title="Most Significant (30d)" earthquakes={allEarthquakes} isLoading={isLoadingMonthly} onQuakeClick={handleQuakeClick} itemsPerPage={5} defaultSortKey="sig" initialSortDirection="descending" filterPredicate={q => q.properties.sig !== null && typeof q.properties.sig === 'number' && q.properties.sig > SIGNIFICANCE_THRESHOLD} getMagnitudeColorStyle={getMagnitudeColorStyle} formatTimeAgo={formatTimeAgo} formatDate={formatDate}/></Suspense>
                            </div>
                            {/*
                                PERFORMANCE NOTE: PaginatedEarthquakeTable is memoized.
                                Ensure any new complex props (objects, functions, arrays) passed to it
                                are memoized using useMemo or useCallback in this component (HomePage)
                                to prevent unnecessary re-renders.
                                (Example: onQuakeClick, getMagnitudeColorStyle, formatTimeAgo, formatDate are already useCallback'd or stable).
                            */}
                            <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}><PaginatedEarthquakeTable title="All Earthquakes (Last 30 Days)" earthquakes={allEarthquakes} isLoading={isLoadingMonthly} onQuakeClick={handleQuakeClick} itemsPerPage={15} defaultSortKey="time" initialSortDirection="descending" getMagnitudeColorStyle={getMagnitudeColorStyle} formatTimeAgo={formatTimeAgo} formatDate={formatDate}/></Suspense>
                        </div> )}

                        {(isLoadingDaily || isLoadingWeekly || (hasAttemptedMonthlyLoad && isLoadingMonthly)) && !showFullScreenLoader && // Use hook's isLoadingDaily/Weekly
                            activeSidebarView !== 'overview_panel' && activeSidebarView !== 'learn_more' &&
                            !((activeSidebarView === 'details_1hr' && earthquakesLastHour) || (activeSidebarView === 'details_24hr' && earthquakesLast24Hours && prev24HourData) || (activeSidebarView === 'details_7day' && earthquakesLast7Days)) &&
                            ( <div className="text-center py-10"><p className="text-sm text-slate-500 animate-pulse">Loading selected data...</p></div> )
                        }
                        {hasAttemptedMonthlyLoad && !isLoadingMonthly && !monthlyError && allEarthquakes.length === 0 && (activeSidebarView === 'details_14day' || activeSidebarView === 'details_30day') &&( <p className="text-slate-400 text-center py-4 text-sm">No 14/30 day earthquake data found or loaded.</p> )}
                        {!initialDataLoaded && !isLoadingDaily && !isLoadingWeekly && (activeSidebarView === 'details_1hr' || activeSidebarView === 'details_24hr' || activeSidebarView === 'details_7day' ) && ( <div className="text-center py-10"><p className="text-sm text-slate-500">No data available for this period.</p></div> )}
                    </div> {/* End of desktop sidebar scrollable content */}
                    <footer className="p-1.5 text-center border-t border-slate-700 mt-auto">
                        <p className="text-[10px] text-slate-500">&copy; {new Date().getFullYear()} Built By Vibes | Data: USGS</p>
                    </footer>
                </aside>
            </div> {/* End of main flex container (main + aside) */}

            <BottomNav onNavClick={setActiveSidebarView} activeView={activeSidebarView} />

            {/* Removed direct rendering of EarthquakeDetailView, now handled by routing */}
        </div>
    );
}

// Removed definition of EarthquakeDetailModal as it's now imported.

export default App;