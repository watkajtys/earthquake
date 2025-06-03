// src/pages/OverviewPage.jsx
import React from 'react';
import SeoMetadata from '../components/SeoMetadata';
import AlertDisplay from '../components/AlertDisplay';
import LatestEvent from '../components/LatestEvent';
import ActivityList from '../components/ActivityList';
import ActiveRegionDisplay from '../components/ActiveRegionDisplay';
import QuickFact from '../components/QuickFact'; // Import the new component
import TimeSinceLastMajorQuakeBanner from '../components/TimeSinceLastMajorQuakeBanner';
import SummaryStatisticsCard from '../components/SummaryStatisticsCard';
import RegionalDistributionList from '../components/RegionalDistributionList';
// InfoSnippet is now imported in QuickFact.jsx
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

                {/* Render the AlertDisplay component */}
                <AlertDisplay
                    currentAlertConfig={currentAlertConfig}
                    hasRecentTsunamiWarning={hasRecentTsunamiWarning}
                    ALERT_LEVELS={ALERT_LEVELS}
                />

                {/* Render the LatestEvent component */}
                <LatestEvent
                    lastMajorQuake={lastMajorQuake}
                    getMagnitudeColor={getMagnitudeColor}
                    formatDate={formatDate}
                    handleQuakeClick={handleQuakeClick}
                />

                {/* Render the ActivityList component */}
                <ActivityList
                    latestFeelableQuakesSnippet={latestFeelableQuakesSnippet}
                    getMagnitudeColor={getMagnitudeColor}
                    formatTimeAgo={formatTimeAgo}
                    handleQuakeClick={handleQuakeClick}
                    navigate={navigate}
                />

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

                {/* Render the ActiveRegionDisplay component */}
                <ActiveRegionDisplay
                    topActiveRegionsOverview={topActiveRegionsOverview}
                    REGIONS={REGIONS}
                    isLoadingDaily={isLoadingDaily}
                    earthquakesLast24Hours={earthquakesLast24Hours}
                />

                {/* Render the QuickFact component */}
                <QuickFact navigate={navigate} />
                {/* ... other content from /overview route ... */}
            </div>
        </>
    );
};

export default OverviewPage;
