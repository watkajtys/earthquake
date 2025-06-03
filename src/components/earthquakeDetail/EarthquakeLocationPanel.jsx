import React, { memo } from 'react';
import { isValidNumber, formatNumber } from '../../utils/utils.js';

function EarthquakeLocationPanel({
    properties,
    originProductProps,
    // isValidNumber, // Now imported
    // formatNumber, // Now imported
    exhibitPanelClass,
    exhibitTitleClass,
    diagramContainerClass,
    captionClass
}) {
    // Conditional rendering based on the original logic
    if (!(originProductProps || (properties && (isValidNumber(properties.nst) || isValidNumber(properties.gap) || isValidNumber(properties.dmin) || isValidNumber(properties.rms))))) { // isValidNumber is now imported
        return null;
    }

    return (
        <div className={`${exhibitPanelClass} border-yellow-500`}>
            <h2 className={`${exhibitTitleClass} text-yellow-800 border-yellow-300`}>Pinpointing the Quake</h2>
            <p className="mb-2 text-xs md:text-sm">Location quality based on available data:</p>
            <ul className="text-xs md:text-sm space-y-1 list-disc list-inside ml-4">
                {(isValidNumber(originProductProps?.['num-stations-used']) || isValidNumber(properties?.nst)) && (
                    <li><strong className="text-slate-700">Stations Used (nst):</strong> {isValidNumber(originProductProps?.['num-stations-used']) ? originProductProps['num-stations-used'] : properties.nst}</li>
                )}
                {(isValidNumber(originProductProps?.['azimuthal-gap']) || isValidNumber(properties?.gap)) && (
                    <li><strong className="text-slate-700">Azimuthal Gap (gap):</strong> {formatNumber(originProductProps?.['azimuthal-gap'] ?? properties.gap, 0)}° (smaller is better)</li>
                )}
                {(isValidNumber(originProductProps?.['minimum-distance']) || isValidNumber(properties?.dmin)) && (
                    <li><strong className="text-slate-700">Nearest Station (dmin):</strong> {formatNumber(originProductProps?.['minimum-distance'] ?? properties.dmin, 1)}° (~{formatNumber((originProductProps?.['minimum-distance'] ?? properties.dmin) * 111, 0)} km)</li>
                )}
                {(isValidNumber(originProductProps?.['standard-error']) || isValidNumber(properties?.rms)) && (
                    <li><strong className="text-slate-700">RMS Error (rms):</strong> {formatNumber(originProductProps?.['standard-error'] ?? properties.rms, 2)} s (smaller indicates better fit)</li>
                )}
            </ul>
            <div className={`${diagramContainerClass} bg-purple-50 mt-3`} style={{minHeight: '160px'}}>
                <svg width="200" height="150" viewBox="0 0 200 150">
                    <circle cx="40" cy="40" r="5" fill="#1d4ed8"/><text x="40" y="30" fontSize="8">Sta 1</text>
                    <circle cx="160" cy="50" r="5" fill="#1d4ed8"/><text x="160" y="40" fontSize="8">Sta 2</text>
                    <circle cx="100" cy="130" r="5" fill="#1d4ed8"/><text x="100" y="145" fontSize="8">Sta 3</text>
                    <circle cx="40" cy="40" r="50" fill="none" stroke="#60a5fa" strokeWidth="1" strokeDasharray="2,2"/>
                    <circle cx="160" cy="50" r="65" fill="none" stroke="#60a5fa" strokeWidth="1" strokeDasharray="2,2"/>
                    <circle cx="100" cy="130" r="45" fill="none" stroke="#60a5fa" strokeWidth="1" strokeDasharray="2,2"/>
                    <circle cx="105" cy="85" r="4" fill="#ef4444"/>
                    <text x="105" y="78" fontSize="8" fill="#b91c1c">Epicenter</text>
                </svg>
            </div>
            <p className={captionClass}>Epicenter is found by triangulating arrival times from multiple seismometers.</p>
        </div>
    );
}

export default memo(EarthquakeLocationPanel);
