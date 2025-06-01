// src/components/sidebar/Details30dayPanel.jsx
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
import { FELT_REPORTS_THRESHOLD, SIGNIFICANCE_THRESHOLD } from '../../constants/appConstants';
import SummaryStatisticsCard from '../SummaryStatisticsCard';

const PaginatedEarthquakeTable = lazy(() => import('../PaginatedEarthquakeTable'));
const MagnitudeDistributionSVGChart = lazy(() => import('../MagnitudeDistributionSVGChart'));
const MagnitudeDepthScatterSVGChart = lazy(() => import('../MagnitudeDepthScatterSVGChart'));
const RegionalDistributionList = lazy(() => import('../RegionalDistributionList'));


const ChartLoadingFallback = ({ message = "Loading data..." }) => (
    <div className="p-4 text-center text-slate-400">{message}</div>
);

const Details30dayPanel = () => {
    const navigate = useNavigate();
    const {
        earthquakesLast30Days,
        allEarthquakes, // Source for various tables
        isLoadingMonthly,
        monthlyError,
        hasAttemptedMonthlyLoad,
    } = useEarthquakeDataState();

    const handleQuakeClick = (quake) => {
        if (quake?.properties?.detail || quake?.properties?.url) {
            navigate(`/quake/${encodeURIComponent(quake.properties.detail || quake.properties.url)}`);
        } else {
            console.warn("No detail URL for quake:", quake);
        }
    };

    if (isLoadingMonthly && (!allEarthquakes || allEarthquakes.length === 0)) {
        return <ChartLoadingFallback message="Loading 30-day data..." />;
    }

    if (hasAttemptedMonthlyLoad && monthlyError) {
        return <div className="p-4 text-center text-red-400">Error loading 30-day data: {monthlyError}</div>;
    }

    if (hasAttemptedMonthlyLoad && (!earthquakesLast30Days || earthquakesLast30Days.length === 0)) {
        return <div className="p-4 text-center text-slate-400">No 30-day earthquake data found or loaded.</div>;
    }

    if (!hasAttemptedMonthlyLoad) {
        return <div className="p-4 text-center text-slate-400">Load monthly data to view this panel.</div>;
    }

    return (
        <div className="space-y-3">
            <SummaryStatisticsCard
                title="Summary (Last 30 Days)"
                currentPeriodData={earthquakesLast30Days}
                isLoading={isLoadingMonthly}
                calculateStats={calculateStatsUtil}
            />
            <div className="grid grid-cols-1 gap-3">
                <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}>
                    <PaginatedEarthquakeTable
                        title="Top 10 Strongest (30d)"
                        earthquakes={allEarthquakes}
                        isLoading={isLoadingMonthly}
                        onQuakeClick={handleQuakeClick}
                        itemsPerPage={10}
                        defaultSortKey="mag"
                        initialSortDirection="descending"
                        getMagnitudeColorStyle={getMagnitudeColorStyle}
                        formatTimeAgo={formatTimeAgo}
                        formatDate={formatDate}
                    />
                </Suspense>
                <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}>
                    <PaginatedEarthquakeTable
                        title="Most Widely Felt (30d)"
                        earthquakes={allEarthquakes}
                        isLoading={isLoadingMonthly}
                        onQuakeClick={handleQuakeClick}
                        itemsPerPage={5}
                        defaultSortKey="felt"
                        initialSortDirection="descending"
                        filterPredicate={q => q.properties.felt !== null && typeof q.properties.felt === 'number' && q.properties.felt > FELT_REPORTS_THRESHOLD}
                        getMagnitudeColorStyle={getMagnitudeColorStyle}
                        formatTimeAgo={formatTimeAgo}
                        formatDate={formatDate}
                    />
                </Suspense>
                <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}>
                    <PaginatedEarthquakeTable
                        title="Most Significant (30d)"
                        earthquakes={allEarthquakes}
                        isLoading={isLoadingMonthly}
                        onQuakeClick={handleQuakeClick}
                        itemsPerPage={5}
                        defaultSortKey="sig"
                        initialSortDirection="descending"
                        filterPredicate={q => q.properties.sig !== null && typeof q.properties.sig === 'number' && q.properties.sig > SIGNIFICANCE_THRESHOLD}
                        getMagnitudeColorStyle={getMagnitudeColorStyle}
                        formatTimeAgo={formatTimeAgo}
                        formatDate={formatDate}
                    />
                </Suspense>
            </div>
            <Suspense fallback={<ChartLoadingFallback />}>
                <MagnitudeDistributionSVGChart
                    earthquakes={allEarthquakes}
                    titleSuffix="(Last 30 Days)"
                    isLoading={isLoadingMonthly}
                    getMagnitudeColor={getMagnitudeColor}
                />
            </Suspense>
            <Suspense fallback={<ChartLoadingFallback />}>
                <MagnitudeDepthScatterSVGChart
                    earthquakes={allEarthquakes}
                    titleSuffix="(Last 30 Days)"
                    isLoading={isLoadingMonthly}
                    getMagnitudeColor={getMagnitudeColor}
                />
            </Suspense>
            <Suspense fallback={<ChartLoadingFallback message="Loading list..." />}>
                <RegionalDistributionList
                    earthquakes={allEarthquakes}
                    titleSuffix="(Last 30 Days)"
                    isLoading={isLoadingMonthly}
                    // getRegionForEarthquake will be imported by RegionalDistributionList from utils
                />
            </Suspense>
            <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}>
                <PaginatedEarthquakeTable
                    title="All Earthquakes (Last 30 Days)"
                    earthquakes={allEarthquakes}
                    isLoading={isLoadingMonthly}
                    onQuakeClick={handleQuakeClick}
                    itemsPerPage={15}
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

export default Details30dayPanel;
