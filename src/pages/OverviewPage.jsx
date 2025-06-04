// src/pages/OverviewPage.jsx
import React from 'react';
import SeoMetadata from '../components/SeoMetadata';
import AlertDisplay from '../components/AlertDisplay';
import LatestEvent from '../components/LatestEvent';
import ActivityList from '../components/ActivityList';
import ActiveRegionDisplay from '../components/ActiveRegionDisplay';
import QuickFact from '../components/QuickFact';
import TimeSinceLastMajorQuakeBanner from '../components/TimeSinceLastMajorQuakeBanner';
import SummaryStatisticsCard from '../components/SummaryStatisticsCard';
// RegionalDistributionList might not be needed here if overview doesn't show it.
import ClusterSummaryItem from '../components/ClusterSummaryItem';

import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx';
import { ALERT_LEVELS, REGIONS as APP_REGIONS } from '../constants/appConstants'; // Import constants if needed by sub-components or logic here

// Props that were previously passed from App.jsx are now mostly sourced from context
const OverviewPage = ({
    getMagnitudeColor, // Utility function, can be passed or imported by sub-components
    formatDate, // Utility function
    handleQuakeClick, // Callback for interactions
    formatTimeAgo, // Utility function
    formatTimeDuration, // Utility function
    getRegionForEarthquake, // Utility function
    handleClusterSummaryClick, // Callback
    navigate, // For navigation actions
}) => {
    const {
        // Overview specific data from context:
        keyStatsForGlobe,
        topActiveRegionsOverview,
        latestFeelableQuakesSnippet,
        recentSignificantQuakesForOverview,
        overviewClusters,

        // General state from context:
        isLoadingInitialData, // Or general isLoading
        error, // Combined error state
        overviewError, // Specific error for overview data
        // highestRecentAlert, // If needed for AlertDisplay, though currentAlertConfig derived below covers it
        // hasRecentTsunamiWarning, // If needed for AlertDisplay
    } = useEarthquakeDataState();

    // Derive currentAlertConfig based on data from keyStatsForGlobe or a dedicated alert field if available
    const currentAlertConfig = React.useMemo(() => {
        // Assuming keyStatsForGlobe might contain an alert level, e.g., keyStatsForGlobe.pagerAlert
        // This part needs to align with what the /api/overview endpoint provides in keyStatsForGlobe
        const alertLevelFromStats = keyStatsForGlobe?.pagerAlert; // Example field
        if (alertLevelFromStats && ALERT_LEVELS[alertLevelFromStats.toUpperCase()]) {
            return ALERT_LEVELS[alertLevelFromStats.toUpperCase()];
        }
        // Fallback or if another source for alerts is preferred for this page
        // const { highestRecentAlert } = useEarthquakeDataState(); // This was how it was before, ensure this data point is still valid
        // if (highestRecentAlert && ALERT_LEVELS[highestRecentAlert.toUpperCase()]) {
        //     return ALERT_LEVELS[highestRecentAlert.toUpperCase()];
        // }
        return null;
    }, [keyStatsForGlobe /*, highestRecentAlert */]); // Add dependencies as needed

    const hasRecentTsunamiWarning = keyStatsForGlobe?.tsunami > 0; // Example, adapt to actual field from worker

    // Derive the primary "latest major quake" for display from recentSignificantQuakesForOverview
    const latestMajorQuakeForDisplay = React.useMemo(() => {
        return recentSignificantQuakesForOverview && recentSignificantQuakesForOverview.length > 0
            ? recentSignificantQuakesForOverview[0]
            : null;
    }, [recentSignificantQuakesForOverview]);

    // Determine if there's an error to display
    const displayError = error || overviewError;

    if (isLoadingInitialData && !keyStatsForGlobe) { // Show a loading state for the whole page if critical data isn't there
        return (
            <div className="p-3 md:p-4 h-full space-y-3 text-slate-200 lg:hidden text-center">
                <h2 className="text-lg font-semibold text-indigo-400 sticky top-0 bg-slate-900 py-2 z-10 -mx-3 px-3 sm:-mx-4 sm:px-4 border-b border-slate-700">
                    Overview
                </h2>
                <p className="animate-pulse">Loading overview data...</p>
            </div>
        );
    }
    
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
            <div className="p-3 md:p-4 h-full space-y-3 text-slate-200 lg:hidden"> {/* Ensure this class matches mobile-first design */}
                <h2 className="text-lg font-semibold text-indigo-400 sticky top-0 bg-slate-900 py-2 z-10 -mx-3 px-3 sm:-mx-4 sm:px-4 border-b border-slate-700">
                    Overview
                </h2>

                {displayError && (
                     <div className="bg-red-700 bg-opacity-40 border border-red-600 text-red-200 px-3 py-2 rounded-md text-xs" role="alert">
                        <strong className="font-bold">Error:</strong> {displayError}
                     </div>
                )}

                <AlertDisplay
                    currentAlertConfig={currentAlertConfig}
                    hasRecentTsunamiWarning={hasRecentTsunamiWarning} // Sourced from keyStatsForGlobe or similar
                    ALERT_LEVELS={ALERT_LEVELS} // Constant
                />

                <LatestEvent
                    lastMajorQuake={latestMajorQuakeForDisplay} // Use derived latest significant quake
                    getMagnitudeColor={getMagnitudeColor}
                    formatDate={formatDate}
                    handleQuakeClick={handleQuakeClick}
                />

                <ActivityList
                    latestFeelableQuakesSnippet={latestFeelableQuakesSnippet} // From context
                    getMagnitudeColor={getMagnitudeColor}
                    formatTimeAgo={formatTimeAgo}
                    handleQuakeClick={handleQuakeClick}
                    navigate={navigate}
                />

                <TimeSinceLastMajorQuakeBanner
                    // This component might need its internal logic updated to use recentSignificantQuakesForOverview
                    // For now, passing the single "latestMajorQuakeForDisplay"
                    lastMajorQuake={latestMajorQuakeForDisplay}
                    // timeBetweenPreviousMajorQuakes and previousMajorQuake might be derived inside the banner or passed if available from overview data
                    isLoadingInitial={isLoadingInitialData && !latestMajorQuakeForDisplay}
                    formatTimeDuration={formatTimeDuration}
                    getRegionForEarthquake={getRegionForEarthquake}
                    handleQuakeClick={handleQuakeClick}
                    getMagnitudeColor={getMagnitudeColor}
                />
                <SummaryStatisticsCard
                    title="Global Statistics (Last 24 Hours)"
                    stats={keyStatsForGlobe} // Pass keyStatsForGlobe directly, Card needs to adapt to its structure
                    isLoading={isLoadingInitialData && !keyStatsForGlobe}
                    // calculateStats prop removed
                />

                <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md mt-3">
                    <h3 className="text-md font-semibold mb-2 text-indigo-300">
                        Active Earthquake Clusters
                    </h3>
                    {isLoadingInitialData && !overviewClusters?.length ? (
                        <p className="text-xs text-slate-300 text-center py-2 animate-pulse">Loading clusters...</p>
                    ) : overviewClusters && overviewClusters.length > 0 ? (
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
                        <p className="text-xs text-slate-300 text-center py-2">
                            No significant active clusters detected currently.
                        </p>
                    )}
                </div>

                <ActiveRegionDisplay
                    topActiveRegionsOverview={topActiveRegionsOverview} // From context
                    REGIONS={APP_REGIONS} // Use imported APP_REGIONS
                    isLoadingDaily={isLoadingInitialData && !topActiveRegionsOverview?.length} // Simplified loading check
                    // earthquakesLast24Hours prop removed, not needed if topActiveRegionsOverview is directly used
                />

                <QuickFact navigate={navigate} />
            </div>
        </>
    );
};

export default OverviewPage;
