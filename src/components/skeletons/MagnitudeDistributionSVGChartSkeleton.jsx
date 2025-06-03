import React, { useMemo } from 'react';
import PropTypes from 'prop-types';

/**
 * A skeleton loader component for the MagnitudeDistributionSVGChart.
 * It mimics the basic structure of the chart to prevent layout shifts.
 */
const MagnitudeDistributionSVGChartSkeleton = React.memo(({ titleSuffix = "(Last 30 Days)" }) => {
    const cardBg = "bg-slate-700";
    const titleColor = "text-indigo-400";
    const axisLabelColor = "text-slate-400";
    const tickLabelColor = "text-slate-500";
    const skeletonBarFillColor = "bg-slate-600"; // Placeholder color for bars
    const borderColor = "border-slate-600";
    const gridLineColor = "stroke-slate-600";

    // Dimensions from original chart
    const chartHeight = 280;
    const barPadding = 10;
    const barWidth = 35;
    const yAxisLabelOffset = 45;
    const xAxisLabelOffset = 40; // For X-axis label and bottom padding

    // MagnitudeDistributionSVGChart has a fixed number of bars (8 magnitude ranges)
    const numBars = 8;
    const svgWidth = numBars * (barWidth + barPadding) + yAxisLabelOffset;

    // Placeholder Y-axis labels (e.g., 0, 25, 50, 75, 100)
    const yLbls = [0, 25, 50, 75, 100]; // Fixed placeholder scale
    const maxYVal = 100; // Assumed max value for scaling skeleton bars

    // Placeholder magnitude range names for X-axis ticks (simplified)
    const magnitudeRangePlaceholders = ['<1', '1-2', '2-3', '3-4', '4-5', '5-6', '6-7', '7+'];

    const placeholderBars = useMemo(() => {
        return Array.from({ length: numBars }).map((_, i) => {
            const x = yAxisLabelOffset + i * (barWidth + barPadding);
            const randomFactor = (i % 4 + 1) / 4; // e.g., 1/4, 2/4, 3/4, 1
            const barHeight = chartHeight * 0.7 * randomFactor; // Max 70% of chart height
            const y = chartHeight - barHeight;
            return { x, y, width: barWidth, height: barHeight, id: `skel-mag-bar-${i}` };
        });
    }, [numBars, barWidth, barPadding, yAxisLabelOffset, chartHeight]);

    return (
        <div className={`${cardBg} p-4 rounded-lg border ${borderColor} overflow-x-auto shadow-md`}>
            <h3 className={`text-lg font-semibold mb-4 ${titleColor}`}>Magnitude Distribution {titleSuffix}</h3>
            <div className="animate-pulse">
                <svg width="100%" height={chartHeight + xAxisLabelOffset} viewBox={`0 0 ${svgWidth} ${chartHeight + xAxisLabelOffset}`} className="overflow-visible">
                    {/* Y-axis Label */}
                    <text transform={`translate(${yAxisLabelOffset / 3}, ${chartHeight / 2}) rotate(-90)`} textAnchor="middle" className={`text-xs fill-current ${axisLabelColor}`}>Count</text>

                    {/* X-axis Label */}
                    <text x={yAxisLabelOffset + (svgWidth - yAxisLabelOffset) / 2} y={chartHeight + xAxisLabelOffset - 5} textAnchor="middle" className={`text-xs fill-current ${axisLabelColor}`}>Magnitude Range</text>

                    {/* Y-axis Ticks and Gridlines */}
                    {yLbls.map((l, i) => {
                        const yP = chartHeight - (l / maxYVal * chartHeight);
                        return (
                            <g key={`skel-mag-y-tl-${i}`}>
                                <text x={yAxisLabelOffset - 8} y={yP + 4} textAnchor="end" className={`text-xs fill-current ${tickLabelColor}`}>{l}</text>
                                <line x1={yAxisLabelOffset} y1={yP} x2={svgWidth} y2={yP} className={`${gridLineColor} stroke-dasharray-2`} strokeDasharray="2,2"/>
                            </g>
                        );
                    })}

                    {/* Placeholder Bars and X-axis Tick Labels */}
                    {placeholderBars.map((bar, i) => (
                        <g key={bar.id}>
                            <rect x={bar.x} y={bar.y} width={bar.width} height={bar.height} className={`fill-current ${skeletonBarFillColor}`} />
                            {/* Placeholder for X-axis tick text (magnitude range) */}
                            <rect x={bar.x + bar.width / 2 - 15} y={chartHeight + 10} width="30" height="8" className={`fill-current ${tickLabelColor} opacity-50`} />
                        </g>
                    ))}
                    {/* Bottom line for X axis */}
                    <line x1={yAxisLabelOffset} y1={chartHeight} x2={svgWidth} y2={chartHeight} className={`${gridLineColor}`} />
                </svg>
            </div>
        </div>
    );
});

MagnitudeDistributionSVGChartSkeleton.propTypes = {
    titleSuffix: PropTypes.string,
};

export default MagnitudeDistributionSVGChartSkeleton;
