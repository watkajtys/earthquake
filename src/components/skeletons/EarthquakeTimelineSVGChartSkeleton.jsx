import React, { useMemo } from 'react';
import PropTypes from 'prop-types';

/**
 * A skeleton loader component for the EarthquakeTimelineSVGChart.
 * It mimics the basic structure of the chart to prevent layout shifts.
 */
const EarthquakeTimelineSVGChartSkeleton = React.memo(({ days = 7, titleSuffix = "(Last 7 Days)" }) => {
    const cardBg = "bg-slate-700";
    const titleColor = "text-indigo-400";
    const axisLabelColor = "text-slate-400";
    const tickLabelColor = "text-slate-500";
    // Use a muted version of bar fill for skeleton, or a generic skeleton color
    const skeletonBarFillColor = "bg-slate-600"; // Or simply use slate-600/500 for rect fill
    const borderColor = "border-slate-600";
    const gridLineColor = "stroke-slate-600"; // For grid lines

    // Dimensions (approximated from EarthquakeTimelineSVGChart)
    const chartHeight = 280;
    const yOffset = 45; // Space for Y-axis labels
    const xOffset = 40; // Space for X-axis labels and bottom padding

    // Determine number of placeholder bars and x-axis ticks based on 'days'
    // This logic should roughly match the real chart's data generation for date labels
    const numBars = days;
    const lblInt = days > 15 ? Math.floor(days / 7) : (days > 7 ? 2 : 1); // Label interval
    const barW = days > 15 ? (days > 25 ? 15 : 20) : 30;
    const barP = days > 15 ? 5 : 8;
    const svgW = numBars * (barW + barP) + yOffset; // Approximate SVG width

    // Placeholder Y-axis labels (e.g., 0, 25, 50, 75, 100)
    const yLbls = [0, 25, 50, 75, 100]; // Using fixed placeholder scale for simplicity
    const maxYVal = 100; // Assuming a max value for scaling skeleton bars

    // Generate placeholder data for bars (varying heights for visual effect)
    const placeholderBars = useMemo(() => {
        return Array.from({ length: numBars }).map((_, i) => {
            const x = yOffset + i * (barW + barP);
            // Make heights somewhat varied and not full height
            const randomFactor = (i % 3 + 1) / 3; // e.g., 1/3, 2/3, 1
            const barHeight = chartHeight * 0.6 * randomFactor; // Max 60% of chart height
            const y = chartHeight - barHeight;
            return { x, y, width: barW, height: barHeight, id: `skel-bar-${i}` };
        });
    }, [numBars, barW, barP, yOffset, chartHeight]);

    // Generate placeholder X-axis ticks
    const placeholderXTicks = useMemo(() => {
        return Array.from({ length: numBars }).filter((_, i) => i % lblInt === 0).map((_, i_actual) => {
            const barIndex = i_actual * lblInt;
            const x = yOffset + barIndex * (barW + barP) + barW / 2;
            return { x, id: `skel-xtick-${barIndex}` };
        });
    }, [numBars, lblInt, barW, barP, yOffset]);

    return (
        <div className={`${cardBg} p-4 rounded-lg border ${borderColor} overflow-x-auto shadow-md`}>
            <h3 className={`text-lg font-semibold mb-4 ${titleColor}`}>Earthquake Frequency {titleSuffix}</h3>
            <div className="animate-pulse"> {/* Animation for the skeleton parts */}
                <svg width="100%" height={chartHeight + xOffset} viewBox={`0 0 ${svgW} ${chartHeight + xOffset}`} className="overflow-visible">
                    {/* Y-axis Label */}
                    <text transform={`translate(${yOffset / 3},${chartHeight / 2}) rotate(-90)`} textAnchor="middle" className={`text-xs fill-current ${axisLabelColor}`}>Count</text>

                    {/* X-axis Label */}
                    <text x={yOffset + (svgW - yOffset) / 2} y={chartHeight + xOffset - 5} textAnchor="middle" className={`text-xs fill-current ${axisLabelColor}`}>Date</text>

                    {/* Y-axis Ticks and Gridlines */}
                    {yLbls.map((l, i) => {
                        const yP = chartHeight - (l / maxYVal * chartHeight);
                        return (
                            <g key={`skel-y-tl-${i}`}>
                                <text x={yOffset - 8} y={yP + 4} textAnchor="end" className={`text-xs fill-current ${tickLabelColor}`}>{l}</text>
                                <line x1={yOffset} y1={yP} x2={svgW} y2={yP} className={`${gridLineColor} stroke-dasharray-2`} strokeDasharray="2,2"/>
                            </g>
                        );
                    })}

                    {/* Placeholder Bars */}
                    {placeholderBars.map(bar => (
                        <rect key={bar.id} x={bar.x} y={bar.y} width={bar.width} height={bar.height} className={`fill-current ${skeletonBarFillColor}`} />
                    ))}

                    {/* X-axis Ticks (simplified: just lines or small rects for text placeholder) */}
                    {placeholderXTicks.map(tick => (
                        <g key={tick.id}>
                           {/* Placeholder for tick text: a small rect */}
                           <rect x={tick.x - 15} y={chartHeight + 10} width="30" height="8" className={`fill-current ${tickLabelColor} opacity-50`} />
                        </g>
                    ))}
                     {/* Bottom line for X axis */}
                    <line x1={yOffset} y1={chartHeight} x2={svgW} y2={chartHeight} className={`${gridLineColor}`} />
                </svg>
            </div>
        </div>
    );
});

EarthquakeTimelineSVGChartSkeleton.propTypes = {
    days: PropTypes.number,
    titleSuffix: PropTypes.string,
};

export default EarthquakeTimelineSVGChartSkeleton;
