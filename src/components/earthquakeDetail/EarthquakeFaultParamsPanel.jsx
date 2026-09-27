import React, { memo, useId } from 'react';
import InfoSnippet from '../InfoSnippet.jsx';
import { formatNumber } from '../../utils/utils.js';

const radians = (degrees) => degrees * Math.PI / 180;

function EarthquakeFaultParamsPanel({
    selectedFaultPlaneKey,
    selectedFaultPlane,
    exhibitPanelClass,
    exhibitTitleClass
}) {
    const markerId = useId().replace(/:/g, '');
    const strike = selectedFaultPlane?.strike;
    const dip = selectedFaultPlane?.dip;
    const rake = selectedFaultPlane?.rake;
    const hasStrike = Number.isFinite(strike) && strike >= 0 && strike <= 360;
    const hasDip = Number.isFinite(dip) && dip >= 0 && dip <= 90;
    const hasRake = Number.isFinite(rake) && rake >= -180 && rake <= 180;
    if (!hasStrike && !hasDip && !hasRake) return null;

    const strikeX = 38 * Math.sin(radians(strike));
    const strikeY = -38 * Math.cos(radians(strike));
    const dipX = 80 * Math.cos(radians(dip));
    const dipY = 80 * Math.sin(radians(dip));
    const rakeX = 42 * Math.cos(radians(rake));
    const rakeY = -42 * Math.sin(radians(rake));

    return (
        <div className={`${exhibitPanelClass} border-green-500`}>
            <h2 className={`${exhibitTitleClass} text-green-800 border-green-200`}>Decoding the Fault Parameters</h2>
            <p className="text-xs text-slate-600 mb-3">
                Parameters for <strong className="font-semibold text-indigo-600">{selectedFaultPlaneKey === 'np1' ? 'Nodal Plane 1' : 'Nodal Plane 2'}</strong>,
                one of two possible planes. These angles alone do not identify which plane ruptured.
            </p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {hasStrike && (
                    <div className="flex flex-col">
                        <div className="p-2 bg-blue-50 rounded-lg shadow text-center flex flex-col justify-between min-h-[220px]">
                            <strong className="block text-blue-700 text-sm">Strike ({formatNumber(strike, 0)}°)</strong>
                            <svg width="180" height="155" viewBox="0 0 180 155" className="mx-auto my-1 max-w-full" role="img" aria-label={`Strike ${strike} degrees clockwise from north, map view`}>
                                <defs>
                                    <marker id={`${markerId}-strike`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto">
                                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#dc3545" />
                                    </marker>
                                </defs>
                                <circle cx="90" cy="75" r="46" fill="#eff6ff" stroke="#94a3b8" />
                                <path d="M90 29 V121 M44 75 H136" stroke="#cbd5e1" strokeDasharray="3 3" />
                                <g fontSize="12" fill="#334155" textAnchor="middle">
                                    <text x="90" y="19">N</text><text x="149" y="79">E</text>
                                    <text x="90" y="137">S</text><text x="31" y="79">W</text>
                                </g>
                                <line data-testid="strike-line" x1={90 - strikeX} y1={75 - strikeY} x2={90 + strikeX} y2={75 + strikeY} stroke="#dc3545" strokeWidth="3" markerEnd={`url(#${markerId}-strike)`} />
                                {hasDip && dip > 0 && dip < 90 && (
                                    <line data-testid="dip-side-tick" x1="90" y1="75" x2={90 + 18 * Math.cos(radians(strike))} y2={75 + 18 * Math.sin(radians(strike))} stroke="#475569" strokeWidth="2" />
                                )}
                                <text x="90" y="153" fontSize="10" textAnchor="middle" fill="#475569">Map view · north is up</text>
                            </svg>
                            <p className="text-xs text-slate-600 mt-1">
                                Red arrow: horizontal direction along the plane, clockwise from north.
                                {hasDip && dip > 0 && dip < 90 && ` Short tick: dip side (${formatNumber((strike + 90) % 360, 0)}°).`}
                            </p>
                        </div>
                        <InfoSnippet topic="strike" />
                    </div>
                )}
                {hasDip && (
                    <div className="flex flex-col">
                        <div className="p-2 bg-red-50 rounded-lg shadow text-center flex flex-col justify-between min-h-[220px]">
                            <strong className="block text-red-700 text-sm">Dip ({formatNumber(dip, 0)}°)</strong>
                            <svg width="180" height="155" viewBox="0 0 180 155" className="mx-auto my-1 max-w-full" role="img" aria-label={`Dip ${dip} degrees below horizontal, cross-section perpendicular to strike`}>
                                <rect x="12" y="46" width="156" height="94" fill="#fee2e2" />
                                <line x1="12" y1="46" x2="168" y2="46" stroke="#94a3b8" strokeWidth="1.5" />
                                <text x="90" y="29" fontSize="11" textAnchor="middle" fill="#475569">Horizontal</text>
                                <line data-testid="dip-line" x1="28" y1="46" x2={28 + dipX} y2={46 + dipY} stroke="#475569" strokeWidth="3" />
                                {dip > 0 && <path d={`M54 46 A26 26 0 0 1 ${28 + 26 * Math.cos(radians(dip))} ${46 + 26 * Math.sin(radians(dip))}`} fill="none" stroke="#b91c1c" strokeWidth="1.5" />}
                                <text x={28 + 46 * Math.cos(radians(dip / 2))} y={46 + 46 * Math.sin(radians(dip / 2)) + 4} fontSize="11" fill="#b91c1c" fontWeight="bold">{formatNumber(dip, 0)}°</text>
                                <text x="90" y="153" fontSize="10" textAnchor="middle" fill="#475569">Section across strike</text>
                            </svg>
                            <p className="text-xs text-slate-600 mt-1">Angle down from horizontal. 0° is horizontal; 90° is vertical.</p>
                        </div>
                        <InfoSnippet topic="dip" />
                    </div>
                )}
                {hasRake && (
                    <div className="flex flex-col">
                        <div className="p-2 bg-emerald-50 rounded-lg shadow text-center flex flex-col justify-between min-h-[220px]">
                            <strong className="block text-emerald-700 text-sm">Rake ({formatNumber(rake, 0)}°)</strong>
                            <svg width="180" height="155" viewBox="0 0 180 155" className="mx-auto my-1 max-w-full" role="img" aria-label={`Rake ${rake} degrees on the fault plane, measured from strike toward up-dip`}>
                                <defs>
                                    <marker id={`${markerId}-rake`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto">
                                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#15803d" />
                                    </marker>
                                </defs>
                                <rect x="18" y="24" width="144" height="104" fill="#dcfce7" stroke="#86b49a" />
                                <path d="M30 76 H150 M90 30 V122" stroke="#94a3b8" strokeDasharray="3 3" />
                                <g fontSize="10" fill="#475569">
                                    <text x="90" y="15" textAnchor="middle">Up-dip (+90°)</text>
                                    <text x="90" y="144" textAnchor="middle">Down-dip (−90°)</text>
                                    <text x="157" y="66" textAnchor="end">Strike (0°)</text>
                                    <text x="23" y="66">±180°</text>
                                </g>
                                <line data-testid="rake-arrow" x1="90" y1="76" x2={90 + rakeX} y2={76 + rakeY} stroke="#15803d" strokeWidth="3" markerEnd={`url(#${markerId}-rake)`} />
                                <circle cx="90" cy="76" r="2.5" fill="#15803d" />
                            </svg>
                            <p className="text-xs text-slate-600 mt-1">Relative slip viewed on the plane. Positive rake turns from strike toward up-dip; negative toward down-dip.</p>
                        </div>
                        <InfoSnippet topic="rake" />
                    </div>
                )}
            </div>
        </div>
    );
}

export default memo(EarthquakeFaultParamsPanel);
