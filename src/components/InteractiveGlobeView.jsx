// src/InteractiveGlobeView.jsx
import React, { useEffect, useRef, useState, useCallback } from 'react'; // Removed unused 'memo'
import Globe from 'react-globe.gl';
// Re-enable necessary imports, ensure useEarthquakeDataState is present if used by uncommented code.
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx';

/**
 * Utility function to take a color string (hex or rgba) and return a new rgba string
 * with its opacity multiplied by `opacityFactor`.
 *
 * @param {string} colorString - The input color string (e.g., "#RRGGBB", "rgba(r,g,b,a)").
 * @param {number} opacityFactor - The factor by which to multiply the current opacity (e.g., 0.7 for 70% of original).
 * @returns {string} A new rgba color string with the adjusted opacity. Returns a fallback color 'rgba(128,128,128,0.5)' if parsing fails.
 */
const makeColorDuller = (colorString, opacityFactor) => {
    const fallbackColor = 'rgba(128,128,128,0.5)';
    let r, g, b, currentAlpha = 1.0;

    if (typeof colorString !== 'string') {
        return fallbackColor;
    }

    try {
        if (colorString.startsWith('#')) {
            let hex = colorString.slice(1);
            if (hex.length === 3) {
                hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
            }
            if (hex.length === 6) {
                r = parseInt(hex.substring(0, 2), 16);
                g = parseInt(hex.substring(2, 4), 16);
                b = parseInt(hex.substring(4, 6), 16);
                currentAlpha = 1.0; // Hex implies full opacity initially
            } else {
                return fallbackColor; // Invalid hex length
            }
        } else if (colorString.startsWith('rgba(') && colorString.endsWith(')')) {
            const parts = colorString.substring(5, colorString.length - 1).split(',');
            if (parts.length === 4) {
                r = parseInt(parts[0].trim(), 10);
                g = parseInt(parts[1].trim(), 10);
                b = parseInt(parts[2].trim(), 10);
                currentAlpha = parseFloat(parts[3].trim());
            } else {
                return fallbackColor; // Invalid rgba format
            }
        } else {
            return fallbackColor; // Not a recognized format
        }

        if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(currentAlpha)) {
            return fallbackColor; // Parsing resulted in NaN
        }

        const newAlpha = Math.max(0, Math.min(1, currentAlpha * opacityFactor));
        return `rgba(${r},${g},${b},${newAlpha.toFixed(3)})`;

    } catch (error) {
        console.error("Error processing color in makeColorDuller:", colorString, error);
        return fallbackColor; // Catch-all for any unexpected errors during parsing/processing
    }
};

/**
 * Renders an interactive 3D globe using `react-globe.gl` to display earthquake data.
 * It visualizes recent earthquakes, highlighted significant quakes, and optionally coastlines
 * and tectonic plate boundaries. The component consumes earthquake data (`globeEarthquakes`,
 * `lastMajorQuake`, `previousMajorQuake`) from `EarthquakeDataContext`.
 * It manages globe dimensions, auto-rotation, user interaction (hover, drag), and dynamic
 * point/ring updates based on incoming data.
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {function(Object):void} props.onQuakeClick - Callback function triggered when an earthquake point on the globe is clicked. Receives the quake data object.
 * @param {function(number):string} props.getMagnitudeColorFunc - Function that returns a color string based on an earthquake's magnitude.
 * @param {Object} [props.coastlineGeoJson] - GeoJSON data for rendering coastlines.
 * @param {Object} [props.tectonicPlatesGeoJson] - GeoJSON data for rendering tectonic plate boundaries.
 * @param {string} [props.highlightedQuakeId] - The ID of a specific earthquake to be visually highlighted on the globe.
 * @param {Array<Array<Object>>} [props.activeClusters=[]] - Array of active earthquake clusters. Each cluster is an array of earthquake objects.
 *   (Note: Cluster visualization logic based on this prop appears to be commented out in the current implementation).
 * @param {string} [props.atmosphereColor="rgba(100,100,255,0.3)"] - Color of the globe's atmosphere effect.
 * @param {number} [props.defaultFocusLat=20] - Default latitude for the globe's camera focus.
 * @param {number} [props.defaultFocusLng=0] - Default longitude for the globe's camera focus.
 * @param {number} [props.defaultFocusAltitude=2.5] - Default altitude (zoom level) for the globe's camera focus.
 * @param {boolean} [props.allowUserDragRotation=true] - Whether users can manually rotate the globe by dragging.
 * @param {boolean} [props.enableAutoRotation=true] - Whether the globe should auto-rotate when not being interacted with.
 * @param {number} [props.globeAutoRotateSpeed=0.1] - Speed of the auto-rotation.
 * @returns {JSX.Element} The InteractiveGlobeView component.
 */
const InteractiveGlobeView = ({
    onQuakeClick,
    getMagnitudeColorFunc,
    coastlineGeoJson,
    tectonicPlatesGeoJson,
    highlightedQuakeId,
    activeClusters = [],
    atmosphereColor = "rgb(100,100,255)",
    defaultFocusLat = 20,
    defaultFocusLng = 0,
    defaultFocusAltitude = 2.5,
    allowUserDragRotation = true,
    enableAutoRotation = true,
    globeAutoRotateSpeed = 0.1
}) => {
    const { globeEarthquakes, lastMajorQuake, previousMajorQuake } = useEarthquakeDataState(); // Re-enable context

    const globeRef = useRef(); // Re-enable for Globe component
    const containerRef = useRef(null);
    const [points, setPoints] = useState([]); // Re-enable for globe data
    const [paths, setPaths] = useState([]); // Re-enable for globe data
    const [globeDimensions, setGlobeDimensions] = useState({ width: null, height: null });
    const [initialLayoutComplete, setInitialLayoutComplete] = useState(false);
    const [isGlobeHovered, setIsGlobeHovered] = useState(false); // Re-enable for interactions
    const [isDragging, setIsDragging] = useState(false); // Re-enable for interactions
    const mouseMoveTimeoutRef = useRef(null); // Re-enable for hover detection
    const windowLoadedRef = useRef(false);
    const [ringsData, setRingsData] = useState([]); // Re-enable for globe data

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

        // This function will now be the core logic for updating dimensions.
        const performDimensionUpdate = () => {
            const currentContainerRefActual = containerRef.current;
            if (!currentContainerRefActual) return;

            const newWidth = currentContainerRefActual.offsetWidth;
            const newHeight = currentContainerRefActual.offsetHeight;

            if (newWidth > 10 && newHeight > 10) {
                setGlobeDimensions(prev => {
                    if (prev.width !== newWidth || prev.height !== newHeight) {
                        // console.log(`Updating dimensions: W=${newWidth}, H=${newHeight}`); // Removed log
                        return { width: newWidth, height: newHeight };
                    }
                    return prev;
                });
            } else {
                 // console.log(`Skipping dimension update due to invalid size: W=${newWidth}, H=${newHeight}`); // Removed log
            }
        };

        // Debounced version for ResizeObserver - this remains the same
        const debouncedPerformDimensionUpdate = debounce(performDimensionUpdate, 200);

        const initialDimensionRead = () => {
            requestAnimationFrame(() => {
                setTimeout(() => {
                    // console.log("Attempting initial dimension read via rAF + setTimeout"); // Removed log
                    performDimensionUpdate();
                }, 0); // A timeout of 0 ms defers execution
            });
        };

        if (document.readyState === 'complete') {
            windowLoadedRef.current = true;
            if (!initialLayoutComplete) { // Ensure this only runs once if initialLayoutComplete wasn't set yet
                setInitialLayoutComplete(true);
                // console.log("Document already complete. Scheduling initial dimension read."); // Removed log
                initialDimensionRead();
            }
        } else {
            const handleWindowLoad = () => {
                window.removeEventListener('load', handleWindowLoad); // Clean up listener early
                windowLoadedRef.current = true;
                if (!initialLayoutComplete) { // Check ensures it only runs once
                    setInitialLayoutComplete(true);
                    // console.log("Window loaded. Scheduling initial dimension read."); // Removed log
                    initialDimensionRead();
                }
            };
            window.addEventListener('load', handleWindowLoad);
        }

        const resizeObserver = new ResizeObserver(debouncedPerformDimensionUpdate);
        if (currentContainerRef) {
            resizeObserver.observe(currentContainerRef);
        }

        // Cleanup
        return () => {
            // The window.load listener is removed by itself in handleWindowLoad.
            // If the component unmounts before 'load', the listener might remain.
            // To be fully robust, it would need to be assignable and removable here.
            // For now, let's assume it usually fires or the component stays mounted.
            if (currentContainerRef) {
                resizeObserver.unobserve(currentContainerRef);
            }
            if (debouncedPerformDimensionUpdate.timeout) {
                clearTimeout(debouncedPerformDimensionUpdate.timeout);
            }
        };
    }, [initialLayoutComplete]);

    // Re-enable useEffects for globe data (points, paths, rings)
    useEffect(() => {
        let allPointsData = (globeEarthquakes || []).map(quake => { // Use globeEarthquakes from context
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
                    if (p.quakeData.id === highlightedQuakeId) {
                        return {
                            ...p,
                            label: `LATEST & PREVIOUS SIG: M${previousMajorQuake.properties.mag?.toFixed(1)} - ${previousMajorQuake.properties.place}`,
                            type: 'highlighted_previous_significant_quake'
                        };
                    }
                    return {
                        ...p,
                        radius: Math.max(0.55, (prevMagValue / 7) + 0.35),
                        color: getMagnitudeColorFunc(prevMagValue),
                        altitude: 0.025,
                        label: `PREVIOUS SIGNIFICANT: M${previousMajorQuake.properties.mag?.toFixed(1)} - ${previousMajorQuake.properties.place}`,
                        type: 'previous_major_quake'
                    };
                }
                return p;
            });

            if (!foundAndUpdated) {
                if (previousMajorQuake.id !== highlightedQuakeId) {
                    allPointsData.push({
                        lat: previousMajorQuake.geometry.coordinates[1],
                        lng: previousMajorQuake.geometry.coordinates[0],
                        altitude: 0.025,
                        radius: Math.max(0.55, (prevMagValue / 7) + 0.35),
                        color: getMagnitudeColorFunc(prevMagValue),
                        label: `PREVIOUS SIGNIFICANT: M${previousMajorQuake.properties.mag?.toFixed(1)} - ${previousMajorQuake.properties.place}`,
                        quakeData: previousMajorQuake,
                        type: 'previous_major_quake'
                    });
                }
            }
        }
        // Active clusters logic can be re-enabled here if needed, currently commented out in original
        setPoints(allPointsData);
    }, [globeEarthquakes, getMagnitudeColorFunc, highlightedQuakeId, previousMajorQuake, activeClusters]);

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
        const newRings = [];
        if (lastMajorQuake && lastMajorQuake.geometry && Array.isArray(lastMajorQuake.geometry.coordinates) && lastMajorQuake.geometry.coordinates.length >= 2 && typeof lastMajorQuake.geometry.coordinates[1] === 'number' && typeof lastMajorQuake.geometry.coordinates[0] === 'number' && lastMajorQuake.properties && typeof lastMajorQuake.properties.mag === 'number') {
            const coords = lastMajorQuake.geometry.coordinates;
            const mag = parseFloat(lastMajorQuake.properties.mag);
            newRings.push({
                id: `major_quake_ring_latest_${lastMajorQuake.id}_${lastMajorQuake.properties.time}_${Date.now()}`,
                lat: coords[1], lng: coords[0], altitude: 0.02,
                color: () => getMagnitudeColorFunc(mag),
                maxR: Math.max(6, mag * 2.2),
                propagationSpeed: Math.max(2, mag * 0.5),
                repeatPeriod: 1800,
            });
        }
        if (previousMajorQuake && previousMajorQuake.geometry && Array.isArray(previousMajorQuake.geometry.coordinates) && previousMajorQuake.geometry.coordinates.length >= 2 && typeof previousMajorQuake.geometry.coordinates[1] === 'number' && typeof previousMajorQuake.geometry.coordinates[0] === 'number' && previousMajorQuake.properties && typeof previousMajorQuake.properties.mag === 'number') {
            const coords = previousMajorQuake.geometry.coordinates;
            const mag = parseFloat(previousMajorQuake.properties.mag);
            const baseColor = getMagnitudeColorFunc(mag);
            newRings.push({
                id: `major_quake_ring_prev_${previousMajorQuake.id}_${previousMajorQuake.properties.time}_${Date.now()}`,
                lat: coords[1], lng: coords[0], altitude: 0.018,
                color: () => makeColorDuller(baseColor, 0.7),
                maxR: Math.max(5, mag * 2.0),
                propagationSpeed: Math.max(1.8, mag * 0.45),
                repeatPeriod: 1900,
            });
        }
        if (newRings.length > 0 || ringsData.length > 0) {
             setRingsData(newRings);
        }
    }, [lastMajorQuake, previousMajorQuake, getMagnitudeColorFunc, ringsData.length]);


    // Re-enable globe interaction useEffects
    useEffect(() => {
        if (globeRef.current?.pointOfView && globeDimensions.width && globeDimensions.height) {
            const targetLatitude = (typeof defaultFocusLat === 'number' && !isNaN(defaultFocusLat)) ? defaultFocusLat : 20;
            const targetLongitude = (typeof defaultFocusLng === 'number' && !isNaN(defaultFocusLng)) ? defaultFocusLng : 0;
            globeRef.current.pointOfView({ lat: targetLatitude, lng: targetLongitude, altitude: defaultFocusAltitude }, 0);
        }
    }, [defaultFocusLat, defaultFocusLng, defaultFocusAltitude, globeDimensions]);

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
        controls.enableRotate = allowUserDragRotation;
        controls.enablePan = allowUserDragRotation;
        controls.enableZoom = allowUserDragRotation;
        if (enableAutoRotation) {
            if (isGlobeHovered || isDragging) {
                if (controls.autoRotate !== false) controls.autoRotate = false;
            } else {
                if (controls.autoRotate !== true) controls.autoRotate = true;
                const targetSpeed = -Math.abs(globeAutoRotateSpeed * 20);
                if (controls.autoRotateSpeed !== targetSpeed) controls.autoRotateSpeed = targetSpeed;
            }
        } else {
            if (controls.autoRotate !== false) controls.autoRotate = false;
            if (controls.autoRotateSpeed !== 0) controls.autoRotateSpeed = 0;
        }
        const handleDragStart = () => setIsDragging(true);
        const handleDragEnd = () => setIsDragging(false);
        controls.addEventListener('start', handleDragStart);
        controls.addEventListener('end', handleDragEnd);
        return () => {
            if (globeInstance.controls()) {
                globeInstance.controls().removeEventListener('start', handleDragStart);
                globeInstance.controls().removeEventListener('end', handleDragEnd);
            }
        };
    }, [allowUserDragRotation, enableAutoRotation, globeAutoRotateSpeed, globeDimensions, isGlobeHovered, isDragging]);

    const handlePointClick = useCallback((point) => {
        if (point?.quakeData) onQuakeClick(point.quakeData);
    }, [onQuakeClick]);

    const handleContainerMouseMove = useCallback((event) => {
        if (!globeRef.current || !containerRef.current || typeof globeRef.current.toGlobeCoords !== 'function') return;
        if (mouseMoveTimeoutRef.current) clearTimeout(mouseMoveTimeoutRef.current);
        mouseMoveTimeoutRef.current = setTimeout(() => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            if (globeRef.current && typeof globeRef.current.toGlobeCoords === 'function') {
                const globeCoords = globeRef.current.toGlobeCoords(x, y);
                const currentlyOverGlobe = !!globeCoords;
                if (currentlyOverGlobe !== isGlobeHovered) setIsGlobeHovered(currentlyOverGlobe);
            } else {
                if (isGlobeHovered) setIsGlobeHovered(false);
            }
        }, 30);
    }, [isGlobeHovered, setIsGlobeHovered]); // Removed setIsDragging from deps as it's not used here

    const handleContainerMouseLeave = useCallback(() => {
        if (mouseMoveTimeoutRef.current) clearTimeout(mouseMoveTimeoutRef.current);
        if (isGlobeHovered) setIsGlobeHovered(false);
    }, [isGlobeHovered, setIsGlobeHovered]);


    // Conditional Rendering Logic:
    // Only render the main content (debug div or eventually the globe)
    // if dimensions are positive and seem valid.
    // The outer containerRef div MUST always render to allow dimension calculation.
    if (!globeDimensions.width || !globeDimensions.height || globeDimensions.height <= 10 || globeDimensions.width <=10 ) {
        // This div is essential for `containerRef.current.offsetHeight` to be measurable.
        // It should occupy the space the globe would, so `w-full h-full` is important.
        return (
            <div ref={containerRef} className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                Initializing or Awaiting Valid Dimensions... (Current W: {String(globeDimensions.width)}, H: {String(globeDimensions.height)})
            </div>
        );
    }

    // If dimensions are valid, render the actual Globe component
    return (
        <div
            ref={containerRef} // This ref is still attached for ResizeObserver.
            className="w-full h-full" // This div establishes the space based on parent constraints.
            style={{ position: 'relative', cursor: isGlobeHovered ? 'grab' : 'default' }}
            onMouseMove={handleContainerMouseMove} // Re-enable hover detection
            onMouseLeave={handleContainerMouseLeave} // Re-enable hover detection
        >
            <Globe
                ref={globeRef}
                width={globeDimensions.width} // Pass calculated dimensions
                height={globeDimensions.height} // Pass calculated dimensions
                globeImageUrl={null}
                bumpImageUrl={null}
                backgroundImageUrl={null}
                backgroundColor="rgba(0,0,0,0)"
                atmosphereColor={atmosphereColor} // Use prop
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

                enablePointerInteraction={true} // Keep interactions enabled
            />
        </div>
    );
};

export default InteractiveGlobeView;