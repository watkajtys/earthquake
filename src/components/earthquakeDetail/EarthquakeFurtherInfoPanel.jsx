import React from 'react';
import { isValidString } from '../../utils/utils.js'; // Assuming this path is correct

function EarthquakeFurtherInfoPanel({
    properties,
    // isValidString, // Now imported
    exhibitPanelClass,
    exhibitTitleClass
}) {
    // Conditional rendering based on the original logic
    if (!isValidString(properties?.url)) { // isValidString is now imported
        return null;
    }

    return (
        <div className={`${exhibitPanelClass} border-gray-400`}>
            <h2 className={`${exhibitTitleClass} text-gray-700 border-gray-200`}>Further Information</h2>
            <p className="text-xs md:text-sm text-slate-600">
                For the most comprehensive and up-to-date scientific details, including additional data products, maps, and information from contributing seismic networks, please refer to the official
                <a href={properties.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline ml-1">
                    USGS Event Page
                </a>.
            </p>
        </div>
    );
}

export default EarthquakeFurtherInfoPanel;
