import React, { memo } from 'react';
import { getFaultType } from '../../utils/detailViewUtils.js';
import tectonicBoundariesData from '../../assets/TectonicPlateBoundaries.json';

const defaultPanelClass = "p-3 bg-white rounded-lg shadow";
const defaultTitleClass = "text-lg font-semibold text-gray-800 mb-2 pb-1 border-b border-gray-300";

/**
 * Calculates the Haversine distance between two points on the Earth.
 * @param {number} lat1 Latitude of point 1
 * @param {number} lon1 Longitude of point 1
 * @param {number} lat2 Latitude of point 2
 * @param {number} lon2 Longitude of point 2
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Finds the closest tectonic boundary feature and distance to the earthquake.
 * This implementation uses Haversine distance to each vertex of the boundary lines.
 * @param {number} earthquakeLat
 * @param {number} earthquakeLon
 * @param {Array} boundaries - Array of GeoJSON features (LineStrings)
 * @returns {object|null} { feature: closestFeature, distance: minDistanceKm, closestPoint: {lat, lon} } or null
 */
function findClosestBoundary(earthquakeLat, earthquakeLon, boundaries) {
    let minDistanceKm = Infinity;
    let closestFeature = null;
    let closestPointOnBoundary = null;

    boundaries.forEach(feature => {
        if (feature.geometry && feature.geometry.type === 'LineString') {
            feature.geometry.coordinates.forEach(coordPair => {
                const boundaryLat = coordPair[1];
                const boundaryLon = coordPair[0];
                const distance = haversineDistance(earthquakeLat, earthquakeLon, boundaryLat, boundaryLon);
                if (distance < minDistanceKm) {
                    minDistanceKm = distance;
                    closestFeature = feature;
                    closestPointOnBoundary = { lat: boundaryLat, lon: boundaryLon };
                }
            });
        }
    });

    if (closestFeature) {
        return { feature: closestFeature, distance: minDistanceKm, closestPoint: closestPointOnBoundary };
    }
    return null;
}

/**
 * Generates descriptive text based on fault type and closest boundary information.
 */
function generateTectonicContextText(faultType, closestBoundaryInfo, intraplateDistanceThresholdKm = 750) {
    const faultTypeName = faultType.name || "Unknown Fault Type";
    let text = "";

    if (!closestBoundaryInfo || closestBoundaryInfo.distance > intraplateDistanceThresholdKm) {
        text = `This ${faultTypeName.toLowerCase()} appears to be an intraplate event, occurring away from major plate boundaries (closest boundary found > ${intraplateDistanceThresholdKm} km). Such earthquakes can result from stresses built up within a tectonic plate.`;
        return text;
    }

    const boundaryType = closestBoundaryInfo.feature.properties?.Boundary_Type || "Unknown";
    const distanceKm = Math.round(closestBoundaryInfo.distance);

    text = `This ${faultTypeName.toLowerCase()} occurred approximately ${distanceKm} km from a ${boundaryType.toLowerCase()} plate boundary. `;

    if (boundaryType === "Convergent") {
        if (faultTypeName.includes("Reverse") || faultTypeName.includes("Thrust")) {
            text += "Reverse faulting, like this event, is common at convergent boundaries where tectonic plates collide, causing one plate to be pushed over another. This compression leads to significant earthquake activity.";
        } else if (faultTypeName.includes("Normal")) {
            text += "While this area is a convergent boundary, normal faulting can sometimes occur due to stresses from the bending of the subducting plate or extension in the overriding plate.";
        } else if (faultTypeName.includes("Strike-Slip")) {
            text += "Strike-slip faulting can also occur at convergent boundaries due to complex stresses as plates interact and accommodate oblique convergence.";
        } else {
            text += "The interaction at this convergent boundary can produce various types of faulting."
        }
    } else if (boundaryType === "Divergent") {
        if (faultTypeName.includes("Normal")) {
            text += "Normal faulting is characteristic of divergent boundaries where tectonic plates are pulling apart. This tensional stress causes blocks of the Earth's crust to drop down, generating earthquakes.";
        } else if (faultTypeName.includes("Strike-Slip")) {
            text += "Divergent boundaries are often segmented by transform faults, leading to strike-slip earthquakes as sections of the spreading ridge move past each other.";
        } else {
             text += "The tensional environment at this divergent boundary typically leads to normal faulting."
        }
    } else if (boundaryType === "Transform") {
        if (faultTypeName.includes("Strike-Slip")) {
            text += "Strike-slip faulting is the hallmark of transform boundaries, where tectonic plates slide horizontally past one another. This movement builds up stress that is released as earthquakes.";
        } else if (faultTypeName.includes("Normal") || faultTypeName.includes("Reverse")) {
            text += "Occasionally, bends or steps in transform faults can create localized areas of tension (leading to normal faults) or compression (leading to reverse faults).";
        } else {
            text += "Movement along this transform boundary primarily results in strike-slip faulting."
        }
    } else { // Unknown boundary type
        text += `The earthquake occurred near a plate boundary whose specific type is not detailed in our dataset. However, a ${faultTypeName.toLowerCase()} suggests `;
        if (faultTypeName.includes("Strike-Slip")) text += "horizontal sliding of crustal blocks. ";
        else if (faultTypeName.includes("Normal")) text += "tensional forces and vertical displacement. ";
        else if (faultTypeName.includes("Reverse") || faultTypeName.includes("Thrust")) text += "compressional forces and vertical displacement. ";
        else text += "crustal movement. ";
    }
    return text;
}


function EarthquakeTectonicContextPanel({
    detailData,
    properties,
    exhibitPanelClass = defaultPanelClass,
    exhibitTitleClass = defaultTitleClass,
}) {
    if (!detailData || !detailData.geometry || !detailData.geometry.coordinates) {
        return (
            <div className={`${exhibitPanelClass} border-orange-500`}>
                <h2 className={`${exhibitTitleClass} text-orange-800 border-orange-200`}>Tectonic Context</h2>
                <p className="text-sm text-slate-500">Earthquake location data is not available.</p>
            </div>
        );
    }

    const coords = detailData.geometry.coordinates;
    const longitude = coords[0];
    const latitude = coords[1];
    const place = properties?.place || "Unknown location";

    let rake = NaN;
    const momentTensorProduct = detailData.properties?.products?.['moment-tensor']?.[0];
    const originProduct = detailData.properties?.products?.origin?.[0];

    if (momentTensorProduct?.properties?.['nodal-plane-1-rake'] !== undefined) {
        rake = parseFloat(momentTensorProduct.properties['nodal-plane-1-rake']);
    } else if (originProduct?.properties?.rake !== undefined) {
        rake = parseFloat(originProduct.properties.rake);
    }

    const faultType = getFaultType(rake);
    const closestBoundaryInfo = findClosestBoundary(latitude, longitude, tectonicBoundariesData.features);
    const tectonicContextText = generateTectonicContextText(faultType, closestBoundaryInfo);

    const svgWidth = 300;
    const svgHeight = 180;
    const viewBox = `0 0 ${svgWidth} ${svgHeight}`;

    const displayLatRange = 20;
    const displayLonRange = 20;
    const minLat = latitude - (displayLatRange / 2);
    const maxLat = latitude + (displayLatRange / 2);
    const minLon = longitude - (displayLonRange / 2);
    const maxLon = longitude + (displayLonRange / 2);

    const mapLonToX = (lon) => ((lon - minLon) / (maxLon - minLon)) * svgWidth;
    const mapLatToY = (lat) => svgHeight - (((lat - minLat) / (maxLat - minLat)) * svgHeight);

    // Filter boundaries for map display (can be different from the search for closest)
    const mapDisplayBoundaries = tectonicBoundariesData.features.filter(feature => {
        if (feature.geometry.type === 'LineString') {
            return feature.geometry.coordinates.some(coordPair => {
                const lon = coordPair[0];
                const lat = coordPair[1];
                return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
            });
        }
        return false;
    });

    const boundaryTypeColors = {
        "Convergent": "#ef4444", "Divergent": "#3b82f6", "Transform": "#10b981", "Unknown": "#6b7280"
    };

    return (
        <div className={`${exhibitPanelClass} border-orange-500`}>
            <h2 className={`${exhibitTitleClass} text-orange-800 border-orange-200`}>Tectonic Context</h2>

            <div className="mt-2 text-sm">
                <p><strong className="text-gray-700">Location:</strong> {place}</p>
                <p><strong className="text-gray-700">Coordinates:</strong> {latitude.toFixed(2)}°N, {longitude.toFixed(2)}°E</p>
                {faultType && faultType.name !== "Unknown Fault Type" && (
                    <p><strong className="text-gray-700">Fault Type:</strong> {faultType.name}</p>
                )}
            </div>

            <div className="mt-3" style={{ minHeight: `${svgHeight + 20}px` }}>
                <svg width="100%" height={svgHeight} viewBox={viewBox} className="bg-slate-100 rounded border border-orange-300">
                    {mapDisplayBoundaries.map((feature, index) => {
                        const points = feature.geometry.coordinates.map(coord =>
                            `${mapLonToX(coord[0])},${mapLatToY(coord[1])}`
                        ).join(' ');
                        const type = feature.properties?.Boundary_Type || "Unknown";
                        const color = boundaryTypeColors[type] || boundaryTypeColors.Unknown;
                        const isClosest = closestBoundaryInfo && feature === closestBoundaryInfo.feature;
                        return (
                            <polyline
                                key={`boundary-${index}`}
                                points={points}
                                stroke={color}
                                strokeWidth={isClosest ? "3" : "1.5"} // Highlight closest boundary
                                fill="none"
                            />
                        );
                    })}
                    {closestBoundaryInfo && closestBoundaryInfo.closestPoint && (
                         <line
                            x1={mapLonToX(longitude)}
                            y1={mapLatToY(latitude)}
                            x2={mapLonToX(closestBoundaryInfo.closestPoint.lon)}
                            y2={mapLatToY(closestBoundaryInfo.closestPoint.lat)}
                            stroke="#000000"
                            strokeWidth="0.75"
                            strokeDasharray="3,3"
                        />
                    )}
                    <circle
                        cx={mapLonToX(longitude)}
                        cy={mapLatToY(latitude)}
                        r="4"
                        fill="gold"
                        stroke="black"
                        strokeWidth="1"
                    />
                     <text
                        x={mapLonToX(longitude) + 5}
                        y={mapLatToY(latitude) - 5}
                        fontSize="10" fill="#333"
                    >
                        ★ Event
                    </text>

                    <g transform="translate(5, 10)">
                        {Object.entries(boundaryTypeColors).map(([type, color], i) => (
                            type === "Unknown" ? null :
                            <g key={type} transform={`translate(0, ${i * 12})`}>
                                <line x1="0" y1="0" x2="10" y2="0" stroke={color} strokeWidth="2" />
                                <text x="15" y="3" fontSize="8" fill="#333">{type}</text>
                            </g>
                        ))}
                    </g>
                </svg>
            </div>

            <p className="mt-3 text-xs text-slate-600">
                {tectonicContextText}
            </p>
        </div>
    );
}

export default memo(EarthquakeTectonicContextPanel);
