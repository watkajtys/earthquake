// src/pages/OverviewPage.jsx
import React from 'react';
import SeoMetadata from '../components/SeoMetadata';
import TimeSinceLastMajorQuakeBanner from '../components/TimeSinceLastMajorQuakeBanner';
import SummaryStatisticsCard from '../components/SummaryStatisticsCard';
import RegionalDistributionList from '../components/RegionalDistributionList';
import InfoSnippet from '../components/InfoSnippet';
import ClusterSummaryItem from '../components/ClusterSummaryItem'; // Assuming this is used here
// Import any other components specific to the previous inline overview content if needed

import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx'; // Import the context hook

// Props that would have been passed to the inline JSX in HomePage.jsx for the /overview route
// These will need to be passed from HomePage.jsx when rendering this component
const OverviewPage = ({
    // currentAlertConfig, // Will get from context via highestRecentAlert
    ALERT_LEVELS, // Constant, but might be passed if structure demands
    // hasRecentTsunamiWarning, // Will get from context
    // lastMajorQuake, // Will get from context
    getMagnitudeColor,
    formatDate,
    handleQuakeClick, // Callback
    latestFeelableQuakesSnippet,
    formatTimeAgo,
    // BottomNav related click might be handled by NavLink if this page is simple
    // isLoadingInitialData, // Will get from context
    // isLoadingMonthly, // Will get from context
    // hasAttemptedMonthlyLoad, // Will get from context
    // timeBetweenPreviousMajorQuakes, // Will get from context
    // previousMajorQuake, // Will get from context
    formatTimeDuration, // For TimeSinceLastMajorQuakeBanner
    getRegionForEarthquake, // For TimeSinceLastMajorQuakeBanner & RegionalDistributionList
    // earthquakesLast24Hours, // Will get from context
    // prev24HourData, // Will get from context
    // isLoadingDaily, // Will get from context
    // isLoadingWeekly, // Will get from context
    calculateStats, // For SummaryStatisticsCard
    overviewClusters, // For ClusterSummaryItem list
    handleClusterSummaryClick, // For ClusterSummaryItem list
    topActiveRegionsOverview, // For active region display
    REGIONS, // For active region display color (if not handled by topActiveRegionsOverview structure)
    navigate, // For "Learn More" button, if not using Link
}) => {
    const {
        highestRecentAlert, // Used to derive currentAlertConfig
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
        isLoadingWeekly
    } = useEarthquakeDataState();

    // Derive currentAlertConfig here
    const currentAlertConfig = React.useMemo(() => {
        if (highestRecentAlert && ALERT_LEVELS[highestRecentAlert.toUpperCase()]) {
            return ALERT_LEVELS[highestRecentAlert.toUpperCase()];
        }
        return null;
    }, [highestRecentAlert, ALERT_LEVELS]);
    
    // This component will replicate the JSX structure previously under the /overview Route in HomePage.jsx
    // For brevity, I'm showing a simplified structure. The actual content should be moved from HomePage.jsx
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

                {/* Example of how one of the components would be used with passed props */}
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

                {/* Last Major Quake section */}
                {lastMajorQuake && (
                    <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md">
                        <h3 className="text-sm font-semibold text-indigo-300 mb-1">Latest Significant Event</h3>
                        <p className="text-lg font-bold" style={{ color: getMagnitudeColor(lastMajorQuake.properties.mag) }}>
                            M {lastMajorQuake.properties.mag?.toFixed(1)}
                        </p>
                        <p className="text-sm text-slate-300 truncate" title={lastMajorQuake.properties.place}>
                            {lastMajorQuake.properties.place || "Location details pending..."}
                        </p>
                        <p className="text-xs text-slate-300"> {/* Changed from text-slate-400 */}
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
                                        <span className="text-slate-300"> {/* Changed from text-slate-400 */}
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
                    formatTimeDuration={formatTimeDuration}
                    getRegionForEarthquake={getRegionForEarthquake}
                    handleQuakeClick={handleQuakeClick}
                    getMagnitudeColor={getMagnitudeColor}
                />
                <SummaryStatisticsCard
                    title="Global Statistics (Last 24 Hours)"
                    currentPeriodData={earthquakesLast24Hours}
                    previousPeriodData={prev24HourData}
                    isLoading={isLoadingDaily || (isLoadingWeekly && !earthquakesLast24Hours)}
                    calculateStats={calculateStats}
                />

                {/* Active Earthquake Clusters Section */}
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
                                    onClusterSelect={handleClusterSummaryClick}
                                />
                            ))}
                        </ul>
                    ) : (
                        <p className="text-xs text-slate-300 text-center py-2"> {/* Changed from text-slate-400 */}
                            No significant active clusters detected currently.
                        </p>
                    )}
                </div>

                {/* Most Active Region */}
                <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md text-sm">
                    <h3 className="text-md font-semibold mb-1 text-indigo-400">Most Active Region (Last 24h)</h3>
                    {isLoadingDaily && !earthquakesLast24Hours ? (
                        <p>Loading...</p>
                    ) : (
                        topActiveRegionsOverview && topActiveRegionsOverview.length > 0 ? (
                            topActiveRegionsOverview.map((region, index) => {
                                const regionColor = REGIONS.find(r => r.name === region.name)?.color || '#9CA3AF';
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
