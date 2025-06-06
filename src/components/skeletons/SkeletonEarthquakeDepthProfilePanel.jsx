import React from 'react';
import SkeletonText from './SkeletonText';
import SkeletonBlock from './SkeletonBlock';

const SkeletonEarthquakeDepthProfilePanel = ({ exhibitPanelClass }) => {
    return (
        <div className={`${exhibitPanelClass} border-purple-500`}>
             {/* SimplifiedDepthProfile has its own title, so we mimic that */}
            <SkeletonText width="w-1/2" height="h-5 mb-2" />
            <SkeletonBlock height="h-24 w-full" /> {/* Placeholder for depth profile chart */}
        </div>
    );
};
export default SkeletonEarthquakeDepthProfilePanel;
