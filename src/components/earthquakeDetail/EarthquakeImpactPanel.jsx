import React from 'react';
import { isValidNumber, isValidString, formatNumber } from '../../utils/detailViewUtils.js';

function EarthquakeImpactPanel({
    properties,
    shakemapProductProps,
    losspagerProductProps,
    shakemapIntensityImageUrl,
    mmiValue, // Derived in parent
    pagerAlertValue, // Derived in parent
    // isValidNumber, // Now imported
    // isValidString, // Now imported
    // formatNumber, // Now imported
    exhibitPanelClass,
    exhibitTitleClass,
    highlightClass,
    captionClass
}) {
    // Conditional rendering based on the original logic
    if (!(shakemapProductProps || losspagerProductProps || isValidNumber(properties?.mmi) || isValidString(properties?.alert))) { // isValidNumber & isValidString are now imported
        return null;
    }

    return (
        <div className={`${exhibitPanelClass} border-gray-500`}>
            <h2 className={`${exhibitTitleClass} text-gray-800 border-gray-300`}>Shaking & Impact Assessment</h2>
            {isValidNumber(mmiValue) && (
                <p>Est. Max Shaking Intensity (MMI): <strong className={highlightClass}>{formatNumber(mmiValue, 1)}</strong></p>
            )}
            {isValidString(pagerAlertValue) && (
                <p>USGS PAGER Alert Level: <span className={`font-bold capitalize px-1.5 py-0.5 rounded-sm text-xs ${pagerAlertValue === 'green' ? 'bg-green-100 text-green-700' : pagerAlertValue === 'yellow' ? 'bg-yellow-100 text-yellow-700' : pagerAlertValue === 'orange' ? 'bg-orange-100 text-orange-700' : pagerAlertValue === 'red' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-slate-700'}`}>{pagerAlertValue}</span></p>
            )}
            {isValidString(shakemapIntensityImageUrl) ? (
                <div className="my-3">
                    <img src={shakemapIntensityImageUrl} alt="ShakeMap Intensity" className="w-full max-w-sm mx-auto border border-gray-300 rounded"/>
                    <p className={captionClass}>USGS ShakeMap Estimated Intensity.</p>
                </div>
            ) : (
                (shakemapProductProps || losspagerProductProps) && <p className="text-xs text-slate-500 my-3">ShakeMap image not found in products for this event.</p>
            )}
            <p className="text-xs text-slate-500 mt-2">Waveform images are not typically available here. Detailed waveform data is available from seismological data centers.</p>
        </div>
    );
}

export default EarthquakeImpactPanel;
