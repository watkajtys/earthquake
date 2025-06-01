// src/components/sidebar/OverviewPanel.jsx
import React, { Suspense, lazy } from 'react'; // Added lazy
import { useNavigate } from 'react-router-dom';
import { useEarthquakeDataState } from '../../context/EarthquakeDataContext';
import {
    getMagnitudeColor,
    getMagnitudeColorStyle,
    formatDate,
    formatTimeAgo,
    formatTimeDuration,
    getRegionForEarthquake as getRegionForEarthquakeUtil, // Aliased to avoid conflict
    calculateStats as calculateStatsUtil
} from '../../utils/utils';
import { ALERT_LEVELS, MAJOR_QUAKE_THRESHOLD, REGIONS as AppRegions } from '../../constants/appConstants';

import TimeSinceLastMajorQuakeBanner from '../TimeSinceLastMajorQuakeBanner';
import SummaryStatisticsCard from '../SummaryStatisticsCard';
import InfoSnippet from '../InfoSnippet';
import ClusterSummaryItem from '../ClusterSummaryItem';
import SkeletonText from '../SkeletonText';
import SkeletonListItem from '../SkeletonListItem';

// Lazy load heavy components if they are specific to this panel
const PaginatedEarthquakeTable = lazy(() => import('../PaginatedEarthquakeTable'));

const ChartLoadingFallback = ({ message = "Loading data..." }) => (
    <div className="p-4 text-center text-slate-400">{message}</div>
);

const OverviewPanel = () => {
    const navigate = useNavigate();
    const {
        currentAlertConfig,
        hasRecentTsunamiWarning,
        lastMajorQuake,
        previousMajorQuake,
        timeBetweenPreviousMajorQuakes,
        isLoadingInitialData,
        isLoadingMonthly,
        hasAttemptedMonthlyLoad,
        earthquakesLast24Hours,
        prev24HourData,
        isLoadingDaily,
        isLoadingWeekly,
        overviewClusters,
        topActiveRegionsOverview,
        activeAlertTriggeringQuakes,
        earthquakesLast7Days, // For recent significant quakes
        // Callbacks for click, assuming they are passed if needed or defined if simple enough
        // For now, using navigate directly or placeholder for complex interactions
    } = useEarthquakeDataState();

    // Event handlers - these might be passed from DesktopSidebar or HomePage if they involve complex state there
    // Or defined here if they are simple navigation.
    const handleQuakeClick = (quake) => {
        if (quake?.properties?.detail || quake?.properties?.url) {
            navigate(`/quake/${encodeURIComponent(quake.properties.detail || quake.properties.url)}`);
        } else {
            console.warn("No detail URL for quake:", quake);
        }
    };

    const handleClusterSummaryClick = (cluster) => {
        navigate(`/cluster/${cluster.id}`);
    };

    const recentSignificantQuakesForOverview = React.useMemo(() => {
        if (!earthquakesLast7Days) return [];
        return earthquakesLast7Days
            .filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD)
            .sort((a, b) => b.properties.time - a.properties.time);
    }, [earthquakesLast7Days]);


    return (
        <>
            {currentAlertConfig && ALERT_LEVELS[currentAlertConfig.text?.toUpperCase()] && (
                <div
                    className={`border-l-4 p-2.5 rounded-r-md shadow-md text-xs ${ALERT_LEVELS[currentAlertConfig.text.toUpperCase()]?.detailsColorClass || ALERT_LEVELS[currentAlertConfig.text.toUpperCase()]?.colorClass} `}
                    role="region"
                    aria-live="polite"
                    aria-labelledby="usgs-alert-title"
                >
                    <p id="usgs-alert-title" className="font-bold text-sm">Active USGS Alert: {currentAlertConfig.text}</p>
                    <p>{ALERT_LEVELS[currentAlertConfig.text.toUpperCase()]?.description}</p>
                    {activeAlertTriggeringQuakes.length > 0 && (
                        <Suspense fallback={<ChartLoadingFallback message="Loading alert quakes table..." />}>
                            <PaginatedEarthquakeTable
                                title={`Alert Triggering Quakes (${currentAlertConfig.text})`}
                                earthquakes={activeAlertTriggeringQuakes}
                                isLoading={false}
                                onQuakeClick={handleQuakeClick}
                                itemsPerPage={3}
                                periodName="alerting"
                                getMagnitudeColorStyle={getMagnitudeColorStyle}
                                formatTimeAgo={formatTimeAgo}
                                formatDate={formatDate}
                                // SkeletonText and SkeletonTableRow are imported by PaginatedEarthquakeTable itself if needed
                            />
                        </Suspense>
                    )}
                </div>
            )}
            {hasRecentTsunamiWarning && !currentAlertConfig && (
                <div
                    className="bg-sky-700 bg-opacity-40 border-l-4 border-sky-500 text-sky-200 p-2.5 rounded-md shadow-md text-xs"
                    role="region"
                    aria-live="polite"
                    aria-labelledby="tsunami-warning-title"
                >
                    <p id="tsunami-warning-title" className="font-bold">Tsunami Info</p>
                    <p>Recent quakes indicate potential tsunami activity. Check official channels.</p>
                </div>
            )}
            <TimeSinceLastMajorQuakeBanner
                lastMajorQuake={lastMajorQuake}
                previousMajorQuake={previousMajorQuake}
                timeBetweenPreviousMajorQuakes={timeBetweenPreviousMajorQuakes}
                isLoadingInitial={isLoadingInitialData}
                isLoadingMonthly={isLoadingMonthly && hasAttemptedMonthlyLoad}
                formatTimeDuration={formatTimeDuration}
                getRegionForEarthquake={getRegionForEarthquakeUtil}
                handleQuakeClick={handleQuakeClick}
                getMagnitudeColor={getMagnitudeColor}
            />
            <SummaryStatisticsCard
                title="Overview (Last 24 Hours)"
                currentPeriodData={earthquakesLast24Hours}
                previousPeriodData={prev24HourData}
                isLoading={isLoadingDaily || (isLoadingWeekly && (!earthquakesLast24Hours || earthquakesLast24Hours.length === 0))}
                calculateStats={calculateStatsUtil}
            />
            <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md text-sm">
                <h3 className="text-md font-semibold mb-1 text-indigo-400">Most Active Region (Last 24h)</h3>
                {(isLoadingDaily && (!earthquakesLast24Hours || earthquakesLast24Hours.length === 0)) ? (
                    <SkeletonText width="w-full" height="h-5" className="bg-slate-600"/>
                ) : (
                    topActiveRegionsOverview && topActiveRegionsOverview.length > 0 ? (
                        topActiveRegionsOverview.map((region, index) => {
                             const regionDetails = AppRegions.find(r => r.name === region.name);
                             const regionColor = regionDetails?.color || '#9CA3AF';
                            return (
                            <p key={region.name} className={`text-slate-300 ${index > 0 ? 'mt-0.5' : ''}`}>
                                    <span className="font-semibold" style={{color: regionColor}}>
                                    {index + 1}. {region.name}
                                    </span>
                                {region.count > 0 ? ` - ${region.count} events` : ''}
                            </p>
                        )})
                    ) : (
                        <p className="text-slate-400 text-xs">(No significant regional activity in the last 24 hours)</p>
                    )
                )}
            </div>

            <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md mt-3">
                <h3 className="text-md font-semibold mb-2 text-indigo-300">
                    Active Earthquake Clusters
                </h3>
                {overviewClusters && overviewClusters.length > 0 ? (
                    <ul className="space-y-2">
                        {overviewClusters.map(cluster => (
                            <ClusterSummaryItem
                                clusterData={cluster}
                                key={cluster.id}
                                onClusterSelect={handleClusterSummaryClick}
                            />
                        ))}
                    </ul>
                ) : (
                    <p className="text-xs text-slate-400 text-center py-2">
                        No significant active clusters detected currently.
                    </p>
                )}
            </div>

            {recentSignificantQuakesForOverview.length > 0 && (
                <Suspense fallback={<ChartLoadingFallback message="Loading significant quakes table..." />}>
                    <PaginatedEarthquakeTable
                        title={`Recent Significant Quakes (M${MAJOR_QUAKE_THRESHOLD.toFixed(1)}+)`}
                        earthquakes={recentSignificantQuakesForOverview}
                        isLoading={isLoadingWeekly && (!earthquakesLast7Days || earthquakesLast7Days.length === 0)}
                        onQuakeClick={handleQuakeClick}
                        itemsPerPage={10}
                        defaultSortKey="time"
                        initialSortDirection="descending"
                        periodName="last 7 days"
                        getMagnitudeColorStyle={getMagnitudeColorStyle}
                        formatTimeAgo={formatTimeAgo}
                        formatDate={formatDate}
                    />
                </Suspense>
            )}
            {isLoadingWeekly && recentSignificantQuakesForOverview.length === 0 && (!earthquakesLast7Days || earthquakesLast7Days.length === 0) &&
                <div className="bg-slate-700 p-3 rounded-lg mt-4 border border-slate-600 shadow-md">
                    <h3 className="text-md font-semibold mb-2 text-indigo-400">Recent Significant Quakes (M{MAJOR_QUAKE_THRESHOLD.toFixed(1)}+)</h3>
                    <SkeletonListItem /> <SkeletonListItem />
                </div>
            }
            <div className="bg-slate-700 p-2 rounded-lg border border-slate-600 shadow-md">
                <h3 className="text-md font-semibold mb-1 text-indigo-400">Did You Know?</h3>
                <InfoSnippet topic="magnitude" />
            </div>
            <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md text-sm">
                <h3 className="text-md font-semibold mb-1 text-indigo-400">Earthquakes & Tectonic Plates</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                    Most earthquakes occur along the edges of tectonic plates... {/* Truncated for brevity */}
                </p>
            </div>
        </>
    );
};

export default OverviewPanel;
