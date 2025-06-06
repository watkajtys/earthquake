import React from 'react';
import SkeletonText from './SkeletonText';
import SkeletonBlock from './SkeletonBlock';

const SkeletonEarthquakeImpactPanel = ({ exhibitPanelClass, exhibitTitleClass }) => {
    return (
        <div className={`${exhibitPanelClass} border-red-500`}>
            <SkeletonText width="w-1/2" height="h-6 mb-3" className={exhibitTitleClass} />
            {/* For ShakeMap section */}
            <SkeletonText width="w-1/4" height="h-5 mb-2" />
            <SkeletonBlock height="h-32 w-full mb-2" /> {/* Shakemap image placeholder */}
            <SkeletonText width="w-full" height="h-3 mb-3" /> {/* Caption */}
            {/* For PAGER section */}
            <SkeletonText width="w-1/4" height="h-5 mb-2" />
            <SkeletonBlock height="h-16 w-full" /> {/* PAGER alert placeholder */}
        </div>
    );
};
export default SkeletonEarthquakeImpactPanel;
