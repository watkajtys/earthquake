import React, { memo } from 'react';
import InfoSnippet from '../InfoSnippet.jsx';
import { isValidNumber, formatNumber } from '../../utils/utils.js';

function EarthquakeFaultParamsPanel({
    selectedFaultPlaneKey,
    selectedFaultPlane,
    // isValidNumber, // Now imported
    // formatNumber, // Now imported
    exhibitPanelClass,
    exhibitTitleClass
    // highlightClass is used internally in <p> and <strong> tags, not passed directly to this component
    // diagramContainerClass is not directly used by this panel wrapper, but by its columns if they were more complex
}) {
    // Conditional rendering for the entire panel
    if (!(selectedFaultPlane && (isValidNumber(selectedFaultPlane.strike) || isValidNumber(selectedFaultPlane.dip) || isValidNumber(selectedFaultPlane.rake)))) { // isValidNumber is now imported
        return null;
    }

    return (
        <div className={`${exhibitPanelClass} border-green-500`}>
            <h2 className={`${exhibitTitleClass} text-green-800 border-green-200`}>Decoding the Fault Parameters</h2>
            <p className="text-xs text-slate-600 mb-3">Parameters for <strong className="font-semibold text-indigo-600">{selectedFaultPlaneKey === 'np1' ? 'Nodal Plane 1' : 'Nodal Plane 2'}</strong>:</p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">

                {/* Strike Parameter Column */}
                {isValidNumber(selectedFaultPlane.strike) && (
                    <div className="flex flex-col">
                        <div className="p-2 bg-blue-50 rounded-lg shadow text-center flex flex-col justify-between min-h-[150px] sm:min-h-[200px]">
                            <strong className="block text-blue-700 text-sm">Strike ({formatNumber(selectedFaultPlane.strike,0)}°)</strong>
                            <svg width="100" height="75" viewBox="0 0 160 120" className="mx-auto my-1">
                                <rect x="5" y="40" width="150" height="75" fill="#e9ecef" stroke="#adb5bd" strokeWidth="1"/>
                                <text x="80" y="35" fontSize="10" textAnchor="middle" fill="#495057">Surface</text>
                                <text x="15" y="15" fontSize="10" textAnchor="middle" fill="#333">N</text>
                                <path d="M15 20 L15 30" stroke="black" strokeWidth="1" markerEnd="url(#arrow-north-strike-detail-decoder-fault-params)"/>
                                <defs>
                                    <marker id="arrow-north-strike-detail-decoder-fault-params" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                                        <path d="M 0 0 L 5 5 L 0 10 z" fill="black" />
                                    </marker>
                                </defs>
                                {(() => {
                                    const diagramCenterX = 80;
                                    const diagramCenterY = 77.5;
                                    const lineLength = 70;
                                    return (
                                        <line
                                            x1={diagramCenterX - lineLength / 2} y1={diagramCenterY}
                                            x2={diagramCenterX + lineLength / 2} y2={diagramCenterY}
                                            stroke="#dc3545"
                                            strokeWidth="2.5"
                                            transform={`rotate(${selectedFaultPlane.strike}, ${diagramCenterX}, ${diagramCenterY})`}
                                        />);
                                })()}
                            </svg>
                            <p className="text-xs text-slate-600 mt-1">Compass direction of the fault's intersection... (full text here)</p>
                        </div>
                        <InfoSnippet topic="strike" />
                    </div>
                )}

                {/* Dip Parameter Column */}
                {isValidNumber(selectedFaultPlane.dip) && (
                    <div className="flex flex-col">
                        <div className="p-2 bg-red-50 rounded-lg shadow text-center flex flex-col justify-between min-h-[150px] sm:min-h-[200px]">
                            <strong className="block text-red-700 text-sm">Dip ({formatNumber(selectedFaultPlane.dip,0)}°)</strong>
                            <svg width="100" height="75" viewBox="0 0 160 120" className="mx-auto my-1">
                                <line x1="10" y1="40" x2="150" y2="40" stroke="#adb5bd" strokeWidth="1.5" />
                                <text x="80" y="30" fontSize="10" textAnchor="middle" fill="#495057">Surface</text>
                                <line x1="40" y1="40" x2="120" y2="100" stroke="#495057" strokeWidth="2" />
                                <path d="M 40 40 C 55 40, 60 48, 65 55" fill="none" stroke="#28a745" strokeWidth="1.5" />
                                <text x="75" y="55" fontSize="10" fill="#28a745" fontWeight="bold">{formatNumber(selectedFaultPlane.dip,0)}°</text>
                            </svg>
                            <p className="text-xs text-slate-600 mt-1">Angle the fault plane tilts down...</p>
                        </div>
                        <InfoSnippet topic="dip" />
                    </div>
                )}

                {/* Rake Parameter Column */}
                {isValidNumber(selectedFaultPlane.rake) && (
                    <div className="flex flex-col">
                        <div className="p-2 bg-emerald-50 rounded-lg shadow text-center flex flex-col justify-between min-h-[150px] sm:min-h-[200px]">
                            <strong className="block text-emerald-700 text-sm">Rake ({formatNumber(selectedFaultPlane.rake,0)}°)</strong>
                            <svg width="100" height="75" viewBox="0 0 160 120" className="mx-auto my-1">
                                <rect x="25" y="10" width="110" height="100" fill="#e0e7ff" stroke="#6d28d9" strokeWidth="1.5" />
                                <line x1="25" y1="60" x2="135" y2="60" stroke="#4f46e5" strokeWidth="1" strokeDasharray="2,2" />
                                <defs>
                                    <marker id="arrow-rake-detail-diag-decoder-fault-params" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="strokeWidth" markerWidth="4" markerHeight="3" orient="auto">
                                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#16a34a"/>
                                    </marker>
                                </defs>
                                <line x1="80" y1="60" x2="50" y2="80" stroke="#16a34a" strokeWidth="2.5" markerEnd="url(#arrow-rake-detail-diag-decoder-fault-params)" transform={`rotate(${selectedFaultPlane.rake} 80 60)`} />
                                <text x="70" y="95" fontSize="10" fill="#16a34a" fontWeight="bold">{formatNumber(selectedFaultPlane.rake,0)}°</text>
                            </svg>
                            <p className="text-xs text-slate-600 mt-1">Direction of slip along the fault plane...</p>
                        </div>
                        <InfoSnippet topic="rake" />
                    </div>
                )}
            </div>
        </div>
    );
}

export default memo(EarthquakeFaultParamsPanel);
