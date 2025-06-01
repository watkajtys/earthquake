// src/pages/OverviewPage.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useEarthquakeDataState } from '../context/EarthquakeDataContext.jsx';
import SeoMetadata from '../components/SeoMetadata';
import TimeSinceLastMajorQuakeBanner from '../components/TimeSinceLastMajorQuakeBanner';
import SummaryStatisticsCard from '../components/SummaryStatisticsCard';
// RegionalDistributionList is not directly used in the provided JSX for Overview, but could be added.
import InfoSnippet from '../components/InfoSnippet';
import ClusterSummaryItem from '../components/ClusterSummaryItem';

// Import utilities and constants
import {
    getMagnitudeColor,
    formatDate,
    formatTimeAgo,
    formatTimeDuration,
    getRegionForEarthquake,
    calculateStats
} from '../utils/utils.js';
import { ALERT_LEVELS, REGIONS as AppRegions, FEELABLE_QUAKE_THRESHOLD as AppFeelableThresholdConstant } from '../constants/appConstants.js';


const OverviewPage = () => {
    const navigate = useNavigate();
    const {
        currentAlertConfig, // Assuming this is shaped by context based on highestRecentAlert
        hasRecentTsunamiWarning,
        lastMajorQuake,
        isLoadingInitialData,
        isLoadingMonthly,
        hasAttemptedMonthlyLoad,
        timeBetweenPreviousMajorQuakes,
        previousMajorQuake,
        earthquakesLast24Hours,
        prev24HourData,
        isLoadingDaily,
        isLoadingWeekly,
        overviewClusters,
        topActiveRegionsOverview,
        earthquakesLast7Days,
        FEELABLE_QUAKE_THRESHOLD: FEELABLE_QUAKE_THRESHOLD_FROM_CONTEXT, // from context
    } = useEarthquakeDataState();

    // Use the constant directly, or fallback to context if you prefer that pattern
    const FEELABLE_QUAKE_THRESHOLD = AppFeelableThresholdConstant || FEELABLE_QUAKE_THRESHOLD_FROM_CONTEXT || 2.5;


    // TODO: Define handleQuakeClick and handleClusterSummaryClick.
    // For now, using placeholder functions. These would typically navigate.
    const handleQuakeClick = (quake) => {
        console.log("Quake clicked in OverviewPage:", quake);
        if (quake?.properties?.detail || quake?.properties?.url) {
             navigate(`/quake/${encodeURIComponent(quake.properties.detail || quake.properties.url)}`);
        }
    };
    const handleClusterSummaryClick = (cluster) => {
        console.log("Cluster clicked in OverviewPage:", cluster);
        navigate(`/cluster/${cluster.id}`);
    };

    // Derive latestFeelableQuakesSnippet from earthquakesLast7Days (or earthquakesLast24Hours as fallback)
    const latestFeelableQuakesSnippet = React.useMemo(() => {
        const sourceData = earthquakesLast7Days || earthquakesLast24Hours || [];
        return sourceData
            .filter(q => q.properties.mag !== null && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD )
            .sort((a, b) => b.properties.time - a.properties.time)
            .slice(0, 3);
    }, [earthquakesLast7Days, earthquakesLast24Hours, FEELABLE_QUAKE_THRESHOLD]);

    return (
        <>
            <SeoMetadata
                title="Earthquake Overview | Latest Global Seismic Summary & Statistics"
                description="Get a comprehensive summary of the latest global earthquake activity, including significant events, regional distributions, key statistics, and seismic alerts."
                keywords="earthquake summary, seismic overview, recent earthquakes, earthquake statistics, significant earthquakes, seismic alerts, regional earthquake activity"
                pageUrl="https://earthquakeslive.com/overview"
                canonicalUrl="https://earthquakeslive.com/overview"
                locale="en_US"
                type="website"
            />
            <div className="p-3 md:p-4 h-full space-y-3 text-slate-200 lg:hidden">
                <h2 className="text-lg font-semibold text-indigo-400 sticky top-0 bg-slate-900 py-2 z-10 -mx-3 px-3 sm:-mx-4 sm:px-4 border-b border-slate-700">
                    Overview
                </h2>

                {currentAlertConfig && ALERT_LEVELS[currentAlertConfig.text?.toUpperCase()] && (
                    <div className={`border-l-4 p-2.5 rounded-r-md shadow-md text-xs ${ALERT_LEVELS[currentAlertConfig.text.toUpperCase()]?.detailsColorClass || ALERT_LEVELS[currentAlertConfig.text.toUpperCase()]?.colorClass}`}>
                        <p className="font-bold text-sm mb-1">Active USGS Alert: {currentAlertConfig.text}</p>
                        <p className="text-xs">{ALERT_LEVELS[currentAlertConfig.text.toUpperCase()]?.description}</p>
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
                        <p className="text-xs text-slate-300">
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

                {/* Latest Feelable Quakes */}
                {latestFeelableQuakesSnippet && latestFeelableQuakesSnippet.length > 0 && (
                    <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md">
                        <h3 className="text-sm font-semibold text-indigo-300 mb-2">Latest Activity</h3>
                        <ul className="space-y-2">
                            {latestFeelableQuakesSnippet.map(quake => (
                                <li
                                    key={`snippet-${quake.id}`}
                                    className="text-xs border-b border-slate-600 last:border-b-0 rounded"
                                >
                                    <button
                                        type="button"
                                        onClick={() => handleQuakeClick(quake)}
                                        className="w-full text-left p-2 hover:bg-slate-600 focus:bg-slate-500 transition-colors rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                    >
                                        <div className="flex justify-between items-center">
                                            <span className="font-semibold" style={{ color: getMagnitudeColor(quake.properties.mag) }}>
                                            M {quake.properties.mag?.toFixed(1)}
                                        </span>
                                        <span className="text-slate-300">
                                                {formatTimeAgo(Date.now() - quake.properties.time)}
                                            </span>
                                        </div>
                                        <p className="text-slate-300 truncate text-[11px]" title={quake.properties.place}>
                                            {quake.properties.place || "Location details pending..."}
                                        </p>
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <button
                            onClick={() => navigate('/feeds?activeFeedPeriod=last_24_hours')} // Example navigation
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
                    formatTimeDuration={formatTimeDuration} // from utils
                    getRegionForEarthquake={getRegionForEarthquake} // from utils
                    handleQuakeClick={handleQuakeClick} // local
                    getMagnitudeColor={getMagnitudeColor} // from utils
                />
                <SummaryStatisticsCard
                    title="Global Statistics (Last 24 Hours)"
                    currentPeriodData={earthquakesLast24Hours}
                    previousPeriodData={prev24HourData}
                    isLoading={isLoadingDaily || (isLoadingWeekly && (!earthquakesLast24Hours || earthquakesLast24Hours.length === 0))}
                    calculateStats={calculateStats} // from utils
                />

                {/* Active Earthquake Clusters Section */}
                <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md mt-3">
                    <h3 className="text-md font-semibold mb-2 text-indigo-300">
                        Active Earthquake Clusters
                    </h3>
                    {overviewClusters && overviewClusters.length > 0 ? (
                        <ul className="space-y-2">
                            {overviewClusters && overviewClusters.map(cluster => ( // overviewClusters from context
                                <ClusterSummaryItem
                                    clusterData={cluster}
                                    key={cluster.id}
                                    onClusterSelect={handleClusterSummaryClick} // local
                                />
                            ))}
                        </ul>
                    ) : (
                        <p className="text-xs text-slate-300 text-center py-2">
                            No significant active clusters detected currently.
                        </p>
                    )}
                </div>

                {/* Most Active Region */}
                <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md text-sm">
                    <h3 className="text-md font-semibold mb-1 text-indigo-400">Most Active Region (Last 24h)</h3>
                    {(isLoadingDaily && (!earthquakesLast24Hours || earthquakesLast24Hours.length === 0)) ? (
                        <p>Loading...</p>
                    ) : (
                        topActiveRegionsOverview && topActiveRegionsOverview.length > 0 ? ( // topActiveRegionsOverview from context
                            topActiveRegionsOverview.map((region, index) => {
                                // REGIONS is now AppRegions imported from constants
                                const regionDetails = AppRegions.find(r => r.name === region.name);
                                const regionColor = regionDetails?.color || '#9CA3AF';
                                return (
                                    <p key={region.name} className={`text-slate-300 ${index > 0 ? 'mt-0.5' : ''}`}>
                                        <span className="font-semibold" style={{color: regionColor}}>
                                            {index + 1}. {region.name}
                                        </span>
                                        {region.count > 0 ? ` - ${region.count} events` : ''}
                                    </p>
                                );
                            })
                        ) : (
                            <p className="text-slate-300 text-xs">(No significant regional activity in the last 24 hours)</p>
                        )
                    )}
                </div>

                {/* Quick Fact & Learn More */}
                <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md text-sm">
                    <h3 className="text-md font-semibold mb-1 text-indigo-400">Quick Fact</h3>
                    <InfoSnippet topic="magnitude" />
                    <button
                        onClick={() => navigate('/learn')}
                        className="mt-2 w-full bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold py-1.5 px-3 rounded transition-colors"
                    >
                        Learn More About Earthquakes
                    </button>
                </div>
                {/* ... other content from /overview route ... */}
            </div>
        </>
    );
};

export default OverviewPage;
