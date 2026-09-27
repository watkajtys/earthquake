import React, { memo } from 'react';
import InfoSnippet from '../InfoSnippet.jsx';
import { formatNumber } from '../../utils/utils.js';
import { projectAxis } from '../../utils/focalMechanismUtils.js';

function EarthquakeStressAxesPanel({
    pAxis,
    tAxis,
    exhibitPanelClass,
    exhibitTitleClass,
    diagramContainerClass,
    captionClass
}) {
    const axes = [
        { name: 'P', label: 'compressional', color: '#b91c1c', value: pAxis },
        { name: 'T', label: 'extensional', color: '#1d4ed8', value: tAxis }
    ];
    if (!axes.some(({ value }) => Number.isFinite(value?.azimuth) || Number.isFinite(value?.plunge))) return null;
    const plottedAxes = axes.map((axis) => ({ ...axis, point: projectAxis(axis.value, 100, 72) }));

    return (
        <div className={`${exhibitPanelClass} border-lime-500`}>
            <h2 className={`${exhibitTitleClass} text-lime-800 border-lime-200`}>P and T Axes of the Earthquake</h2>
            <div className={`${diagramContainerClass} bg-green-50 py-4 flex flex-col sm:flex-row items-center justify-center gap-4`}>
                <svg width="220" height="220" viewBox="0 0 200 200" className="max-w-full shrink-0" role="img" aria-label="P and T axis orientations in a lower-hemisphere equal-area projection, north up and east right">
                    <circle cx="100" cy="100" r="72" fill="#fff" stroke="#64748b" strokeWidth="1.5" />
                    <circle cx="100" cy="100" r={72 * Math.sqrt(0.5)} fill="none" stroke="#cbd5e1" strokeDasharray="3 3" />
                    <path d="M100 28 V172 M28 100 H172" stroke="#e2e8f0" />
                    <circle cx="100" cy="100" r="2" fill="#64748b" />
                    <g fontSize="12" fill="#334155" textAnchor="middle">
                        <text x="100" y="16">N</text><text x="185" y="104">E</text>
                        <text x="100" y="191">S</text><text x="15" y="104">W</text>
                    </g>
                    {plottedAxes.filter(({ point }) => point).map(({ name, color, point }) => (
                        <g key={name}>
                            <circle data-testid={`${name.toLowerCase()}-axis-point`} cx={point.x} cy={point.y} r="8" fill={color} stroke="white" strokeWidth="1" />
                            <text x={point.x} y={point.y + 3.5} textAnchor="middle" fontSize="10" fontWeight="bold" fill="white">{name}</text>
                        </g>
                    ))}
                </svg>
                <div className="text-xs text-slate-700 space-y-3 px-3">
                    {plottedAxes.map(({ name, label, color, value, point }) => (
                        <p key={name}>
                            <strong style={{ color }}>{name} · {label} axis</strong><br />
                            Azimuth: {Number.isFinite(value?.azimuth) ? `${formatNumber(value.azimuth, 0)}°` : 'unavailable'}<br />
                            Plunge: {Number.isFinite(value?.plunge) ? `${formatNumber(value.plunge, 0)}°` : 'unavailable'}
                            {!point && <><br /><span>Not plotted: a valid azimuth and plunge are both required.</span></>}
                        </p>
                    ))}
                    <p>Plunge: edge = 0° (horizontal),<br />dashed ring = 30°, center = 90° (vertical).</p>
                </div>
            </div>
            <p className={captionClass}>
                These are the source mechanism’s compressional (P) and extensional (T) axes.
                They are not direct measurements of regional stress or arrows showing block motion.
                Points show each axis’s downward end in a lower-hemisphere equal-area projection;
                azimuth is clockwise from north and plunge is below horizontal.
            </p>
            <InfoSnippet topic="stressAxes" />
        </div>
    );
}

export default memo(EarthquakeStressAxesPanel);
