import React from 'react';
import SkeletonText from './SkeletonText';
import SkeletonBlock from './SkeletonBlock';

const SkeletonEarthquakeLocationPanel = ({ exhibitPanelClass, exhibitTitleClass }) => {
    return (
        <div className={`${exhibitPanelClass} border-indigo-500`}>
            <SkeletonText width="w-1/3" height="h-6 mb-3" className={exhibitTitleClass} />
            <SkeletonText width="w-full" height="h-4 mb-1" />
            <SkeletonText width="w-3/4" height="h-4 mb-3" />
            <SkeletonBlock height="h-24 w-full mb-2" /> {/* Diagram placeholder */}
            <SkeletonText width="w-1/2" height="h-3" /> {/* Caption */}
        </div>
    );
};
export default SkeletonEarthquakeLocationPanel;
