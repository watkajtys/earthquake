import React, { useMemo } from 'react'; // Added useMemo
import PropTypes from 'prop-types';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext'; // Import context
import { useUIState } from '../contexts/UIStateContext'; // Import context
import SeoMetadata from './SeoMetadata';
import SummaryStatisticsCard from './SummaryStatisticsCard';
import PaginatedEarthquakeTable from './PaginatedEarthquakeTable';
import FeedSelector from './FeedSelector';
import LoadMoreDataButton from './LoadMoreDataButton'; // Import the new component
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
    // currentFeedTitle, activeFeedPeriod, currentFeedData, currentFeedisLoading, // Will be derived or from context
    // previousDataForCurrentFeed, // Will be derived
    handleQuakeClick, 
    // setActiveFeedPeriod, // From context
    // handleLoadMonthlyData, hasAttemptedMonthlyLoad, isLoadingMonthly, allEarthquakes, // From context
    getFeedPageSeoInfo,
    calculateStats, // for SummaryStatisticsCard
    getMagnitudeColorStyle, formatTimeAgo, formatDate // for PaginatedEarthquakeTable
}) => {
    const {
        earthquakesLastHour, earthquakesPriorHour,
        earthquakesLast24Hours, prev24HourData,
        earthquakesLast7Days, prev7DayData, // Assuming prev7DayData is from monthly for 7-14 days comparison
        earthquakesLast14Days, prev14DayData, // Assuming prev14DayData is from monthly for 14-28 days comparison
        earthquakesLast30Days,
        allEarthquakes: contextAllEarthquakes, // Renamed to avoid conflict if allEarthquakes prop was kept
        isLoadingDaily, isLoadingWeekly,
        isLoadingMonthly: contextIsLoadingMonthly, // Renamed
        hasAttemptedMonthlyLoad: contextHasAttemptedMonthlyLoad, // Renamed
        loadMonthlyData // This is the actual function from context
    } = useEarthquakeDataState();

    const { activeFeedPeriod, setActiveFeedPeriod } = useUIState();

    // Re-derive currentFeedData
    const currentFeedData = useMemo(() => {
        const baseDataForFilters = (contextHasAttemptedMonthlyLoad && contextAllEarthquakes.length > 0) ? contextAllEarthquakes : earthquakesLast7Days;
        switch (activeFeedPeriod) {
            case 'last_hour': return earthquakesLastHour;
            case 'last_24_hours': return earthquakesLast24Hours;
            case 'last_7_days': return earthquakesLast7Days;
            case 'last_14_days': return (contextHasAttemptedMonthlyLoad && contextAllEarthquakes.length > 0) ? earthquakesLast14Days : null;
            case 'last_30_days': return (contextHasAttemptedMonthlyLoad && contextAllEarthquakes.length > 0) ? earthquakesLast30Days : null;
            case 'feelable_quakes': return baseDataForFilters ? baseDataForFilters.filter(q => q.properties.mag !== null && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD) : [];
            case 'significant_quakes': return baseDataForFilters ? baseDataForFilters.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD) : [];
            default: return earthquakesLast24Hours;
        }
    }, [activeFeedPeriod, earthquakesLastHour, earthquakesLast24Hours, earthquakesLast7Days,
        earthquakesLast14Days, earthquakesLast30Days, contextAllEarthquakes, contextHasAttemptedMonthlyLoad]);

    // Re-derive currentFeedTitle
    const currentFeedTitle = useMemo(() => {
        const filterPeriodSuffix = (contextHasAttemptedMonthlyLoad && contextAllEarthquakes.length > 0) ? "(Last 30 Days)" : "(Last 7 Days)";
        switch (activeFeedPeriod) {
            case 'last_hour': return "Earthquakes (Last Hour)";
            case 'last_24_hours': return "Earthquakes (Last 24 Hours)";
            case 'last_7_days': return "Earthquakes (Last 7 Days)";
            case 'last_14_days': return "Earthquakes (Last 14 Days)";
            case 'last_30_days': return "Earthquakes (Last 30 Days)";
            case 'feelable_quakes': return `Feelable Quakes (M${FEELABLE_QUAKE_THRESHOLD.toFixed(1)}+) ${filterPeriodSuffix}`;
            case 'significant_quakes': return `Significant Quakes (M${MAJOR_QUAKE_THRESHOLD.toFixed(1)}+) ${filterPeriodSuffix}`;
            default: return "Earthquakes (Last 24 Hours)";
        }
    }, [activeFeedPeriod, contextHasAttemptedMonthlyLoad, contextAllEarthquakes]);

    // Re-derive currentFeedisLoading
    const currentFeedisLoading = useMemo(() => {
        if (activeFeedPeriod === 'last_hour') return isLoadingDaily && (!earthquakesLastHour || earthquakesLastHour.length === 0);
        if (activeFeedPeriod === 'last_24_hours') return isLoadingDaily && (!earthquakesLast24Hours || earthquakesLast24Hours.length === 0);
        if (activeFeedPeriod === 'last_7_days') return isLoadingWeekly && (!earthquakesLast7Days || earthquakesLast7Days.length === 0);
        if (activeFeedPeriod === 'feelable_quakes' || activeFeedPeriod === 'significant_quakes') {
            if (contextHasAttemptedMonthlyLoad && contextAllEarthquakes.length > 0) return contextIsLoadingMonthly && contextAllEarthquakes.length === 0;
            return isLoadingWeekly && (!earthquakesLast7Days || earthquakesLast7Days.length === 0);
        }
        if ((activeFeedPeriod === 'last_14_days' || activeFeedPeriod === 'last_30_days')) {
            return contextIsLoadingMonthly && (!contextAllEarthquakes || contextAllEarthquakes.length === 0);
        }
        return currentFeedData === null; // Fallback based on derived currentFeedData
    }, [activeFeedPeriod, isLoadingDaily, isLoadingWeekly, contextIsLoadingMonthly,
        earthquakesLastHour, earthquakesLast24Hours, earthquakesLast7Days,
        contextAllEarthquakes, contextHasAttemptedMonthlyLoad, currentFeedData]);
        
    // Re-derive previousDataForCurrentFeed
    const previousDataForCurrentFeed = useMemo(() => {
        switch (activeFeedPeriod) {
            case 'last_hour': return earthquakesPriorHour;
            case 'last_24_hours': return prev24HourData;
            case 'last_7_days': return prev7DayData;
            case 'last_14_days': return prev14DayData;
            default: return null;
        }
    }, [activeFeedPeriod, earthquakesPriorHour, prev24HourData, prev7DayData, prev14DayData]);

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
                <FeedSelector
                    activeFeedPeriod={activeFeedPeriod}
                    setActiveFeedPeriod={setActiveFeedPeriod}
                    hasAttemptedMonthlyLoad={contextHasAttemptedMonthlyLoad}
                    allEarthquakes={contextAllEarthquakes}
                    FEELABLE_QUAKE_THRESHOLD={FEELABLE_QUAKE_THRESHOLD}
                    MAJOR_QUAKE_THRESHOLD={MAJOR_QUAKE_THRESHOLD}
                />
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
                <LoadMoreDataButton
                    hasAttemptedMonthlyLoad={contextHasAttemptedMonthlyLoad}
                    isLoadingMonthly={contextIsLoadingMonthly}
                    loadMonthlyData={loadMonthlyData}
                />
            </div>
        </>
    );
};

FeedsPageLayout.propTypes = {
    // currentFeedTitle: PropTypes.string.isRequired, // Derived
    // activeFeedPeriod: PropTypes.string.isRequired, // From context
    // currentFeedData: PropTypes.array, // Derived
    // currentFeedisLoading: PropTypes.bool, // Derived
    // previousDataForCurrentFeed: PropTypes.array, // Derived
    handleQuakeClick: PropTypes.func.isRequired,
    // setActiveFeedPeriod: PropTypes.func.isRequired, // From context
    // handleLoadMonthlyData: PropTypes.func.isRequired, // From context (loadMonthlyData)
    // hasAttemptedMonthlyLoad: PropTypes.bool, // From context
    // isLoadingMonthly: PropTypes.bool, // From context
    // allEarthquakes: PropTypes.array, // From context (contextAllEarthquakes)
    getFeedPageSeoInfo: PropTypes.func.isRequired,
    calculateStats: PropTypes.func.isRequired,
    getMagnitudeColorStyle: PropTypes.func.isRequired,
    formatTimeAgo: PropTypes.func.isRequired,
    formatDate: PropTypes.func.isRequired,
};

export default FeedsPageLayout;
