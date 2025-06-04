// src/pages/HomePage.jsx
import React, { useEffect, useMemo, useCallback, lazy, Suspense, useState } from 'react';
import { Routes, Route, useNavigate, Outlet } from 'react-router-dom';
import SeoMetadata from '../components/SeoMetadata';
import ErrorBoundary from '../components/ErrorBoundary';
import InteractiveGlobeView from '../components/InteractiveGlobeView';
import NotableQuakeFeature from '../components/NotableQuakeFeature';
import PreviousNotableQuakeFeature from '../components/PreviousNotableQuakeFeature';
import InfoSnippet from '../components/InfoSnippet';
import coastlineData from '../assets/ne_110m_coastline.json';
import tectonicPlatesData from '../assets/TectonicPlateBoundaries.json';
import GlobalLastMajorQuakeTimer from "../components/GlobalLastMajorQuakeTimer.jsx";
import BottomNav from "../components/BottomNav.jsx";
import ClusterSummaryItem from '../components/ClusterSummaryItem';
import { getMagnitudeColor } from '../utils/utils.js';

import SkeletonText from '../components/skeletons/SkeletonText';
import SkeletonListItem from '../components/skeletons/SkeletonListItem';
import TimeSinceLastMajorQuakeBanner from '../components/TimeSinceLastMajorQuakeBanner';
import SummaryStatisticsCard from '../components/SummaryStatisticsCard';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx';
import { useUIState } from '../contexts/UIStateContext.jsx';
import {
    FELT_REPORTS_THRESHOLD,
    SIGNIFICANCE_THRESHOLD,
    HEADER_TIME_UPDATE_INTERVAL_MS,
    REGIONS as APP_REGIONS,
    FEELABLE_QUAKE_THRESHOLD,
    MAJOR_QUAKE_THRESHOLD,
    ALERT_LEVELS,
    LOADING_MESSAGE_INTERVAL_MS,
    INITIAL_LOADING_MESSAGES
} from '../constants/appConstants';

// Lazy load route components
const FeedsPageLayoutComponent = lazy(() => import('../components/FeedsPageLayout'));
const EarthquakeDetailModalComponent = lazy(() => import('../components/EarthquakeDetailModalComponent'));
const ClusterDetailModalWrapper = lazy(() => import('../components/ClusterDetailModalWrapper'));
const OverviewPage = lazy(() => import('./OverviewPage'));
const LearnPage = lazy(() => import('./LearnPage'));

// Lazy load other heavy/conditional components for the sidebar
const RegionalDistributionList = lazy(() => import('../components/RegionalDistributionList'));
const MagnitudeDistributionSVGChart = lazy(() => import('../components/MagnitudeDistributionSVGChart'));
const EarthquakeTimelineSVGChart = lazy(() => import('../components/EarthquakeTimelineSVGChart'));
const MagnitudeDepthScatterSVGChart = lazy(() => import('../components/MagnitudeDepthScatterSVGChart'));
const PaginatedEarthquakeTable = lazy(() => import('../components/PaginatedEarthquakeTable'));

// --- GlobeLayout Component ---
const GlobeLayout = (props) => {
  const {
    globeFocusLng,
    handleQuakeClick,
    getMagnitudeColor,
    coastlineData,
    tectonicPlatesData,
    activeClusters,
    lastMajorQuake,
    formatTimeDuration,
    handleNotableQuakeSelect,
    keyStatsForGlobe
  } = props;

  return (
    <div className="block h-full w-full">
      <InteractiveGlobeView
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
            <div className="text-xs sm:text-sm">Last Hour: <span className="font-bold text-sm sm:text-base text-sky-300">{keyStatsForGlobe?.lastHourCount ?? <SkeletonText width="w-6" />}</span></div>
            <div className="text-xs sm:text-sm">24h Total: <span className="font-bold text-sm sm:text-base text-sky-300">{keyStatsForGlobe?.count24h ?? <SkeletonText width="w-8" />}</span></div>
            <div className="text-xs sm:text-sm">72h Total: <span className="font-bold text-sm sm:text-base text-sky-300">{keyStatsForGlobe?.count72h ?? <SkeletonText width="w-8" />}</span></div>
            <div className="text-xs sm:text-sm">24h Strongest: <span className="font-bold text-sm sm:text-base text-sky-300">{keyStatsForGlobe?.strongest24h?.mag ? `M ${keyStatsForGlobe.strongest24h.mag}` : (keyStatsForGlobe === null ? <SkeletonText width="w-12" /> : 'N/A')}</span></div>
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

// --- App Component ---
function App() {
    const { 
        activeSidebarView, setActiveSidebarView,
        globeFocusLng, setGlobeFocusLng,
        setFocusedNotableQuake
    } = useUIState();

    const formatDate = useCallback((timestamp) => {
        if (!timestamp) return 'N/A';
        return new Date(timestamp).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
    }, []);

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

    const LOCAL_REGIONS = useMemo(() => [ // Used for getRegionForEarthquake, distinct from APP_REGIONS from constants
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
        if (lon === null || lat === null || lon === undefined || lat === undefined) return LOCAL_REGIONS[LOCAL_REGIONS.length - 1];
        for (let i = 0; i < LOCAL_REGIONS.length - 1; i++) {
            const region = LOCAL_REGIONS[i];
            if (lat >= region.latMin && lat <= region.latMax && lon >= region.lonMin && lon <= region.lonMax) return region;
        }
        return LOCAL_REGIONS[LOCAL_REGIONS.length - 1];
    }, [LOCAL_REGIONS]);

    const [appCurrentTime, setAppCurrentTime] = useState(Date.now());

    const {
        isLoadingInitialData,
        error,
        overviewError,
        feedError,
        lastUpdatedOverview,
        lastUpdatedFeed,
        currentLoadingMessage,
        isInitialAppLoad,
        setCurrentFeedPeriod,
        currentFeedPeriod,
        keyStatsForGlobe,
        topActiveRegionsOverview,
        latestFeelableQuakesSnippet,
        recentSignificantQuakesForOverview,
        overviewClusters,
        currentEarthquakes,
        currentStatistics,
        lastMajorQuake, // For TimeSinceLastMajorQuakeBanner in sidebar overview
    } = useEarthquakeDataState();

    useEffect(() => {
        const timerId = setInterval(() => setAppCurrentTime(Date.now()), HEADER_TIME_UPDATE_INTERVAL_MS);
        return () => clearInterval(timerId);
    }, []);

    const lastMajorQuakeForGlobe = useMemo(() => {
        return recentSignificantQuakesForOverview && recentSignificantQuakesForOverview.length > 0
            ? recentSignificantQuakesForOverview[0]
            : null;
    }, [recentSignificantQuakesForOverview]);

    useEffect(() => {
        if (lastMajorQuakeForGlobe && lastMajorQuakeForGlobe.geometry && lastMajorQuakeForGlobe.geometry.coordinates && lastMajorQuakeForGlobe.geometry.coordinates.length >= 2) {
            const lng = lastMajorQuakeForGlobe.geometry.coordinates[0];
            if (typeof lng === 'number' && !isNaN(lng)) {
                setGlobeFocusLng(lng);
            }
        }
    }, [lastMajorQuakeForGlobe, setGlobeFocusLng]);

    const showFullScreenLoader = useMemo(() => isLoadingInitialData, [isLoadingInitialData]);

    const RouteLoadingFallback = () => (
        <div className="flex items-center justify-center h-screen w-full bg-slate-900">
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

    const headerTimeDisplay = useMemo(() => {
        const connectingMsg = "Connecting to Seismic Network...";
        const awaitingMsg = "Awaiting Initial Data...";
        if (isInitialAppLoad && !lastUpdatedOverview && !lastUpdatedFeed) {
            return <span role="status" aria-live="polite">{connectingMsg}</span>;
        }
        if (!lastUpdatedOverview && !lastUpdatedFeed) {
            return <span role="status" aria-live="polite">{awaitingMsg}</span>;
        }
        const mostRecentUpdate = lastUpdatedOverview && lastUpdatedFeed
            ? (new Date(lastUpdatedOverview) > new Date(lastUpdatedFeed) ? lastUpdatedOverview : lastUpdatedFeed)
            : (lastUpdatedOverview || lastUpdatedFeed);
        return `Live Data | Worker Updated: ${mostRecentUpdate || 'N/A'}`;
    }, [isInitialAppLoad, lastUpdatedOverview, lastUpdatedFeed]);

    const currentAlertConfig = useMemo(() => {
        const alertLevelFromStats = keyStatsForGlobe?.pagerAlert;
        if (alertLevelFromStats && ALERT_LEVELS[alertLevelFromStats.toUpperCase()]) {
           return ALERT_LEVELS[alertLevelFromStats.toUpperCase()];
        }
        return null;
    }, [keyStatsForGlobe]);

    const navigate = useNavigate();
    const handleQuakeClick = useCallback((quake) => {
        if (quake?.isCluster && quake?.clusterDetails) {
            const clusterInfo = quake.clusterDetails;
            const numQuakesDisplay = clusterInfo.quakes.length;
            const maxMagDisplay = quake.properties.mag;
            let message = `Cluster Information:\n------------------------\nTotal Earthquakes: ${numQuakesDisplay}\nMaximum Magnitude: M ${maxMagDisplay?.toFixed(1)}\nEarthquakes in Cluster (up to 5 shown):\n`;
            clusterInfo.quakes.slice(0, 5).forEach((q, index) => {
                message += `  ${index + 1}. M ${q.mag?.toFixed(1)} - ${q.place}\n`;
            });
            if (clusterInfo.quakes.length > 5) {
                message += `  ...and ${clusterInfo.quakes.length - 5} more.\n`;
            }
            alert(message);
            console.log("Cluster clicked:", quake);
        } else {
            const detailUrl = quake?.properties?.detail || quake?.properties?.url;
            if (detailUrl) {
                navigate(`/quake/${encodeURIComponent(detailUrl)}`);
            } else {
                console.warn("No detail URL for individual earthquake:", quake?.id, quake);
                alert(`Earthquake: M ${quake?.properties?.mag?.toFixed(1)} - ${quake?.properties?.place || 'Unknown location'}. No further details link available.`);
            }
        }
    }, [navigate]);

    const getFeedPageSeoInfo = useCallback((feedTitle, activePeriod) => {
        let periodDescription = "the latest updates";
        let periodKeywords = "earthquake feed, live seismic data";
        switch (activePeriod) {
            case 'last_hour': periodDescription = "the last hour"; periodKeywords = "last hour earthquakes, real-time seismic events"; break;
            case 'last_24_hours': periodDescription = "the last 24 hours"; periodKeywords = "24 hour earthquakes, daily seismic summary"; break;
            case 'last_7_days': periodDescription = "the last 7 days"; periodKeywords = "7 day earthquakes, weekly seismic activity"; break;
            case 'last_14_days': periodDescription = "the last 14 days"; periodKeywords = "14 day earthquakes, biweekly seismic overview"; break;
            case 'last_30_days': periodDescription = "the last 30 days"; periodKeywords = "30 day earthquakes, monthly seismic analysis"; break;
            case 'feelable_quakes_7_days': case 'feelable_quakes_30_days': periodDescription = `feelable quakes (M${FEELABLE_QUAKE_THRESHOLD.toFixed(1)}+)`; periodKeywords = "feelable earthquakes, noticeable seismic events"; break;
            case 'significant_quakes_7_days': case 'significant_quakes_30_days': periodDescription = `significant quakes (M${MAJOR_QUAKE_THRESHOLD.toFixed(1)}+)`; periodKeywords = "significant earthquakes, major seismic events"; break;
            default: periodDescription = "selected period"; break;
        }
        const title = feedTitle ? `${feedTitle} | Seismic Monitor` : 'Earthquake Feeds | Seismic Monitor';
        const description = `Explore earthquake data for ${periodDescription}. View lists, statistics, and details of seismic events. Updated with the latest USGS data.`;
        const keywords = `earthquake feed, live seismic data, earthquake list, ${periodKeywords}, seismic monitor, USGS earthquake data`;
        const safeActivePeriod = String(activePeriod).replace(/[^a-zA-Z0-9_.-]/g, '');
        const canonicalUrl = `https://earthquakeslive.com/feeds?activeFeedPeriod=${safeActivePeriod}`;
        return { title, description, keywords, pageUrl: canonicalUrl, canonicalUrl, locale: "en_US" };
    }, []);

    const handleNotableQuakeSelect = useCallback((quakeFromFeature) => {
        setFocusedNotableQuake(quakeFromFeature);
        const detailUrl = quakeFromFeature?.properties?.detail || quakeFromFeature?.properties?.url || quakeFromFeature?.url;
        if (detailUrl) {
            navigate(`/quake/${encodeURIComponent(detailUrl)}`);
        } else {
            alert(`Featured Quake: ${quakeFromFeature.name || quakeFromFeature.properties?.place}\n${quakeFromFeature.description || ''}`);
        }
    }, [navigate, setFocusedNotableQuake]);

    const handleClusterSummaryClick = useCallback((clusterData) => {
        navigate(`/cluster/${clusterData.id}`);
    }, [navigate]);

    const initialDataLoaded = useMemo(() => !!(keyStatsForGlobe && currentEarthquakes), [keyStatsForGlobe, currentEarthquakes]);

    const handleSetSidebarOverview = useCallback(() => setActiveSidebarView('overview_panel'), [setActiveSidebarView]);
    const handleSetSidebarDetails1hr = useCallback(() => { setActiveSidebarView('details_1hr'); setCurrentFeedPeriod('last_hour'); }, [setActiveSidebarView, setCurrentFeedPeriod]);
    const handleSetSidebarDetails24hr = useCallback(() => { setActiveSidebarView('details_24hr'); setCurrentFeedPeriod('last_24_hours'); }, [setActiveSidebarView, setCurrentFeedPeriod]);
    const handleSetSidebarDetails7day = useCallback(() => { setActiveSidebarView('details_7day'); setCurrentFeedPeriod('last_7_days'); }, [setActiveSidebarView, setCurrentFeedPeriod]);
    const handleSetSidebarDetails14day = useCallback(() => { setActiveSidebarView('details_14day'); setCurrentFeedPeriod('last_14_days'); }, [setActiveSidebarView, setCurrentFeedPeriod]);
    const handleSetSidebarDetails30day = useCallback(() => { setActiveSidebarView('details_30day'); setCurrentFeedPeriod('last_30_days'); }, [setActiveSidebarView, setCurrentFeedPeriod]);
    const handleSetSidebarLearnMore = useCallback(() => setActiveSidebarView('learn_more'), [setActiveSidebarView]);

    if (showFullScreenLoader) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white antialiased" role="status" aria-live="polite">
                <svg className="animate-spin h-12 w-12 text-indigo-400 mb-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg>
                <p className="text-2xl font-light text-indigo-300 mb-3">{currentLoadingMessage}</p>
                <div className="w-1/3 h-1 bg-indigo-700 rounded-full overflow-hidden mt-2"> <div className="h-full bg-indigo-400 animate-pulse-short" style={{ animationDuration: `${LOADING_MESSAGE_INTERVAL_MS * INITIAL_LOADING_MESSAGES.length / 1000}s`}}></div> </div>
                <style>{`@keyframes pulseShort{0%{width:0%}100%{width:100%}}.animate-pulse-short{animation:pulseShort linear infinite}`}</style>
                <p className="text-xs text-slate-500 mt-10">Seismic Data Visualization</p>
            </div>
        );
    }

    const displayError = error || overviewError || feedError;

    return (
        <div className="flex flex-col h-[100svh] font-sans bg-slate-900 text-slate-100 antialiased">
            <header className="bg-slate-800 text-white pt-4 pb-2 px-2 shadow-lg z-40 border-b border-slate-700">
                <div className="mx-auto flex flex-col sm:flex-row justify-between items-center px-3">
                    <h1 className="text-lg md:text-xl font-bold text-indigo-400">Global Seismic Activity Monitor</h1>
                    <p className="text-xs sm:text-sm text-slate-400 mt-0.5 sm:mt-0">{headerTimeDisplay}</p>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden pb-16 lg:pb-0">
                <main className="flex-1 relative bg-slate-900 lg:bg-black w-full overflow-y-auto">
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
                                      coastlineData={coastlineData}
                                      tectonicPlatesData={tectonicPlatesData}
                                      activeClusters={overviewClusters}
                                      lastMajorQuake={lastMajorQuakeForGlobe}
                                      formatTimeDuration={formatTimeDuration}
                                      handleNotableQuakeSelect={handleNotableQuakeSelect}
                                      keyStatsForGlobe={keyStatsForGlobe}
                                    />
                                  </>
                                }
                              >
                                <Route path="quake/:detailUrlParam" element={<EarthquakeDetailModalComponent />} />
                                <Route
                                  path="cluster/:clusterId"
                                  element={
                                    <ClusterDetailModalWrapper
                                      overviewClusters={overviewClusters}
                                      formatDate={formatDate}
                                      getMagnitudeColorStyle={getMagnitudeColorStyle}
                                      onIndividualQuakeSelect={handleQuakeClick}
                                    />
                                  }
                                />
                              </Route>
                              <Route path="/overview" element={
                                  <OverviewPage
                                    ALERT_LEVELS={ALERT_LEVELS}
                                    getMagnitudeColor={getMagnitudeColor}
                                    formatDate={formatDate}
                                    handleQuakeClick={handleQuakeClick}
                                    formatTimeAgo={formatTimeAgo}
                                    formatTimeDuration={formatTimeDuration}
                                    getRegionForEarthquake={getRegionForEarthquake}
                                    handleClusterSummaryClick={handleClusterSummaryClick}
                                    REGIONS={APP_REGIONS} // Use imported APP_REGIONS
                                    navigate={navigate}
                                  />
                              } />
                              <Route path="/feeds" element={
                                  <FeedsPageLayoutComponent
                                    handleQuakeClick={handleQuakeClick}
                                    getFeedPageSeoInfo={getFeedPageSeoInfo}
                                    getMagnitudeColorStyle={getMagnitudeColorStyle}
                                    formatTimeAgo={formatTimeAgo}
                                    formatDate={formatDate}
                                  />
                              } />
                              <Route path="/learn" element={<LearnPage />} />
                            </Routes>
                        </Suspense>
                    </ErrorBoundary>
                </main>

                <aside className="hidden lg:flex w-[480px] bg-slate-800 p-0 flex-col border-l border-slate-700 shadow-2xl z-20">
                    <div className="p-3 border-b border-slate-700"> <h2 className="text-md font-semibold text-indigo-400">Detailed Earthquake Analysis</h2> </div>
                    <div className="flex-shrink-0 p-2 space-x-1 border-b border-slate-700 whitespace-nowrap overflow-x-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-700">
                        <button onClick={handleSetSidebarOverview} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'overview_panel' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>Overview</button>
                        <button onClick={handleSetSidebarDetails1hr} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'details_1hr' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>Last Hour</button>
                        <button onClick={handleSetSidebarDetails24hr} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'details_24hr' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>Last 24hr</button>
                        <button onClick={handleSetSidebarDetails7day} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'details_7day' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>Last 7day</button>
                        <button onClick={handleSetSidebarDetails14day} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'details_14day' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>14-Day</button>
                        <button onClick={handleSetSidebarDetails30day} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'details_30day' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>30-Day</button>
                        <button onClick={handleSetSidebarLearnMore} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'learn_more' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>Learn</button>
                    </div>
                    <div className="flex-1 p-2 space-y-3 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800" key={activeSidebarView}>
                        {displayError && !showFullScreenLoader && (
                            <div className="bg-red-700 bg-opacity-40 border border-red-600 text-red-200 px-3 py-2 rounded-md text-xs" role="alert" aria-live="assertive">
                                <strong className="font-bold">Data Error:</strong> {displayError} Some data might be unavailable.
                            </div>
                        )}
                        {activeSidebarView === 'overview_panel' && (
                            <>
                            {currentAlertConfig && (
                                <div className={`border-l-4 p-2.5 rounded-r-md shadow-md text-xs ${ALERT_LEVELS[currentAlertConfig.text.toUpperCase()]?.detailsColorClass || ALERT_LEVELS[currentAlertConfig.text.toUpperCase()]?.colorClass} `} role="region" aria-live="polite" aria-labelledby="usgs-alert-title">
                                    <p id="usgs-alert-title" className="font-bold text-sm">Active USGS Alert: {currentAlertConfig.text}</p>
                                    <p>{currentAlertConfig.description}</p>
                                    {/* Paginated table for activeAlertTriggeringQuakes needs to be adapted if this data comes from worker stats */}
                                </div>
                            )}
                            {keyStatsForGlobe?.hasRecentTsunamiWarning && !currentAlertConfig && (
                                <div className="bg-sky-700 bg-opacity-40 border-l-4 border-sky-500 text-sky-200 p-2.5 rounded-md shadow-md text-xs" role="region" aria-live="polite" aria-labelledby="tsunami-warning-title">
                                    <p id="tsunami-warning-title" className="font-bold">Tsunami Info</p>
                                    <p>Recent quakes indicate potential tsunami activity. Check official channels.</p>
                                </div>
                            )}
                            <TimeSinceLastMajorQuakeBanner
                                formatTimeDuration={formatTimeDuration}
                                getRegionForEarthquake={getRegionForEarthquake}
                                handleQuakeClick={handleQuakeClick}
                                getMagnitudeColor={getMagnitudeColor}
                            />
                            <SummaryStatisticsCard
                                title="Overview (Last 24 Hours)"
                                stats={keyStatsForGlobe}
                                isLoading={isLoadingInitialData && !keyStatsForGlobe}
                            />
                            <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md text-sm">
                                <h3 className="text-md font-semibold mb-1 text-indigo-400">Most Active Region (Last 24h)</h3>
                                {isLoadingInitialData && !topActiveRegionsOverview?.length ? (
                                    <SkeletonText width="w-full" height="h-5" className="bg-slate-600"/>
                                ) : (
                                    topActiveRegionsOverview && topActiveRegionsOverview.length > 0 ? (
                                        topActiveRegionsOverview.map((region, index) => (
                                            <p key={region.name} className={`text-slate-300 ${index > 0 ? 'mt-0.5' : ''}`}>
                                                <span className="font-semibold" style={{color: APP_REGIONS.find(r => r.name === region.name)?.color || '#9CA3AF'}}>
                                                    {index + 1}. {region.name}
                                                </span>
                                                {region.count > 0 ? ` - ${region.count} events` : ''}
                                            </p>
                                        ))
                                    ) : ( <p className="text-slate-400 text-xs">(No significant regional activity in the last 24 hours)</p> )
                                )}
                            </div>

                                <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md mt-3">
                                    <h3 className="text-md font-semibold mb-2 text-indigo-300">Active Earthquake Clusters</h3>
                                    {overviewClusters && overviewClusters.length > 0 ? (
                                        <ul className="space-y-2">
                                            {overviewClusters.map(cluster => (
                                                <ClusterSummaryItem clusterData={cluster} key={cluster.id} onClusterSelect={handleClusterSummaryClick} />
                                            ))}
                                        </ul>
                                    ) : ( <p className="text-xs text-slate-400 text-center py-2">{isLoadingInitialData ? "Loading clusters..." : "No significant active clusters detected currently."}</p> )}
                                </div>

                            {recentSignificantQuakesForOverview && recentSignificantQuakesForOverview.length > 0 && (
                                <Suspense fallback={<ChartLoadingFallback message="Loading significant quakes table..." />}>
                                    <PaginatedEarthquakeTable
                                        title={`Recent Significant Quakes (M${MAJOR_QUAKE_THRESHOLD.toFixed(1)}+)`}
                                        earthquakes={recentSignificantQuakesForOverview}
                                        isLoading={isLoadingInitialData && !recentSignificantQuakesForOverview?.length}
                                        onQuakeClick={handleQuakeClick} itemsPerPage={10} defaultSortKey="time" initialSortDirection="descending" periodName="overview_significant"
                                        getMagnitudeColorStyle={getMagnitudeColorStyle} formatTimeAgo={formatTimeAgo} formatDate={formatDate}
                                    />
                                </Suspense>
                            )}
                            {isLoadingInitialData && (!recentSignificantQuakesForOverview || recentSignificantQuakesForOverview.length === 0) &&
                                <div className="bg-slate-700 p-3 rounded-lg mt-4 border border-slate-600 shadow-md">
                                    <h3 className="text-md font-semibold mb-2 text-indigo-400">Recent Significant Quakes (M{MAJOR_QUAKE_THRESHOLD.toFixed(1)}+)</h3>
                                    <SkeletonListItem /> <SkeletonListItem />
                                </div>
                            }
                            <div className="bg-slate-700 p-2 rounded-lg border border-slate-600 shadow-md"> <h3 className="text-md font-semibold mb-1 text-indigo-400">Did You Know?</h3> <InfoSnippet topic="magnitude" /> </div>
                            <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md text-sm"> <h3 className="text-md font-semibold mb-1 text-indigo-400">Earthquakes & Tectonic Plates</h3> <p className="text-xs text-slate-400 leading-relaxed"> Most earthquakes occur along the edges of tectonic plates... </p> </div>
                        </> )}
                        {activeSidebarView === 'learn_more' && ( <div className="p-2 bg-slate-700 rounded-md"> <h3 className="text-md font-semibold text-indigo-400 mb-2">Learn About Earthquakes</h3> <InfoSnippet topic="magnitude" /> <InfoSnippet topic="depth" /> <InfoSnippet topic="intensity" /> <InfoSnippet topic="alerts" /> <InfoSnippet topic="strike"/> <InfoSnippet topic="dip"/> <InfoSnippet topic="rake"/> <InfoSnippet topic="stressAxes"/> <InfoSnippet topic="beachball"/> <InfoSnippet topic="stationsUsed"/> <InfoSnippet topic="azimuthalGap"/> <InfoSnippet topic="rmsError"/> </div> )}

                        {activeSidebarView === 'details_1hr' && ( <div className="space-y-3">
                            <SummaryStatisticsCard title="Summary (Last Hour)" stats={currentStatistics} isLoading={isLoadingInitialData && currentFeedPeriod === 'last_hour'} />
                            <Suspense fallback={<ChartLoadingFallback />}><MagnitudeDistributionSVGChart earthquakes={currentEarthquakes} titleSuffix="(Last Hour)" isLoading={isLoadingInitialData && currentFeedPeriod === 'last_hour'} getMagnitudeColor={getMagnitudeColor} /></Suspense>
                            <Suspense fallback={<ChartLoadingFallback />}><MagnitudeDepthScatterSVGChart earthquakes={currentEarthquakes} titleSuffix="(Last Hour)" isLoading={isLoadingInitialData && currentFeedPeriod === 'last_hour'} getMagnitudeColor={getMagnitudeColor} /></Suspense>
                            <Suspense fallback={<ChartLoadingFallback message="Loading list..." />}><RegionalDistributionList earthquakes={currentEarthquakes} titleSuffix="(Last Hour)" isLoading={isLoadingInitialData && currentFeedPeriod === 'last_hour'} getRegionForEarthquake={getRegionForEarthquake} /></Suspense>
                            <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}><PaginatedEarthquakeTable title="Earthquakes (Last Hour)" earthquakes={currentEarthquakes} isLoading={isLoadingInitialData && currentFeedPeriod === 'last_hour'} onQuakeClick={handleQuakeClick} itemsPerPage={10} periodName="last_hour_table" getMagnitudeColorStyle={getMagnitudeColorStyle} formatTimeAgo={formatTimeAgo} formatDate={formatDate} /></Suspense>
                        </div> )}
                        {activeSidebarView === 'details_24hr' && ( <div className="space-y-3">
                            <SummaryStatisticsCard title="Summary (Last 24 Hours)" stats={currentStatistics} isLoading={isLoadingInitialData && currentFeedPeriod === 'last_24_hours'} />
                            <Suspense fallback={<ChartLoadingFallback />}><MagnitudeDistributionSVGChart earthquakes={currentEarthquakes} titleSuffix="(Last 24 Hours)" isLoading={isLoadingInitialData && currentFeedPeriod === 'last_24_hours'} getMagnitudeColor={getMagnitudeColor} /></Suspense>
                            <Suspense fallback={<ChartLoadingFallback />}><MagnitudeDepthScatterSVGChart earthquakes={currentEarthquakes} titleSuffix="(Last 24 Hours)" isLoading={isLoadingInitialData && currentFeedPeriod === 'last_24_hours'} getMagnitudeColor={getMagnitudeColor} /></Suspense>
                            <Suspense fallback={<ChartLoadingFallback message="Loading list..." />}><RegionalDistributionList earthquakes={currentEarthquakes} titleSuffix="(Last 24 Hours)" isLoading={isLoadingInitialData && currentFeedPeriod === 'last_24_hours'} getRegionForEarthquake={getRegionForEarthquake} /></Suspense>
                            <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}><PaginatedEarthquakeTable title="Earthquakes (Last 24 Hours)" earthquakes={currentEarthquakes} isLoading={isLoadingInitialData && currentFeedPeriod === 'last_24_hours'} onQuakeClick={handleQuakeClick} periodName="last_24_hours_table" getMagnitudeColorStyle={getMagnitudeColorStyle} formatTimeAgo={formatTimeAgo} formatDate={formatDate} /></Suspense>
                        </div> )}
                        {activeSidebarView === 'details_7day' && ( <div className="space-y-3">
                            <SummaryStatisticsCard title="Summary (Last 7 Days)" stats={currentStatistics} isLoading={isLoadingInitialData && currentFeedPeriod === 'last_7_days'} />
                            <Suspense fallback={<ChartLoadingFallback />}><MagnitudeDistributionSVGChart earthquakes={currentEarthquakes} titleSuffix="(Last 7 Days)" isLoading={isLoadingInitialData && currentFeedPeriod === 'last_7_days'} getMagnitudeColor={getMagnitudeColor} /></Suspense>
                            <Suspense fallback={<ChartLoadingFallback />}><MagnitudeDepthScatterSVGChart earthquakes={currentEarthquakes} titleSuffix="(Last 7 Days)" isLoading={isLoadingInitialData && currentFeedPeriod === 'last_7_days'} getMagnitudeColor={getMagnitudeColor} /></Suspense>
                            <Suspense fallback={<ChartLoadingFallback />}><EarthquakeTimelineSVGChart earthquakes={currentEarthquakes} days={7} titleSuffix="(Last 7 Days)" isLoading={isLoadingInitialData && currentFeedPeriod === 'last_7_days'} /></Suspense>
                            <Suspense fallback={<ChartLoadingFallback message="Loading list..." />}><RegionalDistributionList earthquakes={currentEarthquakes} titleSuffix="(Last 7 Days)" isLoading={isLoadingInitialData && currentFeedPeriod === 'last_7_days'} getRegionForEarthquake={getRegionForEarthquake} /></Suspense>
                            <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}><PaginatedEarthquakeTable title="Earthquakes (Last 7 Days)" earthquakes={currentEarthquakes} isLoading={isLoadingInitialData && currentFeedPeriod === 'last_7_days'} onQuakeClick={handleQuakeClick} periodName="last_7_days_table" getMagnitudeColorStyle={getMagnitudeColorStyle} formatTimeAgo={formatTimeAgo} formatDate={formatDate} /></Suspense>
                        </div> )}

                        {isLoadingInitialData && (currentFeedPeriod === 'last_14_days' || currentFeedPeriod === 'last_30_days') && <p className="text-xs text-slate-400 text-center py-3 animate-pulse">Loading extended data archives...</p>}
                        {feedError && (currentFeedPeriod === 'last_14_days' || currentFeedPeriod === 'last_30_days') && <p className="text-red-300 text-xs text-center py-1">Error loading data: {feedError}</p>}

                        {activeSidebarView === 'details_14day' && ( <div className="space-y-3">
                            <SummaryStatisticsCard title="Summary (Last 14 Days)" stats={currentStatistics} isLoading={isLoadingInitialData && currentFeedPeriod === 'last_14_days'} />
                            <Suspense fallback={<ChartLoadingFallback />}><MagnitudeDistributionSVGChart earthquakes={currentEarthquakes} titleSuffix="(Last 14 Days)" isLoading={isLoadingInitialData && currentFeedPeriod === 'last_14_days'} getMagnitudeColor={getMagnitudeColor} /></Suspense>
                            <Suspense fallback={<ChartLoadingFallback />}><MagnitudeDepthScatterSVGChart earthquakes={currentEarthquakes} titleSuffix="(Last 14 Days)" isLoading={isLoadingInitialData && currentFeedPeriod === 'last_14_days'} getMagnitudeColor={getMagnitudeColor} /></Suspense>
                            <Suspense fallback={<ChartLoadingFallback />}><EarthquakeTimelineSVGChart earthquakes={currentEarthquakes} days={14} titleSuffix="(Last 14 Days)" isLoading={isLoadingInitialData && currentFeedPeriod === 'last_14_days'}/></Suspense>
                            <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}><PaginatedEarthquakeTable title="All Earthquakes (Last 14 Days)" earthquakes={currentEarthquakes} isLoading={isLoadingInitialData && currentFeedPeriod === 'last_14_days'} onQuakeClick={handleQuakeClick} itemsPerPage={10} defaultSortKey="time" initialSortDirection="descending" getMagnitudeColorStyle={getMagnitudeColorStyle} formatTimeAgo={formatTimeAgo} formatDate={formatDate} periodName="last_14_days_table"/></Suspense>
                        </div> )}
                        {activeSidebarView === 'details_30day' && ( <div className="space-y-3">
                            <SummaryStatisticsCard title="Summary (Last 30 Days)" stats={currentStatistics} isLoading={isLoadingInitialData && currentFeedPeriod === 'last_30_days'} />
                            <Suspense fallback={<ChartLoadingFallback />}><MagnitudeDistributionSVGChart earthquakes={currentEarthquakes} titleSuffix="(Last 30 Days)" isLoading={isLoadingInitialData && currentFeedPeriod === 'last_30_days'} getMagnitudeColor={getMagnitudeColor}/></Suspense>
                            <Suspense fallback={<ChartLoadingFallback />}><MagnitudeDepthScatterSVGChart earthquakes={currentEarthquakes} titleSuffix="(Last 30 Days)" isLoading={isLoadingInitialData && currentFeedPeriod === 'last_30_days'} getMagnitudeColor={getMagnitudeColor}/></Suspense>
                            <Suspense fallback={<ChartLoadingFallback message="Loading list..." />}><RegionalDistributionList earthquakes={currentEarthquakes} titleSuffix="(Last 30 Days)" isLoading={isLoadingInitialData && currentFeedPeriod === 'last_30_days'} getRegionForEarthquake={getRegionForEarthquake}/></Suspense>
                            <div className="grid grid-cols-1 gap-3">
                                <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}><PaginatedEarthquakeTable title="Top 10 Strongest (30d)" earthquakes={currentEarthquakes} isLoading={isLoadingInitialData && currentFeedPeriod === 'last_30_days'} onQuakeClick={handleQuakeClick} itemsPerPage={10} defaultSortKey="mag" initialSortDirection="descending" getMagnitudeColorStyle={getMagnitudeColorStyle} formatTimeAgo={formatTimeAgo} formatDate={formatDate} periodName="strongest_30_days_table"/></Suspense>
                                <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}><PaginatedEarthquakeTable title="Most Widely Felt (30d)" earthquakes={currentEarthquakes} isLoading={isLoadingInitialData && currentFeedPeriod === 'last_30_days'} onQuakeClick={handleQuakeClick} itemsPerPage={5} defaultSortKey="felt" initialSortDirection="descending" filterPredicate={q => q.properties.felt !== null && typeof q.properties.felt === 'number' && q.properties.felt > FELT_REPORTS_THRESHOLD} getMagnitudeColorStyle={getMagnitudeColorStyle} formatTimeAgo={formatTimeAgo} formatDate={formatDate} periodName="felt_30_days_table"/></Suspense>
                                <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}><PaginatedEarthquakeTable title="Most Significant (30d)" earthquakes={currentEarthquakes} isLoading={isLoadingInitialData && currentFeedPeriod === 'last_30_days'} onQuakeClick={handleQuakeClick} itemsPerPage={5} defaultSortKey="sig" initialSortDirection="descending" filterPredicate={q => q.properties.sig !== null && typeof q.properties.sig === 'number' && q.properties.sig > SIGNIFICANCE_THRESHOLD} getMagnitudeColorStyle={getMagnitudeColorStyle} formatTimeAgo={formatTimeAgo} formatDate={formatDate} periodName="significant_30_days_table"/></Suspense>
                            </div>
                            <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}><PaginatedEarthquakeTable title="All Earthquakes (Last 30 Days)" earthquakes={currentEarthquakes} isLoading={isLoadingInitialData && currentFeedPeriod === 'last_30_days'} onQuakeClick={handleQuakeClick} itemsPerPage={15} defaultSortKey="time" initialSortDirection="descending" getMagnitudeColorStyle={getMagnitudeColorStyle} formatTimeAgo={formatTimeAgo} formatDate={formatDate} periodName="all_30_days_table"/></Suspense>
                        </div> )}

                        {isLoadingInitialData && !showFullScreenLoader &&
                            activeSidebarView !== 'overview_panel' && activeSidebarView !== 'learn_more' &&
                            !currentEarthquakes?.length &&
                            ( <div className="text-center py-10"><p className="text-sm text-slate-500 animate-pulse">Loading selected data...</p></div> )
                        }
                        {!isLoadingInitialData && !currentEarthquakes?.length &&
                         (activeSidebarView === 'details_1hr' || activeSidebarView === 'details_24hr' || activeSidebarView === 'details_7day' || activeSidebarView === 'details_14day' || activeSidebarView === 'details_30day') &&
                         ( <div className="text-center py-10"><p className="text-sm text-slate-500">No data available for this period.</p></div> )
                        }
                    </div>
                    <footer className="p-1.5 text-center border-t border-slate-700 mt-auto">
                        <p className="text-[10px] text-slate-500">&copy; {new Date().getFullYear()} Built By Vibes | Data: USGS</p>
                    </footer>
                </aside>
            </div>

            <BottomNav onNavClick={setActiveSidebarView} activeView={activeSidebarView} />
        </div>
    );
}

export default App;