// src/components/sidebar/Details14dayPanel.jsx
import React, { Suspense, lazy } from 'react'; // Added lazy
import { useNavigate } from 'react-router-dom';
import { useEarthquakeDataState } from '../../context/EarthquakeDataContext';
import {
    getMagnitudeColor,
    getMagnitudeColorStyle,
    formatDate,
    formatTimeAgo,
    calculateStats as calculateStatsUtil
} from '../../utils/utils';
import SummaryStatisticsCard from '../SummaryStatisticsCard';

const PaginatedEarthquakeTable = lazy(() => import('../PaginatedEarthquakeTable'));
const EarthquakeTimelineSVGChart = lazy(() => import('../EarthquakeTimelineSVGChart'));
const MagnitudeDepthScatterSVGChart = lazy(() => import('../MagnitudeDepthScatterSVGChart'));

const ChartLoadingFallback = ({ message = "Loading data..." }) => (
    <div className="p-4 text-center text-slate-400">{message}</div>
);

const Details14dayPanel = () => {
    const navigate = useNavigate();
    const {
        earthquakesLast14Days,
        prev14DayDataForMonthly, // This was prev14DayData in context
        isLoadingMonthly,
        monthlyError, // To display error if monthly load failed
        allEarthquakes, // To check if any monthly data is present
        hasAttemptedMonthlyLoad, // Ensure we only show "no data" if load was attempted
    } = useEarthquakeDataState();

    const handleQuakeClick = (quake) => {
        if (quake?.properties?.detail || quake?.properties?.url) {
            navigate(`/quake/${encodeURIComponent(quake.properties.detail || quake.properties.url)}`);
        } else {
            console.warn("No detail URL for quake:", quake);
        }
    };

    if (isLoadingMonthly && (!allEarthquakes || allEarthquakes.length === 0)) {
        return <ChartLoadingFallback message="Loading 14-day data..." />;
    }

    if (hasAttemptedMonthlyLoad && monthlyError) {
        return <div className="p-4 text-center text-red-400">Error loading 14-day data: {monthlyError}</div>;
    }

    if (hasAttemptedMonthlyLoad && (!earthquakesLast14Days || earthquakesLast14Days.length === 0)) {
        return <div className="p-4 text-center text-slate-400">No 14-day earthquake data found or loaded.</div>;
    }

    // If load hasn't been attempted, this panel shouldn't be shown by DesktopSidebar logic,
    // but as a safeguard:
    if (!hasAttemptedMonthlyLoad) {
        return <div className="p-4 text-center text-slate-400">Load monthly data to view this panel.</div>;
    }


    return (
        <div className="space-y-3">
            <SummaryStatisticsCard
                title="Summary (Last 14 Days)"
                currentPeriodData={earthquakesLast14Days}
                previousPeriodData={prev14DayDataForMonthly}
                isLoading={isLoadingMonthly}
                calculateStats={calculateStatsUtil}
            />
            <Suspense fallback={<ChartLoadingFallback />}>
                <EarthquakeTimelineSVGChart
                    earthquakes={earthquakesLast14Days}
                    days={14}
                    titleSuffix="(Last 14 Days)"
                    isLoading={isLoadingMonthly}
                />
            </Suspense>
            <Suspense fallback={<ChartLoadingFallback />}>
                <MagnitudeDepthScatterSVGChart
                    earthquakes={earthquakesLast14Days}
                    titleSuffix="(Last 14 Days)"
                    isLoading={isLoadingMonthly}
                    getMagnitudeColor={getMagnitudeColor}
                />
            </Suspense>
            <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}>
                <PaginatedEarthquakeTable
                    title="All Earthquakes (Last 14 Days)"
                    earthquakes={earthquakesLast14Days}
                    isLoading={isLoadingMonthly}
                    onQuakeClick={handleQuakeClick}
                    itemsPerPage={10}
                    defaultSortKey="time"
                    initialSortDirection="descending"
                    getMagnitudeColorStyle={getMagnitudeColorStyle}
                    formatTimeAgo={formatTimeAgo}
                    formatDate={formatDate}
                />
            </Suspense>
        </div>
    );
};

export default Details14dayPanel;
