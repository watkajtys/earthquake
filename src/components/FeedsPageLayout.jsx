import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEarthquakeDataState } from '../context/EarthquakeDataContext.jsx'; // Corrected path
import SeoMetadata from './SeoMetadata';
import PaginatedEarthquakeTable from './PaginatedEarthquakeTable';
import SummaryStatisticsCard from './SummaryStatisticsCard';
import { getMagnitudeColorStyle, calculateStats as calculateStatsUtil } from '../utils/utils.js';
import { FEELABLE_QUAKE_THRESHOLD, MAJOR_QUAKE_THRESHOLD } from '../constants/appConstants.js'; // Corrected path
// Skeleton components could be used here if needed for more granular loading states
// import SkeletonText from './SkeletonText';
// import SkeletonBlock from './SkeletonBlock';

// Define getFeedPageSeoInfo locally
const getFeedPageSeoInfo = (feedTitle, activePeriodParam) => {
    let periodDescription = "the latest updates";
    let periodKeywords = "earthquake feed, live seismic data";

    switch (activePeriodParam) {
        case 'last_hour':
            periodDescription = "the last hour";
            periodKeywords = "last hour earthquakes, real-time seismic events";
            break;
        case 'last_24_hours':
            periodDescription = "the last 24 hours";
            periodKeywords = "24 hour earthquakes, daily seismic summary";
            break;
        case 'last_7_days':
            periodDescription = "the last 7 days";
            periodKeywords = "7 day earthquakes, weekly seismic activity";
            break;
        case 'last_14_days':
            periodDescription = "the last 14 days";
            periodKeywords = "14 day earthquakes, biweekly seismic overview";
            break;
        case 'last_30_days':
            periodDescription = "the last 30 days";
            periodKeywords = "30 day earthquakes, monthly seismic analysis";
            break;
        case 'feelable_quakes':
            periodDescription = `feelable quakes (M${FEELABLE_QUAKE_THRESHOLD.toFixed(1)}+)`;
            periodKeywords = "feelable earthquakes, noticeable seismic events";
            break;
        case 'significant_quakes':
            periodDescription = `significant quakes (M${MAJOR_QUAKE_THRESHOLD.toFixed(1)}+)`;
            periodKeywords = "significant earthquakes, major seismic events";
            break;
        default:
            periodDescription = "selected period";
            break;
    }

    const title = feedTitle ? `${feedTitle} | Seismic Monitor` : 'Earthquake Feeds | Seismic Monitor';
    const description = `Explore earthquake data for ${periodDescription}. View lists, statistics, and details of seismic events. Updated with the latest USGS data.`;
    const keywords = `earthquake feed, live seismic data, earthquake list, ${periodKeywords}, seismic monitor, USGS earthquake data`;
    const safeActivePeriod = String(activePeriodParam).replace(/[^a-zA-Z0-9_.-]/g, '');
    const canonicalUrl = `https://earthquakeslive.com/feeds?activeFeedPeriod=${safeActivePeriod}`; // Ensure this matches your domain
    return { title, description, keywords, pageUrl: canonicalUrl, canonicalUrl, locale: "en_US" };
};


const FeedsPageLayout = () => {
    const navigate = useNavigate();
    const {
        earthquakesLastHour, earthquakesLast24Hours, earthquakesLast7Days,
        earthquakesLast14Days, earthquakesLast30Days, // from context
        allEarthquakes,
        isLoadingDaily, isLoadingWeekly, isLoadingMonthly,
        hasAttemptedMonthlyLoad, loadMonthlyData,
        formatTimeAgo, formatDate, // from context
        // context also provides: prev24HourData, prev7DayDataForMonthly, prev14DayDataForMonthly
        // These are used to calculate previousDataForCurrentFeed
        prev24HourData: prev24HourDataContext,
        prev7DayDataForMonthly: prev7DayDataContext,
        prev14DayDataForMonthly: prev14DayDataContext,
        earthquakesPriorHour: earthquakesPriorHourContext,
    } = useEarthquakeDataState();

    const [activeFeedPeriod, setActiveFeedPeriod] = useState('last_24_hours');

    const handleQuakeClick = useCallback((quake) => {
        const detailUrl = quake?.properties?.detail || quake?.properties?.url;
        if (detailUrl) {
            navigate(`/quake/${encodeURIComponent(detailUrl)}`);
        } else {
            console.warn("No detail URL for earthquake:", quake?.id);
            alert(`Earthquake: M ${quake?.properties?.mag?.toFixed(1)} - ${quake?.properties?.place || 'Unknown location'}. No further details link available.`);
        }
    }, [navigate]);

    const currentFeedData = useMemo(() => {
        const baseDataForFilters = (hasAttemptedMonthlyLoad && allEarthquakes?.length > 0) ? allEarthquakes : earthquakesLast7Days;
        switch (activeFeedPeriod) {
            case 'last_hour': return earthquakesLastHour;
            case 'last_24_hours': return earthquakesLast24Hours;
            case 'last_7_days': return earthquakesLast7Days;
            case 'last_14_days': return (hasAttemptedMonthlyLoad && allEarthquakes?.length > 0) ? earthquakesLast14Days : null;
            case 'last_30_days': return (hasAttemptedMonthlyLoad && allEarthquakes?.length > 0) ? earthquakesLast30Days : null;
            case 'feelable_quakes': return baseDataForFilters ? baseDataForFilters.filter(q => q.properties.mag !== null && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD) : [];
            case 'significant_quakes': return baseDataForFilters ? baseDataForFilters.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD) : [];
            default: return earthquakesLast24Hours;
        }
    }, [activeFeedPeriod, earthquakesLastHour, earthquakesLast24Hours, earthquakesLast7Days,
        earthquakesLast14Days, earthquakesLast30Days, allEarthquakes, hasAttemptedMonthlyLoad]);

    const currentFeedTitle = useMemo(() => {
        const filterPeriodSuffix = (hasAttemptedMonthlyLoad && allEarthquakes?.length > 0) ? "(Last 30 Days)" : "(Last 7 Days)";
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
    }, [activeFeedPeriod, hasAttemptedMonthlyLoad, allEarthquakes]);

    const currentFeedisLoading = useMemo(() => {
        if (activeFeedPeriod === 'last_hour') return isLoadingDaily && (!earthquakesLastHour || earthquakesLastHour.length === 0);
        if (activeFeedPeriod === 'last_24_hours') return isLoadingDaily && (!earthquakesLast24Hours || earthquakesLast24Hours.length === 0);
        if (activeFeedPeriod === 'last_7_days') return isLoadingWeekly && (!earthquakesLast7Days || earthquakesLast7Days.length === 0);
        if (activeFeedPeriod === 'feelable_quakes' || activeFeedPeriod === 'significant_quakes') {
            if (hasAttemptedMonthlyLoad && allEarthquakes?.length > 0) return isLoadingMonthly && allEarthquakes.length === 0;
            return isLoadingWeekly && (!earthquakesLast7Days || earthquakesLast7Days.length === 0);
        }
        if ((activeFeedPeriod === 'last_14_days' || activeFeedPeriod === 'last_30_days')) {
            return isLoadingMonthly && (!allEarthquakes || allEarthquakes.length === 0);
        }
        return currentFeedData === null;
    }, [activeFeedPeriod, isLoadingDaily, isLoadingWeekly, isLoadingMonthly,
        earthquakesLastHour, earthquakesLast24Hours, earthquakesLast7Days,
        allEarthquakes, hasAttemptedMonthlyLoad, currentFeedData]);

    const previousDataForCurrentFeed = useMemo(() => {
        switch (activeFeedPeriod) {
            case 'last_hour': return earthquakesPriorHourContext;
            case 'last_24_hours': return prev24HourDataContext;
            case 'last_7_days': return prev7DayDataContext;
            case 'last_14_days': return prev14DayDataContext;
            default: return null; // No trend data for filtered views or 30-day view
        }
    }, [activeFeedPeriod, earthquakesPriorHourContext, prev24HourDataContext, prev7DayDataContext, prev14DayDataContext]);

    const seoInfo = getFeedPageSeoInfo(currentFeedTitle, activeFeedPeriod);

    return (
        <>
            <SeoMetadata
                title={seoInfo.title}
                description={seoInfo.description}
                keywords={seoInfo.keywords}
                imageUrl="/vite.svg" // Consider making this dynamic or removing if not used
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
                    calculateStats={calculateStatsUtil}
                />
                <PaginatedEarthquakeTable
                    title={currentFeedTitle}
                    earthquakes={currentFeedData || []}
                    isLoading={currentFeedisLoading}
                    onQuakeClick={handleQuakeClick}
                    itemsPerPage={15}
                    periodName={activeFeedPeriod.replace(/_/g, ' ')}
                    getMagnitudeColorStyle={getMagnitudeColorStyle} // from utils
                    formatTimeAgo={formatTimeAgo} // from context
                    formatDate={formatDate} // from context
                />
                {!hasAttemptedMonthlyLoad && (
                    <div className="text-center py-3 mt-3 border-t border-slate-700">
                        <button onClick={loadMonthlyData} disabled={isLoadingMonthly} className="w-full bg-teal-600 hover:bg-teal-500 p-2.5 rounded-md text-white font-semibold transition-colors text-xs shadow-md disabled:opacity-60">
                            {isLoadingMonthly ? 'Loading Extended Data...' : 'Load 14 & 30-Day Data'}
                        </button>
                    </div>
                )}
                {hasAttemptedMonthlyLoad && isLoadingMonthly && <p className="text-xs text-slate-400 text-center py-3 animate-pulse">Loading extended data archives...</p>}
            </div>
        </>
    );
};

// PropTypes removed as props are now minimal and mostly from context

export default FeedsPageLayout;
