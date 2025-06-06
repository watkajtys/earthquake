import React from 'react';
import SkeletonText from './SkeletonText';
import SkeletonBlock from './SkeletonBlock';

const SkeletonEarthquakeSeismicWavesPanel = ({ exhibitPanelClass, exhibitTitleClass }) => {
    return (
        <div className={`${exhibitPanelClass} border-teal-500`}>
            <SkeletonText width="w-1/2" height="h-6 mb-3" className={exhibitTitleClass} />
            <SkeletonBlock height="h-32 w-full" /> {/* Placeholder for seismic waves diagram */}
            <SkeletonText width="w-full" height="h-3 mt-2" /> {/* Caption */}
        </div>
    );
};
export default SkeletonEarthquakeSeismicWavesPanel;
