// src/components/sidebar/Details7dayPanel.jsx
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
const RegionalDistributionList = lazy(() => import('../RegionalDistributionList'));
const MagnitudeDepthScatterSVGChart = lazy(() => import('../MagnitudeDepthScatterSVGChart'));
const EarthquakeTimelineSVGChart = lazy(() => import('../EarthquakeTimelineSVGChart'));

const ChartLoadingFallback = ({ message = "Loading data..." }) => (
    <div className="p-4 text-center text-slate-400">{message}</div>
);

const Details7dayPanel = () => {
    const navigate = useNavigate();
    const {
        earthquakesLast7Days,
        prev7DayDataForMonthly, // This was named prev7DayData in context, for comparing 7d with 7-14d
        isLoadingWeekly,
        isLoadingMonthly, // Potentially relevant if prev7DayDataForMonthly relies on monthly load
        hasAttemptedMonthlyLoad,
    } = useEarthquakeDataState();

    const handleQuakeClick = (quake) => {
        if (quake?.properties?.detail || quake?.properties?.url) {
            navigate(`/quake/${encodeURIComponent(quake.properties.detail || quake.properties.url)}`);
        } else {
            console.warn("No detail URL for quake:", quake);
        }
    };

    const currentLoadingState = isLoadingWeekly && (!earthquakesLast7Days || earthquakesLast7Days.length === 0);

    if (currentLoadingState) {
        return <ChartLoadingFallback message="Loading last 7 days data..." />;
    }

    if (!earthquakesLast7Days) {
        return <div className="p-4 text-center text-slate-400">No data available for the last 7 days.</div>;
    }

    return (
        <div className="space-y-3">
            <SummaryStatisticsCard
                title="Summary (Last 7 Days)"
                currentPeriodData={earthquakesLast7Days}
                previousPeriodData={prev7DayDataForMonthly}
                isLoading={isLoadingWeekly || (hasAttemptedMonthlyLoad && isLoadingMonthly && !prev7DayDataForMonthly)}
                calculateStats={calculateStatsUtil}
            />
            <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}>
                <PaginatedEarthquakeTable
                    title="Earthquakes (Last 7 Days)"
                    earthquakes={earthquakesLast7Days}
                    isLoading={isLoadingWeekly}
                    onQuakeClick={handleQuakeClick}
                    periodName="last 7 days"
                    getMagnitudeColorStyle={getMagnitudeColorStyle}
                    formatTimeAgo={formatTimeAgo}
                    formatDate={formatDate}
                />
            </Suspense>
            <Suspense fallback={<ChartLoadingFallback message="Loading list..." />}>
                <RegionalDistributionList
                    earthquakes={earthquakesLast7Days}
                    titleSuffix="(Last 7 Days)"
                    isLoading={isLoadingWeekly}
                    // getRegionForEarthquake will be imported by RegionalDistributionList from utils
                />
            </Suspense>
            <Suspense fallback={<ChartLoadingFallback />}>
                <EarthquakeTimelineSVGChart
                    earthquakes={earthquakesLast7Days}
                    days={7}
                    titleSuffix="(Last 7 Days)"
                    isLoading={isLoadingWeekly}
                />
            </Suspense>
            <Suspense fallback={<ChartLoadingFallback />}>
                <MagnitudeDepthScatterSVGChart
                    earthquakes={earthquakesLast7Days}
                    titleSuffix="(Last 7 Days)"
                    isLoading={isLoadingWeekly}
                    getMagnitudeColor={getMagnitudeColor}
                />
            </Suspense>
        </div>
    );
};

export default Details7dayPanel;
