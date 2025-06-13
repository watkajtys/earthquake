import React, { useMemo, useRef, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext';
// import SkeletonBlock from './skeletons/SkeletonBlock'; // Comment out or remove
import MagnitudeDepthScatterSVGChartSkeleton from './skeletons/MagnitudeDepthScatterSVGChartSkeleton'; // New import
import { getMagnitudeColor } from '../utils/utils.js';

/**
 * Renders an SVG scatter plot visualizing the relationship between earthquake magnitude and depth.
 * This component is memoized using `React.memo` for performance.
 * It dynamically adjusts its dimensions based on the container size using `ResizeObserver`.
 *
 * The chart attempts to use pre-sampled earthquake data from `EarthquakeDataContext`
 * (e.g., `sampledEarthquakesLast7Days`, `sampledEarthquakesLast30Days`) based on the `titleSuffix` prop.
 * If corresponding sampled data isn't available, it falls back to processing the `earthquakes` prop.
 * A skeleton loader (`MagnitudeDepthScatterSVGChartSkeleton`) is displayed if `isLoading` is true.
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {Array<Object>} [props.earthquakes] - An array of earthquake feature objects. This is used as a fallback
 *   if pre-sampled data for the period indicated by `titleSuffix` is not available in context.
 *   Each object should adhere to USGS GeoJSON structure, with `properties.mag` and `geometry.coordinates[2]` (depth).
 * @param {string} [props.titleSuffix='(Last 30 Days)'] - Suffix for the chart's title (e.g., "(Last 7 Days)", "(Last 30 Days)").
 *   This suffix also influences which sampled dataset is attempted to be loaded from context.
 * @param {boolean} props.isLoading - Flag indicating whether data is currently loading. If true, a skeleton loader is displayed.
 * @returns {JSX.Element} The MagnitudeDepthScatterSVGChart component.
 */
const MagnitudeDepthScatterSVGChart = React.memo(({earthquakes, titleSuffix = "(Last 30 Days)", isLoading}) => {
    const { sampledEarthquakesLast7Days, sampledEarthquakesLast14Days, sampledEarthquakesLast30Days } = useEarthquakeDataState();
    const cardBg = "bg-slate-700";
    const titleColor = "text-indigo-400";
    const axisLabelColor = "text-slate-400";
    const tickLabelColor = "text-slate-500";
    const gridLineColor = "text-slate-600";
    const borderColor = "border-slate-600";
    const chartContainerRef = useRef(null); // This ref is for the actual chart, not the skeleton
    const [chartDimensions, setChartDimensions] = useState({ width: 500, height: 350 });

    useEffect(() => {
        const chartContainer = chartContainerRef.current;
        if (!chartContainer) return;

        const resizeObserver = new ResizeObserver(entries => {
            if (!entries || !entries.length) return;
            const { width: observedWidth } = entries[0].contentRect;
            const newWidth = Math.max(observedWidth, 300);
            const newHeight = 350;

            setChartDimensions(prevDimensions => {
                if (prevDimensions.width !== newWidth || prevDimensions.height !== newHeight) {
                    return { width: newWidth, height: newHeight };
                }
                return prevDimensions;
            });
        });
        resizeObserver.observe(chartContainer);

        const initialWidth = Math.max(chartContainer.clientWidth, 300);
        setChartDimensions(prevDimensions => {
            if (prevDimensions.width !== initialWidth || prevDimensions.height !== 350) {
                return { width: initialWidth, height: 350 };
            }
            return prevDimensions;
        });

        return () => {
            if (chartContainer) {
                resizeObserver.unobserve(chartContainer);
            }
        };
    }, []); // Empty dependency array means this effect runs once on mount and cleanup on unmount

    const data = useMemo(() => {
        let sourceEarthquakes = earthquakes;
        if (titleSuffix === "(Last 7 Days)" && sampledEarthquakesLast7Days) {
            sourceEarthquakes = sampledEarthquakesLast7Days;
        } else if (titleSuffix === "(Last 14 Days)" && sampledEarthquakesLast14Days) {
            sourceEarthquakes = sampledEarthquakesLast14Days;
        } else if (titleSuffix === "(Last 30 Days)" && sampledEarthquakesLast30Days) {
            sourceEarthquakes = sampledEarthquakesLast30Days;
        }
        if (!sourceEarthquakes) return [];
        return sourceEarthquakes.map(q => ({
            mag: q.properties.mag,
            depth: q.geometry?.coordinates?.[2],
            id: q.id,
            place: q.properties.place
        })).filter(q => q.mag !== null && typeof q.mag === 'number' && q.depth !== null && typeof q.depth === 'number');
    }, [earthquakes, titleSuffix, sampledEarthquakesLast7Days, sampledEarthquakesLast14Days, sampledEarthquakesLast30Days]);

    // Use the new skeleton component when isLoading is true
    if (isLoading) return <MagnitudeDepthScatterSVGChartSkeleton titleSuffix={titleSuffix} />;

    // Pass the chartContainerRef to the actual chart's div, not the skeleton
    if (!data || data.length === 0) return <div ref={chartContainerRef} className={`${cardBg} p-4 rounded-lg border ${borderColor} overflow-hidden shadow-md`}><h3 className={`text-lg font-semibold mb-4 ${titleColor}`}>Magnitude vs. Depth {titleSuffix}</h3><p className="text-slate-400 p-4 text-center text-sm">No sufficient data for chart.</p></div>;

    const { width: dynamicWidth, height: dynamicHeight } = chartDimensions;
    const p = {t: 20, r: 30, b: 50, l: 60};
    const chartContentWidth = dynamicWidth - p.l - p.r;
    const chartContentHeight = dynamicHeight - p.t - p.b;

    const mags = data.map(d => d.mag);
    // const depths = data.map(d => d.depth); // Will be calculated below
    const minMag = mags.length > 0 ? Math.min(...mags) : 0;
    const maxMag = mags.length > 0 ? Math.max(...mags) : 0;
    // const minDepth = depths.length > 0 ? Math.min(...depths) : 0; // Will be replaced by dataMinDepth
    // const maxDepth = depths.length > 0 ? Math.max(...depths) : 0; // Will be replaced by dataMaxDepth

    const depths = data.map(d => d.depth);
    const dataMinDepth = depths.length > 0 ? Math.min(...depths) : 0;
    const dataMaxDepth = depths.length > 0 ? Math.max(...depths) : 0;

    let effectiveMinDepth, effectiveMaxDepth;

    if (dataMinDepth === dataMaxDepth) {
        const padding = dataMaxDepth === 0 ? 5 : Math.abs(dataMaxDepth * 0.15); // 15% padding, or 5 units if depth is 0
        effectiveMinDepth = dataMinDepth - padding;
        effectiveMaxDepth = dataMaxDepth + padding;
    } else {
        const depthRange = dataMaxDepth - dataMinDepth;
        const padding = depthRange * 0.1; // 10% padding top and bottom
        effectiveMinDepth = dataMinDepth - padding;
        effectiveMaxDepth = dataMaxDepth + padding;
    }

    // Ensure effectiveMinDepth does not go below 0 if actual dataMinDepth is non-negative.
    if (dataMinDepth >= 0 && effectiveMinDepth < 0) {
        effectiveMinDepth = 0;
    }
    // Ensure there's a minimal range if effectiveMinDepth and effectiveMaxDepth end up being the same after padding logic.
    // For example, if dataMinDepth is 0, padding calculation might still result in effectiveMinDepth being 0.
    // Or if dataMinDepth and dataMaxDepth are equal.
    if (effectiveMinDepth >= effectiveMaxDepth) {
      effectiveMaxDepth = effectiveMinDepth + 1; // Add a small amount to ensure a positive range for the scale.
    }

    const xScale = (value) => (maxMag === minMag) ? p.l + chartContentWidth / 2 : p.l + ((value - minMag) / (maxMag - minMag)) * chartContentWidth;
    const yScale = (value) => {
        if (effectiveMaxDepth <= effectiveMinDepth) { // Check for zero or negative range
            return p.t + chartContentHeight / 2; // Single point or invalid range, center it
        }
        // Clamp value to the effective domain to prevent points drawing outside due to floating point math
        const clampedValue = Math.max(effectiveMinDepth, Math.min(effectiveMaxDepth, value));
        return p.t + ((clampedValue - effectiveMinDepth) / (effectiveMaxDepth - effectiveMinDepth)) * chartContentHeight;
    };

    const xTicks = [];
    const numXTicks = Math.max(2, Math.min(Math.floor(chartContentWidth / 80), 7));
    if (maxMag > minMag) {
        const xStep = (maxMag - minMag) / (numXTicks -1) || 1;
        for (let i = 0; i < numXTicks; i++) xTicks.push(parseFloat((minMag + i * xStep).toFixed(1)));
    } else {
        xTicks.push(minMag.toFixed(1));
    }

    const yTicks = (() => {
        const ticks = [];
        // Aim for a dynamic number of ticks based on available height, e.g., 40px per tick label space
        const numTargetYTicks = Math.max(2, Math.min(Math.floor(chartContentHeight / 40), 5));

        if (effectiveMaxDepth <= effectiveMinDepth) {
            ticks.push(Number(effectiveMinDepth.toFixed(1)));
            // If range was corrected to be minimal (e.g. effectiveMaxDepth = effectiveMinDepth + 1)
            // ensure that tick is also added if different.
            if (effectiveMaxDepth > effectiveMinDepth) {
                 ticks.push(Number(effectiveMaxDepth.toFixed(1)));
            }
            return [...new Set(ticks)].sort((a,b)=>a-b);
        }

        const range = effectiveMaxDepth - effectiveMinDepth;
        // Calculate a "nice" step value
        let step = Math.pow(10, Math.floor(Math.log10(range / Math.max(1, numTargetYTicks -1 ))));
        const errorFactor = range / (step * (numTargetYTicks - 1));

        // Adjust step based on error factor to get nicer intervals (e.g., 1, 2, 5, 10)
        if (errorFactor > 5) step *= 5; // If step is too small, increase it
        else if (errorFactor > 2) step *= 2;
        else if (errorFactor < 0.5) step /=2; // If step is too large, decrease it


        let firstTick = Math.floor(effectiveMinDepth / step) * step;
         // Adjust firstTick to be at or after effectiveMinDepth
        while(firstTick < effectiveMinDepth - 1e-9) { // Use epsilon for float comparison
            firstTick += step;
        }
        // If firstTick is now slightly above effectiveMinDepth due to adjustments, consider starting from effectiveMinDepth itself
        if (Math.abs(firstTick - effectiveMinDepth) > step * 0.5 && firstTick > effectiveMinDepth) {
            // ticks.push(Number(effectiveMinDepth.toFixed(1))); // Optional: force include effectiveMinDepth
        }


        for (let currentTick = firstTick; currentTick <= effectiveMaxDepth + 1e-9; currentTick += step) {
            ticks.push(Number(currentTick.toFixed(1)));
        }

        // Fallback if no ticks generated
        if (ticks.length === 0) {
            ticks.push(Number(effectiveMinDepth.toFixed(1)));
            if (effectiveMaxDepth !== effectiveMinDepth) { // Check again, as it might have been adjusted
                ticks.push(Number(effectiveMaxDepth.toFixed(1)));
            }
        }

        // Post-process ticks: filter to be within bounds, unique, and sorted.
        let finalTicks = [...new Set(ticks)]
            .sort((a, b) => a - b)
            .filter(tick => tick >= effectiveMinDepth - 1e-9 && tick <= effectiveMaxDepth + 1e-9);

        // If filtering removed all ticks (e.g. very narrow range and step logic was too aggressive)
        // ensure at least min and max are present.
        if (finalTicks.length === 0) {
            finalTicks.push(Number(effectiveMinDepth.toFixed(1)));
            if (effectiveMaxDepth !== effectiveMinDepth) {
                 finalTicks.push(Number(effectiveMaxDepth.toFixed(1)));
            }
            finalTicks = [...new Set(finalTicks)].sort((a,b) => a-b);
        }

        return finalTicks;
    })();
    const memoizedGetMagnitudeColor = getMagnitudeColor;

    return (
        <div ref={chartContainerRef} className={`${cardBg} p-4 rounded-lg border ${borderColor} overflow-hidden shadow-md`}>
            <h3 className={`text-lg font-semibold mb-4 ${titleColor}`}>Magnitude vs. Depth {titleSuffix}</h3>
            <svg width="100%" height={dynamicHeight} viewBox={`0 0 ${dynamicWidth} ${dynamicHeight}`} className="overflow-visible">
                <line x1={p.l} y1={dynamicHeight - p.b} x2={dynamicWidth - p.r} y2={dynamicHeight - p.b} stroke="currentColor" className={gridLineColor}/>
                {xTicks.map((tick, i) => (
                    <g key={`xtick-${tick}-${i}`}>
                        <text x={xScale(tick)} y={dynamicHeight - p.b + 20} textAnchor="middle" className={`text-xs fill-current ${tickLabelColor}`}>{tick}</text>
                        <line x1={xScale(tick)} y1={dynamicHeight - p.b} x2={xScale(tick)} y2={dynamicHeight - p.b + 5} stroke="currentColor" className={gridLineColor}/>
                    </g>
                ))}
                <text x={p.l + chartContentWidth / 2} y={dynamicHeight - p.b + 40} textAnchor="middle" className={`text-sm fill-current ${axisLabelColor}`}>Magnitude</text>
                <line x1={p.l} y1={p.t} x2={p.l} y2={dynamicHeight - p.b} stroke="currentColor" className={gridLineColor}/>
                {yTicks.map(tick => (<g key={`ytick-${tick}`}><text x={p.l - 10} y={yScale(tick) + 4} textAnchor="end" className={`text-xs fill-current ${tickLabelColor}`}>{tick}</text><line x1={p.l - 5} y1={yScale(tick)} x2={p.l} y2={yScale(tick)} stroke="currentColor" className={gridLineColor}/></g>))}
                <text transform={`translate(${p.l / 2 - 10}, ${p.t + chartContentHeight / 2}) rotate(-90)`} textAnchor="middle" className={`text-sm fill-current ${axisLabelColor}`}>Depth (km)</text>
                {data.map(point => (<circle key={point.id} cx={xScale(point.mag)} cy={yScale(point.depth)} r="3.5" fill={memoizedGetMagnitudeColor(point.mag)} fillOpacity="0.7" className="hover:opacity-100 transition-opacity"><title>{`M:${point.mag?.toFixed(1)}, Depth:${point.depth?.toFixed(1)}km - ${point.place}`}</title></circle>))}
            </svg>
        </div>
    );
});

MagnitudeDepthScatterSVGChart.propTypes = {
    earthquakes: PropTypes.array,
    titleSuffix: PropTypes.string,
    isLoading: PropTypes.bool,
};

export default MagnitudeDepthScatterSVGChart;
