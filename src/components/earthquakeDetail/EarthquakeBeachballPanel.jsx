import React, { memo, useId, useMemo } from 'react';
import { beachballGeometry, isCompleteNodalPlane } from '../../utils/focalMechanismUtils.js';

function EarthquakeBeachballPanel({
    np1Data, np2Data, mechanismSourceLabel,
    exhibitPanelClass, exhibitTitleClass, diagramContainerClass, captionClass,
}) {
    const clipId = useId();
    // Both alternatives describe ONE mechanism, independent of the selected plane.
    const plane = isCompleteNodalPlane(np1Data) ? np1Data : np2Data;
    const geometry = useMemo(() => beachballGeometry(plane), [plane]);
    if (!geometry) return null;

    return (
        <div className={`${exhibitPanelClass} border-teal-500`}>
            <h2 className={`${exhibitTitleClass} text-teal-800 border-teal-200`}>"Beach Ball" Diagram</h2>
            <div data-testid="beachball-svg-container" className={`${diagramContainerClass} bg-sky-50`} style={{ minHeight: '220px' }}>
                <svg width="210" height="210" viewBox="0 0 120 120" role="img" aria-label="Double-couple focal mechanism, lower hemisphere, north up and east right">
                    <defs><clipPath id={clipId}><circle cx="60" cy="60" r="50" /></clipPath></defs>
                    <circle cx="60" cy="60" r="50" fill="white" />
                    <path data-testid="beachball-compression" d={geometry.shadedPath} fill="#64748b" clipPath={`url(#${clipId})`} />
                    {geometry.nodalPaths.map((path, index) => <path key={index} d={path} fill="none" stroke="#1e293b" strokeWidth="0.65" />)}
                    <circle cx="60" cy="60" r="50" fill="none" stroke="#1e293b" strokeWidth="0.8" />
                    <g fontSize="7" textAnchor="middle" fill="#334155"><text x="60" y="7">N</text><text x="116" y="62">E</text><text x="60" y="119">S</text><text x="4" y="62">W</text></g>
                </svg>
            </div>
            <p className={captionClass}>Lower-hemisphere, equal-area projection. Shaded: compressional P-wave first motion; white: dilatational first motion. Curves show the two alternative nodal planes.</p>
            <p className={captionClass}>Double-couple representation from the reported strike, dip and rake{mechanismSourceLabel ? ` (${mechanismSourceLabel})` : ''}; it does not show non-double-couple components of a moment tensor. Selecting a different nodal plane does not change this mechanism.</p>
        </div>
    );
}

export default memo(EarthquakeBeachballPanel);
