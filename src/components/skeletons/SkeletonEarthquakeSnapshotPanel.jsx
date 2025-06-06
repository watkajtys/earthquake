import React from 'react';
import SkeletonText from './SkeletonText';
import SkeletonBlock from './SkeletonBlock'; // If needed for larger blocks

const SkeletonEarthquakeSnapshotPanel = ({ exhibitPanelClass, exhibitTitleClass }) => {
    return (
        <div className={`${exhibitPanelClass} border-blue-500`}>
            <SkeletonText width="w-1/3" height="h-6 mb-3" className={exhibitTitleClass} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3 text-sm">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex flex-col space-y-1">
                        <SkeletonText width="w-1/4" height="h-4" />
                        <SkeletonText width="w-1/2" height="h-4" />
                    </div>
                ))}
            </div>
             {/* For energy/mmi/pager section */}
            <div className="mt-3 pt-3 border-t border-gray-200">
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-3">
                    {[...Array(3)].map((_, i) => (
                         <div key={i} className="flex flex-col items-center p-2 rounded-md bg-gray-50">
                            <SkeletonText width="w-1/2" height="h-4 mb-1" />
                            <SkeletonText width="w-1/3" height="h-6" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
export default SkeletonEarthquakeSnapshotPanel;
