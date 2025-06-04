import React, { useMemo, memo } from 'react';
import PropTypes from 'prop-types';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext';
// useUIState removed as activeFeedPeriod and its setter now come from EarthquakeDataContext
import SeoMetadata from './SeoMetadata';
import SummaryStatisticsCard from './SummaryStatisticsCard';
import PaginatedEarthquakeTable from './PaginatedEarthquakeTable';
import FeedSelector from './FeedSelector';
import LoadMoreDataButton from './LoadMoreDataButton';
import { FEELABLE_QUAKE_THRESHOLD, MAJOR_QUAKE_THRESHOLD } from '../constants/appConstants';

// Props calculateStats removed as SummaryStatisticsCard will use currentStatistics from context
const FeedsPageLayout = ({
    handleQuakeClick, 
    getFeedPageSeoInfo,
    // calculateStats, // No longer needed, SummaryStatisticsCard uses context's currentStatistics
    getMagnitudeColorStyle, formatTimeAgo, formatDate // for PaginatedEarthquakeTable
}) => {
    const {
        currentEarthquakes, // Directly use this for the table
        currentStatistics,  // Directly use this for SummaryStatisticsCard
        isLoading,          // General loading state for the current feed
        feedError,          // Error specific to the current feed
        currentFeedPeriod,  // The active feed period string
        setCurrentFeedPeriod, // Function to change the active feed
        // The following are for the LoadMoreDataButton, if its logic is to specifically load 'last_30_days'
        // and to know the state of that specific feed.
        feeds, // To check if 'last_30_days' is loaded
    } = useEarthquakeDataState();

    // currentFeedData is now currentEarthquakes from context.
    // currentFeedisLoading is now isLoading (general loading for current feed) from context.
    // previousDataForCurrentFeed is not directly available from worker, SummaryStatisticsCard might need to adapt or this feature simplified.

    // Derive currentFeedTitle internally based on currentFeedPeriod
    const currentFeedTitle = useMemo(() => {
        // Check if the 30-day feed is available to adjust suffix for feelable/significant
        const isMonthlyDataAvailable = feeds['last_30_days'] && feeds['last_30_days'].earthquakes.length > 0;
        const filterPeriodSuffix = isMonthlyDataAvailable ? "(Last 30 Days)" : "(Last 7 Days)";

        switch (currentFeedPeriod) {
            case 'last_hour': return "Earthquakes (Last Hour)";
            case 'last_24_hours': return "Earthquakes (Last 24 Hours)";
            case 'last_7_days': return "Earthquakes (Last 7 Days)";
            case 'last_14_days': return "Earthquakes (Last 14 Days)";
            case 'last_30_days': return "Earthquakes (Last 30 Days)";
            // Updated period names to match worker
            case 'feelable_quakes_7_days': return `Feelable Quakes (M${FEELABLE_QUAKE_THRESHOLD.toFixed(1)}+) (Last 7 Days)`;
            case 'significant_quakes_7_days': return `Significant Quakes (M${MAJOR_QUAKE_THRESHOLD.toFixed(1)}+) (Last 7 Days)`;
            case 'feelable_quakes_30_days': return `Feelable Quakes (M${FEELABLE_QUAKE_THRESHOLD.toFixed(1)}+) (Last 30 Days)`;
            case 'significant_quakes_30_days': return `Significant Quakes (M${MAJOR_QUAKE_THRESHOLD.toFixed(1)}+) (Last 30 Days)`;
            // Default for older generic feelable/significant if they were still somehow selected
            case 'feelable_quakes': return `Feelable Quakes (M${FEELABLE_QUAKE_THRESHOLD.toFixed(1)}+) ${filterPeriodSuffix}`;
            case 'significant_quakes': return `Significant Quakes (M${MAJOR_QUAKE_THRESHOLD.toFixed(1)}+) ${filterPeriodSuffix}`;
            default: return "Earthquakes";
        }
    }, [currentFeedPeriod, feeds]);

    const seoInfo = getFeedPageSeoInfo(currentFeedTitle, currentFeedPeriod);

    //isLoadingMonthly for LoadMoreDataButton: true if currentFeedPeriod is not 30 days AND 30 day data is currently loading
    //hasAttemptedMonthlyLoad: true if 'last_30_days' data exists in feeds state
    const isLoadingMonthlyForButton = isLoading && currentFeedPeriod === 'last_30_days' && (!feeds['last_30_days'] || feeds['last_30_days'].earthquakes.length === 0);
    const hasLoadedMonthlyFeed = feeds['last_30_days'] && feeds['last_30_days'].earthquakes.length > 0;


    return (
        <>
            <SeoMetadata
                title={seoInfo.title}
                description={seoInfo.description}
                keywords={seoInfo.keywords}
                imageUrl="/vite.svg" // Consider making this dynamic or more specific
                type="website"
            />
            <div className="p-3 md:p-4 h-full space-y-3 text-slate-200 lg:hidden"> {/* Ensure this class matches mobile-first design */}
                <h2 className="text-lg font-semibold text-indigo-400 sticky top-0 bg-slate-900 py-2 z-10 -mx-3 px-3 sm:-mx-4 sm:px-4 border-b border-slate-700">
                    Feeds & Details
                </h2>
                <FeedSelector
                    activeFeedPeriod={currentFeedPeriod} // From EarthquakeDataContext
                    setActiveFeedPeriod={setCurrentFeedPeriod} // From EarthquakeDataContext
                    // hasAttemptedMonthlyLoad and allEarthquakes not directly needed by selector if it just lists periods
                    FEELABLE_QUAKE_THRESHOLD={FEELABLE_QUAKE_THRESHOLD}
                    MAJOR_QUAKE_THRESHOLD={MAJOR_QUAKE_THRESHOLD}
                />
                {feedError && (
                     <div className="bg-red-700 bg-opacity-40 border border-red-600 text-red-200 px-3 py-2 rounded-md text-xs" role="alert">
                        <strong className="font-bold">Feed Error:</strong> {feedError}
                     </div>
                )}
                <SummaryStatisticsCard
                    title={`Statistics for ${currentFeedTitle.replace("Earthquakes ", "").replace("Quakes ", "")}`}
                    stats={currentStatistics} // Directly pass stats object from worker
                    // previousPeriodData not available from worker, this trend feature might be removed or simplified
                    isLoading={isLoading && !currentStatistics} // Loading if general feed loading and no stats yet
                    // calculateStats prop removed
                />
                <PaginatedEarthquakeTable
                    title={currentFeedTitle}
                    earthquakes={currentEarthquakes || []} // earthquakes from context
                    isLoading={isLoading && !currentEarthquakes?.length} // Loading if general feed loading and no quakes yet
                    onQuakeClick={handleQuakeClick}
                    itemsPerPage={15}
                    periodName={currentFeedPeriod.replace(/_/g, ' ')}
                    getMagnitudeColorStyle={getMagnitudeColorStyle}
                    formatTimeAgo={formatTimeAgo}
                    formatDate={formatDate}
                />
                {/* LoadMoreDataButton's role might change to "View 30-day data" */}
                {currentFeedPeriod !== 'last_30_days' && !hasLoadedMonthlyFeed && (
                    <LoadMoreDataButton
                        hasAttemptedMonthlyLoad={hasLoadedMonthlyFeed} // True if 30-day data is already loaded
                        isLoadingMonthly={isLoadingMonthlyForButton} // True if loading 30-day specifically and it's not yet present
                        loadMonthlyData={() => setCurrentFeedPeriod('last_30_days')} // Action changes to select 30-day feed
                        buttonTextOverride={hasLoadedMonthlyFeed ? "View 30-Day Data" : (isLoadingMonthlyForButton ? "Loading 30-Day Data..." : "Load 30-Day Data")}
                    />
                )}
            </div>
        </>
    );
};

FeedsPageLayout.propTypes = {
    handleQuakeClick: PropTypes.func.isRequired,
    getFeedPageSeoInfo: PropTypes.func.isRequired,
    // calculateStats: PropTypes.func.isRequired, // Removed
    getMagnitudeColorStyle: PropTypes.func.isRequired,
    formatTimeAgo: PropTypes.func.isRequired,
    formatDate: PropTypes.func.isRequired,
};

export default memo(FeedsPageLayout);
