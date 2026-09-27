import React, { useId } from 'react';
import { getFaultDiagramGeometry } from './faultDiagramGeometry.js';

const SLIP_COLOR = '#0369a1';
const SIDE_A_COLOR = '#ffedd5';
const SIDE_B_COLOR = '#e2e8f0';

function SlipArrow({ center, vector, markerId, testId }) {
    const magnitude = Math.hypot(vector.x, vector.y);
    if (magnitude < 1e-10) return null;
    return <line
        data-testid={testId}
        x1={center.x - 30 * vector.x} y1={center.y - 30 * vector.y}
        x2={center.x + 30 * vector.x} y2={center.y + 30 * vector.y}
        stroke={SLIP_COLOR} strokeWidth={3 * magnitude} markerEnd={`url(#${markerId})`}
    />;
}

function InteractiveFaultDiagram({ planeData, planeKey }) {
    const uniqueId = useId().replace(/:/g, '');
    const geometry = getFaultDiagramGeometry(planeData);
    if (!geometry) {
        return <p className="p-3 text-sm text-slate-600">Slip diagram unavailable: valid strike, dip (0–90°), and rake are required.</p>;
    }

    const { strike, dip, dipDirection, mapSlip, sectionSlip, mapDownDip, sectionDownDip } = geometry;
    const markerId = `fault-slip-arrow-${uniqueId}`;
    const mapClipId = `fault-map-clip-${uniqueId}`;
    const sectionClipId = `fault-section-clip-${uniqueId}`;
    const mapCenter = { x: 150, y: 135 };
    const mapArrow = { x: 150 + 44 * mapDownDip.x, y: 135 + 44 * mapDownDip.y };
    const sectionCenter = { x: 150, y: 137 };
    const sectionNormal = { x: sectionDownDip.y, y: -sectionDownDip.x };
    const sectionArrow = { x: 150 + 42 * sectionNormal.x, y: 137 + 42 * sectionNormal.y };
    const hasMapSlip = Math.hypot(mapSlip.x, mapSlip.y) > 1e-10;
    const hasSectionSlip = Math.hypot(sectionSlip.x, sectionSlip.y) > 1e-10;
    const planeLabel = planeKey === 'np2' ? 'Nodal plane 2' : 'Nodal plane 1';

    return (
        <figure className="w-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <svg className="w-full max-w-xs mx-auto" viewBox="0 0 300 270" role="img" aria-labelledby={`fault-map-title-${uniqueId} fault-map-desc-${uniqueId}`}>
                    <title id={`fault-map-title-${uniqueId}`}>{planeLabel}: horizontal slip, north-up map view</title>
                    <desc id={`fault-map-desc-${uniqueId}`}>Strike {strike} degrees. Blue arrow is the horizontal component of side A relative to side B. Up and down motion appears in the cross-section.</desc>
                    <defs>
                        <marker id={markerId} markerWidth="7" markerHeight="6" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                            <path d="M0 0 L7 3 L0 6 Z" fill={SLIP_COLOR}/>
                        </marker>
                        <clipPath id={mapClipId}><circle cx="150" cy="135" r="89"/></clipPath>
                    </defs>
                    <text x="150" y="18" textAnchor="middle" fontSize="14" fontWeight="600" fill="#334155">Map view · horizontal motion</text>
                    <text x="150" y="38" textAnchor="middle" fontSize="12" fill="#475569">N</text>
                    <text x="252" y="140" fontSize="12" fill="#475569">E</text>
                    <g clipPath={`url(#${mapClipId})`}>
                        <circle cx="150" cy="135" r="89" fill={SIDE_A_COLOR}/>
                        {dip > 0 && <g transform={`rotate(${strike} 150 135)`}>
                            <rect x="61" y="46" width="89" height="178" fill={SIDE_B_COLOR}/>
                            <line data-testid="fault-map-trace" x1="150" y1="46" x2="150" y2="224" stroke="#475569" strokeWidth="2" strokeDasharray="6 4"/>
                        </g>}
                    </g>
                    <circle cx="150" cy="135" r="89" fill="none" stroke="#94a3b8"/>
                    <text x={mapArrow.x} y={mapArrow.y - 36} textAnchor="middle" fontSize="12" fontWeight="600" fill="#7c2d12">A</text>
                    {dip > 0 && <text x={mapCenter.x - 48 * mapDownDip.x} y={mapCenter.y - 48 * mapDownDip.y + 4} textAnchor="middle" fontSize="12" fontWeight="600" fill="#475569">B</text>}
                    <SlipArrow center={mapArrow} vector={mapSlip} markerId={markerId} testId="fault-map-slip"/>
                    <text x="150" y="244" textAnchor="middle" fontSize="11" fill="#475569">
                        {dip === 0 ? 'Horizontal plane: no unique map trace' : 'Dashed line: plane orientation'}
                    </text>
                    {!hasMapSlip && <text x="150" y="262" textAnchor="middle" fontSize="11" fill={SLIP_COLOR}>No horizontal slip component</text>}
                </svg>

                <svg className="w-full max-w-xs mx-auto" viewBox="0 0 300 270" role="img" aria-labelledby={`fault-section-title-${uniqueId} fault-section-desc-${uniqueId}`}>
                    <title id={`fault-section-title-${uniqueId}`}>{planeLabel}: dip and slip in vertical cross-section</title>
                    <desc id={`fault-section-desc-${uniqueId}`}>Dip {dip} degrees. Depth increases downward; right points toward azimuth {dipDirection} degrees. Blue arrow shows the dip-slip component of A relative to B.</desc>
                    <defs><clipPath id={sectionClipId}><rect x="35" y="48" width="230" height="178" rx="4"/></clipPath></defs>
                    <text x="150" y="18" textAnchor="middle" fontSize="14" fontWeight="600" fill="#334155">Cross-section · dip motion</text>
                    <text x="150" y="37" textAnchor="middle" fontSize="11" fill="#475569">Right = dip direction ({Math.round(dipDirection)}°)</text>
                    <g clipPath={`url(#${sectionClipId})`}>
                        <g transform={`rotate(${dip} ${sectionCenter.x} ${sectionCenter.y})`}>
                            <rect x="-150" y="-163" width="600" height="300" fill={SIDE_A_COLOR}/>
                            <rect x="-150" y="137" width="600" height="300" fill={SIDE_B_COLOR}/>
                            <line data-testid="fault-section-plane" x1="-150" y1="137" x2="450" y2="137" stroke="#475569" strokeWidth="2" strokeDasharray="6 4"/>
                        </g>
                        <line x1="150" y1="137" x2="205" y2="137" stroke="#94a3b8" strokeDasharray="3 3"/>
                        {dip > 0 && <path d={`M190 137 A40 40 0 0 1 ${150 + 40 * sectionDownDip.x} ${137 + 40 * sectionDownDip.y}`} fill="none" stroke="#64748b"/>}
                    </g>
                    <rect x="35" y="48" width="230" height="178" rx="4" fill="none" stroke="#94a3b8"/>
                    <text x={150 + 72 * sectionNormal.x} y={137 + 72 * sectionNormal.y + 4} textAnchor="middle" fontSize="12" fontWeight="600" fill="#7c2d12">A</text>
                    <text x={150 - 52 * sectionNormal.x} y={137 - 52 * sectionNormal.y + 4} textAnchor="middle" fontSize="12" fontWeight="600" fill="#475569">B</text>
                    <SlipArrow center={sectionArrow} vector={sectionSlip} markerId={markerId} testId="fault-section-slip"/>
                    <text x="150" y="244" textAnchor="middle" fontSize="11" fill="#475569">Dip {Math.round(dip)}° · depth increases downward</text>
                    {!hasSectionSlip && <text x="150" y="262" textAnchor="middle" fontSize="11" fill={SLIP_COLOR}>Slip is along strike, out of this section</text>}
                </svg>
            </div>
            <figcaption className="mt-2 text-xs leading-relaxed text-slate-600">
                Blue arrows show A’s slip relative to B; each view shows one projection of that motion.
                {' '}{dip === 90 ? 'A is the side to the right when facing along strike.' : 'A is the hanging wall (above the plane); B is the footwall (below).'}
                {' '}Orientation and direction only: this is not a mapped surface rupture, displacement estimate, or wave direction.
            </figcaption>
        </figure>
    );
}

export default InteractiveFaultDiagram;
