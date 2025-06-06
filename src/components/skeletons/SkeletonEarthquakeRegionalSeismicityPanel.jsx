import React from 'react';
import SkeletonText from './SkeletonText';
import SkeletonBlock from './SkeletonBlock';

const SkeletonEarthquakeRegionalSeismicityPanel = ({ exhibitPanelClass }) => {
    return (
        <div className={`${exhibitPanelClass} border-cyan-500`}>
            {/* Mimicking RegionalSeismicityChart's loading title */}
            <SkeletonText width="w-1/2" height="h-5 mb-2" />
            {/* Mimicking the text line below title in RegionalSeismicityChart */}
            <SkeletonText width="w-full" height="h-3 mb-1" />
            <SkeletonText width="w-5/6" height="h-3 mb-2" />
            {/* Placeholder for chart area */}
            <SkeletonBlock height="h-40 w-full" />
        </div>
    );
};
export default SkeletonEarthquakeRegionalSeismicityPanel;
