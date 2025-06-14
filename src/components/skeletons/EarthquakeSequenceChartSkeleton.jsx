import React, { useMemo } from 'react';

// Base styling from EarthquakeSequenceChart & EarthquakeTimelineSVGChartSkeleton
const cardBg = "bg-slate-700";
// const titleColor = "text-indigo-400"; // Unused: Match main chart title
// const axisLabelColor = "text-slate-400"; // Unused
const tickLabelColor = "text-slate-500"; // For placeholder text rects
const placeholderElementColor = "bg-slate-600"; // For larger rects like plot area, circles
const gridLineColor = "stroke-slate-600";

const EarthquakeSequenceChartSkeleton = React.memo(() => {
    // Dimensions approximated from EarthquakeSequenceChart
    const svgContainerWidth = "100%"; // Matches the chart's container
    const chartHeight = 350; // Fixed height like in the main chart
    const margin = { top: 40, right: 50, bottom: 60, left: 60 };

    const width = 800 - margin.left - margin.right; // Assuming a common default width for skeleton calculation
    const height = chartHeight - margin.top - margin.bottom;

    // Placeholder Y-axis Ticks (e.g., 0, 1, 2, 3, 4, 5)
    const yAxisTicks = useMemo(() => {
        const numTicks = 6;
        return Array.from({ length: numTicks }).map((_, i) => ({
            y: height - (i * (height / (numTicks -1 ))), // Distribute along Y axis
            id: `skel-y-tick-${i}`
        }));
    }, [height]);

    // Placeholder X-axis Ticks
    const xAxisTicks = useMemo(() => {
        const numTicks = Math.floor(width / 100); // Approx 1 tick per 100px
        return Array.from({ length: numTicks }).map((_, i) => ({
            x: (i * (width / (numTicks -1 ))), // Distribute along X axis
            id: `skel-x-tick-${i}`
        }));
    }, [width]);

    // Placeholder circles (a few scattered)
    const placeholderCircles = useMemo(() => {
        return [
            { cx: width * 0.2, cy: height * 0.7, r: 5, id: 'skel-c1' },
            { cx: width * 0.4, cy: height * 0.5, r: 8, id: 'skel-c2', isMain: true }, // Mock mainshock
            { cx: width * 0.6, cy: height * 0.6, r: 5, id: 'skel-c3' },
            { cx: width * 0.8, cy: height * 0.4, r: 5, id: 'skel-c4' },
        ];
    }, [width, height]);

    return (
        <div className={`${cardBg} p-4 rounded-lg border border-slate-600 shadow-md`}>
            {/* Title Placeholder */}
            <div className={`h-6 w-3/4 mb-4 ${placeholderElementColor} rounded animate-pulse mx-auto`}></div>

            <div className="animate-pulse">
                <svg width={svgContainerWidth} height={chartHeight} viewBox={`0 0 ${width + margin.left + margin.right} ${chartHeight}`}>
                    <g transform={`translate(${margin.left},${margin.top})`}>
                        {/* Plot Area Background (optional, can show bounds) */}
                        <rect x="0" y="0" width={width} height={height} className={`fill-current ${placeholderElementColor} opacity-30`} />

                        {/* Y-Axis Label Placeholder */}
                        <rect transform={`translate(${-margin.left / 1.5 +10}, ${height / 2 - 20}) rotate(-90)`} width="40" height="10" className={`fill-current ${tickLabelColor} opacity-50`} />


                        {/* Y-Axis Ticks and Gridlines */}
                        {yAxisTicks.map(tick => (
                            <g key={tick.id}>
                                <rect x={-30} y={tick.y - 4} width="20" height="8" className={`fill-current ${tickLabelColor} opacity-50`} />
                                <line x1={0} x2={width} y1={tick.y} y2={tick.y} className={`${gridLineColor} stroke-dasharray-2 opacity-50`} strokeDasharray="2,2" />
                            </g>
                        ))}
                         {/* Y-Axis Line */}
                        <line x1={0} y1={0} x2={0} y2={height} className={gridLineColor} />


                        {/* X-Axis Ticks and Gridlines */}
                        {xAxisTicks.map(tick => (
                             <g key={tick.id}>
                                <rect x={tick.x - 15} y={height + 10} width="30" height="8" className={`fill-current ${tickLabelColor} opacity-50`} />
                                <line x1={tick.x} x2={tick.x} y1={0} y2={height} className={`${gridLineColor} stroke-dasharray-2 opacity-50`} strokeDasharray="2,2" />
                            </g>
                        ))}
                        {/* X-Axis Line */}
                        <line x1={0} y1={height} x2={width} y2={height} className={gridLineColor} />

                        {/* Placeholder Circles */}
                        {placeholderCircles.map(circle => (
                            <circle
                                key={circle.id}
                                cx={circle.cx}
                                cy={circle.cy}
                                r={circle.r}
                                className={`fill-current ${circle.isMain ? 'stroke-slate-500' : placeholderElementColor} ${circle.isMain ? 'fill-transparent' : ''}`}
                                strokeWidth={circle.isMain ? 2 : 0}
                            />
                        ))}
                         {/* Mock Mainshock Label */}
                        <rect x={placeholderCircles[1].cx + 15} y={placeholderCircles[1].cy -5} width="100" height="10" className={`fill-current ${tickLabelColor} opacity-50`} />

                    </g>
                </svg>
            </div>
        </div>
    );
});

export default EarthquakeSequenceChartSkeleton;
