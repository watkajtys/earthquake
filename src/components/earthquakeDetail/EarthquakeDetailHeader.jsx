import React, { memo } from 'react';
import { isValidString } from '../../utils/utils.js';

// Assuming isValidString will be passed as a prop or defined/imported here
// For now, let's assume it's passed as a prop as per instructions.

function EarthquakeDetailHeader({ properties }) { // Removed isValidString from props
    if (!properties || !isValidString(properties.title)) { // isValidString is now imported
        return null; // Or some fallback UI if the title is not valid
    }

    return (
        <header className="text-center p-4 md:p-5 bg-white rounded-t-lg border-b border-gray-300">
            <h1 id="earthquake-detail-title" className="text-xl md:text-2xl lg:text-3xl font-bold text-slate-800">
                {properties.title}
            </h1>
        </header>
    );
}

export default memo(EarthquakeDetailHeader);
