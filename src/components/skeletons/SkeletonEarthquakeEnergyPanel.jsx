import React from 'react';
import SkeletonText from './SkeletonText';

const SkeletonEarthquakeEnergyPanel = ({ exhibitPanelClass, exhibitTitleClass }) => {
    return (
        <div className={`${exhibitPanelClass} border-orange-500`}>
            <SkeletonText width="w-1/3" height="h-6 mb-3" className={exhibitTitleClass} />
            <SkeletonText width="w-full" height="h-4 mb-2" />
            <SkeletonText width="w-3/4" height="h-4 mb-2" />
            <SkeletonText width="w-1/2" height="h-4" />
        </div>
    );
};
export default SkeletonEarthquakeEnergyPanel;
