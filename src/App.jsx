// src/App.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Routes, Route, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import SeoMetadata from './SeoMetadata'; // Import SeoMetadata
import EarthquakeDetailView from './EarthquakeDetailView';
import InteractiveGlobeView from './InteractiveGlobeView';
import NotableQuakeFeature from './NotableQuakeFeature';
import PreviousNotableQuakeFeature from './PreviousNotableQuakeFeature'; // Import the new component
import InfoSnippet from './InfoSnippet';
import coastlineData from './ne_110m_coastline.json'; // Direct import
import tectonicPlatesData from './TectonicPlateBoundaries.json';
import GlobalLastMajorQuakeTimer                                    from "./GlobalLastMajorQuakeTimer.jsx";
import BottomNav                                                    from "./BottomNav.jsx"; // Direct import
import ClusterSummaryItem from './ClusterSummaryItem'; // Add this line
import ClusterDetailModal from './ClusterDetailModal';
import ClusterDetailModalWrapper from './ClusterDetailModalWrapper.jsx';
import { calculateDistance, getMagnitudeColor } from './utils';

// --- Configuration & Helpers ---
const USGS_API_URL_DAY = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
const USGS_API_URL_WEEK = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson';
const USGS_API_URL_MONTH = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson';
const CLUSTER_MAX_DISTANCE_KM = 100; // Max distance for quakes to be in the same cluster
const CLUSTER_MIN_QUAKES = 3; // Min number of quakes to form a cluster
const CLUSTER_TIME_WINDOW_HOURS = 48; // Time window in hours to consider for clustering
const MAJOR_QUAKE_THRESHOLD = 4.5;
const FEELABLE_QUAKE_THRESHOLD = 2.5;
const FELT_REPORTS_THRESHOLD = 0;
const SIGNIFICANCE_THRESHOLD = 0;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const LOADING_MESSAGE_INTERVAL_MS = 750;
const HEADER_TIME_UPDATE_INTERVAL_MS = 60 * 1000;
const TOP_N_CLUSTERS_OVERVIEW = 3; // Number of top clusters to show in overview

const INITIAL_LOADING_MESSAGES = [
    "Connecting to Global Seismic Network...", "Fetching Most Recent Events...", "Processing Live Data...",
    "Analyzing Tectonic Movements...", "Compiling Regional Summaries...",
    "Finalizing Real-time Display..."
];
const MONTHLY_LOADING_MESSAGES = [
    "Accessing Historical Archives...", "Fetching Extended Seismic Records...", "Processing 14 & 30-Day Data...",
    "Identifying Long-term Patterns...", "Calculating Deep Earth Insights...", "Preparing Historical Analysis...",
];

const ALERT_LEVELS = {
    RED: { text: "RED", colorClass: "bg-red-100 border-red-500 text-red-700", detailsColorClass: "bg-red-50 border-red-400 text-red-800", description: "Potential for 1,000+ fatalities / $1B+ losses." },
    ORANGE: { text: "ORANGE", colorClass: "bg-orange-100 border-orange-500 text-orange-700", detailsColorClass: "bg-orange-50 border-orange-400 text-orange-800", description: "Potential for 100-999 fatalities / $100M-$1B losses." },
    YELLOW: { text: "YELLOW", colorClass: "bg-yellow-100 border-yellow-500 text-yellow-700", detailsColorClass: "bg-yellow-50 border-yellow-400 text-yellow-800", description: "Potential for 1-99 fatalities / $1M-$100M losses." },
    GREEN: { text: "GREEN", colorClass: "bg-green-100 border-green-500 text-green-700", detailsColorClass: "bg-green-50 border-green-400 text-green-800", description: "No significant impact expected (<1 fatality / <$1M losses)." }
};

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
 * @returns {Array<Array<object>>} An array of clusters, where each cluster is an array of earthquake objects.
 */
function findActiveClusters(earthquakes, maxDistanceKm, minQuakes) {
    const clusters = [];
    const processedQuakeIds = new Set();

    // Sort earthquakes by magnitude (descending) to potentially form clusters around stronger events first.
    const sortedEarthquakes = [...earthquakes].sort((a, b) => (b.properties.mag || 0) - (a.properties.mag || 0));

    for (const quake of sortedEarthquakes) {
        if (processedQuakeIds.has(quake.id)) {
            continue;
        }

        const newCluster = [quake];
        processedQuakeIds.add(quake.id);
        const baseLat = quake.geometry.coordinates[1];
        const baseLon = quake.geometry.coordinates[0];

        for (const otherQuake of sortedEarthquakes) {
            if (processedQuakeIds.has(otherQuake.id) || otherQuake.id === quake.id) {
                continue;
            }

            const dist = calculateDistance(
                baseLat,
                baseLon,
                otherQuake.geometry.coordinates[1],
                otherQuake.geometry.coordinates[0]
            );

            if (dist <= maxDistanceKm) {
                newCluster.push(otherQuake);
                processedQuakeIds.add(otherQuake.id);
            }
        }

        if (newCluster.length >= minQuakes) {
            clusters.push(newCluster);
        }
    }
    return clusters;
}

// --- App Component ---
/**
 * The main application component for the Global Seismic Activity Monitor.
 * It fetches, processes, and displays earthquake data using various views and components.
 * Manages application state including earthquake data, loading states, user selections, and UI display modes.
 * Provides routing for different sections of the application like overview, feeds, learning materials, and earthquake details.
 * @returns {JSX.Element} The rendered App component.
 */
function App() {

    const [appRenderTrigger, setAppRenderTrigger] = useState(0);
    const [activeFeedPeriod, setActiveFeedPeriod] = useState('last_24_hours'); // NEW STATE - default to 24 hours

    // --- Callback Hooks (Formatting, Colors, Regions, Stats) ---
    /**
     * Formats a timestamp into a human-readable date and time string.
     * @param {number} timestamp - The Unix timestamp in milliseconds.
     * @returns {string} The formatted date and time string (e.g., "Jan 1, 10:00 AM") or 'N/A' if timestamp is invalid.
     */
    const formatDate = useCallback((timestamp) => {
        if (!timestamp) return 'N/A';
        return new Date(timestamp).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
    }, []);

    /**
     * Formats a duration in milliseconds into a human-readable "time ago" string.
     * @param {number | null} milliseconds - The duration in milliseconds.
     * @returns {string} The formatted time ago string (e.g., "5 min ago", "just now") or 'N/A' if input is invalid.
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

    // getMagnitudeColor is now imported from utils.js and used directly where needed,
    // or passed as a prop if a component needs it but App itself doesn't use it directly in a useCallback here.
    // The useCallback wrapper for getMagnitudeColor previously here is removed.

    /**
     * Returns Tailwind CSS class strings for background and text color based on earthquake magnitude.
     * @param {number | null | undefined} magnitude - The earthquake magnitude.
     * @returns {string} Tailwind CSS class strings.
     */
    const getMagnitudeColorStyle = useCallback((magnitude) => {
        if (magnitude === null || magnitude === undefined) return 'bg-slate-600 text-slate-100';
        if (magnitude < 1.0) return 'bg-cyan-800 bg-opacity-50 text-cyan-100';
        if (magnitude < 2.5) return 'bg-cyan-700 bg-opacity-50 text-cyan-100';
        if (magnitude < 4.0) return 'bg-emerald-700 bg-opacity-50 text-emerald-100';
        if (magnitude < 5.0) return 'bg-yellow-700 bg-opacity-50 text-yellow-100';
        if (magnitude < 6.0) return 'bg-orange-700 bg-opacity-50 text-orange-100';
        if (magnitude < 7.0) return 'bg-orange-800 bg-opacity-60 text-orange-50';
        if (magnitude < 8.0) return 'bg-red-800 bg-opacity-60 text-red-50';
        return 'bg-red-900 bg-opacity-70 text-red-50';
    }, []);

    const REGIONS = useMemo(() => [
        { name: "Alaska & W. Canada", latMin: 50, latMax: 72, lonMin: -170, lonMax: -125, color: "#A78BFA" },
        { name: "California & W. USA", latMin: 30, latMax: 50, lonMin: -125, lonMax: -110, color: "#F472B6" },
        { name: "Japan & Kuril Isl.", latMin: 25, latMax: 50, lonMin: 125, lonMax: 155, color: "#34D399" },
        { name: "Indonesia & Philippines", latMin: -10, latMax: 25, lonMin: 95, lonMax: 140, color: "#F59E0B" },
        { name: "S. America (Andes)", latMin: -55, latMax: 10, lonMin: -80, lonMax: -60, color: "#60A5FA" },
        { name: "Mediterranean", latMin: 30, latMax: 45, lonMin: -10, lonMax: 40, color: "#818CF8" },
        { name: "Central America", latMin: 5, latMax: 30, lonMin: -118, lonMax: -77, color: "#FBBF24" },
        { name: "New Zealand & S. Pacific", latMin: -55, latMax: -10, lonMin: 160, lonMax: -150, color: "#C4B5FD" },
        { name: "Other / Oceanic", latMin: -90, latMax: 90, lonMin: -180, lonMax: 180, color: "#9CA3AF" }
    ], []);

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
     * Calculates various statistics from a list of earthquake objects.
     * @param {Array<object>} earthquakes - An array of earthquake feature objects.
     * @returns {object} An object containing calculated statistics (totalEarthquakes, averageMagnitude, etc.).
     */
    const calculateStats = useCallback((earthquakes) => {
        const baseStats = { totalEarthquakes: 0, averageMagnitude: 'N/A', strongestMagnitude: 'N/A', significantEarthquakes: 0, feelableEarthquakes: 0, averageDepth: 'N/A', deepestEarthquake: 'N/A', averageSignificance: 'N/A', highestAlertLevel: null };
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
        return { totalEarthquakes, averageMagnitude: avgMag?.toFixed(2) || "N/A", strongestMagnitude: strongMag?.toFixed(1) || "N/A", significantEarthquakes: sigQuakes, feelableEarthquakes: feelQuakes, averageDepth: avgDepth?.toFixed(1) || "N/A", deepestEarthquake: deepQuake?.toFixed(1) || "N/A", averageSignificance: avgSig || "N/A", highestAlertLevel: highAlert };
    }, []);

    // --- Skeleton Components ---
    /**
     * A skeleton loader component for text.
     * @param {object} props - The component's props.
     * @param {string} [props.width='w-3/4'] - Tailwind CSS class for width.
     * @param {string} [props.height='h-4'] - Tailwind CSS class for height.
     * @param {string} [props.className=''] - Additional Tailwind CSS classes.
     * @returns {JSX.Element} The rendered SkeletonText component.
     */
    const SkeletonText = ({width = 'w-3/4', height = 'h-4', className = ''}) => <div className={`bg-slate-700 rounded ${width} ${height} animate-pulse mb-2 ${className}`}></div>;

    /**
     * A skeleton loader component for a block of content.
     * @param {object} props - The component's props.
     * @param {string} [props.height='h-24'] - Tailwind CSS class for height.
     * @param {string} [props.className=''] - Additional Tailwind CSS classes.
     * @returns {JSX.Element} The rendered SkeletonBlock component.
     */
    const SkeletonBlock = ({height = 'h-24', className = ''}) => <div className={`bg-slate-700 rounded ${height} animate-pulse ${className}`}></div>;

    /**
     * A skeleton loader component for a list item.
     * @returns {JSX.Element} The rendered SkeletonListItem component.
     */
    const SkeletonListItem = () => <div className="flex items-center justify-between p-2 bg-slate-700 rounded animate-pulse mb-2"><SkeletonText width="w-1/2"/><SkeletonText width="w-1/4"/></div>;

    /**
     * A skeleton loader component for a table row.
     * @param {object} props - The component's props.
     * @param {number} [props.cols=4] - Number of columns in the row.
     * @returns {JSX.Element} The rendered SkeletonTableRow component.
     */
    const SkeletonTableRow = ({cols = 4}) => (<tr className="animate-pulse bg-slate-700">{[...Array(cols)].map((_, i) => (<td key={i} className="px-3 py-2 sm:px-4 whitespace-nowrap"><SkeletonText width="w-full"/></td>))}</tr>);

    // --- Sub-Components (Memoized) ---

    /**
     * A React component that displays a banner with the time since the last major earthquake.
     * @param {object} props - The component's props.
     * @param {object | null} props.lastMajorQuake - The last major earthquake object.
     * @param {number | null} props.timeBetweenPreviousMajorQuakes - Time in milliseconds between the last two major quakes.
     * @param {boolean} props.isLoadingInitial - Whether initial data is loading.
     * @param {boolean} props.isLoadingMonthly - Whether monthly data is loading.
     * @param {number} props.majorQuakeThreshold - The magnitude threshold for a major quake.
     * @returns {JSX.Element} The rendered TimeSinceLastMajorQuakeBanner component.
     */
    const TimeSinceLastMajorQuakeBanner = React.memo(({
                                                          lastMajorQuake,
                                                          previousMajorQuake,
                                                          timeBetweenPreviousMajorQuakes,
                                                          isLoadingInitial,
                                                          isLoadingMonthly,
                                                          majorQuakeThreshold
                                                      }) => {
        const [timeAgoFormatted, setTimeAgoFormatted] = useState('Calculating...');

        useEffect(() => {
            let intervalId = null;
            if (lastMajorQuake?.properties?.time) {
                const startTime = lastMajorQuake.properties.time;
                const updateDisplay = () => {
                    const timeSince = Date.now() - startTime;
                    setTimeAgoFormatted(formatTimeDuration(timeSince));
                };
                updateDisplay();
                intervalId = setInterval(updateDisplay, 1000);
            } else {
                setTimeAgoFormatted('N/A');
            }

            return () => {
                if (intervalId) clearInterval(intervalId);
            };
        }, [lastMajorQuake]);

        const bannerLoading = isLoadingInitial || (isLoadingMonthly && !lastMajorQuake);
        if (bannerLoading && !lastMajorQuake) {
            return ( <div className="bg-slate-700 p-6 mb-6 rounded-lg border border-slate-600 text-center animate-pulse"><SkeletonText width="w-1/4 mx-auto"/> <div className="h-10 bg-slate-600 rounded w-1/2 mx-auto my-2"></div> <SkeletonText width="w-1/3 mx-auto"/><SkeletonText width="w-full mx-auto mt-2" height="h-5"/> <hr className="my-4 border-slate-600"/> <SkeletonText width="w-1/4 mx-auto"/> <div className="h-8 bg-slate-600 rounded w-1/3 mx-auto my-2"></div> <SkeletonText width="w-1/3 mx-auto"/></div>);
        }
        if (!lastMajorQuake && !isLoadingInitial && !isLoadingMonthly) {
            return ( <div className="bg-green-700 bg-opacity-30 border-l-4 border-green-500 text-green-200 p-4 mb-6 rounded-md text-center"><p className="font-bold text-lg">No significant earthquakes (M{majorQuakeThreshold.toFixed(1)}+) recorded in the available data period.</p></div>);
        }

        const region = lastMajorQuake ? getRegionForEarthquake(lastMajorQuake) : null;
        const location = lastMajorQuake?.properties.place || 'Unknown Location';
        const prevIntervalFmt = timeBetweenPreviousMajorQuakes !== null ? formatTimeDuration(timeBetweenPreviousMajorQuakes) : null;
        const mag = lastMajorQuake?.properties.mag?.toFixed(1);
        const depth = lastMajorQuake?.geometry?.coordinates?.[2]?.toFixed(1);
        const magColor = lastMajorQuake ? getMagnitudeColor(lastMajorQuake.properties.mag) : '#D1D5DB';

        // Details for the previous major quake
        const prevRegion = previousMajorQuake ? getRegionForEarthquake(previousMajorQuake) : null;
        const prevLocation = previousMajorQuake?.properties.place || 'Unknown Location';
        const prevMag = previousMajorQuake?.properties.mag?.toFixed(1);
        const prevDepth = previousMajorQuake?.geometry?.coordinates?.[2]?.toFixed(1);
        const prevMagColor = previousMajorQuake ? getMagnitudeColor(previousMajorQuake.properties.mag) : '#D1D5DB';

        return (<div className="bg-slate-700 p-4 rounded-lg border border-slate-600 text-center text-slate-200">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">IT HAS BEEN:</p>
            <p className="text-2xl md:text-3xl font-bold text-indigo-400 tracking-tight mb-2 min-h-[36px] md:min-h-[44px] flex items-center justify-center">
                {lastMajorQuake ? timeAgoFormatted : <SkeletonText width="w-1/2 mx-auto" height="h-10"/>}
            </p>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Since the last significant (M<span style={{fontWeight: 'bold'}}>{majorQuakeThreshold.toFixed(1)}</span>+) earthquake.</p>
            {lastMajorQuake ? (<p className="text-sm text-slate-300 mt-1 mb-3">M<span style={{ color: magColor, fontWeight: 'bold' }}>{mag || '...'}</span> - {location || 'Details Pending...'}<a href={lastMajorQuake.properties.url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 ml-2 text-xs">(details)</a></p>) : (<SkeletonText width="w-full mx-auto mt-1 mb-3" height="h-5"/>)}
            <hr className="my-3 border-slate-600"/>
            {isLoadingMonthly && !prevIntervalFmt && lastMajorQuake ? (
                                <><SkeletonText width="w-1/4 mx-auto"/> <div className="h-8 bg-slate-600 rounded w-1/3 mx-auto my-2"></div> <SkeletonText width="w-1/3 mx-auto"/> <SkeletonText width="w-full mx-auto mt-1 mb-1" height="h-4"/> </>
                            ) : (
                                <>
                                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">PREVIOUSLY IT HAD BEEN:</p>
                                        <p className="text-xl md:text-2xl font-bold text-slate-400 tracking-tight mb-1 min-h-[30px] md:min-h-[36px] flex items-center justify-center">
                                            {prevIntervalFmt ?? (lastMajorQuake ? 'N/A (Only one M4.5+ found or data pending)' : 'N/A')}
                                        </p>
                                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Between significant earthquakes.</p>
                                        {previousMajorQuake && prevIntervalFmt ? (
                                            <p className="text-xs text-slate-400 mt-1">
                                                    (M<span style={{ color: prevMagColor, fontWeight: 'bold' }}>{prevMag || '...'}</span>
                                                    {' - '}{prevLocation || 'Details Pending...'}
                                                <a href="#" onClick={(e) => { e.preventDefault(); handleQuakeClick(previousMajorQuake); }} className="text-indigo-400 hover:text-indigo-300 ml-2 text-xs">(details)</a>
                                                </p>
                                        ) : prevIntervalFmt && <SkeletonText width="w-full mx-auto mt-1" height="h-4" className="bg-slate-600" /> }                </>
                            )}
        </div>);
    });

    /**
     * A React component that displays a card with summary statistics for a given period.
     * @param {object} props - The component's props.
     * @param {string} props.title - The title of the card.
     * @param {Array<object> | null} props.currentPeriodData - Earthquake data for the current period.
     * @param {Array<object> | null} [props.previousPeriodData=null] - Earthquake data for the previous period (for trend comparison).
     * @param {boolean} props.isLoading - Whether the data is currently loading.
     * @returns {JSX.Element} The rendered SummaryStatisticsCard component.
     */
    const SummaryStatisticsCard = React.memo(({title, currentPeriodData, previousPeriodData = null, isLoading}) => {
        const cardBg = "bg-slate-700"; const textColor = "text-slate-300"; const titleColor = "text-indigo-400"; const statBoxBg = "bg-slate-800"; const statValueColor = "text-sky-400"; const statLabelColor = "text-slate-400"; const borderColor = "border-slate-600";
        if (isLoading || currentPeriodData === null) {
            return (<div className={`${cardBg} p-4 rounded-lg border ${borderColor} shadow-md`}> <h3 className={`text-lg font-semibold mb-3 ${titleColor}`}>{title}</h3> <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">{[...Array(8)].map((_, i) => ( <div key={i} className={`${statBoxBg} p-2 rounded-lg text-center animate-pulse`}> <SkeletonText width="w-1/2 mx-auto" height="h-6 mb-1" className="bg-slate-600" /> <SkeletonText width="w-3/4 mx-auto" height="h-3" className="bg-slate-600" /> </div>))}</div> </div>);
        }
        if (currentPeriodData.length === 0 && !["Summary (Last Hour)", "Summary (Last 24 Hours)", "Overview (Last 24 Hours)"].includes(title)) { // --- MODIFIED: Added "Overview (Last 24 Hours)"
            return (<div className={`${cardBg} p-4 rounded-lg border ${borderColor} shadow-md`}><h3 className={`text-lg font-semibold mb-3 ${titleColor}`}>{title}</h3><p className={`${textColor} text-center py-3 text-sm`}>No earthquake data for this period.</p></div>);
        }
        const currentStats = calculateStats(currentPeriodData);
        const previousStats = previousPeriodData ? calculateStats(previousPeriodData) : null;
        const getTrendDisplay = (currentValue, previousValue) => {
            if (!previousValue || previousValue === 'N/A' || currentValue === 'N/A' || ["Summary (Last Hour)"].includes(title)) return null;
            const currentNum = parseFloat(currentValue); const previousNum = parseFloat(previousValue);
            if (isNaN(currentNum) || isNaN(previousNum)) return null;
            const diff = currentNum - previousNum;
            const isCount = !String(currentValue).includes('.');
            if (!isCount && Math.abs(diff) < 0.05 && currentNum !== 0) return null;
            if (isCount && diff === 0) return null;
            const trendColor = diff > 0 ? 'text-red-400' : diff < 0 ? 'text-green-400' : 'text-slate-500';
            const trendSign = diff > 0 ? '▲' : diff < 0 ? '▼' : '';
            return <span className={`ml-1 text-xs ${trendColor}`}>{trendSign} {Math.abs(diff).toFixed(String(currentValue).includes('.') ? 1 : 0)}</span>;
        };
        const statsToDisplay = [ { label: 'Total Events', value: currentStats.totalEarthquakes, trend: getTrendDisplay(currentStats.totalEarthquakes, previousStats?.totalEarthquakes) }, { label: 'Avg. Magnitude', value: currentStats.averageMagnitude, trend: getTrendDisplay(currentStats.averageMagnitude, previousStats?.averageMagnitude) }, { label: 'Strongest Mag.', value: currentStats.strongestMagnitude, trend: getTrendDisplay(currentStats.strongestMagnitude, previousStats?.strongestMagnitude) }, { label: `Feelable (M${FEELABLE_QUAKE_THRESHOLD.toFixed(1)}+)`, value: currentStats.feelableEarthquakes, trend: getTrendDisplay(currentStats.feelableEarthquakes, previousStats?.feelableEarthquakes) }, { label: 'Significant (M4.5+)', value: currentStats.significantEarthquakes, trend: getTrendDisplay(currentStats.significantEarthquakes, previousStats?.significantEarthquakes) }, { label: 'Avg. Depth (km)', value: currentStats.averageDepth, trend: getTrendDisplay(currentStats.averageDepth, previousStats?.averageDepth) }, { label: 'Deepest (km)', value: currentStats.deepestEarthquake, trend: getTrendDisplay(currentStats.deepestEarthquake, previousStats?.deepestEarthquake) }, { label: 'Avg. Significance', value: currentStats.averageSignificance, trend: getTrendDisplay(currentStats.averageSignificance, previousStats?.averageSignificance) },];
        return (<div className={`${cardBg} p-4 rounded-lg border ${borderColor} shadow-md`}> <h3 className={`text-lg font-semibold mb-3 ${titleColor}`}>{title}</h3> {(currentPeriodData.length === 0 && ["Summary (Last Hour)", "Summary (Last 24 Hours)", "Overview (Last 24 Hours)"].includes(title)) && ( <p className={`${textColor} text-center py-3 text-sm`}>No earthquakes recorded in this period.</p>)} {currentPeriodData.length > 0 && ( <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">{statsToDisplay.map(stat => ( <div key={stat.label} className={`${statBoxBg} p-2 rounded-lg text-center border border-slate-700`}> <p className={`text-lg md:text-xl font-bold ${statValueColor}`}>{stat.value}{stat.trend}</p> <p className={`text-xs ${statLabelColor}`}>{stat.label}</p> </div>))}</div>)}</div>);
    });

    /**
     * A React component that displays a list of earthquake counts by region.
     * @param {object} props - The component's props.
     * @param {Array<object> | null} props.earthquakes - An array of earthquake feature objects.
     * @param {string} [props.titleSuffix='(Last 30 Days)'] - Suffix for the component's title.
     * @param {boolean} props.isLoading - Whether the data is currently loading.
     * @returns {JSX.Element | null} The rendered RegionalDistributionList component, or null if no data for 'Last Hour'.
     */
    const RegionalDistributionList = React.memo(({earthquakes, titleSuffix = "(Last 30 Days)", isLoading}) => {
        const cardBg = "bg-slate-700"; const textColor = "text-slate-300"; const titleColor = "text-indigo-400"; const itemBg = "bg-slate-800"; const itemHoverBg = "hover:bg-slate-600"; const countColor = "text-sky-400"; const borderColor = "border-slate-600";
        const regionalData = useMemo(() => {
            if (!earthquakes) return [];
            const counts = REGIONS.map(r => ({...r, count: 0}));
            earthquakes.forEach(q => {
                const region = getRegionForEarthquake(q);
                const rc = counts.find(r => r.name === region.name);
                if (rc) rc.count++;
            });
            return counts.filter(r => r.count > 0).sort((a, b) => b.count - a.count);
        }, [earthquakes, REGIONS, getRegionForEarthquake]);
        if (isLoading) return (<div className={`${cardBg} p-3 rounded-lg mt-4 border ${borderColor} shadow-md`}><h3 className={`text-md font-semibold mb-2 ${titleColor}`}>Regional Distribution {titleSuffix}</h3> <ul className="space-y-1">{[...Array(5)].map((_, i) => <SkeletonListItem key={i}/>)}</ul> </div>);
        if ((!earthquakes || earthquakes.length === 0 || regionalData.length === 0) && titleSuffix === '(Last Hour)') return null;
        if (!earthquakes || earthquakes.length === 0 || regionalData.length === 0) return ( <div className={`${cardBg} p-3 rounded-lg mt-4 border ${borderColor} shadow-md`}><h3 className={`text-md font-semibold mb-2 ${titleColor}`}>Regional Distribution {titleSuffix}</h3><p className={`text-xs ${textColor} text-center`}>No regional earthquake data.</p></div>);
        return (<div className={`${cardBg} p-3 rounded-lg mt-4 border ${borderColor} shadow-md`}> <h3 className={`text-md font-semibold mb-2 ${titleColor}`}>Regional Distribution {titleSuffix}</h3> <ul className="space-y-1 max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800">{regionalData.map(region => (<li key={region.name} className={`flex items-center justify-between p-1.5 ${itemBg} rounded ${itemHoverBg} transition-colors`}> <div className="flex items-center min-w-0 mr-2"><span className="w-3 h-3 rounded-sm mr-2 flex-shrink-0" style={{backgroundColor: region.color}}></span><span className={`text-xs ${textColor} truncate`} title={region.name}>{region.name}</span></div> <span className={`text-xs font-medium ${countColor} flex-shrink-0`}>{region.count}</span></li>))}</ul> </div>);
    });

    /**
     * A React component that displays an SVG bar chart of earthquake magnitude distribution.
     * @param {object} props - The component's props.
     * @param {Array<object> | null} props.earthquakes - An array of earthquake feature objects.
     * @param {string} [props.titleSuffix='(Last 30 Days)'] - Suffix for the component's title.
     * @param {boolean} props.isLoading - Whether the data is currently loading.
     * @returns {JSX.Element} The rendered MagnitudeDistributionSVGChart component.
     */
    const MagnitudeDistributionSVGChart = React.memo(({earthquakes, titleSuffix = "(Last 30 Days)", isLoading}) => {
        const cardBg = "bg-slate-700"; const titleColor = "text-indigo-400"; const axisLabelColor = "text-slate-400"; const tickLabelColor = "text-slate-500"; const barCountLabelColor = "text-slate-300"; const borderColor = "border-slate-600";
        const magnitudeRanges = useMemo(() => [
            {name: '<1', min: -Infinity, max: 0.99, color: getMagnitudeColor(0.5)},
            { name : '1-1.9', min : 1, max : 1.99, color: getMagnitudeColor(1.5) },
            {name: '2-2.9', min: 2, max: 2.99, color: getMagnitudeColor(2.5)},
            { name : '3-3.9', min : 3, max : 3.99, color: getMagnitudeColor(3.5) },
            {name: '4-4.9', min: 4, max: 4.99, color: getMagnitudeColor(4.5)},
            { name : '5-5.9', min : 5, max : 5.99, color: getMagnitudeColor(5.5) },
            {name: '6-6.9', min: 6, max: 6.99, color: getMagnitudeColor(6.5)},
            { name : '7+', min : 7, max : Infinity, color: getMagnitudeColor(7.5) },
        ], [getMagnitudeColor]);
        const data = useMemo(() => {
            if (!earthquakes) return [];
            return magnitudeRanges.map(range => ({
                name : range.name,
                count: earthquakes.filter(q => q.properties.mag !== null && q.properties.mag >= range.min && q.properties.mag <= range.max).length,
                color: range.color
            }));
        }, [earthquakes, magnitudeRanges]);
        if (isLoading) return <div className={`${cardBg} p-4 rounded-lg border ${borderColor} overflow-x-auto shadow-md`}><h3 className={`text-lg font-semibold mb-4 ${titleColor}`}>Magnitude Distribution {titleSuffix}</h3><SkeletonBlock height="h-[300px]" className="bg-slate-600"/></div>;
        if (!earthquakes || earthquakes.length === 0) return <div className={`${cardBg} p-4 rounded-lg border ${borderColor} overflow-x-auto shadow-md`}><h3 className={`text-lg font-semibold mb-4 ${titleColor}`}>Magnitude Distribution {titleSuffix}</h3><p className="text-slate-400 p-4 text-center text-sm">No data for chart.</p></div>;
        const chartHeight = 280; const barPadding = 10; const barWidth = 35; const yAxisLabelOffset = 45; const xAxisLabelOffset = 40; const svgWidth = data.length * (barWidth + barPadding) + yAxisLabelOffset; const maxCount = Math.max(...data.map(d => d.count), 0); const yAxisLabels = [];
        if (maxCount > 0) { const numL = 5; const step = Math.ceil(maxCount / numL) || 1; for (let i = 0; i <= maxCount; i += step) { if (yAxisLabels.length <= numL) yAxisLabels.push(i); else break; } if (!yAxisLabels.includes(maxCount) && yAxisLabels.length <= numL && maxCount > 0) yAxisLabels.push(maxCount); } else { yAxisLabels.push(0); }
        return (<div className={`${cardBg} p-4 rounded-lg border ${borderColor} overflow-x-auto shadow-md`}> <h3 className={`text-lg font-semibold mb-4 ${titleColor}`}>Magnitude Distribution {titleSuffix}</h3> <svg width="100%" height={chartHeight + xAxisLabelOffset} viewBox={`0 0 ${svgWidth} ${chartHeight + xAxisLabelOffset}`} className="overflow-visible"> <text transform={`translate(${yAxisLabelOffset / 3}, ${chartHeight / 2}) rotate(-90)`} textAnchor="middle" className={`text-xs fill-current ${axisLabelColor}`}>Count </text> <text x={yAxisLabelOffset + (svgWidth - yAxisLabelOffset) / 2} y={chartHeight + xAxisLabelOffset - 5} textAnchor="middle" className={`text-xs fill-current ${axisLabelColor}`}>Magnitude Range </text> {yAxisLabels.map((l, i) => { const yP = chartHeight - (l / (maxCount > 0 ? maxCount : 1) * chartHeight); return (<g key={`y-mag-${i}`}> <text x={yAxisLabelOffset - 5} y={yP + 4} textAnchor="end" className={`text-xs fill-current ${tickLabelColor}`}>{l}</text> <line x1={yAxisLabelOffset} y1={yP} x2={svgWidth} y2={yP} stroke="#475569" strokeDasharray="2,2"/> </g>); })} {data.map((item, i) => { const bH = maxCount > 0 ? (item.count / maxCount) * chartHeight : 0; const x = yAxisLabelOffset + i * (barWidth + barPadding); const y = chartHeight - bH; return (<g key={item.name}><title>{`${item.name}: ${item.count}`}</title> <rect x={x} y={y} width={barWidth} height={bH} fill={item.color} className="transition-all duration-300 ease-in-out hover:opacity-75"/> <text x={x + barWidth / 2} y={chartHeight + 15} textAnchor="middle" className={`text-xs fill-current ${tickLabelColor}`}>{item.name}</text> <text x={x + barWidth / 2} y={y - 5 > 10 ? y - 5 : 10} textAnchor="middle" className={`text-xs font-medium fill-current ${barCountLabelColor}`}>{item.count > 0 ? item.count : ''}</text> </g>); })} </svg> </div>);
    });

    /**
     * A React component that displays an SVG bar chart of earthquake frequency over a timeline.
     * @param {object} props - The component's props.
     * @param {Array<object> | null} props.earthquakes - An array of earthquake feature objects.
     * @param {number} [props.days=7] - The number of days to display on the timeline.
     * @param {string} [props.titleSuffix='(Last 7 Days)'] - Suffix for the component's title.
     * @param {boolean} props.isLoading - Whether the data is currently loading.
     * @returns {JSX.Element} The rendered EarthquakeTimelineSVGChart component.
     */
    const EarthquakeTimelineSVGChart = React.memo(({earthquakes, days = 7, titleSuffix = "(Last 7 Days)", isLoading}) => {
        const cardBg = "bg-slate-700"; const titleColor = "text-indigo-400"; const axisLabelColor = "text-slate-400"; const tickLabelColor = "text-slate-500"; const barCountLabelColor = "text-slate-300"; const barFillColor = "#818CF8"; const borderColor = "border-slate-600";
        const data = useMemo(() => { if (!earthquakes) return []; const countsByDay = {}; const today = new Date(); today.setHours(0, 0, 0, 0); const startDate = new Date(today); startDate.setDate(today.getDate() - (days - 1)); for (let i = 0; i < days; i++) { const d = new Date(startDate); d.setDate(startDate.getDate() + i); countsByDay[d.toLocaleDateString([], {month: 'short', day: 'numeric'})] = 0; } earthquakes.forEach(q => { const eD = new Date(q.properties.time); if (eD >= startDate && eD <= new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)) { const dS = eD.toLocaleDateString([], {month: 'short', day: 'numeric'}); if (countsByDay.hasOwnProperty(dS)) countsByDay[dS]++; } }); return Object.entries(countsByDay).map(([date, count]) => ({date, count})); }, [earthquakes, days]);
        if (isLoading) return <div className={`${cardBg} p-4 rounded-lg border ${borderColor} overflow-x-auto shadow-md`}><h3 className={`text-lg font-semibold mb-4 ${titleColor}`}>Earthquake Frequency {titleSuffix}</h3><SkeletonBlock height="h-[300px]" className="bg-slate-600"/></div>;
        if (!earthquakes || earthquakes.length === 0 || data.length === 0) return <div className={`${cardBg} p-4 rounded-lg border ${borderColor} overflow-x-auto shadow-md`}><h3 className={`text-lg font-semibold mb-4 ${titleColor}`}>Earthquake Frequency {titleSuffix}</h3><p className="text-slate-400 p-4 text-center text-sm">No data for chart.</p></div>;
        const chartHeight = 280; const lblInt = days > 15 ? Math.floor(days / 7) : (days > 7 ? 2 : 1); const barW = days > 15 ? (days > 25 ? 15 : 20) : 30; const barP = days > 15 ? 5 : 8; const yOffset = 45; const xOffset = 40; const svgW = data.length * (barW + barP) + yOffset; const maxC = Math.max(...data.map(d => d.count), 0); const yLbls = [];
        if (maxC > 0) { const numL = 5; const step = Math.ceil(maxC / numL) || 1; for (let i = 0; i <= maxC; i += step) { if (yLbls.length <= numL) yLbls.push(i); else break; } if (!yLbls.includes(maxC) && yLbls.length <= numL && maxC > 0) yLbls.push(maxC); if (yLbls.length === 0 && maxC === 0) yLbls.push(0); } else { yLbls.push(0); }
        return (<div className={`${cardBg} p-4 rounded-lg border ${borderColor} overflow-x-auto shadow-md`}> <h3 className={`text-lg font-semibold mb-4 ${titleColor}`}>Earthquake Frequency {titleSuffix}</h3>  <svg width="100%" height={chartHeight + xOffset} viewBox={`0 0 ${svgW} ${chartHeight + xOffset}`} className="overflow-visible"> <text transform={`translate(${yOffset / 3},${chartHeight / 2}) rotate(-90)`} textAnchor="middle" className={`text-xs fill-current ${axisLabelColor}`}>Count </text> <text x={yOffset + (svgW - yOffset) / 2} y={chartHeight + xOffset - 5} textAnchor="middle" className={`text-xs fill-current ${axisLabelColor}`}>Date </text> {yLbls.map((l, i) => { const yP = chartHeight - (l / (maxC > 0 ? maxC : 1) * chartHeight); return (<g key={`y-tl-${i}`}> <text x={yOffset - 5} y={yP + 4} textAnchor="end" className={`text-xs fill-current ${tickLabelColor}`}>{l}</text> <line x1={yOffset} y1={yP} x2={svgW} y2={yP} stroke="#475569" strokeDasharray="2,2"/> </g>); })} {data.map((item, i) => { const bH = maxC > 0 ? (item.count / maxC) * chartHeight : 0; const x = yOffset + i * (barW + barP); const y = chartHeight - bH; return (<g key={item.date}><title>{`${item.date}: ${item.count}`}</title> <rect x={x} y={y} width={barW} height={bH} fill={barFillColor} className="transition-all duration-300 ease-in-out hover:opacity-75"/> {i % lblInt === 0 && (<text x={x + barW / 2} y={chartHeight + 15} textAnchor="middle" className={`text-xs fill-current ${tickLabelColor}`}>{item.date}</text>)} <text x={x + barW / 2} y={y - 5 > 10 ? y - 5 : 10} textAnchor="middle" className={`text-xs font-medium fill-current ${barCountLabelColor}`}>{item.count > 0 ? item.count : ''}</text> </g>); })} </svg> </div>);
    });

    /**
     * A React component that displays an SVG scatter plot of earthquake magnitude versus depth.
     * It uses a ResizeObserver to dynamically adjust chart dimensions.
     * @param {object} props - The component's props.
     * @param {Array<object> | null} props.earthquakes - An array of earthquake feature objects.
     * @param {string} [props.titleSuffix='(Last 30 Days)'] - Suffix for the component's title.
     * @param {boolean} props.isLoading - Whether the data is currently loading.
     * @returns {JSX.Element} The rendered MagnitudeDepthScatterSVGChart component.
     */
    const MagnitudeDepthScatterSVGChart = React.memo(({earthquakes, titleSuffix = "(Last 30 Days)", isLoading}) => {
        const cardBg = "bg-slate-700"; const titleColor = "text-indigo-400"; const axisLabelColor = "text-slate-400"; const tickLabelColor = "text-slate-500"; const gridLineColor = "text-slate-600"; const borderColor = "border-slate-600";
        const chartContainerRef = useRef(null);
        const [chartDimensions, setChartDimensions] = useState({ width: 500, height: 350 });

        useEffect(() => {
            const chartContainer = chartContainerRef.current;
            if (!chartContainer) return;

            const resizeObserver = new ResizeObserver(entries => {
                if (!entries || !entries.length) return;
                const { width: observedWidth } = entries[0].contentRect;
                const newWidth = Math.max(observedWidth, 300);
                const newHeight = 350;

                setChartDimensions(prevDimensions => {
                    if (prevDimensions.width !== newWidth || prevDimensions.height !== newHeight) {
                        return { width: newWidth, height: newHeight };
                    }
                    return prevDimensions;
                });
            });
            resizeObserver.observe(chartContainer);

            const initialWidth = Math.max(chartContainer.clientWidth, 300);
            setChartDimensions(prevDimensions => {
                if (prevDimensions.width !== initialWidth || prevDimensions.height !== 350) {
                    return { width: initialWidth, height: 350 };
                }
                return prevDimensions;
            });

            return () => {
                if (chartContainer) {
                    resizeObserver.unobserve(chartContainer);
                }
            };
        }, []);

        const data = useMemo(() => {
            if (!earthquakes) return [];
            return earthquakes.map(q => ({
                mag: q.properties.mag,
                depth: q.geometry?.coordinates?.[2],
                id: q.id,
                place: q.properties.place
            })).filter(q => q.mag !== null && typeof q.mag === 'number' && q.depth !== null && typeof q.depth === 'number');
        }, [earthquakes]);

        if (isLoading) return <div ref={chartContainerRef} className={`${cardBg} p-4 rounded-lg border ${borderColor} overflow-hidden shadow-md`}><h3 className={`text-lg font-semibold mb-4 ${titleColor}`}>Magnitude vs. Depth {titleSuffix}</h3><SkeletonBlock height="h-[350px]" className="bg-slate-600"/></div>;
        if (!data || data.length === 0) return <div ref={chartContainerRef} className={`${cardBg} p-4 rounded-lg border ${borderColor} overflow-hidden shadow-md`}><h3 className={`text-lg font-semibold mb-4 ${titleColor}`}>Magnitude vs. Depth {titleSuffix}</h3><p className="text-slate-400 p-4 text-center text-sm">No sufficient data for chart.</p></div>;

        const { width: dynamicWidth, height: dynamicHeight } = chartDimensions;
        const p = {t: 20, r: 30, b: 50, l: 60};
        const chartContentWidth = dynamicWidth - p.l - p.r;
        const chartContentHeight = dynamicHeight - p.t - p.b;

        const mags = data.map(d => d.mag);
        const depths = data.map(d => d.depth);
        const minMag = mags.length > 0 ? Math.min(...mags) : 0;
        const maxMag = mags.length > 0 ? Math.max(...mags) : 0;
        const minDepth = depths.length > 0 ? Math.min(...depths) : 0;
        const maxDepth = depths.length > 0 ? Math.max(...depths) : 0;

        const xScale = (value) => (maxMag === minMag) ? p.l + chartContentWidth / 2 : p.l + ((value - minMag) / (maxMag - minMag)) * chartContentWidth;
        const yScale = (value) => (maxDepth === minDepth) ? p.t + chartContentHeight / 2 : p.t + ((value - minDepth) / (maxDepth - minDepth)) * chartContentHeight;

        const xTicks = [];
        const numXTicks = Math.max(2, Math.min(Math.floor(chartContentWidth / 80), 7));
        if (maxMag > minMag) {
            const xStep = (maxMag - minMag) / (numXTicks -1) || 1;
            for (let i = 0; i < numXTicks; i++) xTicks.push(parseFloat((minMag + i * xStep).toFixed(1)));
        } else {
            xTicks.push(minMag.toFixed(1));
        }

        const yTicks = [];
        const numYTicks = Math.max(2, Math.min(Math.floor(chartContentHeight / 50), 7));
        if (maxDepth > minDepth) {
            const yStep = (maxDepth - minDepth) / (numYTicks-1) || 1;
            for (let i = 0; i < numYTicks; i++) yTicks.push(Math.round(minDepth + i * yStep));
        } else {
            yTicks.push(Math.round(minDepth));
        }
        const memoizedGetMagnitudeColor = getMagnitudeColor;

        return (
            <div ref={chartContainerRef} className={`${cardBg} p-4 rounded-lg border ${borderColor} overflow-hidden shadow-md`}>
                <h3 className={`text-lg font-semibold mb-4 ${titleColor}`}>Magnitude vs. Depth {titleSuffix}</h3>
                <svg width="100%" height={dynamicHeight} viewBox={`0 0 ${dynamicWidth} ${dynamicHeight}`} className="overflow-visible">
                    <line x1={p.l} y1={dynamicHeight - p.b} x2={dynamicWidth - p.r} y2={dynamicHeight - p.b} stroke="currentColor" className={gridLineColor}/>
                    {xTicks.map((tick, i) => (
                        <g key={`xtick-${tick}-${i}`}>
                            <text x={xScale(tick)} y={dynamicHeight - p.b + 20} textAnchor="middle" className={`text-xs fill-current ${tickLabelColor}`}>{tick}</text>
                            <line x1={xScale(tick)} y1={dynamicHeight - p.b} x2={xScale(tick)} y2={dynamicHeight - p.b + 5} stroke="currentColor" className={gridLineColor}/>
                        </g>
                    ))}
                    <text x={p.l + chartContentWidth / 2} y={dynamicHeight - p.b + 40} textAnchor="middle" className={`text-sm fill-current ${axisLabelColor}`}>Magnitude</text>
                    <line x1={p.l} y1={p.t} x2={p.l} y2={dynamicHeight - p.b} stroke="currentColor" className={gridLineColor}/>
                    {yTicks.map(tick => (<g key={`ytick-${tick}`}><text x={p.l - 10} y={yScale(tick) + 4} textAnchor="end" className={`text-xs fill-current ${tickLabelColor}`}>{tick}</text><line x1={p.l - 5} y1={yScale(tick)} x2={p.l} y2={yScale(tick)} stroke="currentColor" className={gridLineColor}/></g>))}
                    <text transform={`translate(${p.l / 2 - 10}, ${p.t + chartContentHeight / 2}) rotate(-90)`} textAnchor="middle" className={`text-sm fill-current ${axisLabelColor}`}>Depth (km)</text>
                    {data.map(point => (<circle key={point.id} cx={xScale(point.mag)} cy={yScale(point.depth)} r="3.5" fill={memoizedGetMagnitudeColor(point.mag)} fillOpacity="0.7" className="hover:opacity-100 transition-opacity"><title>{`M:${point.mag?.toFixed(1)}, Depth:${point.depth?.toFixed(1)}km - ${point.place}`}</title></circle>))}
                </svg>
            </div>
        );
    });

    /**
     * A React component that displays a paginated and sortable table of earthquake data.
     * @param {object} props - The component's props.
     * @param {string} props.title - The title of the table.
     * @param {Array<object> | null} props.earthquakes - An array of earthquake feature objects.
     * @param {boolean} props.isLoading - Whether the data is currently loading.
     * @param {function} props.onQuakeClick - Callback function when an earthquake row is clicked.
     * @param {number} [props.itemsPerPage=10] - Number of items to display per page.
     * @param {string} [props.defaultSortKey='time'] - The default key to sort by.
     * @param {string} [props.initialSortDirection='descending'] - The initial sort direction ('ascending' or 'descending').
     * @param {string} [props.periodName] - Name of the period for display purposes (e.g., "last 24 hours").
     * @param {function} [props.filterPredicate] - An optional function to filter earthquakes before display.
     * @returns {JSX.Element} The rendered PaginatedEarthquakeTable component.
     */
    const PaginatedEarthquakeTable = React.memo(({ title, earthquakes, isLoading, onQuakeClick, itemsPerPage = 10, defaultSortKey = 'time', initialSortDirection = 'descending', periodName, filterPredicate }) => {
        const cardBg = "bg-slate-700"; const titleColor = "text-indigo-400"; const tableHeaderBg = "bg-slate-800"; const tableHeaderTextColor = "text-slate-400"; const tableRowHover = "hover:bg-slate-600"; const borderColor = "border-slate-600"; const paginationButton = "bg-slate-600 hover:bg-slate-500 text-slate-300 border-slate-500 disabled:opacity-40"; const paginationText = "text-slate-400";
        const [sortConfig, setSortConfig] = useState({key: defaultSortKey, direction: initialSortDirection}); const [currentPage, setCurrentPage] = useState(1);
        const processedEarthquakes = useMemo(() => { if (!earthquakes) return []; let items = filterPredicate ? earthquakes.filter(filterPredicate) : earthquakes; if (sortConfig.key !== null) { items = [...items].sort((a, b) => { let valA, valB; if (sortConfig.key === 'depth') { valA = a.geometry?.coordinates?.[2]; valB = b.geometry?.coordinates?.[2]; } else { valA = a.properties?.[sortConfig.key]; valB = b.properties?.[sortConfig.key]; } if (valA === null || valA === undefined) return 1; if (valB === null || valB === undefined) return -1; if (typeof valA === 'string' && typeof valB === 'string') { const comparison = valA.toLowerCase().localeCompare(valB.toLowerCase()); return sortConfig.direction === 'ascending' ? comparison : -comparison; } if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1; if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1; return 0; }); } return items; }, [earthquakes, sortConfig, filterPredicate]);
        const paginatedEarthquakes = useMemo(() => { const startIndex = (currentPage - 1) * itemsPerPage; return processedEarthquakes.slice(startIndex, startIndex + itemsPerPage); }, [processedEarthquakes, currentPage, itemsPerPage]);
        const totalPages = Math.ceil(processedEarthquakes.length / itemsPerPage);
        const requestSort = (key) => { let direction = 'ascending'; if (sortConfig.key === key && sortConfig.direction === 'ascending') { direction = 'descending'; } else if (sortConfig.key === key && sortConfig.direction === 'descending') { direction = 'ascending';} setSortConfig({key, direction}); setCurrentPage(1); };
        const getSortIndicator = (key) => (sortConfig.key === key ? (sortConfig.direction === 'ascending' ? ' ▲' : ' ▼') : <span className="text-slate-500"> ◇</span>);
        const columns = [ {label: 'Mag.', key: 'mag', className: `px-2 py-1.5 sm:px-3 whitespace-nowrap text-xs sm:text-sm font-medium`}, {label: 'Location', key: 'place', className: `px-2 py-1.5 sm:px-3 whitespace-nowrap text-xs sm:text-sm`}, {label: 'Time / Ago', key: 'time', className: `px-2 py-1.5 sm:px-3 whitespace-nowrap text-xs sm:text-sm text-slate-400`}, {label: 'Depth', key: 'depth', className: `px-2 py-1.5 sm:px-3 whitespace-nowrap text-xs sm:text-sm text-slate-400`} ];

        if (isLoading || earthquakes === null) {
            return (
                <div className={`${cardBg} p-3 rounded-lg mt-4 overflow-x-auto border ${borderColor} shadow-md`}>
                    <h3 className={`text-md font-semibold mb-2 ${titleColor}`}>{title}</h3>
                    <table className="min-w-full divide-y divide-slate-600">
                        <thead className={tableHeaderBg}>
                        <tr>{columns.map(col => <th key={col.key} className={`px-2 py-1.5 sm:px-3 text-left text-xs font-medium ${tableHeaderTextColor} uppercase tracking-wider`}><SkeletonText width="w-12" className="bg-slate-600"/></th>)}</tr>
                        </thead>
                        <tbody className="bg-slate-700 divide-y divide-slate-600">
                        {[...Array(Math.min(itemsPerPage, 3))].map((_, i) => <SkeletonTableRow key={i} cols={columns.length}/>)}
                        </tbody>
                    </table>
                </div>
            );
        }

        if (processedEarthquakes.length === 0) {
            return (
                <div className={`${cardBg} p-3 rounded-lg mt-4 border ${borderColor} shadow-md`}>
                    <h3 className={`text-md font-semibold mb-2 ${titleColor}`}>{title}</h3>
                    <p className={`text-xs text-slate-400`}>No earthquakes recorded {periodName ? `in the ${periodName}` : 'for this period'}.</p>
                </div>
            );
        }

        const memoizedGetMagnitudeColorStyle = getMagnitudeColorStyle;
        const memoizedFormatTimeAgo = formatTimeAgo;
        const memoizedFormatDate = formatDate;
        return (
            <div className={`${cardBg} p-3 rounded-lg mt-4 border ${borderColor} shadow-md`}>
                <h3 className={`text-md font-semibold mb-2 ${titleColor}`}>{title}</h3>
                <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800">
                    <table className="min-w-full divide-y divide-slate-600">
                        <thead className={`${tableHeaderBg} sticky top-0 z-10`}>
                        <tr>
                            {columns.map(col => (
                                <th key={col.key} scope="col" onClick={() => requestSort(col.key)} className={`px-2 py-1.5 sm:px-3 text-left text-xs font-medium ${tableHeaderTextColor} uppercase tracking-wider cursor-pointer hover:bg-slate-700`}>
                                    {col.label}{getSortIndicator(col.key)}
                                </th>
                            ))}
                        </tr>
                        </thead>
                        <tbody className="bg-slate-700 bg-opacity-50 divide-y divide-slate-600">
                        {paginatedEarthquakes.map((quake) => (
                            <tr key={`pgtbl-${quake.id}`} onClick={() => onQuakeClick(quake)} className={`${memoizedGetMagnitudeColorStyle(quake.properties.mag)} ${tableRowHover} cursor-pointer transition-colors`}>
                                <td className={columns[0].className}>{quake.properties.mag?.toFixed(1) || "N/A"}</td>
                                <td className={`${columns[1].className} text-slate-200`}>
                                    <a href={quake.properties.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-current hover:text-indigo-300 hover:underline">
                                        {quake.properties.place || "N/A"}
                                    </a>
                                </td>
                                <td className={columns[2].className}>
                                    {Date.now() - quake.properties.time < 2 * 24 * 60 * 60 * 1000 ? memoizedFormatTimeAgo(Date.now() - quake.properties.time) : memoizedFormatDate(quake.properties.time)}
                                </td>
                                <td className={columns[3].className}>{quake.geometry?.coordinates?.[2] !== undefined ? `${quake.geometry.coordinates[2].toFixed(1)} km` : "N/A"}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
                {totalPages > 1 && (
                    <div className="mt-3 flex justify-between items-center">
                        <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} className={`px-3 py-1 text-xs font-medium border rounded-md transition-colors ${paginationButton}`}>Prev</button>
                        <span className={`text-xs ${paginationText}`}>Page {currentPage} of {totalPages} ({processedEarthquakes.length})</span>
                        <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className={`px-3 py-1 text-xs font-medium border rounded-md transition-colors ${paginationButton}`}>Next</button>
                    </div>
                )}
            </div>
        );
    });

    // --- State Hooks ---
    const [isLoadingDaily, setIsLoadingDaily] = useState(true);
    const [isLoadingWeekly, setIsLoadingWeekly] = useState(true);
    const [isLoadingMonthly, setIsLoadingMonthly] = useState(false);
    const [hasAttemptedMonthlyLoad, setHasAttemptedMonthlyLoad] = useState(false);
    const [monthlyError, setMonthlyError] = useState(null);
    const [allEarthquakes, setAllEarthquakes] = useState([]);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [dataFetchTime, setDataFetchTime] = useState(null);
    const [appCurrentTime, setAppCurrentTime] = useState(Date.now());
    const [hasRecentTsunamiWarning, setHasRecentTsunamiWarning] = useState(false);
    const [lastMajorQuake, setLastMajorQuake] = useState(null);
    const [previousMajorQuake, setPreviousMajorQuake] = useState(null); // New state variable
    const [timeBetweenPreviousMajorQuakes, setTimeBetweenPreviousMajorQuakes] = useState(null);
    const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
    const [currentLoadingMessages, setCurrentLoadingMessages] = useState(INITIAL_LOADING_MESSAGES);
    const [highestRecentAlert, setHighestRecentAlert] = useState(null);
    const [activeAlertTriggeringQuakes, setActiveAlertTriggeringQuakes] = useState([]);
    const [earthquakesLastHour, setEarthquakesLastHour] = useState([]);
    const [earthquakesLast24Hours, setEarthquakesLast24Hours] = useState([]);
    const [earthquakesLast72Hours, setEarthquakesLast72Hours] = useState([]);
    const [earthquakesLast7Days, setEarthquakesLast7Days] = useState([]);
    const [earthquakesLast14Days, setEarthquakesLast14Days] = useState([]);
    const [earthquakesLast30Days, setEarthquakesLast30Days] = useState([]);
    const [prev24HourData, setPrev24HourData] = useState([]);
    const [prev7DayData, setPrev7DayData] = useState([]);
    const [prev14DayData, setPrev14DayData] = useState([]);
    // const [selectedDetailUrl, setSelectedDetailUrl] = useState(null); // Removed
    const isInitialAppLoad = useRef(true);
    const [globeEarthquakes, setGlobeEarthquakes] = useState([]);
    const [focusedNotableQuake, setFocusedNotableQuake] = useState(null);
    // const [activeSidebarView, setActiveSidebarView] = useState('overview_panel'); // Replaced by useSearchParams
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeClusters, setActiveClusters] = useState([]);
    // const [latestQuakeLongitude, setLatestQuakeLongitude] = useState(null); // Removed
    // const [globeFocusLat, setGlobeFocusLat] = useState(20); // Default latitude - REMOVED
    const [globeFocusLng, setGlobeFocusLng] = useState(0);  // Default longitude
    const activeSidebarView = searchParams.get('sidebarActiveView') || 'overview_panel';

    const setActiveSidebarView = (view) => {
        setSearchParams({ sidebarActiveView: view });
    };

    // --- Derived State & Memos ---
    const isLoadingInitialData = useMemo(() => isLoadingDaily || isLoadingWeekly, [isLoadingDaily, isLoadingWeekly]);

    // --- Data Fetching Callbacks ---
    const fetchDataCb = useCallback(async (url) => {
        try {
            const response = await fetch(url);
            if (!response.ok) { let errorBody = ''; try { errorBody = await response.text(); } catch (e) {} throw new Error(`HTTP error! status: ${response.status} ${response.statusText}. ${errorBody}`);}
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) throw new Error(`Expected JSON but received ${contentType}`);
            const data = await response.json();
            const sanitizedFeatures = (data.features || []).filter(f => f.properties?.type === 'earthquake').map(f => ({ ...f, properties: { ...f.properties, mag: (f.properties.mag === null || typeof f.properties.mag === 'number') ? f.properties.mag : null, detail: f.properties.detail || f.properties.url }, geometry: f.geometry || {type: "Point", coordinates: [null, null, null]} }));
            return {features: sanitizedFeatures, metadata: data.metadata};
        } catch (e) { console.error(`Workspace error from ${url}:`, e); throw e; }
    }, []);

    const latestFeelableQuakesSnippet = useMemo(() => {
        if (!earthquakesLast24Hours || earthquakesLast24Hours.length === 0) {
            return [];
        }
        return earthquakesLast24Hours
            .filter(q => q.properties.mag !== null && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD) // FEELABLE_QUAKE_THRESHOLD is 2.5
            .sort((a, b) => b.properties.time - a.properties.time) // Sort by most recent first
            .slice(0, 3); // Take the top 3
    }, [earthquakesLast24Hours]);

    const currentFeedData = useMemo(() => {
        // Determine the base dataset for feelable/significant: use 30-day if available, else 7-day
        const baseDataForFilters = (hasAttemptedMonthlyLoad && allEarthquakes.length > 0) ? allEarthquakes : earthquakesLast7Days;

        switch (activeFeedPeriod) {
            case 'last_hour':
                return earthquakesLastHour;
            case 'last_24_hours':
                return earthquakesLast24Hours;
            case 'last_7_days':
                return earthquakesLast7Days;
            case 'last_14_days':
                // Ensure earthquakesLast14Days is populated from allEarthquakes if monthly data is loaded
                return (hasAttemptedMonthlyLoad && allEarthquakes.length > 0) ? earthquakesLast14Days : null;
            case 'last_30_days':
                return (hasAttemptedMonthlyLoad && allEarthquakes.length > 0) ? earthquakesLast30Days : null;

            // --- NEW CASES ---
            case 'feelable_quakes':
                return baseDataForFilters ? baseDataForFilters.filter(q => q.properties.mag !== null && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD) : [];
            case 'significant_quakes':
                return baseDataForFilters ? baseDataForFilters.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD) : [];
            // --- END OF NEW CASES ---

            default:
                return earthquakesLast24Hours; // Default case
        }
    }, [
        activeFeedPeriod, earthquakesLastHour, earthquakesLast24Hours, earthquakesLast7Days,
        earthquakesLast14Days, earthquakesLast30Days, allEarthquakes, hasAttemptedMonthlyLoad
    ]);

    const currentFeedTitle = useMemo(() => {
        // Default period for feelable/significant if monthly not loaded
        const filterPeriodSuffix = (hasAttemptedMonthlyLoad && allEarthquakes.length > 0) ? "(Last 30 Days)" : "(Last 7 Days)";

        switch (activeFeedPeriod) {
            case 'last_hour':
                return "Earthquakes (Last Hour)";
            case 'last_24_hours':
                return "Earthquakes (Last 24 Hours)";
            case 'last_7_days':
                return "Earthquakes (Last 7 Days)";
            case 'last_14_days':
                return "Earthquakes (Last 14 Days)";
            case 'last_30_days':
                return "Earthquakes (Last 30 Days)";

            // --- NEW CASES ---
            case 'feelable_quakes':
                return `Feelable Quakes (M${FEELABLE_QUAKE_THRESHOLD.toFixed(1)}+) ${filterPeriodSuffix}`;
            case 'significant_quakes':
                return `Significant Quakes (M${MAJOR_QUAKE_THRESHOLD.toFixed(1)}+) ${filterPeriodSuffix}`;
            // --- END OF NEW CASES ---

            default:
                return "Earthquakes (Last 24 Hours)";
        }
    }, [activeFeedPeriod, hasAttemptedMonthlyLoad, allEarthquakes]); // Added dependencies

    const currentFeedisLoading = useMemo(() => {
        if (activeFeedPeriod === 'last_hour') return isLoadingDaily && !earthquakesLastHour;
        if (activeFeedPeriod === 'last_24_hours') return isLoadingDaily && !earthquakesLast24Hours;
        if (activeFeedPeriod === 'last_7_days') return isLoadingWeekly && !earthquakesLast7Days;

        if (activeFeedPeriod === 'feelable_quakes' || activeFeedPeriod === 'significant_quakes') {
            if (hasAttemptedMonthlyLoad && allEarthquakes.length > 0) {
                return isLoadingMonthly && !allEarthquakes.length > 0; // Loading if monthly attempt made but no data yet
            }
            return isLoadingWeekly && !earthquakesLast7Days; // Else, depends on 7-day data
        }

        if ((activeFeedPeriod === 'last_14_days' || activeFeedPeriod === 'last_30_days')) {
            return isLoadingMonthly && !(allEarthquakes && allEarthquakes.length > 0);
        }

        return currentFeedData === null; // General fallback
    }, [
        activeFeedPeriod, isLoadingDaily, isLoadingWeekly, isLoadingMonthly,
        earthquakesLastHour, earthquakesLast24Hours, earthquakesLast7Days,
        allEarthquakes, hasAttemptedMonthlyLoad, currentFeedData
    ]);

    const previousDataForCurrentFeed = useMemo(() => {
        // Only provide previous period data for simple time-based feeds for now
        switch (activeFeedPeriod) {
            case 'last_24_hours':
                return prev24HourData;
            case 'last_7_days':
                return prev7DayData;
            case 'last_14_days':
                return prev14DayData;
            default: // For last_hour, last_30_days, feelable, significant - omit trends in their specific card for now
                return null;
        }
    }, [activeFeedPeriod, prev24HourData, prev7DayData, prev14DayData]);

    // --- Effect Hooks ---
    useEffect(() => {
        let isMounted = true;
        const orchestrateInitialDataLoad = async () => {
            if (!isMounted) return;
            setLoadingMessageIndex(0); setCurrentLoadingMessages(INITIAL_LOADING_MESSAGES);
            setIsLoadingDaily(true); setIsLoadingWeekly(true); // setError(null) will be handled later by the new logic
            setEarthquakesLastHour([]); setEarthquakesLast24Hours([]); setEarthquakesLast72Hours([]); setEarthquakesLast7Days([]);
            setPrev24HourData([]); // Initialize to empty array
            setGlobeEarthquakes([]); setActiveAlertTriggeringQuakes([]);

            const nowForFiltering = Date.now();
            const filterByTime = (data, hoursAgoStart, hoursAgoEnd = 0) => data ? data.filter(q => q.properties.time >= (nowForFiltering - hoursAgoStart * 36e5) && q.properties.time < (nowForFiltering - hoursAgoEnd * 36e5)) : [];

            let dailyMajor = null;
            let currentLocalLastMajorQuake = null;
            setLastMajorQuake(prev => { currentLocalLastMajorQuake = prev; return prev; });

            let dailyErrorMsg = null;
            let weeklyErrorMsg = null;

            try {
                if (isMounted) setLoadingMessageIndex(0);
                const dailyRes = await fetchDataCb(USGS_API_URL_DAY); if (!isMounted) return;
                if (dailyRes?.features) {
                    if (isMounted) setLoadingMessageIndex(1);
                    const dD = dailyRes.features; setEarthquakesLastHour(filterByTime(dD, 1));
                    const l24 = filterByTime(dD, 24); setEarthquakesLast24Hours(l24);

                    setHasRecentTsunamiWarning(l24.some(q => q.properties.tsunami === 1));
                    const alertsIn24hr = l24.map(q => q.properties.alert).filter(a => a && a !== 'green' && ALERT_LEVELS[a.toUpperCase()]);
                    const currentHighestAlertValue = alertsIn24hr.length > 0 ? alertsIn24hr.sort((a,b) => ({ 'red':0, 'orange':1, 'yellow':2 }[a] - { 'red':0, 'orange':1, 'yellow':2 }[b]))[0] : null;
                    setHighestRecentAlert(currentHighestAlertValue);
                    if (currentHighestAlertValue && ALERT_LEVELS[currentHighestAlertValue.toUpperCase()]) setActiveAlertTriggeringQuakes(l24.filter(q => q.properties.alert === currentHighestAlertValue)); else setActiveAlertTriggeringQuakes([]);

                    const majD = dD.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD).sort((a, b) => b.properties.time - a.properties.time);
                    dailyMajor = majD.length > 0 ? majD[0] : null;
                    if (dailyMajor) {
                        setLastMajorQuake(prev => {
                            const newQuake = (!prev || dailyMajor.properties.time > prev.properties.time) ? dailyMajor : prev;
                            currentLocalLastMajorQuake = newQuake;
                            return newQuake;
                        });
                    }
                    setDataFetchTime(nowForFiltering); setLastUpdated(new Date(dailyRes.metadata?.generated || nowForFiltering).toLocaleString());
                } else {
                    dailyErrorMsg = "Daily data features are missing."; // Handle case where features might be missing
                    if (isMounted) {
                        setEarthquakesLastHour([]);
                        setEarthquakesLast24Hours([]);
                        setActiveAlertTriggeringQuakes([]);
                    }
                }
            } catch (e) {
                if (!isMounted) return;
                dailyErrorMsg = e.message;
                if (isMounted) {
                    setEarthquakesLastHour([]);
                    setEarthquakesLast24Hours([]);
                    setActiveAlertTriggeringQuakes([]);
                }
            }
            finally { if (isMounted) setIsLoadingDaily(false); }

            let weeklyMajorsList = [];
            try {
                if (isMounted) setLoadingMessageIndex(2);
                const weeklyResult = await fetchDataCb(USGS_API_URL_WEEK); if (!isMounted) return;
                if (weeklyResult?.features) {
                    if (isMounted) setLoadingMessageIndex(3);
                    const weeklyData = weeklyResult.features;
                    const last72HoursData = filterByTime(weeklyData, 72);
                    setEarthquakesLast72Hours(last72HoursData);
                    setPrev24HourData(filterByTime(weeklyData, 48, 24)); // This should use [] on error
                    const last7DaysData = filterByTime(weeklyData, 7 * 24);
                    setEarthquakesLast7Days(last7DaysData);
                    const sortedForGlobe = [...last72HoursData].sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0));
                    setGlobeEarthquakes(sortedForGlobe.slice(0, 900));

                    // Old logic for latestQuakeLongitude removed.
                    // Globe focus will be handled by a new useEffect hook listening to lastMajorQuake.

                    weeklyMajorsList = weeklyData.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD).sort((a, b) => b.properties.time - a.properties.time);
                    const latestWeeklyMajor = weeklyMajorsList.length > 0 ? weeklyMajorsList[0] : null;
                    if (latestWeeklyMajor) {
                        setLastMajorQuake(prev => {
                            const newQuake = (!prev || latestWeeklyMajor.properties.time > prev.properties.time) ? latestWeeklyMajor : prev;
                            currentLocalLastMajorQuake = newQuake;
                            return newQuake;
                        });
                    }

                    let consolidatedMajors = [];
                    if (dailyMajor) consolidatedMajors.push(dailyMajor);
                    consolidatedMajors = [...consolidatedMajors, ...weeklyMajorsList]
                        .sort((a,b) => b.properties.time - a.properties.time)
                        .filter((quake, index, self) => index === self.findIndex(q => q.id === quake.id));

                    const newLastMajorQuake = consolidatedMajors.length > 0 ? consolidatedMajors[0] : null;
                    const newPreviousMajorQuake = consolidatedMajors.length > 1 ? consolidatedMajors[1] : null;

                    setLastMajorQuake(prev => {
                        if (newLastMajorQuake && (!prev || newLastMajorQuake.properties.time > prev.properties.time)) {
                            return newLastMajorQuake;
                        }
                        return prev || newLastMajorQuake;
                    });
                    setPreviousMajorQuake(newPreviousMajorQuake);

                    if (newLastMajorQuake && newPreviousMajorQuake) {
                        setTimeBetweenPreviousMajorQuakes(newLastMajorQuake.properties.time - newPreviousMajorQuake.properties.time);
                    } else {
                        setTimeBetweenPreviousMajorQuakes(null);
                    }
                } else {
                    weeklyErrorMsg = "Weekly data features are missing."; // Handle case where features might be missing
                    if (isMounted) {
                        setEarthquakesLast72Hours([]);
                        setEarthquakesLast7Days([]);
                        setPrev24HourData([]); 
                        setGlobeEarthquakes([]);
                    }
                }
            } catch (e) {
                if (!isMounted) return;
                weeklyErrorMsg = e.message;
                if (isMounted) {
                    setEarthquakesLast72Hours([]);
                    setEarthquakesLast7Days([]);
                    setPrev24HourData([]); 
                    setGlobeEarthquakes([]);
                }
            }
            finally {
                if (isMounted) {
                    setIsLoadingWeekly(false);

                    if (dailyErrorMsg && weeklyErrorMsg) {
                        setError("Failed to fetch critical earthquake data from primary sources. Some features may be unavailable. Please check your connection or try again later.");
                    } else if (dailyErrorMsg) {
                        setError(`Daily data error: ${dailyErrorMsg}. Display may be incomplete.`);
                    } else if (weeklyErrorMsg) {
                        setError(`Weekly data error: ${weeklyErrorMsg}. Some historical data might be missing.`);
                    } else {
                        setError(null); // Clear any previous error if both fetches were successful
                    }
                    if (isInitialAppLoad.current) {
                        isInitialAppLoad.current = false;
                        setTimeout(() => {
                            if (isMounted) {
                                setAppRenderTrigger(prev => prev + 1);
                            }
                        }, 100);
                    }
                }
            }
        };
        orchestrateInitialDataLoad();
        const intervalId = setInterval(orchestrateInitialDataLoad, REFRESH_INTERVAL_MS);
        return () => { isMounted = false; clearInterval(intervalId); };
    }, [fetchDataCb]); // Removed getRegionForEarthquake, getMagnitudeColor from dependencies as they are stable

    const handleLoadMonthlyData = useCallback(async () => {
        let isMounted = true; setHasAttemptedMonthlyLoad(true); setIsLoadingMonthly(true); setMonthlyError(null);
        setLoadingMessageIndex(0); setCurrentLoadingMessages(MONTHLY_LOADING_MESSAGES);
        const nowForFiltering = Date.now();
        const filterByTime = (data, hoursAgoStart, hoursAgoEnd = 0) => data ? data.filter(q => q.properties.time >= (nowForFiltering - hoursAgoStart * 36e5) && q.properties.time < (nowForFiltering - hoursAgoEnd * 36e5)) : [];

        // Initialize to empty arrays in case of error, before try block
        setEarthquakesLast14Days([]);
        setEarthquakesLast30Days([]);
        setPrev7DayData([]);
        setPrev14DayData([]);

        let currentOverallLastMajorQuakeForMonthly = null;
        setLastMajorQuake(prev => {
            currentOverallLastMajorQuakeForMonthly = prev;
            return prev;
        });


        try {
            const monthlyResult = await fetchDataCb(USGS_API_URL_MONTH); if (!isMounted) return;
            if (monthlyResult?.features) {
                if(isMounted) setLoadingMessageIndex(1);
                const monthlyData = monthlyResult.features;
                setAllEarthquakes(monthlyData); // This is the main store for all monthly data
                
                const last14Days = filterByTime(monthlyData, 14 * 24);
                setEarthquakesLast14Days(last14Days);

                const last30DaysFiltered = filterByTime(monthlyData, 30 * 24);
                setEarthquakesLast30Days(last30DaysFiltered);
                
                setPrev7DayData(filterByTime(monthlyData, 14 * 24, 7 * 24));
                setPrev14DayData(filterByTime(monthlyData, 28 * 24, 14 * 24));

                const majorQuakesMonthly = monthlyData.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD).sort((a, b) => b.properties.time - a.properties.time);
                const latestMonthlyMajor = majorQuakesMonthly.length > 0 ? majorQuakesMonthly[0] : null;

                if (latestMonthlyMajor) {
                    setLastMajorQuake(prev => {
                        const newQuake = (!prev || latestMonthlyMajor.properties.time > prev.properties.time) ? latestMonthlyMajor : prev;
                        currentOverallLastMajorQuakeForMonthly = newQuake;
                        return newQuake;
                    });
                }

                let allKnownMajorQuakes = majorQuakesMonthly;
                if (currentOverallLastMajorQuakeForMonthly && !majorQuakesMonthly.some(mq => mq.id === currentOverallLastMajorQuakeForMonthly.id)) {
                    allKnownMajorQuakes = [...majorQuakesMonthly, currentOverallLastMajorQuakeForMonthly];
                }

                const sortedAllMajor = allKnownMajorQuakes
                    .sort((a,b) => b.properties.time - a.properties.time)
                    .filter((quake, index, self) => index === self.findIndex(q => q.id === quake.id));

                const finalLastMajorQuake = sortedAllMajor.length > 0 ? sortedAllMajor[0] : null;
                const finalPreviousMajorQuake = sortedAllMajor.length > 1 ? sortedAllMajor[1] : null;

                setLastMajorQuake(finalLastMajorQuake);
                setPreviousMajorQuake(finalPreviousMajorQuake);

                if (finalLastMajorQuake && finalPreviousMajorQuake) {
                    setTimeBetweenPreviousMajorQuakes(finalLastMajorQuake.properties.time - finalPreviousMajorQuake.properties.time);
                } else {
                    setTimeBetweenPreviousMajorQuakes(null);
                }

                if(isMounted) setLoadingMessageIndex(3);
            } else {
                 // Handle case where monthlyResult.features might be null or undefined
                if (!isMounted) return;
                console.error("Monthly data features are missing in the response:", monthlyResult);
                setMonthlyError("Monthly data is currently unavailable or incomplete.");
                setAllEarthquakes([]); // Ensure allEarthquakes is also cleared
                // Already initialized to [] above, but being explicit here for clarity
                setEarthquakesLast14Days([]);
                setEarthquakesLast30Days([]);
                setPrev7DayData([]);
                setPrev14DayData([]);
            }
        } catch (e) {
            if (!isMounted) return;
            console.error("Failed to fetch monthly data:", e);
            setMonthlyError(`Monthly Data Error: ${e.message}`);
            setAllEarthquakes([]);
            // Already initialized to [] above
            setEarthquakesLast14Days([]);
            setEarthquakesLast30Days([]);
            setPrev7DayData([]);
            setPrev14DayData([]);
        }
        finally { if (isMounted) setIsLoadingMonthly(false); }
        return () => { isMounted = false; };
    }, [fetchDataCb]);

    useEffect(() => {
        const timerId = setInterval(() => setAppCurrentTime(Date.now()), HEADER_TIME_UPDATE_INTERVAL_MS);
        return () => clearInterval(timerId);
    }, []);

    useEffect(() => {
        if (earthquakesLast72Hours && earthquakesLast72Hours.length > 0) {
            const foundClusters = findActiveClusters(
                earthquakesLast72Hours,
                CLUSTER_MAX_DISTANCE_KM,
                CLUSTER_MIN_QUAKES
            );
            setActiveClusters(foundClusters);
        } else {
            setActiveClusters([]); // Clear clusters if no source data
        }
    }, [earthquakesLast72Hours]); // Dependency: run when earthquakesLast72Hours changes.

    // Effect to update globe focus coordinates when lastMajorQuake changes
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
    const showFullScreenLoader = useMemo(() => (isLoadingDaily || isLoadingWeekly) && isInitialAppLoad.current, [isLoadingDaily, isLoadingWeekly]);
    const headerTimeDisplay = useMemo(() => { if (isInitialAppLoad.current && (isLoadingDaily || isLoadingWeekly) && !dataFetchTime) return "Connecting to Seismic Network..."; if (!dataFetchTime) return "Awaiting Initial Data..."; const timeSinceFetch = appCurrentTime - dataFetchTime; return `Live Data (7-day): ${timeSinceFetch < 30000 ? 'just now' : formatTimeAgo(timeSinceFetch)} | USGS Feed Updated: ${lastUpdated || 'N/A'}`; }, [isLoadingDaily, isLoadingWeekly, dataFetchTime, appCurrentTime, lastUpdated, isInitialAppLoad, formatTimeAgo]);
    const currentAlertConfig = useMemo(() => { if (highestRecentAlert && ALERT_LEVELS[highestRecentAlert.toUpperCase()]) { return ALERT_LEVELS[highestRecentAlert.toUpperCase()]; } return null; }, [highestRecentAlert]);

    const keyStatsForGlobe = useMemo(() => {
        const isLoadingCritical = isLoadingDaily || isLoadingWeekly;
        if (isLoadingCritical || !earthquakesLast24Hours || !earthquakesLast72Hours) {
            return {
                lastHourCount: <SkeletonText width="w-6" height="h-6" className="inline-block bg-slate-600"/>,
                count24h: <SkeletonText width="w-8" height="h-6" className="inline-block bg-slate-600" />,
                count72h: <SkeletonText width="w-8" height="h-6" className="inline-block bg-slate-600" />,
                strongest24h: <SkeletonText width="w-12" height="h-6" className="inline-block bg-slate-600" />,
            };
        }
        const stats24h = calculateStats(earthquakesLast24Hours);
        const stats72h = calculateStats(earthquakesLast72Hours);
        return {
            lastHourCount: earthquakesLastHour?.length || 0,
            count24h: stats24h.totalEarthquakes,
            count72h: stats72h.totalEarthquakes,
            strongest24h: stats24h.strongestMagnitude !== 'N/A' ? `M ${stats24h.strongestMagnitude}` : 'N/A',
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

            // Determine time range string
            let timeRangeStr = 'Time N/A';
            const now = Date.now();
            const durationMillis = now - earliestTime; // Duration since the earliest quake in cluster started

            if (earliestTime !== Infinity) {
                 // If the cluster's quakes are all very recent (e.g., within last 24 hours from now)
                if (now - latestTime < 24 * 60 * 60 * 1000 && cluster.length > 1) {
                    const clusterDurationMillis = latestTime - earliestTime;
                    if (clusterDurationMillis < 60 * 1000) { // less than a minute
                        timeRangeStr = `Active just now`;
                    } else if (clusterDurationMillis < 60 * 60 * 1000) { // less than an hour
                         timeRangeStr = `Active over ${Math.round(clusterDurationMillis / (60 * 1000))}m`;
                    } else {
                         timeRangeStr = `Active over ${formatTimeDuration(clusterDurationMillis)}`;
                    }
                } else { // Older clusters or single quake "clusters" (if minQuakes was 1)
                    timeRangeStr = `Started ${formatTimeAgo(durationMillis)}`;
                }
            }
            // A simpler alternative for timeRangeStr:
            // if (earliestTime !== Infinity && latestTime !== Infinity) {
            //    timeRangeStr = `Active: ${formatDate(earliestTime)} - ${formatDate(latestTime)}`;
            // }


            return {
                id: `overview_cluster_${strongestQuakeInCluster.id}_${cluster.length}`, // Create a somewhat unique ID
                locationName,
                quakeCount: cluster.length,
                maxMagnitude: maxMag,
                timeRange: timeRangeStr, // Using the more dynamic one for now
                // For sorting and potential future use:
                _maxMagInternal: maxMag,
                _quakeCountInternal: cluster.length,
                _earliestTimeInternal: earliestTime,
                originalQuakes: cluster, // <-- Add this line
            };
        }).filter(Boolean); // Remove any nulls if a cluster was empty

        // Sort clusters: primarily by max magnitude (desc), then by quake count (desc)
        processed.sort((a, b) => {
            if (b._maxMagInternal !== a._maxMagInternal) {
                return b._maxMagInternal - a._maxMagInternal;
            }
            return b._quakeCountInternal - a._quakeCountInternal;
        });

        return processed.slice(0, TOP_N_CLUSTERS_OVERVIEW);

    }, [activeClusters, formatDate, formatTimeAgo, formatTimeDuration]); // Include formatDate, formatTimeAgo, formatTimeDuration if they are from useCallback/component scope

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
        const description = `Explore earthquake data for ${periodDescription}. View lists, statistics, and details of seismic events.`;
        const keywords = `earthquake feed, live seismic data, earthquake list, ${periodKeywords}, seismic monitor`;

        return { title, description, keywords };
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

    // --- Full Screen Loader ---
    if (showFullScreenLoader) {
        return ( <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white antialiased"> <svg className="animate-spin h-12 w-12 text-indigo-400 mb-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg> <p className="text-2xl font-light text-indigo-300 mb-3">{currentLoadingMessages[loadingMessageIndex]}</p> <div className="w-1/3 h-1 bg-indigo-700 rounded-full overflow-hidden mt-2"> <div className="h-full bg-indigo-400 animate-pulse-short" style={{ animationDuration: `${LOADING_MESSAGE_INTERVAL_MS * INITIAL_LOADING_MESSAGES.length / 1000}s`}}></div> </div> <style>{`@keyframes pulseShort{0%{width:0%}100%{width:100%}}.animate-pulse-short{animation:pulseShort linear infinite}`}</style> <p className="text-xs text-slate-500 mt-10">Seismic Data Visualization</p> </div> );
    }

    // --- Main Render ---

    /**
     * A layout component for the feeds page, handling SEO and presentation of feed-specific content.
     * @param {object} props - The component's props.
     * @param {string} props.currentFeedTitle - Title of the current feed.
     * @param {string} props.activeFeedPeriod - Identifier for the active feed period (e.g., 'last_24_hours').
     * @param {Array<object> | null} props.currentFeedData - Data for the current feed.
     * @param {boolean} props.currentFeedisLoading - Loading state for the current feed.
     * @param {Array<object> | null} props.previousDataForCurrentFeed - Data for the previous period, for trend comparison.
     * @param {function} props.handleQuakeClick - Callback for when an earthquake is clicked.
     * @param {function} props.setActiveFeedPeriod - Callback to set the active feed period.
     * @param {function} props.handleLoadMonthlyData - Callback to load monthly data.
     * @param {boolean} props.hasAttemptedMonthlyLoad - Whether an attempt to load monthly data has been made.
     * @param {boolean} props.isLoadingMonthly - Loading state for monthly data.
     * @param {Array<object>} props.allEarthquakes - All earthquake data (used if monthly is loaded).
     * @param {function} props.getFeedPageSeoInfo - Helper function to get SEO information for the feed page.
     * @param {React.ComponentType} props.SummaryStatisticsCardComponent - The SummaryStatisticsCard component.
     * @param {React.ComponentType} props.PaginatedEarthquakeTableComponent - The PaginatedEarthquakeTable component.
     * @returns {JSX.Element} The rendered FeedsPageLayout component.
     */
    const FeedsPageLayout = ({
        currentFeedTitle, activeFeedPeriod, currentFeedData, currentFeedisLoading,
        previousDataForCurrentFeed, handleQuakeClick, setActiveFeedPeriod,
        handleLoadMonthlyData, hasAttemptedMonthlyLoad, isLoadingMonthly, allEarthquakes,
        // FEELABLE_QUAKE_THRESHOLD, MAJOR_QUAKE_THRESHOLD, // These are global constants, accessible
        getFeedPageSeoInfo, // Pass the helper function
        SummaryStatisticsCardComponent, PaginatedEarthquakeTableComponent // Renamed to avoid conflict if defined outside
    }) => {
        const seoInfo = getFeedPageSeoInfo(currentFeedTitle, activeFeedPeriod);

        return (
            <>
                <SeoMetadata
                    title={seoInfo.title}
                    description={seoInfo.description}
                    keywords={seoInfo.keywords}
                    imageUrl="/vite.svg" // Or your preferred default image
                    type="website"
                />
                <div className="p-3 md:p-4 h-full space-y-3 text-slate-200 lg:hidden">
                    <h2 className="text-lg font-semibold text-indigo-400 sticky top-0 bg-slate-900 py-2 z-10 -mx-3 px-3 sm:-mx-4 sm:px-4 border-b border-slate-700">
                        Feeds & Details
                    </h2>
                    <div className="my-2 flex flex-wrap gap-2 pb-2">
                        <button onClick={() => setActiveFeedPeriod('last_hour')} className={`text-xs px-3 py-1.5 rounded whitespace-nowrap ${activeFeedPeriod === 'last_hour' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500'}`}>Last Hour</button>
                        <button onClick={() => setActiveFeedPeriod('feelable_quakes')} className={`text-xs px-3 py-1.5 rounded whitespace-nowrap ${activeFeedPeriod === 'feelable_quakes' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500'}`}>Feelable (M{FEELABLE_QUAKE_THRESHOLD.toFixed(1)}+)</button>
                        <button onClick={() => setActiveFeedPeriod('significant_quakes')} className={`text-xs px-3 py-1.5 rounded whitespace-nowrap ${activeFeedPeriod === 'significant_quakes' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500'}`}>Significant (M{MAJOR_QUAKE_THRESHOLD.toFixed(1)}+)</button>
                        <button onClick={() => setActiveFeedPeriod('last_24_hours')} className={`text-xs px-3 py-1.5 rounded whitespace-nowrap ${activeFeedPeriod === 'last_24_hours' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500'}`}>Last 24hr</button>
                        <button onClick={() => setActiveFeedPeriod('last_7_days')} className={`text-xs px-3 py-1.5 rounded whitespace-nowrap ${activeFeedPeriod === 'last_7_days' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500'}`}>Last 7day</button>
                        {(hasAttemptedMonthlyLoad && allEarthquakes.length > 0) && (
                            <React.Fragment key="monthly-feed-buttons">
                                <button onClick={() => setActiveFeedPeriod('last_14_days')} className={`text-xs px-3 py-1.5 rounded whitespace-nowrap ${activeFeedPeriod === 'last_14_days' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500'}`}>14-Day</button>
                                <button onClick={() => setActiveFeedPeriod('last_30_days')} className={`text-xs px-3 py-1.5 rounded whitespace-nowrap ${activeFeedPeriod === 'last_30_days' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500'}`}>30-Day</button>
                            </React.Fragment>
                        )}
                    </div>
                    <SummaryStatisticsCardComponent
                        title={`Statistics for ${currentFeedTitle.replace("Earthquakes ", "").replace("Quakes ", "")}`}
                        currentPeriodData={currentFeedData || []}
                        previousPeriodData={(activeFeedPeriod !== 'feelable_quakes' && activeFeedPeriod !== 'significant_quakes') ? previousDataForCurrentFeed : null}
                        isLoading={currentFeedisLoading}
                    />
                    <PaginatedEarthquakeTableComponent
                        title={currentFeedTitle}
                        earthquakes={currentFeedData || []}
                        isLoading={currentFeedisLoading}
                        onQuakeClick={handleQuakeClick}
                        itemsPerPage={15}
                        periodName={activeFeedPeriod.replace('_', ' ')}
                    />
                    {!hasAttemptedMonthlyLoad && (
                        <div className="text-center py-3 mt-3 border-t border-slate-700">
                            <button onClick={handleLoadMonthlyData} disabled={isLoadingMonthly} className="w-full bg-teal-600 hover:bg-teal-500 p-2.5 rounded-md text-white font-semibold transition-colors text-xs shadow-md disabled:opacity-60">
                                {isLoadingMonthly ? 'Loading Extended Data...' : 'Load 14 & 30-Day Data'}
                            </button>
                        </div>
                    )}
                    {hasAttemptedMonthlyLoad && isLoadingMonthly && <p className="text-xs text-slate-400 text-center py-3 animate-pulse">Loading extended data archives...</p>}
                </div>
            </>
        );
    };

    return (
        <div className="flex flex-col h-[100svh] font-sans bg-slate-900 text-slate-100 antialiased">
            <header className="bg-slate-800 text-white p-2 shadow-lg z-40 border-b border-slate-700">
                <div className="mx-auto flex flex-col sm:flex-row justify-between items-center px-3">
                    <h1 className="text-lg md:text-xl font-bold text-indigo-400">Global Seismic Activity Monitor</h1>
                    <p className="text-xs sm:text-sm text-slate-400 mt-0.5 sm:mt-0">{headerTimeDisplay}</p>
                </div>
            </header>

            {/* This main flex container now has padding-bottom for mobile to avoid overlap with BottomNav */}
            <div className="flex flex-1 overflow-hidden pb-16 lg:pb-0">

                {/* MAIN CONTENT AREA - This will now adapt based on activeMobileView */}
                {/* On mobile, only ONE of its direct children should be 'block', others 'hidden' */}
                {/* On desktop (lg:), the globe wrapper is 'lg:block' and mobile content sections are 'lg:hidden' */}
                <main className="flex-1 relative bg-slate-900 lg:bg-black w-full overflow-y-auto">
                    <Routes>
                        <Route path="/" element={
                            <>
                                <SeoMetadata
                                    title="Global Seismic Activity Monitor | Real-time Earthquake Data"
                                    description="Track live earthquakes around the world with our interactive globe. Get real-time data, view significant quake details, and explore seismic activity trends."
                                    keywords="earthquakes, seismic activity, live earthquakes, earthquake map, global earthquakes, real-time data, seismology"
                                    imageUrl="/vite.svg"
                                    type="website"
                                />
                                <div className="lg:block h-full w-full">
                                    <InteractiveGlobeView
                                        earthquakes={globeEarthquakes}
                                    // initialLongitude={latestQuakeLongitude} // Removed
                                    defaultFocusLat={20} // Static default latitude
                                    defaultFocusLng={globeFocusLng} // Dynamic longitude
                                    onQuakeClick={handleQuakeClick}
                                    getMagnitudeColorFunc={getMagnitudeColor}
                                    allowUserDragRotation={true}
                                    enableAutoRotation={true}
                                    globeAutoRotateSpeed={0.1}
                                    coastlineGeoJson={coastlineData}
                                    tectonicPlatesGeoJson={tectonicPlatesData}
                                    highlightedQuakeId={lastMajorQuake?.id}
                                    latestMajorQuakeForRing={lastMajorQuake}
                                    previousMajorQuake={previousMajorQuake}
                                    activeClusters={activeClusters} // <-- New prop
                                />
                                <div className="absolute top-2 left-2 z-10 space-y-2">
                                    <NotableQuakeFeature
                                        dynamicFeaturedQuake={lastMajorQuake}
                                        isLoadingDynamicQuake={isLoadingInitialData}
                                        onNotableQuakeSelect={handleNotableQuakeSelect}
                                        getMagnitudeColorFunc={getMagnitudeColor}
                                    />
                                    <PreviousNotableQuakeFeature
                                        previousMajorQuake={previousMajorQuake}
                                        isLoadingPreviousQuake={isLoadingInitialData}
                                        onNotableQuakeSelect={handleNotableQuakeSelect}
                                        getMagnitudeColorFunc={getMagnitudeColor}
                                    />
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
                                    MAJOR_QUAKE_THRESHOLD={MAJOR_QUAKE_THRESHOLD}
                                    formatTimeDuration={formatTimeDuration}
                                    SkeletonText={SkeletonText}
                                />
                                </div>
                            </>
                        } />
                        <Route path="/overview" element={
                            <>
                                <SeoMetadata
                                    title="Earthquake Overview | Latest Seismic Summary"
                                    description="Get a summary of the latest global earthquake activity, including significant events, regional distributions, and key statistics."
                                    keywords="earthquake summary, seismic overview, recent earthquakes, earthquake statistics"
                                    imageUrl="/vite.svg"
                                    type="website"
                                />
                                <div className="p-3 md:p-4 h-full space-y-3 text-slate-200 lg:hidden">
                                    <h2 className="text-lg font-semibold text-indigo-400 sticky top-0 bg-slate-900 py-2 z-10 -mx-3 px-3 sm:-mx-4 sm:px-4 border-b border-slate-700">
                                        Overview
                                    </h2>
                                {currentAlertConfig && (
                                    <div className={`border-l-4 p-2.5 rounded-r-md shadow-md text-xs ${ALERT_LEVELS[currentAlertConfig.text.toUpperCase()]?.detailsColorClass || ALERT_LEVELS[currentAlertConfig.text.toUpperCase()]?.colorClass} `}>
                                        <p className="font-bold text-sm mb-1">Active USGS Alert: {currentAlertConfig.text}</p>
                                        <p className="text-xs">{currentAlertConfig.description}</p>
                                    </div>
                                )}
                                {hasRecentTsunamiWarning && !currentAlertConfig && (
                                    <div className="bg-sky-700 bg-opacity-40 border-l-4 border-sky-500 text-sky-200 p-2.5 rounded-md shadow-md text-xs" role="alert">
                                        <p className="font-bold mb-1">Tsunami Information</p>
                                        <p className="text-xs">Recent quakes may indicate tsunami activity. Please check official channels for alerts.</p>
                                    </div>
                                )}
                                {lastMajorQuake && (
                                    <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md">
                                        <h3 className="text-sm font-semibold text-indigo-300 mb-1">Latest Significant Event</h3>
                                        <p className="text-lg font-bold" style={{ color: getMagnitudeColor(lastMajorQuake.properties.mag) }}>
                                            M {lastMajorQuake.properties.mag?.toFixed(1)}
                                        </p>
                                        <p className="text-sm text-slate-300 truncate" title={lastMajorQuake.properties.place}>
                                            {lastMajorQuake.properties.place || "Location details pending..."}
                                        </p>
                                        <p className="text-xs text-slate-400">
                                           {formatDate(lastMajorQuake.properties.time)}
                                            {lastMajorQuake.geometry?.coordinates?.[2] !== undefined && `, Depth: ${lastMajorQuake.geometry.coordinates[2].toFixed(1)} km`}
                                        </p>
                                        <button
                                            onClick={() => handleQuakeClick(lastMajorQuake)}
                                            className="mt-2 w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-1.5 px-3 rounded transition-colors"
                                        >
                                            View Details
                                        </button>
                                   </div>
                                )}
                                {latestFeelableQuakesSnippet.length > 0 && (
                                    <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md">
                                        <h3 className="text-sm font-semibold text-indigo-300 mb-2">Latest Activity</h3>
                                        <ul className="space-y-2">
                                            {latestFeelableQuakesSnippet.map(quake => (
                                                <li
                                                    key={`snippet-${quake.id}`}
                                                    className="text-xs border-b border-slate-600 pb-1 last:border-b-0 last:pb-0 p-2 rounded hover:bg-slate-600 cursor-pointer transition-colors"
                                                    onClick={() => handleQuakeClick(quake)}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-semibold" style={{ color: getMagnitudeColor(quake.properties.mag) }}>
                                                            M {quake.properties.mag?.toFixed(1)}
                                                        </span>
                                                        <span className="text-slate-400">
                                                            {formatTimeAgo(Date.now() - quake.properties.time)}
                                                        </span>
                                                    </div>
                                                    <p className="text-slate-300 truncate text-[11px]" title={quake.properties.place}>
                                                        {quake.properties.place || "Location details pending..."}
                                                    </p>
                                                </li>
                                            ))}
                                        </ul>
                                        {/* Intentionally not changing this button's onClick for now, as it's tied to BottomNav */}
                                        <button
                                            onClick={() => {/* This will be handled by NavLink in BottomNav */}}
                                            className="mt-3 w-full bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold py-1.5 px-3 rounded transition-colors"
                                        >
                                            View All Recent Activity
                                        </button>
                                    </div>
                                )}
                                <TimeSinceLastMajorQuakeBanner
                                    lastMajorQuake={lastMajorQuake}
                                    timeBetweenPreviousMajorQuakes={timeBetweenPreviousMajorQuakes}
                                    previousMajorQuake={previousMajorQuake}
                                    isLoadingInitial={isLoadingInitialData}
                                    isLoadingMonthly={isLoadingMonthly && hasAttemptedMonthlyLoad}
                                    majorQuakeThreshold={MAJOR_QUAKE_THRESHOLD}
                                />
                                <SummaryStatisticsCard
                                    title="Global Statistics (Last 24 Hours)"
                                    currentPeriodData={earthquakesLast24Hours}
                                    previousPeriodData={prev24HourData}
                                    isLoading={isLoadingDaily || (isLoadingWeekly && !earthquakesLast24Hours)}
                                />

                                {/* Active Earthquake Clusters Section - Mobile */}
                                <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md mt-3">
                                    <h3 className="text-md font-semibold mb-2 text-indigo-300">
                                        Active Earthquake Clusters
                                    </h3>
                                    {overviewClusters && overviewClusters.length > 0 ? (
                                        <ul className="space-y-2">
                                            {overviewClusters.map(cluster => (
                                                <ClusterSummaryItem
                                                    clusterData={cluster}
                                                    key={cluster.id}
                                                    onClusterSelect={handleClusterSummaryClick} // <-- Add this prop
                                                />
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-xs text-slate-400 text-center py-2">
                                            No significant active clusters detected currently.
                                        </p>
                                    )}
                                </div>

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
                                <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md text-sm">
                                    <h3 className="text-md font-semibold mb-1 text-indigo-400">Quick Fact</h3>
                                    <InfoSnippet topic="magnitude" />
                                    <button
                                        onClick={() => navigate('/learn')} // Updated to use navigate
                                        className="mt-2 w-full bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold py-1.5 px-3 rounded transition-colors"
                                    >
                                        Learn More About Earthquakes
                                    </button>
                                </div>
                                </div>
                            </>
                        } />
                        <Route path="/feeds" element={
                            <FeedsPageLayout
                                currentFeedTitle={currentFeedTitle}
                                activeFeedPeriod={activeFeedPeriod}
                                currentFeedData={currentFeedData}
                                currentFeedisLoading={currentFeedisLoading}
                                previousDataForCurrentFeed={previousDataForCurrentFeed}
                                handleQuakeClick={handleQuakeClick}
                                setActiveFeedPeriod={setActiveFeedPeriod}
                                handleLoadMonthlyData={handleLoadMonthlyData}
                                hasAttemptedMonthlyLoad={hasAttemptedMonthlyLoad}
                                isLoadingMonthly={isLoadingMonthly}
                                allEarthquakes={allEarthquakes}
                                // FEELABLE_QUAKE_THRESHOLD and MAJOR_QUAKE_THRESHOLD are global constants
                                getFeedPageSeoInfo={getFeedPageSeoInfo}
                                SummaryStatisticsCardComponent={SummaryStatisticsCard} // Pass the memoized component
                                PaginatedEarthquakeTableComponent={PaginatedEarthquakeTable} // Pass the memoized component
                            />
                        } />
                        <Route path="/learn" element={
                            <>
                                <SeoMetadata
                                    title="Learn About Earthquakes | Seismic Science Explained"
                                    description="Understand earthquake science, including magnitude, depth, fault types, seismic waves, and how earthquake data is interpreted."
                                    keywords="earthquake science, seismology basics, magnitude, fault types, seismic waves, earthquake education"
                                    imageUrl="/vite.svg"
                                    type="website"
                                />
                                <div className="p-3 md:p-4 h-full space-y-2 text-slate-200 lg:hidden">
                                    <h2 className="text-lg font-semibold text-indigo-400 sticky top-0 bg-slate-900 py-2 z-10 -mx-3 px-3 sm:-mx-4 sm:px-4 border-b border-slate-700">
                                        Learn About Earthquakes
                                    </h2>
                                <InfoSnippet topic="magnitude" />
                                <InfoSnippet topic="depth" />
                                <InfoSnippet topic="intensity" />
                                <InfoSnippet topic="alerts" />
                                <InfoSnippet topic="strike"/>
                                <InfoSnippet topic="dip"/>
                                <InfoSnippet topic="rake"/>
                                <InfoSnippet topic="stressAxes"/>
                                <InfoSnippet topic="beachball"/>
                                <InfoSnippet topic="stationsUsed"/>
                                <InfoSnippet topic="azimuthalGap"/>
                                <InfoSnippet topic="rmsError"/>
                                </div>
                            </>
                        } />
                        <Route
                            path="/quake/:detailUrlParam"
                            element={<EarthquakeDetailModal broaderEarthquakeData={ (allEarthquakes && allEarthquakes.length > 0 && earthquakesLast30Days && earthquakesLast30Days.length > 0) ? earthquakesLast30Days : earthquakesLast7Days } handleLoadMonthlyData={handleLoadMonthlyData} hasAttemptedMonthlyLoad={hasAttemptedMonthlyLoad} isLoadingMonthly={isLoadingMonthly} />}
                        />
                        <Route path="/cluster/:clusterId" element={<ClusterDetailModalWrapper overviewClusters={overviewClusters} formatDate={formatDate} getMagnitudeColorStyle={getMagnitudeColorStyle} onIndividualQuakeSelect={handleQuakeClick} />} />
                    </Routes>
                </main>

                {/* DESKTOP SIDEBAR (hidden on small screens, flex on large) */}
                {/* The desktop sidebar's visibility is controlled by CSS (hidden lg:flex) */}
                <aside className="hidden lg:flex w-[480px] bg-slate-800 p-0 flex-col border-l border-slate-700 shadow-2xl z-20">
                    <div className="p-3 border-b border-slate-700"> <h2 className="text-md font-semibold text-indigo-400">Detailed Earthquake Analysis</h2> </div>
                    <div className="flex-shrink-0 p-2 space-x-1 border-b border-slate-700 whitespace-nowrap overflow-x-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-700">
                        <button onClick={() => setSearchParams({ sidebarActiveView: 'overview_panel' })} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'overview_panel' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>Overview</button>
                        <button onClick={() => setSearchParams({ sidebarActiveView: 'details_1hr' })} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'details_1hr' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>Last Hour</button>
                        <button onClick={() => setSearchParams({ sidebarActiveView: 'details_24hr' })} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'details_24hr' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>Last 24hr</button>
                        <button onClick={() => setSearchParams({ sidebarActiveView: 'details_7day' })} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'details_7day' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>Last 7day</button>
                        {hasAttemptedMonthlyLoad && !isLoadingMonthly && allEarthquakes.length > 0 && ( <> <button onClick={() => setSearchParams({ sidebarActiveView: 'details_14day' })} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'details_14day' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>14-Day</button> <button onClick={() => setSearchParams({ sidebarActiveView: 'details_30day' })} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'details_30day' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>30-Day</button> </> )}
                        <button onClick={() => setSearchParams({ sidebarActiveView: 'learn_more' })} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'learn_more' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>Learn</button>
                    </div>
                    <div className="flex-1 p-2 space-y-3 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800" key={activeSidebarView}>
                        {error && !showFullScreenLoader && (<div className="bg-red-700 bg-opacity-40 border border-red-600 text-red-200 px-3 py-2 rounded-md text-xs" role="alert"><strong className="font-bold">Data Error:</strong> {error} Some data might be unavailable.</div>)}
                        {activeSidebarView === 'overview_panel' && (
                            <>
                            {currentAlertConfig && ( <div className={`border-l-4 p-2.5 rounded-r-md shadow-md text-xs ${ALERT_LEVELS[currentAlertConfig.text.toUpperCase()]?.detailsColorClass || ALERT_LEVELS[currentAlertConfig.text.toUpperCase()]?.colorClass} `}> <p className="font-bold text-sm">Active USGS Alert: {currentAlertConfig.text}</p> <p>{currentAlertConfig.description}</p> {activeAlertTriggeringQuakes.length > 0 && (<PaginatedEarthquakeTable title={`Alert Triggering Quakes (${currentAlertConfig.text})`} earthquakes={activeAlertTriggeringQuakes} isLoading={false} onQuakeClick={handleQuakeClick} itemsPerPage={3} periodName="alerting"/> )} </div> )}
                            {hasRecentTsunamiWarning && !currentAlertConfig && (<div className="bg-sky-700 bg-opacity-40 border-l-4 border-sky-500 text-sky-200 p-2.5 rounded-md shadow-md text-xs" role="alert"><p className="font-bold">Tsunami Info</p><p>Recent quakes indicate potential tsunami activity. Check official channels.</p></div>)}
                            <TimeSinceLastMajorQuakeBanner
                                lastMajorQuake={lastMajorQuake}
                                timeBetweenPreviousMajorQuakes={timeBetweenPreviousMajorQuakes}
                                previousMajorQuake={previousMajorQuake}
                                isLoadingInitial={isLoadingInitialData}
                                isLoadingMonthly={isLoadingMonthly && hasAttemptedMonthlyLoad}
                                majorQuakeThreshold={MAJOR_QUAKE_THRESHOLD}
                            />
                            <SummaryStatisticsCard
                                title="Overview (Last 24 Hours)"
                                currentPeriodData={earthquakesLast24Hours}
                                previousPeriodData={prev24HourData} // Ensure trends are shown on desktop too
                                isLoading={isLoadingDaily || (isLoadingWeekly && !earthquakesLast24Hours)}
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
                                    <h3 className="text-md font-semibold mb-2 text-indigo-300">
                                        Active Earthquake Clusters
                                    </h3>
                                    {overviewClusters && overviewClusters.length > 0 ? (
                                        <ul className="space-y-2">
                                            {overviewClusters.map(cluster => (
                                                <ClusterSummaryItem
                                                    clusterData={cluster}
                                                    key={cluster.id}
                                                    onClusterSelect={handleClusterSummaryClick} // <-- Add this prop
                                                />
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-xs text-slate-400 text-center py-2">
                                            No significant active clusters detected currently.
                                        </p>
                                    )}
                                </div>

                            {recentSignificantQuakesForOverview.length > 0 && (
                                <PaginatedEarthquakeTable
                                    title={`Recent Significant Quakes (M${MAJOR_QUAKE_THRESHOLD.toFixed(1)}+)`}
                                    earthquakes={recentSignificantQuakesForOverview}
                                    isLoading={isLoadingWeekly && !earthquakesLast7Days}
                                    onQuakeClick={handleQuakeClick}
                                    itemsPerPage={10}
                                    defaultSortKey="time"
                                    initialSortDirection="descending"
                                    periodName="last 7 days"
                                />
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
                            <SummaryStatisticsCard title="Summary (Last Hour)" currentPeriodData={earthquakesLastHour} isLoading={isLoadingDaily}/>
                            <PaginatedEarthquakeTable title="Earthquakes (Last Hour)" earthquakes={earthquakesLastHour} isLoading={isLoadingDaily} onQuakeClick={handleQuakeClick} itemsPerPage={10} periodName="last hour"/>
                            <RegionalDistributionList earthquakes={earthquakesLastHour} titleSuffix="(Last Hour)" isLoading={isLoadingDaily}/>
                            <MagnitudeDepthScatterSVGChart earthquakes={earthquakesLastHour} titleSuffix="(Last Hour)" isLoading={isLoadingDaily} />
                        </div> )}
                        {activeSidebarView === 'details_24hr' && !isLoadingWeekly && earthquakesLast24Hours && ( <div className="space-y-3">
                            <SummaryStatisticsCard title="Summary (Last 24 Hours)" currentPeriodData={earthquakesLast24Hours} previousPeriodData={prev24HourData} isLoading={isLoadingWeekly || (isLoadingDaily && !prev24HourData) }/>
                            <PaginatedEarthquakeTable title="Earthquakes (Last 24 Hours)" earthquakes={earthquakesLast24Hours} isLoading={isLoadingDaily} onQuakeClick={handleQuakeClick} periodName="last 24 hours"/>
                            <RegionalDistributionList earthquakes={earthquakesLast24Hours} titleSuffix="(Last 24 Hours)" isLoading={isLoadingDaily}/>
                            <MagnitudeDepthScatterSVGChart earthquakes={earthquakesLast24Hours} titleSuffix="(Last 24 Hours)" isLoading={isLoadingDaily} />
                        </div> )}
                        {activeSidebarView === 'details_7day' && !isLoadingWeekly && earthquakesLast7Days && ( <div className="space-y-3">
                            <SummaryStatisticsCard title="Summary (Last 7 Days)" currentPeriodData={earthquakesLast7Days} previousPeriodData={prev7DayData} isLoading={isLoadingWeekly || (isLoadingMonthly && hasAttemptedMonthlyLoad && !prev7DayData) }/>
                            <PaginatedEarthquakeTable title="Earthquakes (Last 7 Days)" earthquakes={earthquakesLast7Days} isLoading={isLoadingWeekly} onQuakeClick={handleQuakeClick} periodName="last 7 days"/>
                            <RegionalDistributionList earthquakes={earthquakesLast7Days} titleSuffix="(Last 7 Days)" isLoading={isLoadingWeekly}/>
                            <EarthquakeTimelineSVGChart earthquakes={earthquakesLast7Days} days={7} titleSuffix="(Last 7 Days)" isLoading={isLoadingWeekly}/>
                            <MagnitudeDepthScatterSVGChart earthquakes={earthquakesLast7Days} titleSuffix="(Last 7 Days)" isLoading={isLoadingWeekly} />
                        </div> )}

                        {activeSidebarView !== 'overview_panel' && activeSidebarView !== 'learn_more' && !hasAttemptedMonthlyLoad && ( <div className="text-center py-3 mt-3 border-t border-slate-700"> <button onClick={handleLoadMonthlyData} disabled={isLoadingMonthly} className="w-full bg-teal-600 hover:bg-teal-500 p-2.5 rounded-md text-white font-semibold transition-colors text-xs shadow-md disabled:opacity-60"> {isLoadingMonthly ? 'Loading Historical Data...' : 'Load Full 14 & 30-Day Analysis'} </button> </div> )}
                        {hasAttemptedMonthlyLoad && isLoadingMonthly && <p className="text-xs text-slate-400 text-center py-3 animate-pulse">Loading extended data archives...</p>}
                        {hasAttemptedMonthlyLoad && monthlyError && !isLoadingMonthly && <p className="text-red-300 text-xs text-center py-1">Error loading monthly data: {monthlyError}</p>}

                        {activeSidebarView === 'details_14day' && hasAttemptedMonthlyLoad && !isLoadingMonthly && !monthlyError && allEarthquakes.length > 0 && ( <div className="space-y-3">
                            <SummaryStatisticsCard title="Summary (Last 14 Days)" currentPeriodData={earthquakesLast14Days} previousPeriodData={prev14DayData} isLoading={false}/>
                            <EarthquakeTimelineSVGChart earthquakes={earthquakesLast14Days} days={14} titleSuffix="(Last 14 Days)" isLoading={false}/>
                            <MagnitudeDepthScatterSVGChart earthquakes={earthquakesLast14Days} titleSuffix="(Last 14 Days)" isLoading={false}/>
                            <PaginatedEarthquakeTable title="All Earthquakes (Last 14 Days)" earthquakes={earthquakesLast14Days} isLoading={false} onQuakeClick={handleQuakeClick} itemsPerPage={10} defaultSortKey="time" initialSortDirection="descending"/>
                        </div> )}
                        {activeSidebarView === 'details_30day' && hasAttemptedMonthlyLoad && !isLoadingMonthly && !monthlyError && allEarthquakes.length > 0 && ( <div className="space-y-3">
                            <SummaryStatisticsCard title="Summary (Last 30 Days)" currentPeriodData={earthquakesLast30Days} isLoading={false}/>
                            <div className="grid grid-cols-1 gap-3">
                                <PaginatedEarthquakeTable title="Top 10 Strongest (30d)" earthquakes={allEarthquakes} isLoading={false} onQuakeClick={handleQuakeClick} itemsPerPage={10} defaultSortKey="mag" initialSortDirection="descending"/>
                                <PaginatedEarthquakeTable title="Most Widely Felt (30d)" earthquakes={allEarthquakes} isLoading={false} onQuakeClick={handleQuakeClick} itemsPerPage={5} defaultSortKey="felt" initialSortDirection="descending" filterPredicate={q => q.properties.felt !== null && typeof q.properties.felt === 'number' && q.properties.felt > FELT_REPORTS_THRESHOLD}/>
                                <PaginatedEarthquakeTable title="Most Significant (30d)" earthquakes={allEarthquakes} isLoading={false} onQuakeClick={handleQuakeClick} itemsPerPage={5} defaultSortKey="sig" initialSortDirection="descending" filterPredicate={q => q.properties.sig !== null && typeof q.properties.sig === 'number' && q.properties.sig > SIGNIFICANCE_THRESHOLD}/>
                            </div>
                            <MagnitudeDistributionSVGChart earthquakes={allEarthquakes} titleSuffix="(Last 30 Days)" isLoading={false}/>
                            <MagnitudeDepthScatterSVGChart earthquakes={allEarthquakes} titleSuffix="(Last 30 Days)" isLoading={false}/>
                            <RegionalDistributionList earthquakes={allEarthquakes} titleSuffix="(Last 30 Days)" isLoading={false}/>
                            <PaginatedEarthquakeTable title="All Earthquakes (Last 30 Days)" earthquakes={allEarthquakes} isLoading={false} onQuakeClick={handleQuakeClick} itemsPerPage={15} defaultSortKey="time" initialSortDirection="descending"/>
                        </div> )}

                        {(isLoadingDaily || isLoadingWeekly || (hasAttemptedMonthlyLoad && isLoadingMonthly)) && !showFullScreenLoader &&
                            activeSidebarView !== 'overview_panel' && activeSidebarView !== 'learn_more' &&
                            !((activeSidebarView === 'details_1hr' && earthquakesLastHour) || (activeSidebarView === 'details_24hr' && earthquakesLast24Hours && prev24HourData) || (activeSidebarView === 'details_7day' && earthquakesLast7Days)) &&
                            ( <div className="text-center py-10"><p className="text-sm text-slate-500 animate-pulse">Loading selected data...</p></div> )
                        }
                        {hasAttemptedMonthlyLoad && !isLoadingMonthly && !monthlyError && allEarthquakes.length === 0 && (activeSidebarView === 'details_14day' || activeSidebarView === 'details_30day') &&( <p className="text-slate-400 text-center py-4 text-sm">No 14/30 day earthquake data found or loaded.</p> )}
                        {!initialDataLoaded && !isLoadingDaily && !isLoadingWeekly && (activeSidebarView === 'details_1hr' || activeSidebarView === 'details_24hr' || activeSidebarView === 'details_7day' ) && ( <div className="text-center py-10"><p className="text-sm text-slate-500">No data available for this period.</p></div> )}
                    </div> {/* End of desktop sidebar scrollable content */}
                    <div className="p-1.5 text-center border-t border-slate-700 mt-auto">
                        <p className="text-[10px] text-slate-500">&copy; {new Date().getFullYear()} Built By Vibes | Data: USGS</p>
                    </div>
                </aside>
            </div> {/* End of main flex container (main + aside) */}

            <BottomNav />

            {/* Removed direct rendering of EarthquakeDetailView, now handled by routing */}
        </div>
    );
}

/**
 * A component that wraps EarthquakeDetailView and handles its presentation as a modal
 * controlled by routing parameters. It extracts the detail URL from the route and
 * manages the modal's open/close state based on navigation.
 * @returns {JSX.Element} The rendered EarthquakeDetailView component configured as a modal.
 */
const EarthquakeDetailModal = ({ broaderEarthquakeData, dataSourceTimespanDays, handleLoadMonthlyData, hasAttemptedMonthlyLoad, isLoadingMonthly }) => { // Add dataSourceTimespanDays
    const { detailUrlParam } = useParams();
    const navigate = useNavigate();
    const detailUrl = decodeURIComponent(detailUrlParam);

    const handleClose = () => {
        navigate(-1);
    };

    // Prepare a callback for SEO data if needed, or handle directly in App.jsx
    // For now, just passing broaderEarthquakeData
    return <EarthquakeDetailView
                detailUrl={detailUrl}
                onClose={handleClose}
                broaderEarthquakeData={broaderEarthquakeData}
                dataSourceTimespanDays={dataSourceTimespanDays} // Pass it down
                handleLoadMonthlyData={handleLoadMonthlyData}
                hasAttemptedMonthlyLoad={hasAttemptedMonthlyLoad}
                isLoadingMonthly={isLoadingMonthly}
            />;
};

export default App;