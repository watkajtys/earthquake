// src/components/sidebar/Details24hrPanel.jsx
import React, { Suspense } from 'react';
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

const ChartLoadingFallback = ({ message = "Loading data..." }) => (
    <div className="p-4 text-center text-slate-400">{message}</div>
);

const Details24hrPanel = () => {
    const navigate = useNavigate();
    const {
        earthquakesLast24Hours,
        prev24HourData, // For SummaryStatisticsCard trend
        isLoadingDaily, // Or isLoadingWeekly if 24hr data comes from weekly feed
        isLoadingWeekly,
    } = useEarthquakeDataState();

    const handleQuakeClick = (quake) => {
        if (quake?.properties?.detail || quake?.properties?.url) {
            navigate(`/quake/${encodeURIComponent(quake.properties.detail || quake.properties.url)}`);
        } else {
            console.warn("No detail URL for quake:", quake);
        }
    };

    const currentLoadingState = isLoadingDaily || (isLoadingWeekly && (!earthquakesLast24Hours || earthquakesLast24Hours.length === 0));

    if (currentLoadingState && (!earthquakesLast24Hours || earthquakesLast24Hours.length === 0)) {
        return <ChartLoadingFallback message="Loading last 24 hours data..." />;
    }

    if (!earthquakesLast24Hours) {
         return <div className="p-4 text-center text-slate-400">No data available for the last 24 hours.</div>;
    }

    return (
        <div className="space-y-3">
            <SummaryStatisticsCard
                title="Summary (Last 24 Hours)"
                currentPeriodData={earthquakesLast24Hours}
                previousPeriodData={prev24HourData}
                isLoading={currentLoadingState}
                calculateStats={calculateStatsUtil}
            />
            <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}>
                <PaginatedEarthquakeTable
                    title="Earthquakes (Last 24 Hours)"
                    earthquakes={earthquakesLast24Hours}
                    isLoading={currentLoadingState}
                    onQuakeClick={handleQuakeClick}
                    periodName="last 24 hours"
                    getMagnitudeColorStyle={getMagnitudeColorStyle}
                    formatTimeAgo={formatTimeAgo}
                    formatDate={formatDate}
                />
            </Suspense>
            <Suspense fallback={<ChartLoadingFallback message="Loading list..." />}>
                <RegionalDistributionList
                    earthquakes={earthquakesLast24Hours}
                    titleSuffix="(Last 24 Hours)"
                    isLoading={currentLoadingState}
                    // getRegionForEarthquake will be imported by RegionalDistributionList from utils
                />
            </Suspense>
            <Suspense fallback={<ChartLoadingFallback />}>
                <MagnitudeDepthScatterSVGChart
                    earthquakes={earthquakesLast24Hours}
                    titleSuffix="(Last 24 Hours)"
                    isLoading={currentLoadingState}
                    getMagnitudeColor={getMagnitudeColor}
                />
            </Suspense>
        </div>
    );
};

export default Details24hrPanel;
