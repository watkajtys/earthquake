import React, { memo } from 'react';
import { getBeachballPathsAndType } from '../../utils/detailViewUtils.js';
import { isValidNumber } from '../../utils/utils.js';

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
    diagramContainerClass,
    captionClass
}) {
    // Conditional rendering for the entire panel based on the original logic
    if (!(momentTensorProductProps && (isValidNumber(np1Data?.strike) || isValidNumber(np2Data?.strike) || isValidNumber(pAxis?.azimuth) || isValidNumber(tAxis?.azimuth)))) { // isValidNumber is now imported
        return null;
    }

    return (
        <div className={`${exhibitPanelClass} border-teal-500`}>
            <h2 className={`${exhibitTitleClass} text-teal-800 border-teal-200`}>"Beach Ball" Diagram</h2>
            <div data-testid="beachball-svg-container" className={`${diagramContainerClass} bg-sky-50`} style={{ minHeight: '220px' }}>
                <svg width="150" height="150" viewBox="0 0 120 120">
                    {(() => {
                        const selectedPlane = selectedFaultPlaneKey === 'np1' ? np1Data : np2Data;
                        // Ensure np1Data and selectedPlane are available before trying to access their properties
                        if (!np1Data || !selectedPlane) return null;

                        const orientationStrike = parseFloat(np1Data.strike);
                        const rake = parseFloat(selectedPlane.rake);
                        // const dip = parseFloat(selectedPlane.dip); // Unused

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
            <p className={captionClass}>Conceptual focal mechanism (beach ball) showing fault planes and stress axes. Shaded areas often represent compressional first motions, white areas tensional, depending on projection.</p>
        </div>
    );
}

export default memo(EarthquakeBeachballPanel);
