import React, { memo } from 'react';
import { isValidNumber, formatNumber } from '../../utils/utils.js';
import InfoSnippet from '../InfoSnippet.jsx'; // Corrected import path

// Removed NstIcon, GapIcon, DminIcon, RmsIcon as they are no longer used in the grid.

function EarthquakeLocationPanel({
    properties,
    originProductProps,
    exhibitPanelClass,
    exhibitTitleClass,
}) {
    // Conditional rendering for the entire panel
    if (!(originProductProps || (properties && (isValidNumber(properties.nst) || isValidNumber(properties.gap) || isValidNumber(properties.dmin) || isValidNumber(properties.rms))))) {
        return null;
    }

    // Data Extraction
    const nstValue = parseFloat(isValidNumber(properties?.nst) ? properties.nst : originProductProps?.['num-stations-used'] || 0);
    const gapValue = parseFloat(isValidNumber(properties?.gap) ? properties.gap : originProductProps?.['azimuthal-gap'] || 0);
    const dminValue = parseFloat(isValidNumber(properties?.dmin) ? properties.dmin : originProductProps?.['minimum-distance'] || 0);
    const rmsValue = parseFloat(isValidNumber(properties?.rms) ? properties.rms : originProductProps?.['standard-error'] || 0);

    const dminKm = dminValue * 111; // Convert dmin from degrees to km

    // SVG Constants
    const svgWidth = 400;
    const svgHeight = 330; // Adjusted height for labels
    const centerX = svgWidth / 2;
    const centerY = svgHeight / 2 - 20; // Shift center up a bit for bottom labels
    const plotRadius = Math.min(centerX, centerY) * 0.65; // Max radius for stations
    const dminPlotRadius = plotRadius * (dminValue > 0 ? Math.max(0.1, Math.min(1, dminValue / 5)) : 0.2); // dmin scaled, capped, at least 10% if present
                                                                                                    // Example: dmin 0.5deg -> 0.1*plotRadius, 2.5deg -> 0.5*plotRadius, 5+deg -> plotRadius
                                                                                                    // Ensure dminPlotRadius is less than plotRadius for other stations

    // Stations
    const stations = [];
    const displayNst = Math.min(nstValue, 20); // Cap at 20 stations for visual clarity
    const stationRadius = 4; // SVG radius for station markers

    // DMIN station (always try to plot if nst > 0 and dmin > 0)
    let dminStation = null;
    if (nstValue > 0 && dminValue > 0) {
        dminStation = { x: centerX, y: centerY - dminPlotRadius, isDmin: true };
        stations.push(dminStation);
    }

    // Other stations, considering the gap
    // Ensure gapValue is between 0 and 360
    const safeGap = Math.max(0, Math.min(360, gapValue));
    const availableAngle = 360 - safeGap;
    // If only one station (DMIN), no need for angleStep. If no DMIN, but 1 other station, place it at startAngle.
    const remainingNst = displayNst - (dminStation ? 1 : 0);
    const angleStep = remainingNst > 1 && availableAngle > 0 ? availableAngle / (remainingNst -1) : (remainingNst === 1 && availableAngle > 0 ? availableAngle : 0) ;
    let currentAngle = (safeGap / 2); // Start angle to center the distribution within the available space

    for (let i = 0; i < remainingNst; i++) {
        // For the first station if no DMIN, or for subsequent stations if DMIN exists.
        const angleRad = (currentAngle * Math.PI) / 180;
        stations.push({
            x: centerX + plotRadius * Math.cos(angleRad),
            y: centerY + plotRadius * Math.sin(angleRad),
        });
        if (remainingNst > 1) { // Avoid incrementing if only one station is to be plotted in the gap
             currentAngle += angleStep;
        }
    }

    // Epicenter style based on RMS
    const epicenterStrokeDasharray = rmsValue > 0.7 ? "4 4" : "none";

    // Azimuthal Gap Arc Path
    // Start angle for arc needs to be where the stations stop, end angle where they begin
    const arcStartAngle = (safeGap / 2) + availableAngle; // Degrees
    const arcEndAngle = safeGap / 2; // Degrees
    const startX = centerX + plotRadius * Math.cos(arcStartAngle * Math.PI / 180);
    const startY = centerY + plotRadius * Math.sin(arcStartAngle * Math.PI / 180);
    const endX = centerX + plotRadius * Math.cos(arcEndAngle * Math.PI / 180);
    const endY = centerY + plotRadius * Math.sin(arcEndAngle * Math.PI / 180);
    const largeArcFlag = safeGap > 180 ? 1 : 0;
    const gapArcPath = `M ${startX} ${startY} A ${plotRadius} ${plotRadius} 0 ${largeArcFlag} 0 ${endX} ${endY}`;


    return (
        <div className={`${exhibitPanelClass} border-sky-500`}>
            <h2 className={`${exhibitTitleClass} text-sky-800 border-sky-300`}>Pinpointing the Quake</h2>
            <p className="mb-4 text-xs md:text-sm text-gray-600">Location quality based on available data:</p>

            <div className="w-full flex justify-center items-center my-4 px-2">
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full max-w-md mx-auto bg-slate-50 rounded shadow">
                    {/* Defs for markers if needed later */}
                    <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
                        </marker>
                    defs>

                    {/* Plot Background Grid (optional decorative) */}
                    <circle cx={centerX} cy={centerY} r={plotRadius} fill="none" stroke="#e2e8f0" strokeWidth="1" />
                    <circle cx={centerX} cy={centerY} r={plotRadius * 0.5} fill="none" stroke="#e2e8f0" strokeWidth="1" />
                    <line x1={centerX - plotRadius} y1={centerY} x2={centerX + plotRadius} y2={centerY} stroke="#e2e8f0" strokeWidth="1" />
                    <line x1={centerX} y1={centerY - plotRadius} x2={centerX} y2={centerY + plotRadius} stroke="#e2e8f0" strokeWidth="1" />

                    {/* Azimuthal Gap Representation (Arc for the gap) */}
                    {nstValue > 1 && safeGap > 0 && safeGap < 360 && (
                        <path d={gapArcPath} stroke="#cbd5e1" strokeWidth="15" fill="none" opacity="0.7" />
                    )}
                     {nstValue > 1 && safeGap > 0 && safeGap < 360 && (
                         <text x={centerX} y={centerY + plotRadius + 25} textAnchor="middle" className="text-xs fill-slate-500">
                             Azimuthal Gap: {formatNumber(safeGap,0)}°
                         </text>
                     )}


                    {/* Stations */}
                    {stations.map((station, index) => (
                        <circle
                            key={index}
                            cx={station.x}
                            cy={station.y}
                            r={station.isDmin ? stationRadius + 1 : stationRadius}
                            fill={station.isDmin ? "#f59e0b" : "#0ea5e9"} // Amber for DMIN, Sky for others
                            stroke={station.isDmin ? "#d97706" : "#0284c7"}
                            strokeWidth="1"
                        />
                    ))}

                    {/* DMIN Line and Label */}
                    {dminStation && (
                        <>
                            <line
                                x1={centerX}
                                y1={centerY}
                                x2={dminStation.x}
                                y2={dminStation.y}
                                stroke="#f59e0b"
                                strokeWidth="1.5"
                                strokeDasharray="3 3"
                                markerEnd="url(#arrowhead)"
                            />
                            <text x={dminStation.x} y={dminStation.y - 10} textAnchor="middle" className="text-xs fill-amber-600">
                                DMIN: {formatNumber(dminKm, 0)} km
                            </text>
                        </>
                    )}

                    {/* Epicenter */}
                    <circle cx={centerX} cy={centerY} r="6" fill="#ef4444" stroke="#b91c1c" strokeWidth="1.5" strokeDasharray={epicenterStrokeDasharray} />
                    <text x={centerX} y={centerY - 10} textAnchor="middle" className="text-xs font-semibold fill-red-700">Epicenter</text>
                    {rmsValue > 0 && (
                         <text x={centerX} y={centerY + plotRadius + 10} textAnchor="middle" className="text-xs fill-slate-500">
                             RMS: {formatNumber(rmsValue,2)}s {epicenterStrokeDasharray !== "none" ? "(less certain)" : "(more certain)"}
                         </text>
                    )}
                     <text x={10} y={svgHeight - 10} className="text-xs fill-slate-400">NST: {nstValue}</text>


                </svg>
            </div>

            {/* InfoSnippets re-integrated below the plot */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 px-2">
                <InfoSnippet topic="stationsUsed" />
                <InfoSnippet topic="azimuthalGap" />
                <InfoSnippet topic="nearestStation" />
                <InfoSnippet topic="rmsError" />
            </div>
        </div>
    );
}

export default memo(EarthquakeLocationPanel);
