// src/InteractiveGlobeView.jsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import Globe from 'react-globe.gl';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx';

// makeColorDuller function (kept as is from original)
const makeColorDuller = (colorString, opacityFactor) => {
    const fallbackColor = 'rgba(128,128,128,0.5)';
    let r, g, b, currentAlpha = 1.0;
    if (typeof colorString !== 'string') return fallbackColor;
    try {
        if (colorString.startsWith('#')) {
            let hex = colorString.slice(1);
            if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
            if (hex.length === 6) {
                r = parseInt(hex.substring(0,2), 16);
                g = parseInt(hex.substring(2,4), 16);
                b = parseInt(hex.substring(4,6), 16);
                currentAlpha = 1.0;
            } else return fallbackColor;
        } else if (colorString.startsWith('rgba(') && colorString.endsWith(')')) {
            const parts = colorString.substring(5, colorString.length-1).split(',');
            if (parts.length === 4) {
                r = parseInt(parts[0].trim(),10);
                g = parseInt(parts[1].trim(),10);
                b = parseInt(parts[2].trim(),10);
                currentAlpha = parseFloat(parts[3].trim());
            } else return fallbackColor;
        } else return fallbackColor;
        if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(currentAlpha)) return fallbackColor;
        const newAlpha = Math.max(0,Math.min(1,currentAlpha * opacityFactor));
        return `rgba(${r},${g},${b},${newAlpha.toFixed(3)})`;
    } catch (error) { console.error("Error processing color in makeColorDuller:", colorString, error); return fallbackColor; }
};

const InteractiveGlobeView = ({
    onQuakeClick,
    getMagnitudeColorFunc,
    coastlineGeoJson,
    tectonicPlatesGeoJson,
    highlightedQuakeId,
    activeClusters = [], // Retained, as it's for data, not sizing
    atmosphereColor = "rgb(100,100,255)",
    defaultFocusLat = 20,
    defaultFocusLng = 0,
    defaultFocusAltitude = 2.5,
    allowUserDragRotation = true,
    enableAutoRotation = true,
    globeAutoRotateSpeed = 0.1
}) => {
    const { globeEarthquakes, lastMajorQuake, previousMajorQuake } = useEarthquakeDataState();

    const globeRef = useRef();
    // Removed containerRef, calculatedSize, isInitialMeasurementDone, and related JS sizing useEffects

    const [points, setPoints] = useState([]);
    const [paths, setPaths] = useState([]);
    const [ringsData, setRingsData] = useState([]);

    const [isGlobeHovered, setIsGlobeHovered] = useState(false); // For interaction feedback
    const [isDragging, setIsDragging] = useState(false); // For interaction feedback
    const mouseMoveTimeoutRef = useRef(null); // For hover detection optimization

    // Data processing useEffects (points, paths, rings) - kept from original
    useEffect(() => {
        let allPointsData = (globeEarthquakes || []).map(quake => {
            const isHighlighted = quake.id === highlightedQuakeId;
            const magValue = parseFloat(quake.properties.mag) || 0;
            let pointRadius, pointColor, pointAltitude, pointLabel, pointType;
            if (isHighlighted) {
                pointRadius = Math.max(0.6, (magValue / 7) + 0.4);
                pointColor = getMagnitudeColorFunc(magValue);
                pointAltitude = 0.03;
                pointLabel = `LATEST SIGNIFICANT: M${quake.properties.mag?.toFixed(1)} - ${quake.properties.place}`;
                pointType = 'highlighted_significant_quake';
            } else {
                pointRadius = Math.max(0.15, (magValue / 7) + 0.05);
                pointColor = getMagnitudeColorFunc(quake.properties.mag);
                pointAltitude = 0.01;
                pointLabel = `M${quake.properties.mag?.toFixed(1)} - ${quake.properties.place}`;
                pointType = 'recent_quake';
            }
            return { lat: quake.geometry?.coordinates?.[1], lng: quake.geometry?.coordinates?.[0], altitude: pointAltitude, radius: pointRadius, color: pointColor, label: pointLabel, quakeData: quake, type: pointType };
        }).filter(p => typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng));

        if (previousMajorQuake && previousMajorQuake.id && previousMajorQuake.geometry?.coordinates && previousMajorQuake.properties) {
            const prevMagValue = parseFloat(previousMajorQuake.properties.mag) || 0;
            let foundAndUpdated = false;
            allPointsData = allPointsData.map(p => {
                if (p.quakeData.id === previousMajorQuake.id) {
                    foundAndUpdated = true;
                    if (p.quakeData.id === highlightedQuakeId) {
                        return { ...p, label: `LATEST & PREVIOUS SIG: M${previousMajorQuake.properties.mag?.toFixed(1)} - ${previousMajorQuake.properties.place}`, type: 'highlighted_previous_significant_quake' };
                    }
                    return { ...p, radius: Math.max(0.55, (prevMagValue / 7) + 0.35), color: getMagnitudeColorFunc(prevMagValue), altitude: 0.025, label: `PREVIOUS SIGNIFICANT: M${previousMajorQuake.properties.mag?.toFixed(1)} - ${previousMajorQuake.properties.place}`, type: 'previous_major_quake' };
                }
                return p;
            });
            if (!foundAndUpdated && previousMajorQuake.id !== highlightedQuakeId) {
                 allPointsData.push({ lat: previousMajorQuake.geometry.coordinates[1], lng: previousMajorQuake.geometry.coordinates[0], altitude: 0.025, radius: Math.max(0.55, (parseFloat(previousMajorQuake.properties.mag) || 0 / 7) + 0.35), color: getMagnitudeColorFunc(previousMajorQuake.properties.mag), label: `PREVIOUS SIGNIFICANT: M${previousMajorQuake.properties.mag?.toFixed(1)} - ${previousMajorQuake.properties.place}`, quakeData: previousMajorQuake, type: 'previous_major_quake'});
            }
        }
        // Active clusters logic (commented out in original) can be re-inserted here if needed
        setPoints(allPointsData);
    }, [globeEarthquakes, getMagnitudeColorFunc, highlightedQuakeId, previousMajorQuake, activeClusters]);

    useEffect(() => {
        let processedPaths = [];
        if (coastlineGeoJson?.type === "GeometryCollection" && Array.isArray(coastlineGeoJson.geometries)) {
            processedPaths = processedPaths.concat(coastlineGeoJson.geometries.filter(g => g.type === "LineString").map((g,i) => ({id: `coastline-${i}`, coords: g.coordinates, color:'rgb(208,208,214)', stroke:0.25, label:'Coastline', properties:{Boundary_Type:'Coastline'}})));
        }
        if (tectonicPlatesGeoJson?.type === "FeatureCollection" && Array.isArray(tectonicPlatesGeoJson.features)) {
            processedPaths = processedPaths.concat(tectonicPlatesGeoJson.features.filter(f => f.geometry?.type === "LineString").map((f,i) => { let color = 'rgba(255,165,0,0.8)'; const type=f.properties?.Boundary_Type; if(type==='Convergent')color='rgba(220,20,60,0.8)';else if(type==='Divergent')color='rgba(60,179,113,0.8)';else if(type==='Transform')color='rgba(70,130,180,0.8)'; return {id:`plate-${f.properties?.OBJECTID||i}`, coords:f.geometry.coordinates, color, stroke:1, label:`Plate Boundary: ${type||'Unknown'}`, properties:f.properties};}));
        }
        setPaths(processedPaths);
    }, [coastlineGeoJson, tectonicPlatesGeoJson]);

    useEffect(() => {
        const newRings = [];
        if (lastMajorQuake && lastMajorQuake.geometry && lastMajorQuake.properties && typeof lastMajorQuake.properties.mag === 'number') {
            const coords = lastMajorQuake.geometry.coordinates; const mag = parseFloat(lastMajorQuake.properties.mag);
            newRings.push({ id:`major_quake_ring_latest_${lastMajorQuake.id}_${lastMajorQuake.properties.time}_${Date.now()}`, lat:coords[1],lng:coords[0],altitude:0.02,color:()=>getMagnitudeColorFunc(mag),maxR:Math.max(6,mag*2.2),propagationSpeed:Math.max(2,mag*0.5),repeatPeriod:1800 });
        }
        if (previousMajorQuake && previousMajorQuake.geometry && previousMajorQuake.properties && typeof previousMajorQuake.properties.mag === 'number') {
            const coords = previousMajorQuake.geometry.coordinates; const mag = parseFloat(previousMajorQuake.properties.mag); const baseColor = getMagnitudeColorFunc(mag);
            newRings.push({ id:`major_quake_ring_prev_${previousMajorQuake.id}_${previousMajorQuake.properties.time}_${Date.now()}`, lat:coords[1],lng:coords[0],altitude:0.018,color:()=>makeColorDuller(baseColor,0.7),maxR:Math.max(5,mag*2.0),propagationSpeed:Math.max(1.8,mag*0.45),repeatPeriod:1900 });
        }
        if (newRings.length > 0 || ringsData.length > 0) setRingsData(newRings);
    }, [lastMajorQuake, previousMajorQuake, getMagnitudeColorFunc, ringsData.length]);

    // Globe interaction useEffects - these do not depend on JS-calculated dimensions
    useEffect(() => {
        // The globe might not be rendered immediately if we were doing conditional rendering,
        // but with pure CSS sizing, globeRef should be available once this component renders.
        if (globeRef.current?.pointOfView) {
            const targetLatitude = (typeof defaultFocusLat === 'number' && !isNaN(defaultFocusLat)) ? defaultFocusLat : 20;
            const targetLongitude = (typeof defaultFocusLng === 'number' && !isNaN(defaultFocusLng)) ? defaultFocusLng : 0;
            globeRef.current.pointOfView({ lat: targetLatitude, lng: targetLongitude, altitude: defaultFocusAltitude }, 0);
        }
    }, [defaultFocusLat, defaultFocusLng, defaultFocusAltitude]); // Removed globeDimensions/calculatedSize

    useEffect(() => {
        const globeInstance = globeRef.current;
        if (!globeInstance?.controls || typeof globeInstance.controls !== 'function') {
            return;
        }
        const controls = globeInstance.controls();
        if (!controls) return;

        controls.enableRotate = allowUserDragRotation;
        controls.enablePan = allowUserDragRotation;
        controls.enableZoom = allowUserDragRotation;

        if (enableAutoRotation) {
            if (isGlobeHovered || isDragging) { if (controls.autoRotate !== false) controls.autoRotate = false; }
            else { if (controls.autoRotate !== true) controls.autoRotate = true; const targetSpeed = -Math.abs(globeAutoRotateSpeed * 20); if (controls.autoRotateSpeed !== targetSpeed) controls.autoRotateSpeed = targetSpeed; }
        } else { if (controls.autoRotate !== false) controls.autoRotate = false; if (controls.autoRotateSpeed !== 0) controls.autoRotateSpeed = 0; }

        const handleDragStart = () => setIsDragging(true);
        const handleDragEnd = () => setIsDragging(false);
        controls.addEventListener('start', handleDragStart);
        controls.addEventListener('end', handleDragEnd);

        return () => { if (globeInstance.controls()) { controls.removeEventListener('start', handleDragStart); controls.removeEventListener('end', handleDragEnd); }};
    }, [allowUserDragRotation, enableAutoRotation, globeAutoRotateSpeed, isGlobeHovered, isDragging]); // Removed globeDimensions/calculatedSize

    const handlePointClick = useCallback((point) => { if (point?.quakeData) onQuakeClick(point.quakeData); }, [onQuakeClick]);

    const handleContainerMouseMove = useCallback((event) => {
        // For pure CSS sizing, containerRef is not strictly needed for size calculation here.
        // Hover detection needs to be relative to the globe's actual element.
        if (!globeRef.current || typeof globeRef.current.getGlobeEl !== 'function' || typeof globeRef.current.toGlobeCoords !== 'function') return;

        if (mouseMoveTimeoutRef.current) clearTimeout(mouseMoveTimeoutRef.current);

        mouseMoveTimeoutRef.current = setTimeout(() => {
            const globeElement = globeRef.current.getGlobeEl(); // Get the underlying canvas/div
            if (!globeElement) {
                 if (isGlobeHovered) setIsGlobeHovered(false); // If globe element isn't there, not hovering
                return;
            }
            const rect = globeElement.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            const globeCoords = globeRef.current.toGlobeCoords(x, y);
            const currentlyOverGlobe = !!globeCoords && x >= 0 && x <= rect.width && y >= 0 && y <= rect.height; // Check if within bounds

            if (currentlyOverGlobe !== isGlobeHovered) {
                setIsGlobeHovered(currentlyOverGlobe);
            }
        }, 30);
    }, [isGlobeHovered, setIsGlobeHovered]); // globeRef is stable

    const handleContainerMouseLeave = useCallback(() => {
        if (mouseMoveTimeoutRef.current) clearTimeout(mouseMoveTimeoutRef.current);
        if (isGlobeHovered) setIsGlobeHovered(false);
    }, [isGlobeHovered, setIsGlobeHovered]);

    return (
        <div
            className="w-full h-full relative overflow-hidden" // Strict containment
            style={{ cursor: isGlobeHovered ? 'grab' : (allowUserDragRotation ? 'grab' : 'default') }} // Dynamic cursor
            onMouseMove={handleContainerMouseMove}
            onMouseLeave={handleContainerMouseLeave}
        >
            <Globe
                ref={globeRef}
                width="100%" // Fill parent
                height="100%" // Fill parent
                globeImageUrl={null}
                bumpImageUrl={null}
                backgroundImageUrl={null}
                backgroundColor="rgba(0,0,0,0)"
                atmosphereColor={atmosphereColor}
                atmosphereAltitude={0.15}
                pointsData={points}
                pointLat="lat" pointLng="lng" pointAltitude="altitude"
                pointRadius="radius" pointColor="color" pointLabel="label"
                pointsMerge={false} pointsTransitionDuration={0}
                onPointClick={handlePointClick}
                pathsData={paths}
                pathPoints="coords" pathPointLat={p => p[1]} pathPointLng={p => p[0]}
                pathColor={path => path.color} pathStroke={path => path.stroke}
                pathLabel={path => path.label} pathTransitionDuration={0}
                ringsData={ringsData}
                ringLat="lat" ringLng="lng" ringAltitude="altitude"
                ringColor="color" ringMaxRadius="maxR"
                ringPropagationSpeed="propagationSpeed" ringRepeatPeriod="repeatPeriod"
                ringResolution={128}
                enablePointerInteraction={true}
            />
        </div>
    );
};

export default InteractiveGlobeView;