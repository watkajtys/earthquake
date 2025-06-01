import React from 'react';
import PropTypes from 'prop-types';
import SeoMetadata from './SeoMetadata';
import SummaryStatisticsCard from './SummaryStatisticsCard';
import PaginatedEarthquakeTable from './PaginatedEarthquakeTable';
import { FEELABLE_QUAKE_THRESHOLD, MAJOR_QUAKE_THRESHOLD } from '../constants/appConstants';

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
 * @param {function} props.calculateStats - Function to calculate stats (needed by SummaryStatisticsCard).
 * @param {function} props.getMagnitudeColorStyle - Function for PaginatedEarthquakeTable.
 * @param {function} props.formatTimeAgo - Function for PaginatedEarthquakeTable.
 * @param {function} props.formatDate - Function for PaginatedEarthquakeTable.
 * @returns {JSX.Element} The rendered FeedsPageLayout component.
 */
const FeedsPageLayout = ({
    currentFeedTitle, activeFeedPeriod, currentFeedData, currentFeedisLoading,
    previousDataForCurrentFeed, handleQuakeClick, setActiveFeedPeriod,
    handleLoadMonthlyData, hasAttemptedMonthlyLoad, isLoadingMonthly, allEarthquakes,
    getFeedPageSeoInfo,
    calculateStats, // for SummaryStatisticsCard
    getMagnitudeColorStyle, formatTimeAgo, formatDate // for PaginatedEarthquakeTable
}) => {
    const seoInfo = getFeedPageSeoInfo(currentFeedTitle, activeFeedPeriod);

    return (
        <>
            <SeoMetadata
                title={seoInfo.title}
                description={seoInfo.description}
                keywords={seoInfo.keywords}
                imageUrl="/vite.svg"
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
                    {(hasAttemptedMonthlyLoad && allEarthquakes && allEarthquakes.length > 0) && (
                        <React.Fragment key="monthly-feed-buttons">
                            <button onClick={() => setActiveFeedPeriod('last_14_days')} className={`text-xs px-3 py-1.5 rounded whitespace-nowrap ${activeFeedPeriod === 'last_14_days' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500'}`}>14-Day</button>
                            <button onClick={() => setActiveFeedPeriod('last_30_days')} className={`text-xs px-3 py-1.5 rounded whitespace-nowrap ${activeFeedPeriod === 'last_30_days' ? 'bg-indigo-500 text-white' : 'bg-slate-600 hover:bg-slate-500'}`}>30-Day</button>
                        </React.Fragment>
                    )}
                </div>
                <SummaryStatisticsCard
                    title={`Statistics for ${currentFeedTitle.replace("Earthquakes ", "").replace("Quakes ", "")}`}
                    currentPeriodData={currentFeedData || []}
                    previousPeriodData={(activeFeedPeriod !== 'feelable_quakes' && activeFeedPeriod !== 'significant_quakes') ? previousDataForCurrentFeed : null}
                    isLoading={currentFeedisLoading}
                    calculateStats={calculateStats}
                    // FEELABLE_QUAKE_THRESHOLD is now imported by SummaryStatisticsCard
                />
                <PaginatedEarthquakeTable
                    title={currentFeedTitle}
                    earthquakes={currentFeedData || []}
                    isLoading={currentFeedisLoading}
                    onQuakeClick={handleQuakeClick}
                    itemsPerPage={15}
                    periodName={activeFeedPeriod.replace(/_/g, ' ')}
                    getMagnitudeColorStyle={getMagnitudeColorStyle}
                    formatTimeAgo={formatTimeAgo}
                    formatDate={formatDate}
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

FeedsPageLayout.propTypes = {
    currentFeedTitle: PropTypes.string.isRequired,
    activeFeedPeriod: PropTypes.string.isRequired,
    currentFeedData: PropTypes.array,
    currentFeedisLoading: PropTypes.bool,
    previousDataForCurrentFeed: PropTypes.array,
    handleQuakeClick: PropTypes.func.isRequired,
    setActiveFeedPeriod: PropTypes.func.isRequired,
    handleLoadMonthlyData: PropTypes.func.isRequired,
    hasAttemptedMonthlyLoad: PropTypes.bool,
    isLoadingMonthly: PropTypes.bool,
    allEarthquakes: PropTypes.array,
    getFeedPageSeoInfo: PropTypes.func.isRequired,
    // FEELABLE_QUAKE_THRESHOLD and MAJOR_QUAKE_THRESHOLD are now imported
    calculateStats: PropTypes.func.isRequired,
    getMagnitudeColorStyle: PropTypes.func.isRequired,
    formatTimeAgo: PropTypes.func.isRequired,
    formatDate: PropTypes.func.isRequired,
};

export default FeedsPageLayout;
