import React, { useMemo, memo } from 'react'; // Added useMemo, memo
import PropTypes from 'prop-types';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext'; // Import context
import { useUIState } from '../contexts/UIStateContext'; // Import context
import SeoMetadata from './SeoMetadata';
import SummaryStatisticsCard from './SummaryStatisticsCard';
import PaginatedEarthquakeTable from './PaginatedEarthquakeTable';
import FeedSelector from './FeedSelector';
import RangeFilter from './RangeFilter';
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
        loadMonthlyData // This is the actual function from context
    } = useEarthquakeDataState();

    const {
        activeFeedPeriod, setActiveFeedPeriod,
        magnitudeRange, setMagnitudeRange,
        depthRange, setDepthRange,
    } = useUIState();

    // Re-derive currentFeedData
    const currentFeedData = useMemo(() => {
        let filteredData;
        const baseDataForFilters = (contextHasAttemptedMonthlyLoad && contextAllEarthquakes.length > 0) ? contextAllEarthquakes : earthquakesLast7Days;

        switch (activeFeedPeriod) {
            case 'last_hour':
                filteredData = earthquakesLastHour;
                break;
            case 'last_24_hours':
                filteredData = earthquakesLast24Hours;
                break;
            case 'last_7_days':
                filteredData = earthquakesLast7Days;
                break;
            case 'last_14_days':
                filteredData = (contextHasAttemptedMonthlyLoad && contextAllEarthquakes.length > 0) ? earthquakesLast14Days : null;
                break;
            case 'last_30_days':
                filteredData = (contextHasAttemptedMonthlyLoad && contextAllEarthquakes.length > 0) ? earthquakesLast30Days : null;
                break;
            case 'feelable_quakes':
                filteredData = baseDataForFilters ? baseDataForFilters.filter(q => q.properties.mag !== null && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD) : [];
                break;
            case 'significant_quakes':
                filteredData = baseDataForFilters ? baseDataForFilters.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD) : [];
                break;
            default:
                filteredData = earthquakesLast24Hours;
        }

        if (filteredData) {
            return filteredData.filter(quake => {
                const mag = quake.properties.mag;
                const depth = quake.geometry.coordinates[2];
                return mag >= magnitudeRange[0] && mag <= magnitudeRange[1] &&
                       depth >= depthRange[0] && depth <= depthRange[1];
            });
        }

        return filteredData;
    }, [
        activeFeedPeriod, earthquakesLastHour, earthquakesLast24Hours, earthquakesLast7Days,
        earthquakesLast14Days, earthquakesLast30Days, contextAllEarthquakes,
        contextHasAttemptedMonthlyLoad, magnitudeRange, depthRange
    ]);

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
            <div className="p-3 md:p-4 min-h-0 flex-1 space-y-3 text-slate-200 lg:hidden overflow-y-auto">
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
                <RangeFilter
                    title="Magnitude"
                    min={0}
                    max={10}
                    value={magnitudeRange}
                    onChange={setMagnitudeRange}
                />
                <RangeFilter
                    title="Depth (km)"
                    min={0}
                    max={1000}
                    value={depthRange}
                    onChange={setDepthRange}
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
    handleQuakeClick: PropTypes.func.isRequired,
    getFeedPageSeoInfo: PropTypes.func.isRequired,
    calculateStats: PropTypes.func.isRequired,
    getMagnitudeColorStyle: PropTypes.func.isRequired,
    formatTimeAgo: PropTypes.func.isRequired,
    formatDate: PropTypes.func.isRequired,
};

export default memo(FeedsPageLayout);
