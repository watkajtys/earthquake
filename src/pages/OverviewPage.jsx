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
import { getMagnitudeColorStyle } from '../utils/utils.js'; // Added import
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx'; // Import the context hook

/**
 * Renders the "Overview" page, providing a snapshot of current and recent global seismic activity.
 * This page is typically displayed on mobile devices or when the "Overview" tab is selected in the main UI.
 * It aggregates various data display components like alerts, latest significant event,
 * activity lists, summary statistics, regional distributions, and active clusters.
 *
 * The component receives several utility functions and pre-calculated data snippets as props.
 * It also consumes real-time data and loading states directly from `EarthquakeDataContext`.
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {Object} props.ALERT_LEVELS - Configuration object for USGS PAGER alert levels.
 * @param {function(number):string} props.getMagnitudeColor - Function to get color based on earthquake magnitude.
 * @param {function(number):string} props.formatDate - Function to format a timestamp into a readable date string.
 * @param {function(Object):void} props.handleQuakeClick - Callback for when an earthquake item is clicked.
 * @param {Array<Object>} props.latestFeelableQuakesSnippet - Array of the latest feelable quakes for a snippet display.
 * @param {function(number):string} props.formatTimeAgo - Function to format a duration into a "time ago" string.
 * @param {function(number):string} props.formatTimeDuration - Function to format a duration into a detailed time string (days, hr, min).
 * @param {function(Object):Object} props.getRegionForEarthquake - Function to determine the geographic region of an earthquake.
 * @param {function(Array<Object>):Object} props.calculateStats - Function to calculate summary statistics from an array of earthquakes.
 * @param {Array<Object>} props.overviewClusters - Array of processed earthquake cluster data for display.
 * @param {function(Object):void} props.handleClusterSummaryClick - Callback for when a cluster summary item is clicked.
 * @param {Array<Object>} props.topActiveRegionsOverview - Array of data for displaying the most active regions.
 * @param {Array<Object>} props.REGIONS - Array of predefined geographic region objects.
 * @param {function(string):void} props.navigate - Navigation function from a routing library.
 * @returns {JSX.Element} The OverviewPage component.
 */
const OverviewPage = ({
    ALERT_LEVELS,
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
    calculateStats,
    overviewClusters,
    handleClusterSummaryClick,
    topActiveRegionsOverview,
    REGIONS,
    navigate,
}) => {
    const {
        highestRecentAlert,
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

    /**
     * Memoized configuration object for the current highest USGS PAGER alert,
     * derived from `highestRecentAlert` (from context) and the `ALERT_LEVELS` prop.
     * @type {Object|null}
     */
    const currentAlertConfig = React.useMemo(() => {
        if (highestRecentAlert && ALERT_LEVELS[highestRecentAlert.toUpperCase()]) {
            return ALERT_LEVELS[highestRecentAlert.toUpperCase()];
        }
        return null;
    }, [highestRecentAlert, ALERT_LEVELS]);

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
                    getMagnitudeColorStyle={getMagnitudeColorStyle}
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
