import React, { memo } from 'react';
import SimplifiedDepthProfile from '../SimplifiedDepthProfile'; // Adjusted path

function EarthquakeDepthProfilePanel({
    detailData,
    exhibitPanelClass
}) {
    // Guard condition based on the original rendering logic
    if (!(detailData &&
        detailData.geometry &&
        detailData.geometry.coordinates &&
        detailData.geometry.coordinates[2] !== undefined &&
        detailData.properties &&
        detailData.properties.mag !== undefined)) {
        return null; // Or some fallback UI
    }

    return (
        <div className={`${exhibitPanelClass} border-amber-500`}>
            <SimplifiedDepthProfile
                earthquakeDepth={detailData.geometry.coordinates[2]}
                magnitude={detailData.properties.mag}
            />
        </div>
    );
}

export default memo(EarthquakeDepthProfilePanel);
