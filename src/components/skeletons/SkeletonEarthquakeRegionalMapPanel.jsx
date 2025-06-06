import React from 'react';
import SkeletonText from './SkeletonText';
import SkeletonBlock from './SkeletonBlock';

const SkeletonEarthquakeRegionalMapPanel = ({ exhibitPanelClass, exhibitTitleClass }) => {
    return (
        <div className={`${exhibitPanelClass} border-green-500`}>
            <SkeletonText width="w-1/2" height="h-6 mb-3" className={exhibitTitleClass} />
            <SkeletonBlock height="h-48 w-full" /> {/* Placeholder for map area */}
            <div className="mt-2 flex justify-between">
                <SkeletonText width="w-1/4" height="h-4" />
                <SkeletonText width="w-1/3" height="h-4" />
            </div>
        </div>
    );
};
export default SkeletonEarthquakeRegionalMapPanel;
