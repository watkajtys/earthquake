import React, { useEffect, useMemo, memo } from 'react';
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
 * Provides the layout structure for the earthquake feeds page.
 * This component is memoized using `React.memo` for performance.
 * It orchestrates the display of various feed-related views, including:
 * - SEO metadata using `SeoMetadata`.
 * - A `FeedSelector` to switch between different time periods or filters.
 * - `SummaryStatisticsCard` to show aggregated data for the selected feed.
 * - `PaginatedEarthquakeTable` to list earthquakes in the selected feed.
 * - `LoadMoreDataButton` to enable fetching extended (e.g., monthly) data.
 *
 * Most of the data (like current feed data, titles, loading states) is derived internally
 * using `useMemo` based on state from `EarthquakeDataContext` (e.g., `earthquakesLastHour`, `allEarthquakes`)
 * and `UIStateContext` (e.g., `activeFeedPeriod`).
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {function} props.handleQuakeClick - Callback function passed to `PaginatedEarthquakeTable` for when an earthquake row is clicked.
 * @param {function} props.getFeedPageSeoInfo - Function that returns SEO information (title, description, keywords)
 *   based on the current feed title and active period.
 * @param {function} props.calculateStats - Function passed to `SummaryStatisticsCard` to compute statistics from earthquake data.
 * @param {function} props.getMagnitudeColorStyle - Function passed to `PaginatedEarthquakeTable` to get CSS classes for magnitude coloring.
 * @param {function} props.formatTimeAgo - Function passed to `PaginatedEarthquakeTable` to format timestamps into "time ago" strings.
 * @param {function} props.formatDate - Function passed to `PaginatedEarthquakeTable` to format timestamps into full date strings.
 * @returns {JSX.Element} The FeedsPageLayout component.
 */
const FeedsPageLayout = ({
    handleQuakeClick,
    getFeedPageSeoInfo,
    calculateStats,
    getMagnitudeColorStyle, formatTimeAgo, formatDate
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
        monthlyHasLoaded: contextMonthlyHasLoaded,
        monthlyError, dailyError, weeklyError, refreshData,
        loadMonthlyData // This is the actual function from context
    } = useEarthquakeDataState();

    const { activeFeedPeriod, setActiveFeedPeriod } = useUIState();
    const monthlyAvailable = contextMonthlyHasLoaded ?? (contextHasAttemptedMonthlyLoad && contextAllEarthquakes.length > 0);
    const isExtendedPeriod = activeFeedPeriod === 'last_14_days' || activeFeedPeriod === 'last_30_days';
    const isFilteredPeriod = activeFeedPeriod === 'feelable_quakes' || activeFeedPeriod === 'significant_quakes';
    const usesMonthlyData = isExtendedPeriod || (isFilteredPeriod && monthlyAvailable);
    const feedError = usesMonthlyData ? monthlyError : activeFeedPeriod === 'last_hour' || activeFeedPeriod === 'last_24_hours' ? dailyError : weeklyError;
    const monthlyUnavailable = isExtendedPeriod && !monthlyAvailable && Boolean(monthlyError);
    useEffect(() => {
        if (isExtendedPeriod && !monthlyAvailable && !contextHasAttemptedMonthlyLoad && !contextIsLoadingMonthly && !monthlyError) loadMonthlyData();
    }, [isExtendedPeriod, monthlyAvailable, contextHasAttemptedMonthlyLoad, contextIsLoadingMonthly, monthlyError, loadMonthlyData]);

    // Re-derive currentFeedData
    const currentFeedData = useMemo(() => {
        const baseDataForFilters = monthlyAvailable ? contextAllEarthquakes : earthquakesLast7Days;
        switch (activeFeedPeriod) {
            case 'last_hour': return earthquakesLastHour;
            case 'last_24_hours': return earthquakesLast24Hours;
            case 'last_7_days': return earthquakesLast7Days;
            case 'last_14_days': return monthlyAvailable ? earthquakesLast14Days : null;
            case 'last_30_days': return monthlyAvailable ? earthquakesLast30Days : null;
            case 'feelable_quakes': return baseDataForFilters ? baseDataForFilters.filter(q => q.properties.mag !== null && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD) : [];
            case 'significant_quakes': return baseDataForFilters ? baseDataForFilters.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD) : [];
            default: return earthquakesLast24Hours;
        }
    }, [activeFeedPeriod, earthquakesLastHour, earthquakesLast24Hours, earthquakesLast7Days,
        earthquakesLast14Days, earthquakesLast30Days, contextAllEarthquakes, monthlyAvailable]);

    // Re-derive currentFeedTitle
    const currentFeedTitle = useMemo(() => {
        const filterPeriodSuffix = monthlyAvailable ? "(Last 30 Days)" : "(Last 7 Days)";
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
    }, [activeFeedPeriod, monthlyAvailable]);

    // Re-derive currentFeedisLoading
    const currentFeedisLoading = useMemo(() => {
        if (activeFeedPeriod === 'last_hour') return isLoadingDaily && (!earthquakesLastHour || earthquakesLastHour.length === 0);
        if (activeFeedPeriod === 'last_24_hours') return isLoadingDaily && (!earthquakesLast24Hours || earthquakesLast24Hours.length === 0);
        if (activeFeedPeriod === 'last_7_days') return isLoadingWeekly && (!earthquakesLast7Days || earthquakesLast7Days.length === 0);
        if (activeFeedPeriod === 'feelable_quakes' || activeFeedPeriod === 'significant_quakes') {
            if (monthlyAvailable) return false;
            return isLoadingWeekly && (!earthquakesLast7Days || earthquakesLast7Days.length === 0);
        }
        if ((activeFeedPeriod === 'last_14_days' || activeFeedPeriod === 'last_30_days')) {
            return !monthlyAvailable && !monthlyError;
        }
        return currentFeedData === null; // Fallback based on derived currentFeedData
    }, [activeFeedPeriod, isLoadingDaily, isLoadingWeekly,
        earthquakesLastHour, earthquakesLast24Hours, earthquakesLast7Days,
        monthlyAvailable, monthlyError, currentFeedData]);
        
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
            <div className="p-3 md:p-4 min-h-0 flex-1 w-full max-w-6xl mx-auto space-y-3 text-slate-200 overflow-y-auto">
                <h2 className="text-lg font-semibold text-indigo-400 sticky top-0 bg-slate-900 py-2 z-10 -mx-3 px-3 sm:-mx-4 sm:px-4 border-b border-slate-700">
                    Feeds & Details
                </h2>
                <FeedSelector
                    activeFeedPeriod={activeFeedPeriod}
                    setActiveFeedPeriod={setActiveFeedPeriod}
                    hasAttemptedMonthlyLoad={contextHasAttemptedMonthlyLoad}
                    monthlyHasLoaded={monthlyAvailable}
                    allEarthquakes={contextAllEarthquakes}
                    FEELABLE_QUAKE_THRESHOLD={FEELABLE_QUAKE_THRESHOLD}
                    MAJOR_QUAKE_THRESHOLD={MAJOR_QUAKE_THRESHOLD}
                />
                {feedError && <div role="alert" className="rounded border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200">
                    <p>Could not refresh this feed. Previously loaded data, when available, is still shown.</p>
                    <button type="button" onClick={usesMonthlyData ? loadMonthlyData : refreshData} className="mt-2 rounded bg-slate-700 px-3 py-2 text-white">Retry feed</button>
                </div>}
                {monthlyUnavailable ? <p className="rounded bg-slate-800 p-4 text-slate-300">This period is unavailable until the monthly feed loads successfully.</p> : <>
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
                    paginationKey={activeFeedPeriod}
                    getMagnitudeColorStyle={getMagnitudeColorStyle}
                    formatTimeAgo={formatTimeAgo}
                    formatDate={formatDate}
                />
                </>}
                <LoadMoreDataButton
                    hasAttemptedMonthlyLoad={contextHasAttemptedMonthlyLoad}
                    monthlyHasLoaded={monthlyAvailable}
                    monthlyError={monthlyError}
                    isLoadingMonthly={contextIsLoadingMonthly}
                    loadMonthlyData={loadMonthlyData}
                />
            </div>
        </>
    );
};

FeedsPageLayout.propTypes = {
    handleQuakeClick: PropTypes.func.isRequired,
    getFeedPageSeoInfo: PropTypes.func.isRequired,
    calculateStats: PropTypes.func.isRequired,
    getMagnitudeColorStyle: PropTypes.func.isRequired,
    formatTimeAgo: PropTypes.func.isRequired,
    formatDate: PropTypes.func.isRequired,
};

export default memo(FeedsPageLayout);
