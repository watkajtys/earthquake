// src/components/sidebar/Details1hrPanel.jsx
import React, { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEarthquakeDataState } from '../../context/EarthquakeDataContext';
import {
    getMagnitudeColor,
    getMagnitudeColorStyle,
    formatDate,
    formatTimeAgo,
    calculateStats as calculateStatsUtil
} from '../../utils/utils'; // Assuming getRegionForEarthquake is also in utils if needed by RegionalDistributionList directly
import SummaryStatisticsCard from '../SummaryStatisticsCard';
import SkeletonText from '../SkeletonText'; // If needed for inline loading states not covered by Suspense

const PaginatedEarthquakeTable = lazy(() => import('../PaginatedEarthquakeTable'));
const RegionalDistributionList = lazy(() => import('../RegionalDistributionList'));
const MagnitudeDepthScatterSVGChart = lazy(() => import('../MagnitudeDepthScatterSVGChart'));

const ChartLoadingFallback = ({ message = "Loading data..." }) => (
    <div className="p-4 text-center text-slate-400">{message}</div>
);

const Details1hrPanel = () => {
    const navigate = useNavigate();
    const {
        earthquakesLastHour,
        earthquakesPriorHour, // For SummaryStatisticsCard trend
        isLoadingDaily,
        // getRegionForEarthquake, // from context or utils for RegionalDistributionList
    } = useEarthquakeDataState();

    const handleQuakeClick = (quake) => {
        if (quake?.properties?.detail || quake?.properties?.url) {
            navigate(`/quake/${encodeURIComponent(quake.properties.detail || quake.properties.url)}`);
        } else {
            console.warn("No detail URL for quake:", quake);
        }
    };

    if (isLoadingDaily && (!earthquakesLastHour || earthquakesLastHour.length === 0)) {
        return <ChartLoadingFallback message="Loading last hour data..." />;
    }

    if (!earthquakesLastHour) {
        return <div className="p-4 text-center text-slate-400">No data available for the last hour.</div>;
    }

    return (
        <div className="space-y-3">
            <SummaryStatisticsCard
                title="Summary (Last Hour)"
                currentPeriodData={earthquakesLastHour}
                previousPeriodData={earthquakesPriorHour}
                isLoading={isLoadingDaily}
                calculateStats={calculateStatsUtil}
            />
            <Suspense fallback={<ChartLoadingFallback message="Loading table..." />}>
                <PaginatedEarthquakeTable
                    title="Earthquakes (Last Hour)"
                    earthquakes={earthquakesLastHour}
                    isLoading={isLoadingDaily}
                    onQuakeClick={handleQuakeClick}
                    itemsPerPage={10}
                    periodName="last hour"
                    getMagnitudeColorStyle={getMagnitudeColorStyle}
                    formatTimeAgo={formatTimeAgo}
                    formatDate={formatDate}
                />
            </Suspense>
            <Suspense fallback={<ChartLoadingFallback message="Loading list..." />}>
                <RegionalDistributionList
                    earthquakes={earthquakesLastHour}
                    titleSuffix="(Last Hour)"
                    isLoading={isLoadingDaily}
                    // getRegionForEarthquake will be imported by RegionalDistributionList from utils
                />
            </Suspense>
            <Suspense fallback={<ChartLoadingFallback />}>
                <MagnitudeDepthScatterSVGChart
                    earthquakes={earthquakesLastHour}
                    titleSuffix="(Last Hour)"
                    isLoading={isLoadingDaily}
                    getMagnitudeColor={getMagnitudeColor}
                />
            </Suspense>
        </div>
    );
};

export default Details1hrPanel;
