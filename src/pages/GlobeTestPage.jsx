// src/pages/GlobeTestPage.jsx
import React, { Suspense, lazy, useRef, useState, useEffect } from 'react';

// Lazy load InteractiveGlobeView to mimic the main app's behavior partly
const InteractiveGlobeView = lazy(() => import('../components/InteractiveGlobeView'));

// A simple mock function, as the real one is imported from utils
const mockGetMagnitudeColor = (magnitude) => {
    if (magnitude > 7) return 'darkred';
    if (magnitude > 6) return 'red';
    if (magnitude > 5) return 'orange';
    if (magnitude > 4) return 'yellow';
    return 'lightgreen';
};

const mockOnQuakeClick = (quake) => {
    console.log('Globe test page: Quake clicked (no-op)', quake);
};

// This page will be rendered within the existing EarthquakeDataProvider
// and UIStateProvider via the routing setup in HomePage.jsx,
// so InteractiveGlobeView should receive its necessary context.

function GlobeTestPage() {
    const wrapperRef = useRef(null);
    const [dimensions, setDimensions] = useState({ width: null, height: null });

    useEffect(() => {
        const currentWrapperRef = wrapperRef.current;
        if (!currentWrapperRef) return;

        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    setDimensions({ width, height });
                }
            }
        });

        resizeObserver.observe(currentWrapperRef);

        // Initial check, as ResizeObserver might not fire if size is already set by CSS
        // and matches initial state (though unlikely with null initial state)
        const initialWidth = currentWrapperRef.offsetWidth;
        const initialHeight = currentWrapperRef.offsetHeight;
        if (initialWidth > 0 && initialHeight > 0 && (dimensions.width !== initialWidth || dimensions.height !== initialHeight)) {
             setDimensions({ width: initialWidth, height: initialHeight });
        }


        return () => {
            if (currentWrapperRef) {
                resizeObserver.unobserve(currentWrapperRef);
            }
        };
    }, []); // Empty dependency array to run once on mount and clean up on unmount

    // These props are to ensure InteractiveGlobeView can render.
    const globeViewProps = {
        onQuakeClick: mockOnQuakeClick,
        getMagnitudeColorFunc: mockGetMagnitudeColor,
        coastlineGeoJson: null,
        tectonicPlatesGeoJson: null,
        highlightedQuakeId: null,
        activeClusters: [],
        atmosphereColor: "rgba(100,100,255,0.3)",
        defaultFocusLat: 0,
        defaultFocusLng: 0,
        defaultFocusAltitude: 2.5,
        allowUserDragRotation: true,
        enableAutoRotation: false,
        globeAutoRotateSpeed: 0.1,
        // Pass explicit dimensions if available
        explicitWidth: dimensions.width,
        explicitHeight: dimensions.height,
    };

    return (
        <div
            ref={wrapperRef}
            style={{
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100vw',
                height: '100svh', // Using svh as per diagnostic goal
                backgroundColor: 'rgba(0, 0, 25, 1)', // Dark blue background
                zIndex: 9999, // Ensure it's on top
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}
            id="globe-test-page-wrapper"
        >
            <Suspense
                fallback={
                    <div style={{ color: 'white', fontSize: '2em', textAlign: 'center' }}>
                        Loading Globe Component...
                    </div>
                }
            >
                {(dimensions.width && dimensions.height && dimensions.width > 0 && dimensions.height > 0) ? (
                    <InteractiveGlobeView {...globeViewProps} />
                ) : (
                    <div style={{ color: 'white', fontSize: '1.5em', textAlign: 'center' }}>
                        Determining container size...
                    </div>
                )}
            </Suspense>
        </div>
    );
}

export default GlobeTestPage;
