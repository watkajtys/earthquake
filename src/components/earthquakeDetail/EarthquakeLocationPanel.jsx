import React, { memo } from 'react';
import { isValidNumber, formatNumber } from '../../utils/utils.js';
import InfoSnippet from '../InfoSnippet.jsx'; // Corrected import path

// SVG Icons (simple placeholders for now)
const NstIcon = () => (
    <svg viewBox="0 0 50 50" fill="currentColor" className="w-12 h-12 mb-2 text-sky-600">
        <path d="M10 40 H40 V45 H10z M15 35 H35 V40 H15z M20 30 H30 V35 H20z M25 5 L25 30 M15 15 L25 5 L35 15" stroke="currentColor" strokeWidth="2" fill="none"/>
    </svg>
);
const GapIcon = () => (
    <svg viewBox="0 0 50 50" fill="none" stroke="currentColor" strokeWidth="3" className="w-12 h-12 mb-2 text-sky-600">
        <circle cx="25" cy="25" r="18" strokeDasharray="100 15" transform="rotate(-30 25 25)"/>
        <path d="M25 25 L43 25" strokeWidth="1" strokeDasharray="2 2"/>
        <path d="M25 25 L25+18*0.866 25-18*0.5" strokeWidth="1" strokeDasharray="2 2"/>
    </svg>
);
const DminIcon = () => (
    <svg viewBox="0 0 50 50" fill="currentColor" className="w-12 h-12 mb-2 text-sky-600">
        <circle cx="25" cy="25" r="4" />
        <circle cx="10" cy="10" r="3" />
        <path d="M23 23 L12 12" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2"/>
        <text x="10" y="20" fontSize="8">DMIN</text>
    </svg>
);
const RmsIcon = () => (
    <svg viewBox="0 0 50 50" fill="none" stroke="currentColor" strokeWidth="2" className="w-12 h-12 mb-2 text-sky-600">
        <path d="M5 45 L15 30 L25 35 L35 15 L45 20"/>
        <circle cx="25" cy="25" r="18" opacity="0.3"/>
        <circle cx="25" cy="25" r="3" fill="red"/>
    </svg>
);


function EarthquakeLocationPanel({
    properties,
    originProductProps,
    exhibitPanelClass,
    exhibitTitleClass,
    // diagramContainerClass, // No longer needed
    // captionClass // No longer needed
}) {
    // Conditional rendering based on the original logic
    if (!(originProductProps || (properties && (isValidNumber(properties.nst) || isValidNumber(properties.gap) || isValidNumber(properties.dmin) || isValidNumber(properties.rms))))) {
        return null;
    }

    const nst = isValidNumber(originProductProps?.['num-stations-used']) ? originProductProps['num-stations-used'] : properties?.nst;
    const gap = isValidNumber(originProductProps?.['azimuthal-gap']) ? originProductProps['azimuthal-gap'] : properties?.gap;
    const dmin = isValidNumber(originProductProps?.['minimum-distance']) ? originProductProps['minimum-distance'] : properties?.dmin;
    const rms = isValidNumber(originProductProps?.['standard-error']) ? originProductProps['standard-error'] : properties?.rms;

    return (
        <div className={`${exhibitPanelClass} border-sky-500`}>
            <h2 className={`${exhibitTitleClass} text-sky-800 border-sky-300`}>Pinpointing the Quake</h2>
            <p className="mb-4 text-xs md:text-sm text-gray-600">Location quality based on available data:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {isValidNumber(nst) && (
                    <div className="bg-slate-50 p-3 rounded-lg shadow-md flex flex-col items-center text-center transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-105 focus-within:ring-2 focus-within:ring-sky-500 focus-within:ring-offset-2">
                        <NstIcon />
                        <h3 className="text-sm font-semibold text-slate-700 mb-0.5">Stations Used</h3>
                        <p className="text-lg font-bold text-sky-700 mb-1.5">{nst}</p>
                        <InfoSnippet topic="stationsUsed" />
                    </div>
                )}
                {isValidNumber(gap) && (
                    <div className="bg-slate-50 p-3 rounded-lg shadow-md flex flex-col items-center text-center transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-105 focus-within:ring-2 focus-within:ring-sky-500 focus-within:ring-offset-2">
                        <GapIcon />
                        <h3 className="text-sm font-semibold text-slate-700 mb-0.5">Azimuthal Gap</h3>
                        <p className="text-lg font-bold text-sky-700 mb-1.5">
                            {formatNumber(gap, 0)}
                            <span className="text-sm font-normal text-slate-500 ml-1">°</span>
                        </p>
                        <InfoSnippet topic="azimuthalGap" />
                    </div>
                )}
                {isValidNumber(dmin) && (
                    <div className="bg-slate-50 p-3 rounded-lg shadow-md flex flex-col items-center text-center transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-105 focus-within:ring-2 focus-within:ring-sky-500 focus-within:ring-offset-2">
                        <DminIcon />
                        <h3 className="text-sm font-semibold text-slate-700 mb-0.5">Nearest Station (DMIN)</h3>
                        <p className="text-lg font-bold text-sky-700">
                            {formatNumber(dmin, 1)}
                            <span className="text-sm font-normal text-slate-500 ml-1">°</span>
                        </p>
                        <p className="text-xs text-slate-500 mb-1.5">~{formatNumber(dmin * 111, 0)} km</p>
                        <InfoSnippet topic="nearestStation" />
                    </div>
                )}
                {isValidNumber(rms) && (
                    <div className="bg-slate-50 p-3 rounded-lg shadow-md flex flex-col items-center text-center transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-105 focus-within:ring-2 focus-within:ring-sky-500 focus-within:ring-offset-2">
                        <RmsIcon />
                        <h3 className="text-sm font-semibold text-slate-700 mb-0.5">RMS Error</h3>
                        <p className="text-lg font-bold text-sky-700 mb-1.5">
                            {formatNumber(rms, 2)}
                            <span className="text-sm font-normal text-slate-500 ml-1">s</span>
                        </p>
                        <InfoSnippet topic="rmsError" />
                    </div>
                )}
            </div>
        </div>
    );
}

export default memo(EarthquakeLocationPanel);
