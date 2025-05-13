// src/InteractiveGlobeView.jsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import Globe from 'react-globe.gl';

const InteractiveGlobeView = ({
                                  earthquakes,
                                  onQuakeClick,
                                  getMagnitudeColorFunc,
                                  atmosphereColor = "rgba(100,100,255,0.3)",
                                  defaultFocusLat = 20,
                                  defaultFocusLng = 0,
                                  defaultFocusAltitude = 2.5,
                                  allowUserDragRotation = false, // Use this to explicitly control interaction
                                  enableAutoRotation = true,
                                  globeAutoRotateSpeed = 0.1
                              }) => {
    const globeRef = useRef();
    const containerRef = useRef(null);
    const [points, setPoints] = useState([]);
    const [globeDimensions, setGlobeDimensions] = useState({ width: null, height: null });

    // Debounce utility (unchanged)
    const debounce = (func, delay) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    };

    // Effect for handling container resize (unchanged)
    useEffect(() => {
        const currentContainerRef = containerRef.current;
        if (!currentContainerRef) return;

        const updateDimensions = () => {
            const newWidth = currentContainerRef.offsetWidth;
            const newHeight = currentContainerRef.offsetHeight;
            // Ensure valid dimensions before setting state
            if (newWidth > 10 && newHeight > 10) {
                setGlobeDimensions(prev => {
                    // Only update state if dimensions actually changed
                    if (prev.width !== newWidth || prev.height !== newHeight) {
                        return { width: newWidth, height: newHeight };
                    }
                    return prev;
                });
            }
        };
        const debouncedUpdateDimensions = debounce(updateDimensions, 200);
        // Initial call
        updateDimensions();
        // Observe
        const resizeObserver = new ResizeObserver(debouncedUpdateDimensions);
        resizeObserver.observe(currentContainerRef);
        // Cleanup
        return () => {
            if (currentContainerRef) {
                resizeObserver.unobserve(currentContainerRef);
            }
            // Clear any pending debounce timeout on unmount
            clearTimeout(debounce.timeout);
        };
    }, []); // Empty dependency array ensures this runs once on mount for setup


    // Effect for updating points data (unchanged)
    useEffect(() => {
        const allPointsData = [
            ...(earthquakes || []).map(quake => ({ lat: quake.geometry?.coordinates?.[1], lng: quake.geometry?.coordinates?.[0], altitude: 0.01, radius: Math.max(0.15, (parseFloat(quake.properties.mag) || 0) / 7) + 0.05, color: getMagnitudeColorFunc(quake.properties.mag), label: `M${quake.properties.mag?.toFixed(1)} - ${quake.properties.place}`, quakeData: quake, type: 'recent' })),
        ].filter(p => typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng));
        setPoints(allPointsData);
    }, [earthquakes, getMagnitudeColorFunc]);

    // Effect for setting initial point of view (unchanged)
    useEffect(() => {
        // Ensure globeDimensions are set before trying to set point of view
        if (globeRef.current && typeof globeRef.current.pointOfView === 'function' && globeDimensions.width && globeDimensions.height) {
            globeRef.current.pointOfView({ lat: defaultFocusLat, lng: defaultFocusLng, altitude: defaultFocusAltitude }, 0);
        }
    }, [defaultFocusLat, defaultFocusLng, defaultFocusAltitude, globeDimensions]); // Add globeDimensions dependency

    // Effect to directly manipulate controls for zoom/rotate/pan/auto-rotate
    useEffect(() => {
        const globeInstance = globeRef.current;
        // Ensure globeInstance, controls, and dimensions are ready
        if (globeInstance && typeof globeInstance.controls === 'function' && globeDimensions.width && globeDimensions.height) {
            const controls = globeInstance.controls();
            if (controls) {
                // Explicitly disable user interactions based on allowUserDragRotation prop
                controls.enableRotate = allowUserDragRotation;
                controls.enablePan = allowUserDragRotation;
                controls.enableZoom = allowUserDragRotation;

                // Set auto-rotation based on props
                controls.autoRotate = enableAutoRotation;
                if (enableAutoRotation) {
                    controls.autoRotateSpeed = globeAutoRotateSpeed * 20; // Adjust multiplier as needed
                } else {
                    controls.autoRotateSpeed = 0;
                }
                // Optional: Force an update to the controls if needed, though changing properties should suffice
                // controls.update();
            }
        }
        // Rerun if config props or dimensions change
    }, [allowUserDragRotation, enableAutoRotation, globeAutoRotateSpeed, globeDimensions]); // ADDED globeDimensions

    // Click handler (unchanged)
    const handlePointClick = useCallback((point) => {
        if (point.quakeData) {
            onQuakeClick(point.quakeData);
        }
    }, [onQuakeClick]);


    // Loading state display (unchanged)
    if (globeDimensions.width === null || globeDimensions.height === null) {
        return (
            <div ref={containerRef} className="w-full h-full flex items-center justify-center text-slate-500">
                Initializing Interactive Globe...
            </div>
        );
    }

    // Main render (Globe component)
    return (
        <div ref={containerRef} className="w-full h-full" style={{ position: 'relative' }}>
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
                    pointLat="lat"
                    pointLng="lng"
                    pointAltitude="altitude"
                    pointRadius="radius"
                    pointColor="color"
                    pointsMerge={true}
                    pointsTransitionDuration={0}
                    enableAutoRotate={enableAutoRotation} // Keep passing these for library's primary control
                    autoRotateSpeed={globeAutoRotateSpeed}
                    enablePointerInteraction={true} // Keep true for clicks
                    onPointClick={handlePointClick}
                />
            )}
        </div>
    );
};

export default InteractiveGlobeView;