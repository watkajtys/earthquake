// src/InteractiveGlobeView.jsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import Globe from 'react-globe.gl';

const InteractiveGlobeView = ({
                                  earthquakes,
                                  onQuakeClick,
                                  getMagnitudeColorFunc,
                                  coastlineGeoJson,
                                  tectonicPlatesGeoJson,
                                  highlightedQuakeId,
                                  latestMajorQuakeForRing,
                                  atmosphereColor = "rgba(100,100,255,0.3)",
                                  defaultFocusLat = 20,
                                  defaultFocusLng = 0,
                                  defaultFocusAltitude = 2.5,
                                  allowUserDragRotation = false,
                                  enableAutoRotation = true,
                                  globeAutoRotateSpeed = 0.1
                              }) => {
    const globeRef = useRef();
    const containerRef = useRef(null);
    const [points, setPoints] = useState([]);
    const [paths, setPaths] = useState([]);
    const [globeDimensions, setGlobeDimensions] = useState({ width: null, height: null });
    const [isGlobeHovered, setIsGlobeHovered] = useState(false);
    const mouseMoveTimeoutRef = useRef(null);
    const [ringsData, setRingsData] = useState([]);

    const debounce = (func, delay) => {
        let timeout;
        const debouncedFunc = (...args) => {
            clearTimeout(timeout);
            debouncedFunc.timeout = setTimeout(() => func.apply(this, args), delay);
        };
        debouncedFunc.timeout = null;
        return debouncedFunc;
    };

    useEffect(() => {
        const currentContainerRef = containerRef.current;
        if (!currentContainerRef) return;
        const updateDimensions = () => {
            const newWidth = currentContainerRef.offsetWidth;
            const newHeight = currentContainerRef.offsetHeight;
            if (newWidth > 10 && newHeight > 10) {
                setGlobeDimensions(prev => (prev.width !== newWidth || prev.height !== newHeight) ? { width: newWidth, height: newHeight } : prev);
            }
        };
        const debouncedUpdateDimensions = debounce(updateDimensions, 200);
        updateDimensions();
        const resizeObserver = new ResizeObserver(debouncedUpdateDimensions);
        resizeObserver.observe(currentContainerRef);
        return () => {
            if (currentContainerRef) resizeObserver.unobserve(currentContainerRef);
            if (debouncedUpdateDimensions.timeout) clearTimeout(debouncedUpdateDimensions.timeout);
        };
    }, []);

    useEffect(() => {
        const allPointsData = (earthquakes || []).map(quake => {
            const isHighlighted = quake.id === highlightedQuakeId;
            const magValue = parseFloat(quake.properties.mag) || 0;
            let pointRadius, pointColor, pointAltitude;
            if (isHighlighted) {
                pointRadius = Math.max(0.6, (magValue / 7) + 0.4); pointColor = '#FFFF00'; pointAltitude = 0.03;
            } else {
                pointRadius = Math.max(0.15, (magValue / 7) + 0.05); pointColor = getMagnitudeColorFunc(quake.properties.mag); pointAltitude = 0.01;
            }
            return {
                lat: quake.geometry?.coordinates?.[1], lng: quake.geometry?.coordinates?.[0], altitude: pointAltitude, radius: pointRadius, color: pointColor,
                label: `${isHighlighted ? 'LATEST SIGNIFICANT: ' : ''}M${quake.properties.mag?.toFixed(1)} - ${quake.properties.place}`,
                quakeData: quake, type: isHighlighted ? 'highlighted_significant_quake' : 'recent_quake'
            };
        }).filter(p => typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng));
        setPoints(allPointsData);
    }, [earthquakes, getMagnitudeColorFunc, highlightedQuakeId]);

    useEffect(() => {
        let processedPaths = [];
        if (coastlineGeoJson?.type === "GeometryCollection" && Array.isArray(coastlineGeoJson.geometries)) {
            processedPaths = processedPaths.concat(coastlineGeoJson.geometries
                .filter(g => g.type === "LineString" && Array.isArray(g.coordinates))
                .map((g, i) => ({ id: `coastline-${i}`, coords: g.coordinates, color: 'rgba(150, 150, 200, 0.5)', stroke: 0.25, label: 'Coastline', properties: { Boundary_Type: 'Coastline' } })));
        }
        if (tectonicPlatesGeoJson?.type === "FeatureCollection" && Array.isArray(tectonicPlatesGeoJson.features)) {
            processedPaths = processedPaths.concat(tectonicPlatesGeoJson.features
                .filter(f => f.type === "Feature" && f.geometry?.type === "LineString" && Array.isArray(f.geometry.coordinates))
                .map((f, i) => {
                    let color = 'rgba(255, 165, 0, 0.6)'; const type = f.properties?.Boundary_Type;
                    if (type === 'Convergent') color = 'rgba(220, 20, 60, 0.7)'; else if (type === 'Divergent') color = 'rgba(60, 179, 113, 0.7)'; else if (type === 'Transform') color = 'rgba(70, 130, 180, 0.7)';
                    return { id: `plate-${f.properties?.OBJECTID || i}`, coords: f.geometry.coordinates, color, stroke: 1, label: `Plate Boundary: ${type || 'Unknown'}`, properties: f.properties };
                }));
        }
        setPaths(processedPaths);
    }, [coastlineGeoJson, tectonicPlatesGeoJson]);

    useEffect(() => {
        if (globeRef.current?.pointOfView && globeDimensions.width && globeDimensions.height) {
            globeRef.current.pointOfView({ lat: defaultFocusLat, lng: defaultFocusLng, altitude: defaultFocusAltitude }, 0);
        }
    }, [defaultFocusLat, defaultFocusLng, defaultFocusAltitude, globeDimensions]);

    useEffect(() => {
        const globeInstance = globeRef.current;
        if (globeInstance?.controls && typeof globeInstance.controls === 'function' && globeDimensions.width && globeDimensions.height) {
            const controls = globeInstance.controls();
            if (controls) {
                controls.enableRotate = allowUserDragRotation;
                controls.enablePan = allowUserDragRotation;
                controls.enableZoom = allowUserDragRotation;
                if (isGlobeHovered) {
                    if (controls.autoRotate !== false) controls.autoRotate = false;
                } else {
                    if (controls.autoRotate !== enableAutoRotation) controls.autoRotate = enableAutoRotation;
                    if (enableAutoRotation) {
                        const targetSpeed = -Math.abs(globeAutoRotateSpeed * 20);
                        if (controls.autoRotateSpeed !== targetSpeed) controls.autoRotateSpeed = targetSpeed;
                    } else {
                        if (controls.autoRotateSpeed !== 0) controls.autoRotateSpeed = 0;
                        if (controls.autoRotate !== false) controls.autoRotate = false;
                    }
                }
            }
        }
    }, [allowUserDragRotation, enableAutoRotation, globeAutoRotateSpeed, globeDimensions, isGlobeHovered]);

    const handlePointClick = useCallback((point) => {
        if (point?.quakeData) onQuakeClick(point.quakeData);
    }, [onQuakeClick]);

    const handleContainerMouseMove = useCallback((event) => {
        if (!globeRef.current || !containerRef.current || typeof globeRef.current.toGlobeCoords !== 'function') {
            return;
        }
        if (mouseMoveTimeoutRef.current) {
            clearTimeout(mouseMoveTimeoutRef.current);
        }
        mouseMoveTimeoutRef.current = setTimeout(() => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const globeCoords = globeRef.current.toGlobeCoords(x, y);
            const currentlyOverGlobe = !!globeCoords;
            if (currentlyOverGlobe !== isGlobeHovered) {
                setIsGlobeHovered(currentlyOverGlobe);
            }
        }, 30);
    }, [isGlobeHovered, setIsGlobeHovered]); // Added setIsGlobeHovered to dependencies

    const handleContainerMouseLeave = useCallback(() => {
        if (mouseMoveTimeoutRef.current) {
            clearTimeout(mouseMoveTimeoutRef.current);
        }
        if (isGlobeHovered) {
            setIsGlobeHovered(false);
        }
    }, [isGlobeHovered, setIsGlobeHovered]); // Added setIsGlobeHovered to dependencies

    // useEffect for Rings Data
    useEffect(() => {
        // console.log("Rings useEffect triggered. latestMajorQuakeForRing:", latestMajorQuakeForRing);

        if (latestMajorQuakeForRing &&
            latestMajorQuakeForRing.geometry &&
            Array.isArray(latestMajorQuakeForRing.geometry.coordinates) &&
            latestMajorQuakeForRing.geometry.coordinates.length >= 2 &&
            typeof latestMajorQuakeForRing.geometry.coordinates[1] === 'number' &&
            typeof latestMajorQuakeForRing.geometry.coordinates[0] === 'number' &&
            latestMajorQuakeForRing.properties &&
            typeof latestMajorQuakeForRing.properties.mag === 'number'
        ) {
            const coords = latestMajorQuakeForRing.geometry.coordinates;
            const mag = parseFloat(latestMajorQuakeForRing.properties.mag);

            const ringObject = {
                id: `major_quake_ring_${latestMajorQuakeForRing.id}_${latestMajorQuakeForRing.properties.time}_${Date.now()}`,
                lat: coords[1],
                lng: coords[0],
                altitude: 0.02, // Slightly increased altitude

                // Option 1: Brighter, more consistently opaque color (less fade-out of alpha)
                // color: (t) => `rgba(255, 100, 0, ${Math.max(0.2, 0.8 - t * 0.6)})`, // Orange-Red, keeps some opacity
                // Option 2: A very vibrant, mostly solid color
                color: () => 'rgba(255, 255, 0, 0.75)', // Bright Yellow
                // Option 3: Your previous static red was also good, ensure alpha is high enough
                // color: () => 'rgba(255, 80, 80, 0.75)',


                maxR: Math.max(6, mag * 2.2), // Increased max radius for more impact
                propagationSpeed: Math.max(2, mag * 0.5), // Moderate speed
                repeatPeriod: 1800, // Pulsing effect, adjust as preferred (0 for single shot)
            };

            console.log("Setting ringsData with:", ringObject);
            setRingsData([ringObject]);

        } else {
            console.log("latestMajorQuakeForRing is invalid or null, clearing ringsData.");
            if (ringsData.length > 0) {
                setRingsData([]);
            }
        }
    }, [latestMajorQuakeForRing]);


    if (globeDimensions.width === null || globeDimensions.height === null) {
        return <div ref={containerRef} className="w-full h-full flex items-center justify-center text-slate-500">Initializing Interactive Globe...</div>;
    }

    return (
        <div
            ref={containerRef}
            className="w-full h-full"
            style={{ position: 'relative', cursor: 'default' }}
            onMouseMove={handleContainerMouseMove}
            onMouseLeave={handleContainerMouseLeave}
        >
            {globeDimensions.width > 0 && globeDimensions.height > 0 && (
                <Globe
                    ref={globeRef}
                    width={globeDimensions.width}
                    height={globeDimensions.height}
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
                    ringLat="lat"
                    ringLng="lng"
                    ringAltitude="altitude"
                    ringColor="color"
                    ringMaxRadius="maxR"
                    ringPropagationSpeed="propagationSpeed"
                    ringRepeatPeriod="repeatPeriod"
                    ringResolution={128}

                    enablePointerInteraction={true}
                />
            )}
        </div>
    );
};

export default InteractiveGlobeView;