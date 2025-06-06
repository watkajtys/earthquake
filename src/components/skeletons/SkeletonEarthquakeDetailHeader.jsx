import React from 'react';
import SkeletonText from './SkeletonText';

const SkeletonEarthquakeDetailHeader = () => {
    return (
        <div className="p-3 md:p-4 bg-gray-700 text-white rounded-t-lg">
            {/* Mimic title line */}
            <SkeletonText width="w-3/4" height="h-7 mb-2" />
            {/* Mimic sub-header line */}
            <SkeletonText width="w-1/2" height="h-5" />
        </div>
    );
};
export default SkeletonEarthquakeDetailHeader;
