import React from 'react';
import SkeletonText from './skeletons/SkeletonText';
import SkeletonBlock from './skeletons/SkeletonBlock';
import { FEELABLE_QUAKE_THRESHOLD } from '../constants/appConstants';

/**
 * A React component that displays a card with summary statistics for a given period.
 * @param {object} props - The component's props.
 * @param {string} props.title - The title of the card.
 * @param {Array<object> | null} props.currentPeriodData - Earthquake data for the current period.
 * @param {Array<object> | null} [props.previousPeriodData=null] - Earthquake data for the previous period (for trend comparison).
 * @param {boolean} props.isLoading - Whether the data is currently loading.
 * @param {function} props.calculateStats - Function to calculate statistics.
 * @returns {JSX.Element} The rendered SummaryStatisticsCard component.
 */
const SummaryStatisticsCard = React.memo(({title, currentPeriodData, previousPeriodData = null, isLoading, calculateStats}) => {
    const cardBg = "bg-slate-700"; const textColor = "text-slate-300"; const titleColor = "text-indigo-400"; const statBoxBg = "bg-slate-800"; const statValueColor = "text-sky-400"; const statLabelColor = "text-slate-400"; const borderColor = "border-slate-600";
    if (isLoading || currentPeriodData === null) {
        return (<div className={`${cardBg} p-4 rounded-lg border ${borderColor} shadow-md`}> <h3 className={`text-lg font-semibold mb-3 ${titleColor}`}>{title}</h3> <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">{[...Array(8)].map((_, i) => ( <div key={i} className={`${statBoxBg} p-2 rounded-lg text-center animate-pulse`}> <SkeletonText width="w-1/2 mx-auto" height="h-6 mb-1" className="bg-slate-600" /> <SkeletonText width="w-3/4 mx-auto" height="h-3" className="bg-slate-600" /> </div>))}</div> </div>);
    }
    // Ensure `title` is a string before calling `includes`
    const safeTitle = typeof title === 'string' ? title : '';
    if (currentPeriodData.length === 0 && !["Summary (Last Hour)", "Summary (Last 24 Hours)", "Overview (Last 24 Hours)"].some(t => safeTitle.includes(t))) {
        return (<div className={`${cardBg} p-4 rounded-lg border ${borderColor} shadow-md`}><h3 className={`text-lg font-semibold mb-3 ${titleColor}`}>{title}</h3><p className={`${textColor} text-center py-3 text-sm`}>No earthquake data for this period.</p></div>);
    }
    const currentStats = calculateStats(currentPeriodData);
    const previousStats = previousPeriodData ? calculateStats(previousPeriodData) : null;
    const getTrendDisplay = (currentValue, previousValue) => {
        if (!previousValue || previousValue === 'N/A' || currentValue === 'N/A') return null;
        const currentNum = parseFloat(currentValue); const previousNum = parseFloat(previousValue);
        if (isNaN(currentNum) || isNaN(previousNum)) return null;
        const diff = currentNum - previousNum;
        const isCount = !String(currentValue).includes('.');
        if (!isCount && Math.abs(diff) < 0.05 && currentNum !== 0) return null;
        if (isCount && diff === 0) return null;
        const trendColor = diff > 0 ? 'text-red-400' : diff < 0 ? 'text-green-400' : 'text-slate-500';
        const trendSign = diff > 0 ? '▲' : diff < 0 ? '▼' : '';
        return <span className={`ml-1 text-xs ${trendColor}`}>{trendSign} {Math.abs(diff).toFixed(String(currentValue).includes('.') ? 1 : 0)}</span>;
    };
    const statsToDisplay = [ { label: 'Total Events', value: currentStats.totalEarthquakes, trend: getTrendDisplay(currentStats.totalEarthquakes, previousStats?.totalEarthquakes) }, { label: 'Avg. Magnitude', value: currentStats.averageMagnitude, trend: getTrendDisplay(currentStats.averageMagnitude, previousStats?.averageMagnitude) }, { label: 'Strongest Mag.', value: currentStats.strongestMagnitude, trend: getTrendDisplay(currentStats.strongestMagnitude, previousStats?.strongestMagnitude) }, { label: `Feelable (M${FEELABLE_QUAKE_THRESHOLD.toFixed(1)}+)`, value: currentStats.feelableEarthquakes, trend: getTrendDisplay(currentStats.feelableEarthquakes, previousStats?.feelableEarthquakes) }, { label: 'Significant (M4.5+)', value: currentStats.significantEarthquakes, trend: getTrendDisplay(currentStats.significantEarthquakes, previousStats?.significantEarthquakes) }, { label: 'Avg. Depth (km)', value: currentStats.averageDepth, trend: getTrendDisplay(currentStats.averageDepth, previousStats?.averageDepth) }, { label: 'Deepest (km)', value: currentStats.deepestEarthquake, trend: getTrendDisplay(currentStats.deepestEarthquake, previousStats?.deepestEarthquake) }, { label: 'Avg. Significance', value: currentStats.averageSignificance, trend: getTrendDisplay(currentStats.averageSignificance, previousStats?.averageSignificance) },];
    return (<div className={`${cardBg} p-4 rounded-lg border ${borderColor} shadow-md`}> <h3 className={`text-lg font-semibold mb-3 ${titleColor}`}>{title}</h3> {(currentPeriodData.length === 0 && ["Summary (Last Hour)", "Summary (Last 24 Hours)", "Overview (Last 24 Hours)"].some(t => safeTitle.includes(t))) && ( <p className={`${textColor} text-center py-3 text-sm`}>No earthquakes recorded in this period.</p>)} {currentPeriodData.length > 0 && ( <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">{statsToDisplay.map(stat => ( <div key={stat.label} className={`${statBoxBg} p-2 rounded-lg text-center border border-slate-700`}> <p className={`text-lg md:text-xl font-bold ${statValueColor}`}>{stat.value}{stat.trend}</p> <p className={`text-xs ${statLabelColor}`}>{stat.label}</p> </div>))}</div>)}</div>);
});

export default SummaryStatisticsCard;
