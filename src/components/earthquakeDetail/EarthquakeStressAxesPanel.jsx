import React, { memo } from 'react';
import InfoSnippet from '../InfoSnippet.jsx'; // Adjusted import path
import { isValidNumber, formatNumber } from '../../utils/detailViewUtils.js';

function EarthquakeStressAxesPanel({
    pAxis,
    tAxis,
    // isValidNumber, // Now imported
    // formatNumber, // Now imported
    exhibitPanelClass,
    exhibitTitleClass,
    diagramContainerClass,
    captionClass
}) {
    // Conditional rendering based on the original logic
    if (!(pAxis && tAxis && (isValidNumber(pAxis.azimuth) || isValidNumber(pAxis.plunge) || isValidNumber(tAxis.azimuth) || isValidNumber(tAxis.plunge)))) { // isValidNumber is now imported
        return null;
    }

    return (
        <div className={`${exhibitPanelClass} border-lime-500`}>
            <h2 className={`${exhibitTitleClass} text-lime-800 border-lime-200 flex justify-between items-center`}>
                <span>What Pushed and Pulled? (Stress Axes)</span>
            </h2>
            <div className={`${diagramContainerClass} bg-green-50 py-4`} style={{minHeight: '200px'}}>
                <svg width="280" height="180" viewBox="0 0 280 180">
                    <defs>
                        <marker id="arrRedDetailPushCleanStress" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto" fill="#dc2626">
                            <polygon points="0 3.5, 10 0, 10 7" />
                        </marker>
                        <marker id="arrBlueDetailPullCleanStress" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto" fill="#2563eb">
                            <polygon points="0 0, 10 3.5, 0 7" />
                        </marker>
                    </defs>
                    <rect x="100" y="50" width="80" height="80" fill="#d1fae5" stroke="#065f46" strokeWidth="1.5"/>
                    <text x="140" y="95" fontFamily="Inter, sans-serif" fontSize="11" fill="#047857" textAnchor="middle">Crust</text>
                    <text x="140" y="107" fontFamily="Inter, sans-serif" fontSize="11" fill="#047857" textAnchor="middle">Block</text>
                    {isValidNumber(pAxis.azimuth) && (
                        <>
                            <line x1="30" y1="90" x2="95" y2="90" stroke="#dc2626" strokeWidth="3" markerEnd="url(#arrRedDetailPushCleanStress)" />
                            <line x1="250" y1="90" x2="185" y2="90" stroke="#dc2626" strokeWidth="3" markerEnd="url(#arrRedDetailPushCleanStress)" />
                            <text x="45" y="115" fontSize="10" fill="#b91c1c" textAnchor="middle">SQUEEZE</text>
                            <text x="45" y="128" fontSize="10" fill="#b91c1c" textAnchor="middle">(P-axis: {formatNumber(pAxis.azimuth,0)}°)</text>
                            <text x="235" y="115" fontSize="10" fill="#b91c1c" textAnchor="middle">SQUEEZE</text>
                            <text x="235" y="128" fontSize="10" fill="#b91c1c" textAnchor="middle">(P-axis: {formatNumber(pAxis.azimuth,0)}°)</text>
                        </>
                    )}
                    {isValidNumber(tAxis.azimuth) && (
                        <>
                            <line x1="140" y1="45" x2="140" y2="15" stroke="#2563eb" strokeWidth="3" markerStart="url(#arrBlueDetailPullCleanStress)" />
                            <line x1="140" y1="135" x2="140" y2="165" stroke="#2563eb" strokeWidth="3" markerStart="url(#arrBlueDetailPullCleanStress)" />
                            <text x="140" y="30" fontSize="10" fill="#1d4ed8" textAnchor="middle">STRETCH (T-axis: {formatNumber(tAxis.azimuth,0)}°)</text>
                            <text x="140" y="155" fontSize="10" fill="#1d4ed8" textAnchor="middle">STRETCH (T-axis: {formatNumber(tAxis.azimuth,0)}°)</text>
                        </>
                    )}
                </svg>
            </div>
            <p className={captionClass}>
                P-axis (Pressure) shows main squeeze direction, T-axis (Tension) shows main stretch. The labeled degrees indicate the compass orientation of these forces.
                <InfoSnippet topic="stressAxes" />
            </p>
        </div>
    );
}

export default memo(EarthquakeStressAxesPanel);
