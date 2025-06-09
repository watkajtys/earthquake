// src/components/TectonicPlatesGlobeView.jsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import Globe from 'react-globe.gl';
// Removed: import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx';


// Removed makeColorDuller function as it was primarily for earthquake rings/highlights


/**
 * A React component that renders an interactive 3D globe displaying
 * coastlines, and tectonic plate boundaries. It uses 'react-globe.gl'.
 * @param {object} props - The component's props.
 * @param {boolean} [props.allowUserDragRotation=true] - Whether to allow users to manually rotate the globe.
 * @param {string} [props.atmosphereColor="rgba(100,100,255,0.3)"] - Color of the globe's atmosphere.
 * @param {object} [props.coastlineGeoJson] - GeoJSON data for rendering coastlines.
 * @param {number} [props.defaultFocusAltitude=2.5] - Target altitude (zoom level) for the globe's camera focus. Can be updated dynamically.
 * @param {number} [props.defaultFocusLat=20] - Target latitude for the globe's camera focus. Can be updated dynamically.
 * @param {number} [props.defaultFocusLng=0] - Target longitude for the globe's camera focus. Can be updated dynamically.
 * @param {boolean} [props.enableAutoRotation=true] - Whether the globe should auto-rotate.
 * @param {number} [props.globeAutoRotateSpeed=0.1] - Speed of the auto-rotation.
 * @param {object} [props.tectonicPlatesGeoJson] - GeoJSON data for rendering tectonic plate boundaries.
 * @returns {JSX.Element} The rendered TectonicPlatesGlobeView component.
 */
const TectonicPlatesGlobeView = ({
                                  coastlineGeoJson,
                                  tectonicPlatesGeoJson,
                                  atmosphereColor = "rgba(100,100,255,0.3)",
                                  defaultFocusLat = 20,
                                  defaultFocusLng = 0,
                                  defaultFocusAltitude = 2.5,
                                  allowUserDragRotation = true,
                                  enableAutoRotation = true,
                                  globeAutoRotateSpeed = 0.1
                              }) => {

    // 1. Fortify majorPlatesData
    const rawMajorPlatesData = [
      { lat: 0, lng: -150, name: 'Pacific Plate', size: 0.8, color: 'rgba(255, 255, 255, 0.85)' },
      { lat: 45, lng: -100, name: 'North American Plate', size: 0.8, color: 'rgba(255, 255, 255, 0.85)' },
      { lat: 50, lng: 50, name: 'Eurasian Plate', size: 0.8, color: 'rgba(255, 255, 255, 0.85)' },
      { lat: 0, lng: 20, name: 'African Plate', size: 0.8, color: 'rgba(255, 255, 255, 0.85)' },
      { lat: -80, lng: 0, name: 'Antarctic Plate', size: 0.8, color: 'rgba(255, 255, 255, 0.85)' },
      { lat: -25, lng: 135, name: 'Australian Plate', size: 0.8, color: 'rgba(255, 255, 255, 0.85)' }, // Split from Indo-Australian
      { lat: 10, lng: 77, name: 'Indian Plate', size: 0.7, color: 'rgba(255, 255, 255, 0.85)' }, // Split from Indo-Australian
      { lat: -20, lng: -60, name: 'South American Plate', size: 0.8, color: 'rgba(255, 255, 255, 0.85)' },
      { lat: -15, lng: -90, name: 'Nazca Plate', size: 0.7, color: 'rgba(255, 255, 255, 0.85)' },
      { lat: 30, lng: 5, name: 'Arabian Plate', size: 0.6, color: 'rgba(255, 255, 255, 0.85)' }, // Added for more detail
      { lat: 10, lng: -75, name: 'Caribbean Plate', size: 0.6, color: 'rgba(255, 255, 255, 0.85)' }, // Added for more detail
      { lat: 5, lng: 128, name: 'Philippine Sea Plate', size: 0.6, color: 'rgba(255, 255, 255, 0.85)' }, // Added for more detail
      { lat: 40, lng: -120, name: 'Juan de Fuca Plate', size: 0.5, color: 'rgba(255, 255, 255, 0.85)' }, // Added for more detail
      { lat: 5, lng: -40, name: 'Scotia Plate', size: 0.5, color: 'rgba(255, 255, 255, 0.85)' }, // Added for more detail
    ];

    const plateMovementArrowsData = [
      { lat: 15, lng: -140, name: 'Pacific Plate Arrow', rotation: 315, htmlElement: '<span class="plate-arrow" style="transform: rotate(315deg); display:inline-block;">➔</span>' }, // NW
      { lat: 50, lng: -90, name: 'North American Plate Arrow', rotation: 240, htmlElement: '<span class="plate-arrow" style="transform: rotate(240deg); display:inline-block;">➔</span>' }, // SW (generalized)
      { lat: 50, lng: 75, name: 'Eurasian Plate Arrow (East)', rotation: 90, htmlElement: '<span class="plate-arrow" style="transform: rotate(90deg); display:inline-block;">➔</span>' }, // E
      // { lat: 50, lng: -5, name: 'Eurasian Plate Arrow (West)', rotation: 270, htmlElement: '<span class="plate-arrow" style="transform: rotate(270deg); display:inline-block;">➔</span>' }, // W (complex, this is just one part)
      { lat: 10, lng: 30, name: 'African Plate Arrow', rotation: 45, htmlElement: '<span class="plate-arrow" style="transform: rotate(45deg); display:inline-block;">➔</span>' }, // NE
      // Antarctic plate is relatively static or has divergent boundaries, arrows might be misleading without more context.
      // { lat: -75, lng: 0, name: 'Antarctic Plate Arrow', rotation: 0, htmlElement: '<span class="plate-arrow" style="transform: rotate(0deg); display:inline-block;">➔</span>' },
      { lat: -20, lng: 125, name: 'Australian Plate Arrow', rotation: 45, htmlElement: '<span class="plate-arrow" style="transform: rotate(45deg); display:inline-block;">➔</span>' }, // NE
      { lat: 20, lng: 77, name: 'Indian Plate Arrow', rotation: 45, htmlElement: '<span class="plate-arrow" style="transform: rotate(45deg); display:inline-block;">➔</span>' }, // NE
      { lat: -15, lng: -50, name: 'South American Plate Arrow', rotation: 270, htmlElement: '<span class="plate-arrow" style="transform: rotate(270deg); display:inline-block;">➔</span>' }, // W
      { lat: -10, lng: -80, name: 'Nazca Plate Arrow', rotation: 75, htmlElement: '<span class="plate-arrow" style="transform: rotate(75deg); display:inline-block;">➔</span>' }, // ENE
      { lat: 25, lng: 48, name: 'Arabian Plate Arrow', rotation: 30, htmlElement: '<span class="plate-arrow" style="transform: rotate(30deg); display:inline-block;">➔</span>' }, // NNE
      { lat: 15, lng: -70, name: 'Caribbean Plate Arrow', rotation: 90, htmlElement: '<span class="plate-arrow" style="transform: rotate(90deg); display:inline-block;">➔</span>' }, // E
      { lat: 10, lng: 120, name: 'Philippine Sea Plate Arrow', rotation: 300, htmlElement: '<span class="plate-arrow" style="transform: rotate(300deg); display:inline-block;">➔</span>' }, // NW
      { lat: 45, lng: -126, name: 'Juan de Fuca Plate Arrow', rotation: 65, htmlElement: '<span class="plate-arrow" style="transform: rotate(65deg); display:inline-block;">➔</span>' }, // ENE (subducting under N.America)
      // Scotia plate has complex movement, often shown as rotating or transform.
      // { lat: -57, lng: -40, name: 'Scotia Plate Arrow', rotation: 90, htmlElement: '<span class="plate-arrow" style="transform: rotate(90deg); display:inline-block;">➔</span>' }, // E
    ];

    const validMajorPlatesData = rawMajorPlatesData.filter(plate => {
        const isValid = typeof plate.lat === 'number' && !isNaN(plate.lat) && plate.lat >= -90 && plate.lat <= 90 &&
               typeof plate.lng === 'number' && !isNaN(plate.lng) && plate.lng >= -180 && plate.lng <= 180 &&
               plate.name && typeof plate.name === 'string' &&
               typeof plate.size === 'number' && !isNaN(plate.size) &&
               plate.color && typeof plate.color === 'string';
        if (!isValid) {
            console.warn("Filtering out invalid major plate data:", plate);
        }
        return isValid;
    });

    // 2. Fortify plateMovementArrowsData
    const rawPlateMovementArrowsData = [
      { lat: 15, lng: -140, name: 'Pacific Plate Arrow', rotation: 315, htmlElementString: '➔' }, // NW
      { lat: 50, lng: -90, name: 'North American Plate Arrow', rotation: 240, htmlElementString: '➔' }, // SW (generalized)
      { lat: 50, lng: 75, name: 'Eurasian Plate Arrow (East)', rotation: 90, htmlElementString: '➔' }, // E
      { lat: 10, lng: 30, name: 'African Plate Arrow', rotation: 45, htmlElementString: '➔' }, // NE
      { lat: -20, lng: 125, name: 'Australian Plate Arrow', rotation: 45, htmlElementString: '➔' }, // NE
      { lat: 20, lng: 77, name: 'Indian Plate Arrow', rotation: 45, htmlElementString: '➔' }, // NE
      { lat: -15, lng: -50, name: 'South American Plate Arrow', rotation: 270, htmlElementString: '➔' }, // W
      { lat: -10, lng: -80, name: 'Nazca Plate Arrow', rotation: 75, htmlElementString: '➔' }, // ENE
      { lat: 25, lng: 48, name: 'Arabian Plate Arrow', rotation: 30, htmlElementString: '➔' }, // NNE
      { lat: 15, lng: -70, name: 'Caribbean Plate Arrow', rotation: 90, htmlElementString: '➔' }, // E
      { lat: 10, lng: 120, name: 'Philippine Sea Plate Arrow', rotation: 300, htmlElementString: '➔' }, // NW
      { lat: 45, lng: -126, name: 'Juan de Fuca Plate Arrow', rotation: 65, htmlElementString: '➔' }, // ENE (subducting under N.America)
    ];

    const validPlateMovementArrowsData = rawPlateMovementArrowsData.filter(arrow => {
        const isValid = typeof arrow.lat === 'number' && !isNaN(arrow.lat) && arrow.lat >= -90 && arrow.lat <= 90 &&
               typeof arrow.lng === 'number' && !isNaN(arrow.lng) && arrow.lng >= -180 && arrow.lng <= 180 &&
               typeof arrow.rotation === 'number' && !isNaN(arrow.rotation) &&
               arrow.htmlElementString && typeof arrow.htmlElementString === 'string';
        if (!isValid) {
            console.warn("Filtering out invalid plate movement arrow data:", arrow);
        }
        return isValid;
    }).map(arrow => ({
        ...arrow,
        // Ensure the htmlElement is correctly formatted with the rotation
        htmlElement: `<span class="plate-arrow" style="transform: rotate(${arrow.rotation}deg); display:inline-block;">${arrow.htmlElementString}</span>`
    }));


    // Removed: useEarthquakeDataState hook

    const globeRef = useRef();
    const containerRef = useRef(null);
    // Removed: const [points, setPoints] = useState([]); // For earthquakes
    const [paths, setPaths] = useState([]);
    const [globeDimensions, setGlobeDimensions] = useState({ width: null, height: null });
    const [initialLayoutComplete, setInitialLayoutComplete] = useState(false);
    const [isGlobeHovered, setIsGlobeHovered] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const mouseMoveTimeoutRef = useRef(null);
    const windowLoadedRef = useRef(false);
    // Removed: const [ringsData, setRingsData] = useState([]); // For earthquake rings

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
            if (!initialLayoutComplete && !windowLoadedRef.current) return;
            const currentContainerRefActual = containerRef.current;
            if (!currentContainerRefActual) return;

            const newWidth = currentContainerRefActual.offsetWidth;
            const newHeight = currentContainerRefActual.offsetHeight;

            if (newWidth > 10 && newHeight > 10) {
                 setGlobeDimensions(prev => (prev.width !== newWidth || prev.height !== newHeight) ? { width: newWidth, height: newHeight } : prev);
            }
        };

        const debouncedUpdateDimensions = debounce(updateDimensions, 200);

        if (document.readyState === 'complete') {
            windowLoadedRef.current = true;
            setInitialLayoutComplete(true);
            if (containerRef.current) {
                const newWidth = containerRef.current.offsetWidth;
                const newHeight = containerRef.current.offsetHeight;
                if (newWidth > 10 && newHeight > 10) {
                    setGlobeDimensions({ width: newWidth, height: newHeight });
                }
            }
        } else {
            const handleWindowLoad = () => {
                windowLoadedRef.current = true;
                setInitialLayoutComplete(true);
                if (containerRef.current) {
                    const newWidth = containerRef.current.offsetWidth;
                    const newHeight = containerRef.current.offsetHeight;
                    if (newWidth > 10 && newHeight > 10) {
                         setGlobeDimensions({ width: newWidth, height: newHeight });
                    } else {
                        setTimeout(() => {
                            if (containerRef.current) {
                                const w = containerRef.current.offsetWidth;
                                const h = containerRef.current.offsetHeight;
                                if (w > 10 && h > 10) {
                                    setGlobeDimensions({ width: w, height: h });
                                }
                            }
                        }, 150);
                    }
                }
                window.removeEventListener('load', handleWindowLoad);
            };
            window.addEventListener('load', handleWindowLoad);
        }

        const resizeObserver = new ResizeObserver(debouncedUpdateDimensions);
        if (currentContainerRef) {
            resizeObserver.observe(currentContainerRef);
        }

        return () => {
            if (currentContainerRef) {
                resizeObserver.unobserve(currentContainerRef);
            }
            if (debouncedUpdateDimensions.timeout) clearTimeout(debouncedUpdateDimensions.timeout);
        };
    }, [initialLayoutComplete]);


    // Removed useEffect for points (earthquake data processing)


    useEffect(() => {
        let processedPaths = [];
        // 3. Fortify pathsData generation for coastlines
        if (coastlineGeoJson?.type === "GeometryCollection" && Array.isArray(coastlineGeoJson.geometries)) {
            processedPaths = processedPaths.concat(
                coastlineGeoJson.geometries
                .filter(g =>
                    g.type === "LineString" &&
                    Array.isArray(g.coordinates) &&
                    g.coordinates.length > 1 &&
                    g.coordinates.every(coord => Array.isArray(coord) && coord.length >= 2 && typeof coord[0] === 'number' && typeof coord[1] === 'number')
                )
                .map((g, i) => ({ id: `coastline-${i}`, coords: g.coordinates, color: 'rgb(208,208,214)', stroke: 0.25, label: 'Coastline', properties: { Boundary_Type: 'Coastline' } }))
            );
        } else if (coastlineGeoJson) {
            console.warn("Coastline GeoJSON is not in the expected GeometryCollection format or is invalid:", coastlineGeoJson);
        }

        // 3. Fortify pathsData generation for tectonic plates
        if (tectonicPlatesGeoJson?.type === "FeatureCollection" && Array.isArray(tectonicPlatesGeoJson.features)) {
            processedPaths = processedPaths.concat(
                tectonicPlatesGeoJson.features
                .filter(f =>
                    f.type === "Feature" &&
                    f.geometry?.type === "LineString" &&
                    Array.isArray(f.geometry.coordinates) &&
                    f.geometry.coordinates.length > 1 &&
                    f.geometry.coordinates.every(coord => Array.isArray(coord) && coord.length >= 2 && typeof coord[0] === 'number' && typeof coord[1] === 'number')
                )
                .map((f, i) => {
                    let color = 'rgba(0, 255, 255, 0.9)'; // Bright cyan
                    const type = f.properties?.Boundary_Type;
                    return { id: `plate-${f.properties?.OBJECTID || i}`, coords: f.geometry.coordinates, color, stroke: 1.8, label: `Plate Boundary: ${type || 'Unknown'}`, properties: f.properties };
                })
            );
        } else if (tectonicPlatesGeoJson) {
            console.warn("Tectonic Plates GeoJSON is not in the expected FeatureCollection format or is invalid:", tectonicPlatesGeoJson);
        }

        setPaths(processedPaths);
    }, [coastlineGeoJson, tectonicPlatesGeoJson]);

    // 4. Review Globe Dimensions Effect (Check existing logic)
    useEffect(() => {
        // This effect for pointOfView already depends on globeDimensions.width and .height.
        // It also checks globeRef.current.pointOfView, implicitly checking globeRef.current.
        // Adding explicit non-zero checks for width/height for robustness.
        if (globeRef.current?.pointOfView && globeDimensions.width && globeDimensions.width > 0 && globeDimensions.height && globeDimensions.height > 0) {
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


    // Removed: handlePointClick (no earthquake points to click)


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

            if (globeRef.current && typeof globeRef.current.toGlobeCoords === 'function') {
                const globeCoords = globeRef.current.toGlobeCoords(x, y);
                const currentlyOverGlobe = !!globeCoords;
                if (currentlyOverGlobe !== isGlobeHovered) {
                    setIsGlobeHovered(currentlyOverGlobe);
                }
            } else {
                if (isGlobeHovered) setIsGlobeHovered(false);
            }
        }, 30);
    }, [isGlobeHovered]); // Removed setIsGlobeHovered from deps as it's stable

    const handleContainerMouseLeave = useCallback(() => {
        if (mouseMoveTimeoutRef.current) {
            clearTimeout(mouseMoveTimeoutRef.current);
        }
        if (isGlobeHovered) {
            setIsGlobeHovered(false);
        }
    }, [isGlobeHovered]); // Removed setIsGlobeHovered


    // Removed: useEffect for Rings Data


    if (globeDimensions.width === null || globeDimensions.height === null) {
        return <div ref={containerRef} className="w-full h-full flex items-center justify-center text-slate-500">Initializing Globe...</div>;
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
                    globeImageUrl={null} // No specific globe image, using background and paths
                    bumpImageUrl={null} // No bump map
                    backgroundImageUrl={'/assets/starry_background.jpg'} // Starry background
                    backgroundColor="rgba(0,0,0,0)" // Transparent globe background to show starry sky
                    atmosphereColor={atmosphereColor} // Keep atmosphere, can be adjusted
                    atmosphereAltitude={0.15} // Keep atmosphere altitude

                    // pointsData removed
                    // onPointClick removed

                    pathsData={paths}
                    pathPoints="coords" pathPointLat={p => p[1]} pathPointLng={p => p[0]}
                    pathColor={path => path.color} pathStroke={path => path.stroke}
                    pathLabel={path => path.label} pathTransitionDuration={0}

                    // ringsData removed

                    labelsData={validMajorPlatesData}
                    labelLat="lat"
                    labelLng="lng"
                    labelText="name"
                    labelSize="size"
                    labelColor="color"
                    labelDotRadius={0.2} // Small dot for each label
                    labelResolution={2}
                    labelsTransitionDuration={500}

                    htmlElementsData={validPlateMovementArrowsData}
                    htmlLat="lat"
                    htmlLng="lng"
                    htmlElement="htmlElement"

                    enablePointerInteraction={true} // Keep true for hover/drag, path interactions if any added later
                />
            )}
        </div>
    );
};

export default TectonicPlatesGlobeView;
