import React, { memo } from 'react';
import { isValidString, isValidNumber, formatNumber, formatLargeNumber } from '../../utils/detailViewUtils.js';

function EarthquakeMwwPanel({
    properties,
    scalarMomentValue,
    // isValidString, // Now imported
    // isValidNumber, // Now imported
    // formatNumber, // Now imported
    // formatLargeNumber, // Now imported
    exhibitPanelClass,
    exhibitTitleClass,
    highlightClass
}) {
    // Conditional rendering based on the original logic
    if (!(isValidString(properties?.magType) && isValidNumber(scalarMomentValue) && isValidNumber(properties?.mag))) { // Functions are now imported
        return null;
    }

    return (
        <div className={`${exhibitPanelClass} border-pink-500`}>
            <h2 className={`${exhibitTitleClass} text-pink-800 border-pink-200`}>Mww: The Modern Measure</h2>
            <p>This earthquake was <strong className={highlightClass}>{properties.magType.toUpperCase()} {formatNumber(properties.mag,1)}</strong>.</p>
            <ul className="list-disc list-inside text-xs md:text-sm text-slate-600 mt-2 space-y-1">
                <li>Moment Magnitude (Mww) is standard for moderate to large quakes.</li>
                <li>Based on Seismic Moment: <strong className={highlightClass}>{formatLargeNumber(scalarMomentValue)} N-m</strong> for this event.</li>
                <li>Seismic Moment considers: fault area, slip amount, and rock rigidity.</li>
                <li>Mww accurately represents energy differences, unlike older scales.</li>
            </ul>
        </div>
    );
}

export default memo(EarthquakeMwwPanel);
