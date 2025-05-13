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
                                  allowUserDragRotation = false,
                                  enableAutoRotation = true,      // Prop still used by useEffect
                                  globeAutoRotateSpeed = 0.1    // Prop still used by useEffect
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
            // Keep track of the timeout ID for cleanup
            debounce.timeout = setTimeout(() => func.apply(this, args), delay);
        };
    };
    debounce.timeout = null; // Initialize static property

    // Effect for handling container resize (unchanged)
    useEffect(() => {
        const currentContainerRef = containerRef.current;
        if (!currentContainerRef) return;

        const updateDimensions = () => {
            const newWidth = currentContainerRef.offsetWidth;
            const newHeight = currentContainerRef.offsetHeight;
            if (newWidth > 10 && newHeight > 10) {
                setGlobeDimensions(prev => {
                    if (prev.width !== newWidth || prev.height !== newHeight) {
                        return { width: newWidth, height: newHeight };
                    }
                    return prev;
                });
            }
        };
        const debouncedUpdateDimensions = debounce(updateDimensions, 200);
        updateDimensions(); // Initial call
        const resizeObserver = new ResizeObserver(debouncedUpdateDimensions);
        resizeObserver.observe(currentContainerRef);
        return () => {
            if (currentContainerRef) {
                resizeObserver.unobserve(currentContainerRef);
            }
            clearTimeout(debounce.timeout); // Clear timeout on unmount
        };
    }, []);


    // Effect for updating points data (unchanged)
    useEffect(() => {
        const allPointsData = [
            ...(earthquakes || []).map(quake => ({ lat: quake.geometry?.coordinates?.[1], lng: quake.geometry?.coordinates?.[0], altitude: 0.01, radius: Math.max(0.15, (parseFloat(quake.properties.mag) || 0) / 7) + 0.05, color: getMagnitudeColorFunc(quake.properties.mag), label: `M${quake.properties.mag?.toFixed(1)} - ${quake.properties.place}`, quakeData: quake, type: 'recent' })),
        ].filter(p => typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng));
        setPoints(allPointsData);
    }, [earthquakes, getMagnitudeColorFunc]);

    // Effect for setting initial point of view (unchanged)
    useEffect(() => {
        if (globeRef.current && typeof globeRef.current.pointOfView === 'function' && globeDimensions.width && globeDimensions.height) {
            globeRef.current.pointOfView({ lat: defaultFocusLat, lng: defaultFocusLng, altitude: defaultFocusAltitude }, 0);
        }
    }, [defaultFocusLat, defaultFocusLng, defaultFocusAltitude, globeDimensions]);

    // Effect to directly manipulate controls for zoom/rotate/pan/auto-rotate (unchanged)
    useEffect(() => {
        const globeInstance = globeRef.current;
        if (globeInstance && typeof globeInstance.controls === 'function' && globeDimensions.width && globeDimensions.height) {
            const controls = globeInstance.controls();
            if (controls) {
                controls.enableRotate = allowUserDragRotation;
                controls.enablePan = allowUserDragRotation;
                controls.enableZoom = allowUserDragRotation;

                controls.autoRotate = enableAutoRotation;
                if (enableAutoRotation) {
                    // If the rotation direction is still not what you want (e.g., you want clockwise):
                    // Try making the speed negative:
                    controls.autoRotateSpeed = -Math.abs(globeAutoRotateSpeed * 20);
                    // controls.autoRotateSpeed = globeAutoRotateSpeed * 20; // Default: Counter-Clockwise
                } else {
                    controls.autoRotateSpeed = 0;
                }
            }
        }
    }, [allowUserDragRotation, enableAutoRotation, globeAutoRotateSpeed, globeDimensions]);

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
                    // REMOVED: enableAutoRotate={enableAutoRotation}
                    // REMOVED: autoRotateSpeed={globeAutoRotateSpeed}
                    enablePointerInteraction={true}
                    onPointClick={handlePointClick}
                />
            )}
        </div>
    );
};

export default InteractiveGlobeView;