import React, { memo } from 'react';
import { isValidString, isValidNumber, formatNumber, formatLargeNumber } from '../../utils/utils.js';

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
            <h2 className={`${exhibitTitleClass} text-pink-800 border-pink-200`}>Seismic Moment and Magnitude</h2>
            <p>Reported magnitude: <strong className={highlightClass}>{properties.magType.toUpperCase()} {formatNumber(properties.mag,1)}</strong>.</p>
            <ul className="list-disc list-inside text-xs md:text-sm text-slate-600 mt-2 space-y-1">
                <li>Reported scalar seismic moment: <strong className={highlightClass}>{formatLargeNumber(scalarMomentValue)} N·m</strong>.</li>
                <li>Seismic moment describes the size of the source in terms of fault area, average slip, and rock rigidity.</li>
                <li>Moment magnitude (Mw) is calculated from seismic moment. Mww is the W-phase method of estimating moment magnitude.</li>
                <li>Radiated seismic energy is a separate physical quantity and can differ between earthquakes with the same moment.</li>
            </ul>
        </div>
    );
}

export default memo(EarthquakeMwwPanel);
