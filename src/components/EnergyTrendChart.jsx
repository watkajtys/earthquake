import React from 'react';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx';

// Simplified formatter for axis labels, showing only units for large numbers
const formatEnergyForAxis = (joules) => {
    if (joules === 0) return '0 J';
    if (joules < 1e3) return `${joules} J`; // Keep small values as J
    if (joules < 1e6) return `${(joules / 1e3).toFixed(1)} kJ`;
    if (joules < 1e9) return `${(joules / 1e6).toFixed(1)} MJ`;
    if (joules < 1e12) return `${(joules / 1e9).toFixed(1)} GJ`;
    if (joules < 1e15) return `${(joules / 1e12).toFixed(1)} TJ`;
    return `${(joules / 1e15).toFixed(1)} PJ`;
};

// More precise formatter for tooltips (similar to SeismicEnergyDisplay)
const formatEnergyForTooltip = (joules) => {
    if (joules === null || joules === undefined || joules === 0) {
        return '0 J';
    }
    const units = [
        { threshold: 1e15, unit: 'PJ' },
        { threshold: 1e12, unit: 'TJ' },
        { threshold: 1e9, unit: 'GJ' },
        { threshold: 1e6, unit: 'MJ' },
        { threshold: 1e3, unit: 'kJ' },
    ];
    for (const { threshold, unit } of units) {
        if (joules >= threshold) {
            return `${(joules / threshold).toFixed(2)} ${unit}`;
        }
    }
    return `${joules.toFixed(0)} J`;
};


export const EnergyTrendChart = ({ title = "Daily Seismic Energy Trend (Last 30 Days)" }) => {
    const { dailyEnergyTrend, energyComparisonError } = useEarthquakeDataState();

    // SVG Dimensions and Margins
    const svgWidth = 450;
    const svgHeight = 220;
    const margin = { top: 20, right: 20, bottom: 50, left: 60 }; // Increased bottom for x-axis labels, left for y-axis
    const chartWidth = svgWidth - margin.left - margin.right;
    const chartHeight = svgHeight - margin.top - margin.bottom;

    if (energyComparisonError) { // Though less likely for trend, good to check
        return (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative shadow-md text-sm" role="alert">
                <strong className="font-bold">Error:</strong>
                <span className="block sm:inline"> Could not load energy trend data due to a previous error: {energyComparisonError}</span>
            </div>
        );
    }

    if (!dailyEnergyTrend || dailyEnergyTrend.length === 0) {
        return (
            <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md text-sm text-slate-200">
                {title && <h3 className="text-md font-semibold mb-2 text-indigo-400">{title}</h3>}
                <p className="text-slate-400">Loading trend data or data unavailable...</p>
            </div>
        );
    }

    const maxEnergy = Math.max(...dailyEnergyTrend.map(d => d.energy), 0);

    // Scales
    const xScale = (index) => (index / dailyEnergyTrend.length) * chartWidth;
    const yScale = (energyValue) => chartHeight - (energyValue / (maxEnergy > 0 ? maxEnergy : 1)) * chartHeight; // Avoid division by zero if maxEnergy is 0

    const barWidth = chartWidth / dailyEnergyTrend.length - 2; // -2 for some spacing

    // Y-axis ticks (simplified: 0, half, max)
    const yTicks = [
        { value: 0, label: '0 J' },
        ...(maxEnergy > 0 ? [
            { value: maxEnergy / 2, label: formatEnergyForAxis(maxEnergy / 2) },
            { value: maxEnergy, label: formatEnergyForAxis(maxEnergy) }
        ] : [])
    ];

    // X-axis ticks (simplified: first, middle, last date)
    const xTickData = [];
    if (dailyEnergyTrend.length > 0) {
        xTickData.push({ index: 0, label: dailyEnergyTrend[0].dateString });
        if (dailyEnergyTrend.length > 15) { // Add middle tick if data is substantial
             xTickData.push({ index: Math.floor(dailyEnergyTrend.length / 2), label: dailyEnergyTrend[Math.floor(dailyEnergyTrend.length / 2)].dateString });
        }
        if (dailyEnergyTrend.length > 1) { // Ensure not to repeat if only 1 item
            xTickData.push({ index: dailyEnergyTrend.length - 1, label: dailyEnergyTrend[dailyEnergyTrend.length - 1].dateString });
        }
    }


    return (
        <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 shadow-xl text-sm text-slate-300">
            {title && <h3 className="text-lg font-semibold mb-3 text-indigo-300">{title}</h3>}
            <svg width={svgWidth} height={svgHeight} aria-labelledby="chart-title" role="graphics-document">
                <title id="chart-title">{title}</title>
                <g transform={`translate(${margin.left}, ${margin.top})`}>
                    {/* Y-axis Line */}
                    <line x1="0" y1="0" x2="0" y2={chartHeight} stroke="#a0aec0" strokeWidth="1" />
                    {/* Y-axis Ticks and Labels */}
                    {yTicks.map(tick => (
                        <g key={`y-tick-${tick.value}`} transform={`translate(0, ${yScale(tick.value)})`}>
                            <line x1="-5" y1="0" x2="0" y2="0" stroke="#a0aec0" strokeWidth="1" />
                            <text x="-10" y="3" fill="#a0aec0" textAnchor="end" fontSize="10px">
                                {tick.label}
                            </text>
                        </g>
                    ))}

                    {/* X-axis Line */}
                    <line x1="0" y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="#a0aec0" strokeWidth="1" />
                     {/* X-axis Ticks and Labels */}
                    {xTickData.map(tick => (
                        <g key={`x-tick-${tick.index}`} transform={`translate(${xScale(tick.index) + barWidth / 2}, ${chartHeight})`}>
                            <text y="15" fill="#a0aec0" textAnchor="middle" fontSize="10px">
                                {tick.label}
                            </text>
                        </g>
                    ))}

                    {/* Bars */}
                    {dailyEnergyTrend.map((dataPoint, index) => {
                        const barHeight = chartHeight - yScale(dataPoint.energy);
                        const xPos = xScale(index);
                        const yPos = yScale(dataPoint.energy);

                        return (
                            <rect
                                key={dataPoint.dateString || index}
                                x={xPos}
                                y={yPos}
                                width={Math.max(0, barWidth)} // Ensure width is not negative
                                height={Math.max(0, barHeight)} // Ensure height is not negative
                                fill={dataPoint.energy > 0 ? "rgba(59, 130, 246, 0.7)" : "#4a5568"} // blue-500 with opacity, gray for zero
                                className="hover:fill-blue-400 transition-colors duration-150"
                                rx="1" // Slightly rounded corners for bars
                            >
                                <title>{`${dataPoint.dateString}: ${formatEnergyForTooltip(dataPoint.energy)}`}</title>
                            </rect>
                        );
                    })}
                </g>
            </svg>
        </div>
    );
};

export default EnergyTrendChart;
