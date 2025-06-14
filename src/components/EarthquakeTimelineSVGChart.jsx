import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext';
// Remove old SkeletonBlock import if no longer used, or keep if other skeletons are used from it.
// For now, assume it's only for this specific skeleton.
// import SkeletonBlock from './skeletons/SkeletonBlock';
import EarthquakeTimelineSVGChartSkeleton from './skeletons/EarthquakeTimelineSVGChartSkeleton'; // New skeleton import

/**
 * Displays an SVG bar chart visualizing earthquake frequency over a specified number of days.
 * This component is memoized using `React.memo` for performance optimization.
 * It can utilize pre-calculated daily counts from `EarthquakeDataContext` (e.g., `dailyCounts7Days`,
 * `dailyCounts14Days`, `dailyCounts30Days`) if available for the specified `days` prop.
 * Otherwise, it processes the raw `earthquakes` data to calculate daily frequencies.
 * Shows a skeleton loader (`EarthquakeTimelineSVGChartSkeleton`) when `isLoading` is true.
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {Array<Object>|null} [props.earthquakes=null] - An array of earthquake feature objects. This is used as a fallback
 *   if pre-calculated data for the specified `days` is not available in context. Each object should
 *   adhere to the USGS GeoJSON feature structure, particularly `properties.time`.
 * @param {number} [props.days=7] - The number of days to display on the timeline (e.g., 7, 14, 30).
 *   The component will try to use corresponding pre-calculated daily counts from context if available.
 * @param {string} [props.titleSuffix='(Last 7 Days)'] - Suffix for the chart's title, typically indicating the time period.
 * @param {boolean} props.isLoading - Flag indicating whether the data is currently loading.
 *   If true, a skeleton loader is displayed.
 * @returns {JSX.Element} The EarthquakeTimelineSVGChart component.
 */
const EarthquakeTimelineSVGChart = React.memo(({earthquakes = null, days = 7, titleSuffix = "(Last 7 Days)", isLoading}) => {
    const { dailyCounts7Days, dailyCounts14Days, dailyCounts30Days } = useEarthquakeDataState(); // earthquakesLast7Days removed
    const cardBg = "bg-slate-700";
    const titleColor = "text-indigo-400";
    const axisLabelColor = "text-slate-400";
    const tickLabelColor = "text-slate-500";
    const barCountLabelColor = "text-slate-300";
    const barFillColor = "#818CF8";
    const borderColor = "border-slate-600";

    const data = useMemo(() => {
        if (days === 7 && dailyCounts7Days) {
            return dailyCounts7Days.map(d => ({ date: d.dateString, count: d.count }));
        } else if (days === 30 && dailyCounts30Days) {
            return dailyCounts30Days.map(d => ({ date: d.dateString, count: d.count }));
        } else if (days === 14 && dailyCounts14Days) {
            return dailyCounts14Days.map(d => ({ date: d.dateString, count: d.count }));
        }
        const sourceData = earthquakes;
        if (!sourceData) return [];
        const countsByDay = {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - (days - 1));
        for (let i = 0; i < days; i++) {
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + i);
            countsByDay[d.toLocaleDateString([], {month: 'short', day: 'numeric'})] = 0;
        }
        sourceData.forEach(q => {
            const eD = new Date(q.properties.time);
            if (eD >= startDate && eD <= new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)) {
                const dS = eD.toLocaleDateString([], {month: 'short', day: 'numeric'});
                if (Object.prototype.hasOwnProperty.call(countsByDay, dS)) countsByDay[dS]++;
            }
        });
        return Object.entries(countsByDay).map(([date, count]) => ({date, count}));
    }, [earthquakes, days, dailyCounts7Days, dailyCounts14Days, dailyCounts30Days]); // earthquakesLast7Days removed

    const noDataAvailable = useMemo(() => {
        if (days === 7) return !dailyCounts7Days || dailyCounts7Days.length === 0 || dailyCounts7Days.every(d => d.count === 0);
        if (days === 30) return !dailyCounts30Days || dailyCounts30Days.length === 0 || dailyCounts30Days.every(d => d.count === 0);
        if (days === 14) return !dailyCounts14Days || dailyCounts14Days.length === 0 || dailyCounts14Days.every(d => d.count === 0);
        return !data || data.length === 0 || data.every(d => d.count === 0);
    }, [days, dailyCounts7Days, dailyCounts14Days, dailyCounts30Days, data]); // earthquakes removed

    // Use the new skeleton component when isLoading is true
    if (isLoading) return <EarthquakeTimelineSVGChartSkeleton days={days} titleSuffix={titleSuffix} />;

    if (noDataAvailable) return <div className={`${cardBg} p-4 rounded-lg border ${borderColor} overflow-x-auto shadow-md`}><h3 className={`text-lg font-semibold mb-4 ${titleColor}`}>Earthquake Frequency {titleSuffix}</h3><p className="text-slate-400 p-4 text-center text-sm">No data for chart.</p></div>;

    const chartHeight = 280;
    const lblInt = days > 15 ? Math.floor(days / 7) : (days > 7 ? 2 : 1);
    const barW = days > 15 ? (days > 25 ? 15 : 20) : 30;
    const barP = days > 15 ? 5 : 8;
    const yOffset = 45;
    const xOffset = 40;
    const svgW = data.length * (barW + barP) + yOffset;
    const maxC = Math.max(...data.map(d => d.count), 0);
    const yLbls = [];
    if (maxC > 0) {
        const numL = 5;
        const step = Math.ceil(maxC / numL) || 1;
        for (let i = 0; i <= maxC; i += step) {
            if (yLbls.length <= numL) yLbls.push(i); else break;
        }
        if (!yLbls.includes(maxC) && yLbls.length <= numL && maxC > 0) yLbls.push(maxC);
        if (yLbls.length === 0 && maxC === 0) yLbls.push(0);
    } else {
        yLbls.push(0);
    }

    return (
        <div className={`${cardBg} p-4 rounded-lg border ${borderColor} overflow-x-auto shadow-md`}>
            <h3 className={`text-lg font-semibold mb-4 ${titleColor}`}>Earthquake Frequency {titleSuffix}</h3>
            <svg data-testid="timeline-svg-chart" width="100%" height={chartHeight + xOffset} viewBox={`0 0 ${svgW} ${chartHeight + xOffset}`} className="overflow-visible">
                <text transform={`translate(${yOffset / 3},${chartHeight / 2}) rotate(-90)`} textAnchor="middle" className={`text-xs fill-current ${axisLabelColor}`}>Count</text>
                <text x={yOffset + (svgW - yOffset) / 2} y={chartHeight + xOffset - 5} textAnchor="middle" className={`text-xs fill-current ${axisLabelColor}`}>Date</text>
                {yLbls.map((l, i) => {
                    const yP = chartHeight - (l / (maxC > 0 ? maxC : 1) * chartHeight);
                    return (
                        <g key={`y-tl-${i}`}>
                            <text x={yOffset - 5} y={yP + 4} textAnchor="end" className={`text-xs fill-current ${tickLabelColor}`}>{l}</text>
                            <line x1={yOffset} y1={yP} x2={svgW} y2={yP} stroke="#475569" strokeDasharray="2,2"/>
                        </g>
                    );
                })}
                {data.map((item, i) => {
                    const bH = maxC > 0 ? (item.count / maxC) * chartHeight : 0;
                    const x = yOffset + i * (barW + barP);
                    const y = chartHeight - bH;
                    return (
                        <g key={item.date}>
                            <title>{`${item.date}: ${item.count}`}</title>
                            <rect x={x} y={y} width={barW} height={bH} fill={barFillColor} className="transition-all duration-300 ease-in-out hover:opacity-75"/>
                            {i % lblInt === 0 && (
                                <text x={x + barW / 2} y={chartHeight + 15} textAnchor="middle" className={`text-xs fill-current ${tickLabelColor}`}>{item.date}</text>
                            )}
                            <text x={x + barW / 2} y={y - 5 > 10 ? y - 5 : 10} textAnchor="middle" className={`text-xs font-medium fill-current ${barCountLabelColor}`}>{item.count > 0 ? item.count : ''}</text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
});

EarthquakeTimelineSVGChart.propTypes = {
    earthquakes: PropTypes.array,
    days: PropTypes.number,
    titleSuffix: PropTypes.string,
    isLoading: PropTypes.bool,
};

export default EarthquakeTimelineSVGChart;
