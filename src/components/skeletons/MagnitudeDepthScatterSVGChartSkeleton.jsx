import React, { useRef, useState, useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * A skeleton loader component for the MagnitudeDepthScatterSVGChart.
 * It mimics the basic structure of the chart to prevent layout shifts.
 */
const MagnitudeDepthScatterSVGChartSkeleton = React.memo(({ titleSuffix = "(Last 30 Days)" }) => {
    const cardBg = "bg-slate-700";
    const titleColor = "text-indigo-400";
    const axisLabelColor = "text-slate-400";
    const tickLabelColor = "text-slate-500";
    const gridLineColor = "text-slate-600"; // For grid lines
    const borderColor = "border-slate-600";
    const skeletonPointColor = "bg-slate-600"; // Color for placeholder points

    const chartContainerRef = useRef(null);
    // Using fixed dimensions for skeleton, similar to initial/default in the main chart
    // The main chart's dynamic resizing will take over once loaded.
    // Min width 300, height 350 from original chart.
    const [chartDimensions, setChartDimensions] = useState({ width: 500, height: 350 });

    useEffect(() => {
        // Simplified effect to set initial width based on container, if available
        // This helps the skeleton take available width like the real chart might on first render.
        const chartContainer = chartContainerRef.current;
        if (chartContainer) {
            const initialWidth = Math.max(chartContainer.clientWidth, 300);
             setChartDimensions(prevDimensions => {
                if (prevDimensions.width !== initialWidth || prevDimensions.height !== 350) {
                     return { width: initialWidth, height: 350 };
                }
                return prevDimensions;
            });
        }
    }, []);


    const { width: dynamicWidth, height: dynamicHeight } = chartDimensions;
    const p = { t: 20, r: 30, b: 50, l: 60 }; // Padding from original chart
    const chartContentWidth = dynamicWidth - p.l - p.r;
    const chartContentHeight = dynamicHeight - p.t - p.b;

    // Placeholder ticks (simplified)
    const numXTicks = 5;
    const numYTicks = 5;

    const xTicks = Array.from({ length: numXTicks }).map((_, i) => p.l + (i / (numXTicks - 1)) * chartContentWidth);
    const yTicks = Array.from({ length: numYTicks }).map((_, i) => p.t + (i / (numYTicks - 1)) * chartContentHeight);

    // Placeholder scatter points
    const scatterPoints = [
        { cx: p.l + chartContentWidth * 0.2, cy: p.t + chartContentHeight * 0.8 },
        { cx: p.l + chartContentWidth * 0.4, cy: p.t + chartContentHeight * 0.6 },
        { cx: p.l + chartContentWidth * 0.6, cy: p.t + chartContentHeight * 0.4 },
        { cx: p.l + chartContentWidth * 0.8, cy: p.t + chartContentHeight * 0.2 },
        { cx: p.l + chartContentWidth * 0.5, cy: p.t + chartContentHeight * 0.5 },
    ];

    return (
        <div ref={chartContainerRef} className={`${cardBg} p-4 rounded-lg border ${borderColor} overflow-hidden shadow-md`}>
            <h3 className={`text-lg font-semibold mb-4 ${titleColor}`}>Magnitude vs. Depth {titleSuffix}</h3>
            <div className="animate-pulse">
                <svg width="100%" height={dynamicHeight} viewBox={`0 0 ${dynamicWidth} ${dynamicHeight}`} className="overflow-visible">
                    {/* X-axis line */}
                    <line x1={p.l} y1={dynamicHeight - p.b} x2={dynamicWidth - p.r} y2={dynamicHeight - p.b} stroke="currentColor" className={gridLineColor} />
                    {/* X-axis Ticks & Labels (placeholders) */}
                    {xTicks.map((tickX, i) => (
                        <g key={`skel-xtick-${i}`}>
                            <rect x={tickX - 15} y={dynamicHeight - p.b + 10} width="30" height="8" className={`fill-current ${tickLabelColor} opacity-50`} />
                            <line x1={tickX} y1={dynamicHeight - p.b} x2={tickX} y2={dynamicHeight - p.b + 5} stroke="currentColor" className={gridLineColor} />
                        </g>
                    ))}
                    {/* X-axis Label */}
                    <text x={p.l + chartContentWidth / 2} y={dynamicHeight - p.b + 40} textAnchor="middle" className={`text-sm fill-current ${axisLabelColor}`}>Magnitude</text>

                    {/* Y-axis line */}
                    <line x1={p.l} y1={p.t} x2={p.l} y2={dynamicHeight - p.b} stroke="currentColor" className={gridLineColor} />
                    {/* Y-axis Ticks & Labels (placeholders) */}
                    {yTicks.map((tickY, i) => (
                        <g key={`skel-ytick-${i}`}>
                            <rect x={p.l - 30 - 8} y={tickY - 4} width="30" height="8" className={`fill-current ${tickLabelColor} opacity-50`} />
                            <line x1={p.l - 5} y1={tickY} x2={p.l} y2={tickY} stroke="currentColor" className={gridLineColor} />
                        </g>
                    ))}
                    {/* Y-axis Label */}
                    <text transform={`translate(${p.l / 2 - 10}, ${p.t + chartContentHeight / 2}) rotate(-90)`} textAnchor="middle" className={`text-sm fill-current ${axisLabelColor}`}>Depth (km)</text>

                    {/* Placeholder Scatter Points */}
                    {scatterPoints.map((point, i) => (
                        <circle key={`skel-point-${i}`} cx={point.cx} cy={point.cy} r="3.5" className={`fill-current ${skeletonPointColor} opacity-60`} />
                    ))}
                </svg>
            </div>
        </div>
    );
});

MagnitudeDepthScatterSVGChartSkeleton.propTypes = {
    titleSuffix: PropTypes.string,
};

export default MagnitudeDepthScatterSVGChartSkeleton;
