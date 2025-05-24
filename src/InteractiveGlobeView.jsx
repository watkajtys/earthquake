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
                                  previousMajorQuake, // Added new prop
                                  atmosphereColor = "rgba(100,100,255,0.3)",
                                  defaultFocusLat = 20,
                                  defaultFocusLng = 0,
                                  defaultFocusAltitude = 2.5,
                                  allowUserDragRotation = true,
                                  enableAutoRotation = true,
                                  globeAutoRotateSpeed = 0.1
                              }) => {
    const globeRef = useRef();
    const containerRef = useRef(null);
    const [points, setPoints] = useState([]);
    const [paths, setPaths] = useState([]);
    const [globeDimensions, setGlobeDimensions] = useState({ width: null, height: null });
    const [isGlobeHovered, setIsGlobeHovered] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
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
        updateDimensions(); // Initial immediate call
        const timerId = setTimeout(updateDimensions, 50); // Delayed call

        const resizeObserver = new ResizeObserver(debouncedUpdateDimensions);
        resizeObserver.observe(currentContainerRef);

        return () => {
            if (timerId) clearTimeout(timerId); // Clear the timeout
            if (currentContainerRef) resizeObserver.unobserve(currentContainerRef);
            if (debouncedUpdateDimensions.timeout) clearTimeout(debouncedUpdateDimensions.timeout);
        };
    }, []);

    useEffect(() => {
        let allPointsData = (earthquakes || []).map(quake => {
            const isHighlighted = quake.id === highlightedQuakeId;
            const magValue = parseFloat(quake.properties.mag) || 0;
            let pointRadius, pointColor, pointAltitude, pointLabel, pointType;

            if (isHighlighted) {
                pointRadius = Math.max(0.6, (magValue / 7) + 0.4);
                pointColor = '#FFFF00'; // Yellow for latest significant
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
            return {
                lat: quake.geometry?.coordinates?.[1], lng: quake.geometry?.coordinates?.[0], altitude: pointAltitude, radius: pointRadius, color: pointColor,
                label: pointLabel,
                quakeData: quake, type: pointType
            };
        }).filter(p => typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng));

        if (previousMajorQuake && previousMajorQuake.id && previousMajorQuake.geometry?.coordinates && previousMajorQuake.properties) {
            const prevMagValue = parseFloat(previousMajorQuake.properties.mag) || 0;
            let foundAndUpdated = false;
            allPointsData = allPointsData.map(p => {
                if (p.quakeData.id === previousMajorQuake.id) {
                    foundAndUpdated = true;
                    // If previousMajorQuake is also the highlightedQuakeId, let highlighted style take precedence mostly
                    if (p.quakeData.id === highlightedQuakeId) {
                        return {
                            ...p, // Keep most of highlighted style
                            label: `LATEST & PREVIOUS SIG: M${previousMajorQuake.properties.mag?.toFixed(1)} - ${previousMajorQuake.properties.place}`, // Special label
                            type: 'highlighted_previous_significant_quake'
                        };
                    }
                    return {
                        ...p,
                        radius: Math.max(0.55, (prevMagValue / 7) + 0.35), // Slightly smaller than latest highlighted
                        color: '#B0BEC5', // Distinct grey
                        altitude: 0.025, // Slightly different altitude
                        label: `PREVIOUS SIGNIFICANT: M${previousMajorQuake.properties.mag?.toFixed(1)} - ${previousMajorQuake.properties.place}`,
                        type: 'previous_major_quake'
                    };
                }
                return p;
            });

            if (!foundAndUpdated) {
                 // Ensure previousMajorQuake is not also the current highlighted one before adding separately
                if (previousMajorQuake.id !== highlightedQuakeId) {
                    allPointsData.push({
                        lat: previousMajorQuake.geometry.coordinates[1],
                        lng: previousMajorQuake.geometry.coordinates[0],
                        altitude: 0.025,
                        radius: Math.max(0.55, (prevMagValue / 7) + 0.35),
                        color: '#B0BEC5', // Distinct grey
                        label: `PREVIOUS SIGNIFICANT: M${previousMajorQuake.properties.mag?.toFixed(1)} - ${previousMajorQuake.properties.place}`,
                        quakeData: previousMajorQuake,
                        type: 'previous_major_quake'
                    });
                }
            }
        }
        setPoints(allPointsData);
    }, [earthquakes, getMagnitudeColorFunc, highlightedQuakeId, previousMajorQuake]);

    useEffect(() => {
        let processedPaths = [];
        if (coastlineGeoJson?.type === "GeometryCollection" && Array.isArray(coastlineGeoJson.geometries)) {
            processedPaths = processedPaths.concat(coastlineGeoJson.geometries
                .filter(g => g.type === "LineString" && Array.isArray(g.coordinates))
                .map((g, i) => ({ id: `coastline-${i}`, coords: g.coordinates, color: 'rgb(208,208,214)', stroke: 0.25, label: 'Coastline', properties: { Boundary_Type: 'Coastline' } })));
        }
        if (tectonicPlatesGeoJson?.type === "FeatureCollection" && Array.isArray(tectonicPlatesGeoJson.features)) {
            processedPaths = processedPaths.concat(tectonicPlatesGeoJson.features
                .filter(f => f.type === "Feature" && f.geometry?.type === "LineString" && Array.isArray(f.geometry.coordinates))
                .map((f, i) => {
                    let color = 'rgba(255, 165, 0, 0.8)'; const type = f.properties?.Boundary_Type;
                    if (type === 'Convergent') color = 'rgba(220, 20, 60, 0.8)'; else if (type === 'Divergent') color = 'rgba(60, 179, 113, 0.8)'; else if (type === 'Transform') color = 'rgba(70, 130, 180, 0.8)';
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

    // CONSOLIDATED Effect to manage globe controls and drag listeners
    useEffect(() => {
        const globeInstance = globeRef.current;
        if (!globeInstance?.controls || typeof globeInstance.controls !== 'function' || !globeDimensions.width || !globeDimensions.height) {
            return;
        }

        const controls = globeInstance.controls();
        if (!controls) {
            console.warn("Globe controls not available when trying to set properties or listeners.");
            return;
        }

        // 1. Set user interaction capabilities based on props
        // This is the most direct way to enable/disable user drag rotation
        controls.enableRotate = allowUserDragRotation;
        controls.enablePan = allowUserDragRotation; // Usually linked with enableRotate
        controls.enableZoom = allowUserDragRotation; // Usually linked

        // 2. Manage auto-rotation logic
        if (enableAutoRotation) {
            if (isGlobeHovered || isDragging) {
                // Pause auto-rotation if hovered or actively dragging
                if (controls.autoRotate !== false) {
                    controls.autoRotate = false;
                }
            } else {
                // If not hovered AND not dragging, enable auto-rotation
                if (controls.autoRotate !== true) {
                    controls.autoRotate = true;
                }
                // Set speed only if auto-rotation is active or being activated
                // The negative sign determines direction, adjust as needed.
                const targetSpeed = -Math.abs(globeAutoRotateSpeed * 20); // Example: * 20 for a perceptible speed
                if (controls.autoRotateSpeed !== targetSpeed) {
                    controls.autoRotateSpeed = targetSpeed;
                }
            }
        } else {
            // If auto-rotation is globally disabled by the prop, ensure it's off.
            if (controls.autoRotate !== false) {
                controls.autoRotate = false;
            }
            if (controls.autoRotateSpeed !== 0) {
                controls.autoRotateSpeed = 0;
            }
        }

        // 3. Add event listeners for drag state to the controls object
        const handleDragStart = () => setIsDragging(true);
        const handleDragEnd = () => setIsDragging(false);

        controls.addEventListener('start', handleDragStart); // User starts interacting
        controls.addEventListener('end', handleDragEnd);     // User stops interacting

        // Cleanup function for this effect
        return () => {
            if (globeInstance.controls()) { // Check if controls still exist (might be destroyed on unmount)
                globeInstance.controls().removeEventListener('start', handleDragStart);
                globeInstance.controls().removeEventListener('end', handleDragEnd);
            }
        };

    }, [
        allowUserDragRotation,
        enableAutoRotation,
        globeAutoRotateSpeed,
        globeDimensions,    // Globe might be re-created if dimensions change.
        isGlobeHovered,
        isDragging,
        // setIsDragging is stable, no need to include it.
    ]);


    const handlePointClick = useCallback((point) => {
        if (point?.quakeData) onQuakeClick(point.quakeData);
    }, [onQuakeClick]);

    // Mouse hover detection (slightly simplified from your original for clarity here)
    // Your existing mouseMoveTimeoutRef logic is fine.
    const handleContainerMouseMove = useCallback((event) => {
        if (!globeRef.current || !containerRef.current || typeof globeRef.current.toGlobeCoords !== 'function') {
            return;
        }
        if (mouseMoveTimeoutRef.current) {
            clearTimeout(mouseMoveTimeoutRef.current);
        }
        mouseMoveTimeoutRef.current = setTimeout(() => {
            if (!containerRef.current) return; // Check if containerRef is still valid
            const rect = containerRef.current.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            // Check if the globe instance and toGlobeCoords method are available
            if (globeRef.current && typeof globeRef.current.toGlobeCoords === 'function') {
                const globeCoords = globeRef.current.toGlobeCoords(x, y);
                const currentlyOverGlobe = !!globeCoords;
                if (currentlyOverGlobe !== isGlobeHovered) {
                    setIsGlobeHovered(currentlyOverGlobe);
                }
            } else {
                // If globe is not ready, assume not hovered.
                if (isGlobeHovered) setIsGlobeHovered(false);
            }

        }, 30); // 30ms delay is reasonable
    }, [isGlobeHovered, setIsGlobeHovered]); // Dependencies

    const handleContainerMouseLeave = useCallback(() => {
        if (mouseMoveTimeoutRef.current) {
            clearTimeout(mouseMoveTimeoutRef.current);
        }
        if (isGlobeHovered) {
            setIsGlobeHovered(false);
        }
    }, [isGlobeHovered, setIsGlobeHovered]);

    // useEffect for Rings Data
    useEffect(() => {
        const newRings = [];

        // Ring for latestMajorQuakeForRing
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
            newRings.push({
                id: `major_quake_ring_latest_${latestMajorQuakeForRing.id}_${latestMajorQuakeForRing.properties.time}_${Date.now()}`,
                lat: coords[1],
                lng: coords[0],
                altitude: 0.02,
                color: () => 'rgba(255, 255, 0, 0.8)', // Bright Yellow for latest
                maxR: Math.max(6, mag * 2.2),
                propagationSpeed: Math.max(2, mag * 0.5),
                repeatPeriod: 1800,
            });
        }

        // Ring for previousMajorQuake
        if (previousMajorQuake &&
            previousMajorQuake.geometry &&
            Array.isArray(previousMajorQuake.geometry.coordinates) &&
            previousMajorQuake.geometry.coordinates.length >= 2 &&
            typeof previousMajorQuake.geometry.coordinates[1] === 'number' &&
            typeof previousMajorQuake.geometry.coordinates[0] === 'number' &&
            previousMajorQuake.properties &&
            typeof previousMajorQuake.properties.mag === 'number'
        ) {
            const coords = previousMajorQuake.geometry.coordinates;
            const mag = parseFloat(previousMajorQuake.properties.mag);
            newRings.push({
                id: `major_quake_ring_prev_${previousMajorQuake.id}_${previousMajorQuake.properties.time}_${Date.now()}`,
                lat: coords[1],
                lng: coords[0],
                altitude: 0.018, // Slightly different altitude
                color: () => 'rgba(180, 180, 180, 0.6)', // Greyish for previous
                maxR: Math.max(5, mag * 2.0),
                propagationSpeed: Math.max(1.8, mag * 0.45),
                repeatPeriod: 1900, // Slightly different period
            });
        }
        
        if (newRings.length > 0 || ringsData.length > 0) { // Update only if there's a change or existing rings to clear
             setRingsData(newRings);
        }

    }, [latestMajorQuakeForRing, previousMajorQuake, ringsData.length]); // Added previousMajorQuake and ringsData.length to dependency array



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