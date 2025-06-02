import React from 'react';
import { isValidString } from '../../utils/detailViewUtils.js';

// Assuming isValidString will be passed as a prop or defined/imported here
// For now, let's assume it's passed as a prop as per instructions.

function EarthquakeDetailHeader({ properties }) { // Removed isValidString from props
    if (!properties || !isValidString(properties.title)) { // isValidString is now imported
        return null; // Or some fallback UI if the title is not valid
    }

    return (
        <header className="text-center p-4 md:p-5 bg-white rounded-t-lg border-b border-gray-300">
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-blue-700">Unpacking the Shakes!</h1>
            <p id="earthquake-detail-title" className="text-md text-slate-600 mt-1">{properties.title}</p>
        </header>
    );
}

export default EarthquakeDetailHeader;
