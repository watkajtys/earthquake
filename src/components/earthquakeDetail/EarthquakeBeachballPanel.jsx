import React, { memo } from 'react';

import { isValidNumber, getBeachballPathsAndType, getFaultType } from '../../utils/detailViewUtils.js';
import SimpleFaultBlockDiagram from './SimpleFaultBlockDiagram.jsx';

function EarthquakeBeachballPanel({
    momentTensorProductProps,
    np1Data,
    np2Data,
    selectedFaultPlaneKey,
    pAxis,
    tAxis,
    // isValidNumber, // Now imported
    // getBeachballPathsAndType, // Now imported
    exhibitPanelClass,
    exhibitTitleClass,
    diagramContainerClass, // This will be modified for grid layout
    captionClass
}) {
    // Conditional rendering for the entire panel based on the original logic
    if (!(momentTensorProductProps && (isValidNumber(np1Data?.strike) || isValidNumber(np2Data?.strike) || isValidNumber(pAxis?.azimuth) || isValidNumber(tAxis?.azimuth)))) { // isValidNumber is now imported
        return null;
    }

    const selectedPlane = selectedFaultPlaneKey === 'np1' ? np1Data : np2Data;
    let faultType = { name: "Unknown Fault Type", icon: "❓", description: "Fault movement details are unclear." }; // Default
    if (selectedPlane && isValidNumber(selectedPlane.rake)) {
        faultType = getFaultType(parseFloat(selectedPlane.rake));
    }

    let captionText = `The 'beachball' diagram (left) and simplified block diagram (right) illustrate the earthquake's faulting mechanism. `;
    if (faultType.name !== "Unknown Fault Type") {
        captionText = `This '${faultType.name}' earthquake is represented by the 'beachball' diagram (left) and a simplified block diagram (right). `;
    }
    captionText += `On the beachball: The two curved lines are possible orientations of the fault plane. `;
    // Updated explanation for shaded/white areas and P/T axes:
    captionText += `Shaded quadrants show where rock was compressed by the fault movement. White quadrants show where rock was pulled apart (dilatation). `;
    captionText += `The 'P' (Pressure) axis points to the center of the compressional quadrants, indicating the main direction of squeezing. `;
    captionText += `The 'T' (Tension) axis points to the center of the dilatational quadrants, indicating the main direction of stretching.`;

    return (
        <div className={`${exhibitPanelClass} border-teal-500`}>
            <h2 className={`${exhibitTitleClass} text-teal-800 border-teal-200`}>"Beach Ball" & Fault Type</h2>
            <div
                data-testid="beachball-diagram-container"
                className={`${diagramContainerClass} bg-sky-50 grid grid-cols-1 md:grid-cols-2 gap-2 items-center justify-items-center p-2`}
                style={{ minHeight: '240px' }} // Adjusted minHeight for two diagrams
            >
                {/* Beachball SVG */}
                <div className="flex justify-center items-center w-full h-full"> {/* Centering container */}
                    <svg width="150" height="150" viewBox="0 0 120 120">
                        {(() => {
                            // selectedPlane already determined above
                            if (!np1Data || !selectedPlane) return null;

                            const orientationStrike = parseFloat(np1Data.strike);
                            // rake also determined above from selectedPlane
                            const rake = selectedPlane.rake !== undefined ? parseFloat(selectedPlane.rake) : NaN;
                            const dip = selectedPlane.dip !== undefined ? parseFloat(selectedPlane.dip) : NaN;

                            if (!isValidNumber(orientationStrike) || !isValidNumber(rake)) {
                            return (
                                <>
                                    <line x1="60" y1="10" x2="60" y2="110" stroke="#cccccc" strokeWidth="1" />
                                    <line x1="10" y1="60" x2="110" y2="60" stroke="#cccccc" strokeWidth="1" />
                                </>
                            );
                        }
                        
                        const { shadedPaths: canonicalShadedPaths, nodalPlanes: canonicalNodalPlanes } = getBeachballPathsAndType(rake); // dip argument removed

                        return (
                            <g transform={`rotate(${orientationStrike}, 60, 60)`}>
                                {canonicalShadedPaths.map((pathData, index) => (
                                    <path key={`bb-shade-${index}`} d={pathData} fill="#aaaaaa" stroke="#555555" strokeWidth="0.25" />
                                ))}
                                {canonicalNodalPlanes.map((plane, index) => {
                                    if (plane.type === 'line') {
                                        return <line key={`bb-plane-${index}`} x1={plane.x1} y1={plane.y1} x2={plane.x2} y2={plane.y2} stroke="#333" strokeWidth="1.0" />;
                                    } else if (plane.type === 'path') {
                                        return <path key={`bb-plane-${index}`} d={plane.d} stroke="#333" strokeWidth="1.0" fill="none"/>;
                                    }
                                    return null;
                                })}
                            </g>
                        );
                    })()}

                    {pAxis && isValidNumber(pAxis.azimuth) &&
                        <text x="60" y="60"
                              transform={`rotate(${pAxis.azimuth} 60 60) translate(0 -${(isValidNumber(pAxis.plunge) && pAxis.plunge > 45) ? 20 : 38})`}
                              className="text-xs font-bold fill-red-600" textAnchor="middle">P</text>}
                    {tAxis && isValidNumber(tAxis.azimuth) &&
                        <text x="60" y="60"
                              transform={`rotate(${tAxis.azimuth} 60 60) translate(0 ${(isValidNumber(tAxis.plunge) && tAxis.plunge > 45) ? 20 : 38})`}
                              className="text-xs font-bold fill-blue-600" textAnchor="middle">T</text>}
                    <text x="60" y="8" fontSize="8" textAnchor="middle" fill="#555">N</text>
                    </svg>
                </div>

                {/* SimpleFaultBlockDiagram */}
                {selectedPlane && isValidNumber(selectedPlane.rake) ? (
                    <div className="flex justify-center items-center w-full h-full"> {/* Centering container */}
                        <SimpleFaultBlockDiagram faultType={faultType} />
                    </div>
                ) : (
                    <div className="text-xs text-slate-400 flex justify-center items-center w-full h-full">Block diagram unavailable.</div>
                )}
            </div>
            <p className={`${captionClass} mt-2`}>{captionText}</p>
        </div>
    );
}

export default memo(EarthquakeBeachballPanel);
