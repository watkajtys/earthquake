import React, { memo } from 'react';
import {
    isValidString,
    isValuePresent,
    isValidNumber,
    formatDate,
    formatNumber,
    formatLargeNumber
} from '../../utils/utils.js';

function EarthquakeSnapshotPanel({
    properties,
    geometry,
    originProductProps,
    momentTensorProductProps, // For 'percent-double-couple'
    energyJoules,             // Derived in parent: scalarMomentValue from momentTensorProductProps
    mmiValue,                 // Derived in parent: from shakemapProductProps or properties.mmi
    pagerAlertValue,          // Derived in parent: from losspagerProductProps or properties.alert
    // Helper functions below are now imported
    // isValidString,
    // isValuePresent,
    // isValidNumber,
    // formatDate,
    // formatNumber,
    // formatLargeNumber,
    exhibitPanelClass,
    exhibitTitleClass
}) {
    // Basic safety check
    if (!properties) {
        return null; // Or a loading/error state appropriate for this panel
    }

    return (
        <div className={`${exhibitPanelClass} border-blue-500`}>
            <h2 className={`${exhibitTitleClass} text-blue-800 border-blue-200`}>Earthquake Snapshot</h2>
            <table data-testid="snapshot-table" className="w-full text-xs md:text-sm"><tbody>
            {isValidString(properties.title) && (
                <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600 w-2/5 md:w-1/3">Event Name</td><td className="py-1.5">{properties.title}</td></tr>
            )}
            {isValuePresent(properties.time) && (
                <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Date & Time (UTC)</td><td className="py-1.5">{formatDate(properties.time)}</td></tr>
            )}
            {geometry?.coordinates && isValidNumber(geometry.coordinates[1]) && isValidNumber(geometry.coordinates[0]) && (
                <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Location</td><td className="py-1.5">{formatNumber(geometry.coordinates[1], 3)}°, {formatNumber(geometry.coordinates[0], 3)}°</td></tr>
            )}
            {isValidNumber(properties.mag) && (
                <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Magnitude ({isValidString(properties.magType) ? properties.magType : 'Mww'})</td><td className="py-1.5">{formatNumber(properties.mag, 1)}</td></tr>
            )}
            {geometry?.coordinates && isValidNumber(geometry.coordinates[2]) && ( // Depth can be 0
                <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Depth</td><td className="py-1.5">{formatNumber(geometry.coordinates[2], 1)} km</td></tr>
            )}
            {isValidNumber(energyJoules) && ( // energyJoules (scalarMoment) can be 0
                <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Energy (Seismic Moment)</td><td className="py-1.5">{formatLargeNumber(energyJoules)} N-m</td></tr>
            )}
            {momentTensorProductProps && isValidNumber(momentTensorProductProps['percent-double-couple']) && (
                <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Percent Double Couple</td><td className="py-1.5">{formatNumber(parseFloat(momentTensorProductProps['percent-double-couple']) * 100, 0)}%</td></tr>
            )}
            {isValuePresent(properties.tsunami) && ( // tsunami can be 0 or 1
                <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Tsunami?</td><td className="py-1.5">{properties.tsunami === 1 ? 'Yes' : 'No'}</td></tr>
            )}
            {isValidString(properties.status) && (
                <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Status</td><td className="py-1.5 capitalize">{properties.status}</td></tr>
            )}
            {isValuePresent(properties.felt) && isValidNumber(properties.felt) && ( // felt can be 0
                <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Felt Reports (DYFI)</td><td className="py-1.5">{properties.felt}</td></tr>
            )}
            {isValidNumber(mmiValue) && (
                <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">MMI (ShakeMap)</td><td className="py-1.5">{formatNumber(mmiValue,1)}</td></tr>
            )}
            {isValidString(pagerAlertValue) && (
                <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">PAGER Alert</td><td className={`py-1.5 capitalize font-semibold ${pagerAlertValue === 'green' ? 'text-green-600' : pagerAlertValue === 'yellow' ? 'text-yellow-600' : pagerAlertValue === 'orange' ? 'text-orange-600' : pagerAlertValue === 'red' ? 'text-red-600' : 'text-slate-600'}`}>{pagerAlertValue}</td></tr>
            )}
            {(isValidNumber(originProductProps?.['num-stations-used']) || isValidNumber(properties?.nst)) && (
                <tr className="border-t border-gray-300 mt-2 pt-2"><td className="pt-2 pr-2 font-semibold text-slate-600">Stations Used:</td><td className="pt-2">{isValidNumber(originProductProps?.['num-stations-used']) ? originProductProps['num-stations-used'] : properties.nst}</td></tr>
            )}
            {(isValidNumber(originProductProps?.['azimuthal-gap']) || isValidNumber(properties?.gap)) && (
                <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Azimuthal Gap:</td><td className="py-1.5">{formatNumber(originProductProps?.['azimuthal-gap'] ?? properties.gap, 0)}°</td></tr>
            )}
            {(isValidNumber(originProductProps?.['minimum-distance']) || isValidNumber(properties?.dmin)) && (
                <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Min. Distance:</td><td className="py-1.5">{formatNumber(originProductProps?.['minimum-distance'] ?? properties.dmin, 1)}°</td></tr>
            )}
            {(isValidNumber(originProductProps?.['standard-error']) || isValidNumber(properties?.rms)) && (
                <tr><td className="py-1.5 pr-2 font-semibold text-slate-600">RMS Error:</td><td className="py-1.5">{formatNumber(originProductProps?.['standard-error'] ?? properties.rms, 2)} s</td></tr>
            )}
            </tbody></table>
        </div>
    );
}

export default memo(EarthquakeSnapshotPanel);
