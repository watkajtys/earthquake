// src/InteractiveGlobeView.jsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import Globe from 'react-globe.gl';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx'; // Import the context hook

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
    globeAutoRotateSpeed = 0.1,
    explicitWidth = null, // New prop
    explicitHeight = null // New prop
}) => {
    const { globeEarthquakes, lastMajorQuake, previousMajorQuake } = useEarthquakeDataState(); // Get data from context

    const globeRef = useRef();
    const containerRef = useRef(null); // Still needed for fallback and mouse events
    const [points, setPoints] = useState([]);
    const [paths, setPaths] = useState([]);
    // Internal dimensions, used if explicit ones are not provided
    const [internalGlobeDimensions, setInternalGlobeDimensions] = useState({ width: null, height: null });
    const [initialLayoutComplete, setInitialLayoutComplete] = useState(false);
    const [isGlobeHovered, setIsGlobeHovered] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const mouseMoveTimeoutRef = useRef(null);
    const windowLoadedRef = useRef(false); // To track if window.load has fired
    const [ringsData, setRingsData] = useState([]);

    // Determine dimensions to use: explicit or internal
    const useExplicitDimensions = typeof explicitWidth === 'number' && explicitWidth > 0 &&
                                typeof explicitHeight === 'number' && explicitHeight > 0;

    const displayWidth = useExplicitDimensions ? explicitWidth : internalGlobeDimensions.width;
    const displayHeight = useExplicitDimensions ? explicitHeight : internalGlobeDimensions.height;

    const debounce = (func, delay) => {
        let timeout;
        const debouncedFunc = (...args) => {
            clearTimeout(timeout);
            debouncedFunc.timeout = setTimeout(() => func.apply(this, args), delay);
        };
        debouncedFunc.timeout = null;
        return debouncedFunc;
    };

    // This useEffect handles internal dimension calculation ONLY if explicit dimensions are not provided
    useEffect(() => {
        if (useExplicitDimensions) {
            // If using explicit dimensions, no need to run internal calculations or observers
            return;
        }

        const currentContainerRef = containerRef.current;
        if (!currentContainerRef) return;

        const updateDimensions = () => {
            if (!initialLayoutComplete && !windowLoadedRef.current) return;

            const currentContainerRefActual = containerRef.current;
            if (!currentContainerRefActual) return;

            const newWidth = currentContainerRefActual.offsetWidth;
            const newHeight = currentContainerRefActual.offsetHeight;

            if (newWidth > 10 && newHeight > 10) {
                setInternalGlobeDimensions(prev => (prev.width !== newWidth || prev.height !== newHeight) ? { width: newWidth, height: newHeight } : prev);
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
                    setInternalGlobeDimensions({ width: newWidth, height: newHeight });
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
                        setInternalGlobeDimensions({ width: newWidth, height: newHeight });
                    } else {
                        setTimeout(() => {
                            if (containerRef.current) {
                                const w = containerRef.current.offsetWidth;
                                const h = containerRef.current.offsetHeight;
                                if (w > 10 && h > 10) {
                                    setInternalGlobeDimensions({ width: w, height: h });
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
        resizeObserver.observe(currentContainerRef);

        return () => {
            resizeObserver.unobserve(currentContainerRef);
            if (debouncedUpdateDimensions.timeout) clearTimeout(debouncedUpdateDimensions.timeout);
            // It's good practice to also remove the window.load listener if the component unmounts before it fires,
            // though in typical React lifecycles where this effect runs after mount, this might be less critical
            // if handleWindowLoad always cleans itself up. However, to be safe:
            // window.removeEventListener('load', handleWindowLoad); // This line would need handleWindowLoad to be defined in a way it's accessible here.
            // The current structure where handleWindowLoad removes itself is generally okay.
        };
    }, [useExplicitDimensions, initialLayoutComplete]); // Effect now depends on useExplicitDimensions and initialLayoutComplete

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
                        color: getMagnitudeColorFunc(prevMagValue),
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
                        color: getMagnitudeColorFunc(prevMagValue),
                        label: `PREVIOUS SIGNIFICANT: M${previousMajorQuake.properties.mag?.toFixed(1)} - ${previousMajorQuake.properties.place}`,
                        quakeData: previousMajorQuake,
                        type: 'previous_major_quake'
                    });
                }
            }
        }

        // --- NEW: Process activeClusters ---
        // if (activeClusters && activeClusters.length > 0) {
        //     activeClusters.forEach((cluster, index) => {
        //         if (cluster.length === 0) return;

        //         let sumLat = 0, sumLng = 0, maxMag = 0;
        //         let quakesInClusterDetails = [];

        //         cluster.forEach(quake => {
        //             sumLat += quake.geometry.coordinates[1];
        //             sumLng += quake.geometry.coordinates[0];
        //             if (quake.properties.mag > maxMag) {
        //                 maxMag = quake.properties.mag;
        //             }
        //             quakesInClusterDetails.push({
        //                 id: quake.id,
        //                 mag: quake.properties.mag,
        //                 place: quake.properties.place,
        //                 time: quake.properties.time
        //             });
        //         });

        //         const centroidLat = sumLat / cluster.length;
        //         const centroidLng = sumLng / cluster.length;

        //         allPointsData.push({
        //             lat: centroidLat,
        //             lng: centroidLng,
        //             altitude: 0.02, // Slightly elevated to distinguish, if needed
        //             radius: 0.5 + (cluster.length / 10), // Radius based on cluster size, adjust as needed
        //             color: 'rgba(255, 255, 0, 0.75)', // Bright yellow for clusters, with some transparency
        //             label: `Cluster: ${cluster.length} quakes (Max Mag: ${maxMag.toFixed(1)})`,
        //             type: 'cluster_center',
        //             // Store the original cluster data for potential interaction
        //             clusterData: {
        //                 id: `cluster_${index}_${Date.now()}`, // Create a unique ID for the cluster point
        //                 quakes: quakesInClusterDetails,
        //                 centroidLat,
        //                 centroidLng,
        //                 numQuakes: cluster.length,
        //                 maxMag
        //             },
        //             // To make it clickable and identifiable by onQuakeClick,
        //             // we can mock a minimal 'quakeData' structure for clusters.
        //             // App.jsx's onQuakeClick expects properties.detail or properties.url.
        //             // We'll need to handle 'cluster_center' type clicks differently there, or adapt this.
        //             // For now, this structure helps avoid errors in existing onPointClick if it tries to access quakeData.properties.detail
        //             quakeData: {
        //                 id: `cluster_vis_${index}_${Date.now()}`, // Unique ID for this visual point
        //                 properties: {
        //                     place: `Cluster of ${cluster.length} earthquakes`,
        //                     mag: maxMag,
        //                     // No 'detail' or 'url' for clusters in the same way as individual quakes
        //                 },
        //                 geometry: {
        //                     type: "Point",
        //                     coordinates: [centroidLng, centroidLat, 0] // Mock geometry
        //                 },
        //                 isCluster: true, // Custom flag
        //                 clusterDetails: { // Pass actual detailed quake list
        //                     quakes: cluster.map(q => ({ // Map to avoid passing huge objects if not needed directly by globe label
        //                         id: q.id,
        //                         mag: q.properties.mag,
        //                         place: q.properties.place,
        //                         time: q.properties.time,
        //                         detail: q.properties.detail || q.properties.url // Keep detail for individual quakes within cluster
        //                     }))
        //                 }
        //             }
        //         });
        //     });
        // }
        // --- END NEW ---
        setPoints(allPointsData);
    }, [globeEarthquakes, getMagnitudeColorFunc, highlightedQuakeId, previousMajorQuake, activeClusters]); // Update dependency array

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
        // This effect should use the actual display dimensions
        if (globeRef.current?.pointOfView && displayWidth && displayHeight) {
            const targetLatitude = (typeof defaultFocusLat === 'number' && !isNaN(defaultFocusLat)) ? defaultFocusLat : 20;
            const targetLongitude = (typeof defaultFocusLng === 'number' && !isNaN(defaultFocusLng)) ? defaultFocusLng : 0;
            // Assuming defaultFocusAltitude is generally reliable or has a suitable default in its definition
            globeRef.current.pointOfView({ lat: targetLatitude, lng: targetLongitude, altitude: defaultFocusAltitude }, 0);
        }
    }, [defaultFocusLat, defaultFocusLng, defaultFocusAltitude, displayWidth, displayHeight]);

    // CONSOLIDATED Effect to manage globe controls and drag listeners
    useEffect(() => {
        const globeInstance = globeRef.current;
        // This effect should also use the actual display dimensions for its guard condition
        if (!globeInstance?.controls || typeof globeInstance.controls !== 'function' || !displayWidth || !displayHeight) {
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
        displayWidth,
        displayHeight,
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

        // Ring for lastMajorQuake (from context, previously latestMajorQuakeForRing)
        if (lastMajorQuake &&
            lastMajorQuake.geometry &&
            Array.isArray(lastMajorQuake.geometry.coordinates) &&
            lastMajorQuake.geometry.coordinates.length >= 2 &&
            typeof lastMajorQuake.geometry.coordinates[1] === 'number' &&
            typeof lastMajorQuake.geometry.coordinates[0] === 'number' &&
            lastMajorQuake.properties &&
            typeof lastMajorQuake.properties.mag === 'number'
        ) {
            const coords = lastMajorQuake.geometry.coordinates;
            const mag = parseFloat(lastMajorQuake.properties.mag);
            newRings.push({
                id: `major_quake_ring_latest_${lastMajorQuake.id}_${lastMajorQuake.properties.time}_${Date.now()}`,
                lat: coords[1],
                lng: coords[0],
                altitude: 0.02,
                color: () => getMagnitudeColorFunc(mag),
                maxR: Math.max(6, mag * 2.2),
                propagationSpeed: Math.max(2, mag * 0.5),
                repeatPeriod: 1800,
            });
        }

        // Ring for previousMajorQuake (from context)
        if (previousMajorQuake && // This is now from context
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
            const baseColor = getMagnitudeColorFunc(mag);
            newRings.push({
                id: `major_quake_ring_prev_${previousMajorQuake.id}_${previousMajorQuake.properties.time}_${Date.now()}`,
                lat: coords[1],
                lng: coords[0],
                altitude: 0.018, // Slightly different altitude
                color: () => makeColorDuller(baseColor, 0.7),
                maxR: Math.max(5, mag * 2.0),
                propagationSpeed: Math.max(1.8, mag * 0.45),
                repeatPeriod: 1900, // Slightly different period
            });
        }
        
        if (newRings.length > 0 || ringsData.length > 0) { // Update only if there's a change or existing rings to clear
             setRingsData(newRings);
        }

    }, [lastMajorQuake, previousMajorQuake, getMagnitudeColorFunc, ringsData.length]); // Update dependency array, added getMagnitudeColorFunc as it's used in color callbacks


    // Conditional rendering based on whether dimensions are determined (either explicit or internal)
    if (!displayWidth || !displayHeight || displayWidth <= 0 || displayHeight <= 0) {
        // If using explicit dimensions, containerRef might not be strictly necessary here for sizing,
        // but it's kept for mouse events and if internal sizing logic needs to run as a fallback.
        return (
            <div ref={containerRef} className="w-full h-full flex items-center justify-center text-slate-500">
                Initializing Interactive Globe... (Waiting for dimensions)
            </div>
        );
    }

    return (
        <div
            ref={containerRef} // Keep ref for mouse events and fallback internal sizing
            className="w-full h-full"
            style={{ position: 'relative', cursor: 'default' }}
            onMouseMove={handleContainerMouseMove}
            onMouseLeave={handleContainerMouseLeave}
        >
            {/* Render Globe with the determined displayWidth and displayHeight */}
            <Globe
                ref={globeRef}
                width={displayWidth}
                height={displayHeight}
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