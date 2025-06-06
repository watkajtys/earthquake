import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext';
// import SkeletonBlock from './skeletons/SkeletonBlock'; // Comment out or remove
import MagnitudeDepthScatterSVGChartSkeleton from './skeletons/MagnitudeDepthScatterSVGChartSkeleton'; // New import
import { getMagnitudeColor } from '../utils/utils.js';

/**
 * A React component that displays an SVG scatter plot of earthquake magnitude versus depth.
 * It uses a ResizeObserver to dynamically adjust chart dimensions.
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
    const depths = data.map(d => d.depth);
    const minMag = mags.length > 0 ? Math.min(...mags) : 0;
    const maxMag = mags.length > 0 ? Math.max(...mags) : 0;
    const minDepth = depths.length > 0 ? Math.min(...depths) : 0;
    const maxDepth = depths.length > 0 ? Math.max(...depths) : 0;

    const xScale = (value) => (maxMag === minMag) ? p.l + chartContentWidth / 2 : p.l + ((value - minMag) / (maxMag - minMag)) * chartContentWidth;
    const yScale = (value) => (maxDepth === minDepth) ? p.t + chartContentHeight / 2 : p.t + ((value - minDepth) / (maxDepth - minDepth)) * chartContentHeight;

    const xTicks = [];
    const numXTicks = Math.max(2, Math.min(Math.floor(chartContentWidth / 80), 7));
    if (maxMag > minMag) {
        const xStep = (maxMag - minMag) / (numXTicks -1) || 1;
        for (let i = 0; i < numXTicks; i++) xTicks.push(parseFloat((minMag + i * xStep).toFixed(1)));
    } else {
        xTicks.push(minMag.toFixed(1));
    }

    const yTicks = [];
    const numYTicks = Math.max(2, Math.min(Math.floor(chartContentHeight / 50), 7));
    if (maxDepth > minDepth) {
        const yStep = (maxDepth - minDepth) / (numYTicks-1) || 1;
        for (let i = 0; i < numYTicks; i++) yTicks.push(Math.round(minDepth + i * yStep));
    } else {
        yTicks.push(Math.round(minDepth));
    }
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

export default MagnitudeDepthScatterSVGChart;
