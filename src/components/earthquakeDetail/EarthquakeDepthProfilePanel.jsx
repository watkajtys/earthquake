import React from 'react';
import SimplifiedDepthProfile from '../SimplifiedDepthProfile'; // Adjusted path

function EarthquakeDepthProfilePanel({
    detailData,
    exhibitPanelClass
}) {
    // Guard condition based on the original rendering logic
    if (!detailData?.geometry?.coordinates?.[2] !== undefined && detailData?.properties?.mag !== undefined) {
        // This condition seems a bit off. It should likely be:
        // !(detailData?.geometry?.coordinates?.[2] !== undefined && detailData?.properties?.mag !== undefined)
        // or more simply:
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

export default EarthquakeDepthProfilePanel;
