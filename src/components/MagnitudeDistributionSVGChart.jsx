import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext';
// import SkeletonBlock from './skeletons/SkeletonBlock'; // Comment out or remove
import MagnitudeDistributionSVGChartSkeleton from './skeletons/MagnitudeDistributionSVGChartSkeleton'; // New import
import { getMagnitudeColor } from '../utils/utils.js';

/**
 * A React component that displays an SVG bar chart of earthquake magnitude distribution.
 */
const MagnitudeDistributionSVGChart = React.memo(({earthquakes, titleSuffix = "(Last 30 Days)", isLoading}) => {
    const { magnitudeDistribution7Days, magnitudeDistribution14Days, magnitudeDistribution30Days } = useEarthquakeDataState();
    const cardBg = "bg-slate-700";
    const titleColor = "text-indigo-400";
    const axisLabelColor = "text-slate-400";
    const tickLabelColor = "text-slate-500";
    const barCountLabelColor = "text-slate-300";
    const borderColor = "border-slate-600";

    const magnitudeRanges = useMemo(() => [
        {name: '<1', min: -Infinity, max: 0.99, color: getMagnitudeColor(0.5)},
        { name : '1-1.9', min : 1, max : 1.99, color: getMagnitudeColor(1.5) },
        {name: '2-2.9', min: 2, max: 2.99, color: getMagnitudeColor(2.5)},
        { name : '3-3.9', min : 3, max : 3.99, color: getMagnitudeColor(3.5) },
        {name: '4-4.9', min: 4, max: 4.99, color: getMagnitudeColor(4.5)},
        { name : '5-5.9', min : 5, max : 5.99, color: getMagnitudeColor(5.5) },
        {name: '6-6.9', min: 6, max: 6.99, color: getMagnitudeColor(6.5)},
        { name : '7+', min : 7, max : Infinity, color: getMagnitudeColor(7.5) },
    ], [getMagnitudeColor]);

    const data = useMemo(() => {
        if (titleSuffix === "(Last 7 Days)" && magnitudeDistribution7Days && magnitudeDistribution7Days.length > 0) {
            return magnitudeDistribution7Days;
        } else if (titleSuffix === "(Last 14 Days)" && magnitudeDistribution14Days && magnitudeDistribution14Days.length > 0) {
            return magnitudeDistribution14Days;
        } else if (titleSuffix === "(Last 30 Days)" && magnitudeDistribution30Days && magnitudeDistribution30Days.length > 0) {
            return magnitudeDistribution30Days;
        } else {
            if (!earthquakes) return [];
            return magnitudeRanges.map(range => ({
                name : range.name,
                count: earthquakes.filter(q => q.properties.mag !== null && q.properties.mag >= range.min && q.properties.mag <= range.max).length,
                color: range.color
            }));
        }
    }, [earthquakes, titleSuffix, magnitudeDistribution7Days, magnitudeDistribution14Days, magnitudeDistribution30Days, magnitudeRanges]);

    // Use the new skeleton component when isLoading is true
    if (isLoading) return <MagnitudeDistributionSVGChartSkeleton titleSuffix={titleSuffix} />;

    if (!data || data.filter(d => d.count > 0).length === 0) return <div className={`${cardBg} p-4 rounded-lg border ${borderColor} overflow-x-auto shadow-md`}><h3 className={`text-lg font-semibold mb-4 ${titleColor}`}>Magnitude Distribution {titleSuffix}</h3><p className="text-slate-400 p-4 text-center text-sm">No data for chart.</p></div>;

    const chartHeight = 280;
    const barPadding = 10;
    const barWidth = 35;
    const yAxisLabelOffset = 45;
    const xAxisLabelOffset = 40;
    const svgWidth = data.length * (barWidth + barPadding) + yAxisLabelOffset;
    const maxCount = Math.max(...data.map(d => d.count), 0);
    const yAxisLabels = [];
    if (maxCount > 0) {
        const numL = 5;
        const step = Math.ceil(maxCount / numL) || 1;
        for (let i = 0; i <= maxCount; i += step) {
            if (yAxisLabels.length <= numL) yAxisLabels.push(i); else break;
        }
        if (!yAxisLabels.includes(maxCount) && yAxisLabels.length <= numL && maxCount > 0) yAxisLabels.push(maxCount);
    } else {
        yAxisLabels.push(0);
    }

    return (
        <div className={`${cardBg} p-4 rounded-lg border ${borderColor} overflow-x-auto shadow-md`}>
            <h3 className={`text-lg font-semibold mb-4 ${titleColor}`}>Magnitude Distribution {titleSuffix}</h3>
            <svg width="100%" height={chartHeight + xAxisLabelOffset} viewBox={`0 0 ${svgWidth} ${chartHeight + xAxisLabelOffset}`} className="overflow-visible">
                <text transform={`translate(${yAxisLabelOffset / 3}, ${chartHeight / 2}) rotate(-90)`} textAnchor="middle" className={`text-xs fill-current ${axisLabelColor}`}>Count</text>
                <text x={yAxisLabelOffset + (svgWidth - yAxisLabelOffset) / 2} y={chartHeight + xAxisLabelOffset - 5} textAnchor="middle" className={`text-xs fill-current ${axisLabelColor}`}>Magnitude Range</text>
                {yAxisLabels.map((l, i) => {
                    const yP = chartHeight - (l / (maxCount > 0 ? maxCount : 1) * chartHeight);
                    return (
                        <g key={`y-mag-${i}`}>
                            <text x={yAxisLabelOffset - 5} y={yP + 4} textAnchor="end" className={`text-xs fill-current ${tickLabelColor}`}>{l}</text>
                            <line x1={yAxisLabelOffset} y1={yP} x2={svgWidth} y2={yP} stroke="#475569" strokeDasharray="2,2"/>
                        </g>
                    );
                })}
                {data.map((item, i) => {
                    const bH = maxCount > 0 ? (item.count / maxCount) * chartHeight : 0;
                    const x = yAxisLabelOffset + i * (barWidth + barPadding);
                    const y = chartHeight - bH;
                    return (
                        <g key={item.name}>
                            <title>{`${item.name}: ${item.count}`}</title>
                            <rect x={x} y={y} width={barWidth} height={bH} fill={item.color} className="transition-all duration-300 ease-in-out hover:opacity-75"/>
                            <text x={x + barWidth / 2} y={chartHeight + 15} textAnchor="middle" className={`text-xs fill-current ${tickLabelColor}`}>{item.name}</text>
                            <text x={x + barWidth / 2} y={y - 5 > 10 ? y - 5 : 10} textAnchor="middle" className={`text-xs font-medium fill-current ${barCountLabelColor}`}>{item.count > 0 ? item.count : ''}</text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
});

MagnitudeDistributionSVGChart.propTypes = {
    earthquakes: PropTypes.array,
    titleSuffix: PropTypes.string,
    isLoading: PropTypes.bool,
};

export default MagnitudeDistributionSVGChart;
