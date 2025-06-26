// src/pages/GlobeTestPage.jsx
import React, { useRef, useState, useEffect } from 'react'; // Removed Suspense, lazy

// Regular import for InteractiveGlobeView to simplify loader removal in this test
import InteractiveGlobeView from '../components/InteractiveGlobeView';

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
    // Dimensions from ResizeObserver on the wrapper element
    const [roDimensions, setRoDimensions] = useState({ width: null, height: null });
    // Dimensions from window.visualViewport API
    const [visualViewportDims, setVisualViewportDims] = useState({ vvWidth: null, vvHeight: null });

    // Effect for ResizeObserver on the main wrapper (100vw/100svh element)
    useEffect(() => {
        const currentWrapperRef = wrapperRef.current;
        if (!currentWrapperRef) return;

        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    setRoDimensions({ width, height });
                }
            }
        });

        resizeObserver.observe(currentWrapperRef);

        const initialWidth = currentWrapperRef.offsetWidth;
        const initialHeight = currentWrapperRef.offsetHeight;
        if (initialWidth > 0 && initialHeight > 0 && (roDimensions.width !== initialWidth || roDimensions.height !== initialHeight)) {
             setRoDimensions({ width: initialWidth, height: initialHeight });
        }

        return () => {
            if (currentWrapperRef) {
                resizeObserver.unobserve(currentWrapperRef);
            }
        };
    }, []); // roDimensions.width, roDimensions.height removed from deps as they cause loop

    // Effect for window.visualViewport
    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return; // visualViewport API not supported

        const updateVisualViewport = () => {
            setVisualViewportDims({ vvWidth: vv.width, vvHeight: vv.height });
        };

        updateVisualViewport(); // Initial read
        vv.addEventListener('resize', updateVisualViewport);
        vv.addEventListener('scroll', updateVisualViewport); // Also listen to scroll as it can affect viewport on some mobiles

        return () => {
            vv.removeEventListener('resize', updateVisualViewport);
            vv.removeEventListener('scroll', updateVisualViewport);
        };
    }, []);

    // Determine final dimensions to pass to InteractiveGlobeView
    let finalWidth = null;
    let finalHeight = null;
    let dimensionSource = "Not set";

    if (visualViewportDims.vvWidth && visualViewportDims.vvHeight && visualViewportDims.vvWidth > 0 && visualViewportDims.vvHeight > 0) {
        finalWidth = visualViewportDims.vvWidth;
        finalHeight = visualViewportDims.vvHeight;
        dimensionSource = "VisualViewport";
    } else if (roDimensions.width && roDimensions.height && roDimensions.width > 0 && roDimensions.height > 0) {
        // Skepticism for ResizeObserver height if it's anomalously large
        // (e.g., >900px, or much larger than width for portrait)
        // This is a simple heuristic, might need refinement.
        const MAX_PLAUSIBLE_SVH_HEIGHT = 950; // Adjust as needed
        if (roDimensions.height > MAX_PLAUSIBLE_SVH_HEIGHT && roDimensions.height > roDimensions.width * 1.5) { // Heuristic for portrait anomaly
            // Don't use this anomalous RO height yet, wait for VV or RO to stabilize.
            // Keep finalHeight as null, Globe will show its internal loader.
            dimensionSource = "RO (anomalous - waiting)";
        } else {
            finalWidth = roDimensions.width;
            finalHeight = roDimensions.height;
            dimensionSource = "ResizeObserver";
        }
    }

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
        explicitWidth: finalWidth,
        explicitHeight: finalHeight,
    };

    return (
        <div
            ref={wrapperRef}
            style={{
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100vw',
                height: '100svh',
                backgroundColor: 'rgba(0, 0, 25, 1)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}
            id="globe-test-page-wrapper"
        >
            <div style={{
                position: 'absolute',
                top: '10px',
                left: '10px',
                padding: '5px',
                backgroundColor: 'rgba(0,0,0,0.85)',
                color: 'white',
                fontSize: '12px', // Smaller for more info
                zIndex: 10000,
                fontFamily: 'monospace',
                lineHeight: '1.4'
            }}>
                RO Dimensions: <br />
                W: {roDimensions.width ? roDimensions.width.toFixed(2) + 'px' : 'null'}, H: {roDimensions.height ? roDimensions.height.toFixed(2) + 'px' : 'null'} <br />
                VV Dimensions: <br />
                W: {visualViewportDims.vvWidth ? visualViewportDims.vvWidth.toFixed(2) + 'px' : 'null'}, H: {visualViewportDims.vvHeight ? visualViewportDims.vvHeight.toFixed(2) + 'px' : 'null'} <br />
                Final Dimensions Used: <br />
                W: {finalWidth ? finalWidth.toFixed(2) + 'px' : 'null'}, H: {finalHeight ? finalHeight.toFixed(2) + 'px' : 'null'} (Source: {dimensionSource})
            </div>

            {/* No more Suspense for InteractiveGlobeView here, as it's imported directly */}
            {/* InteractiveGlobeView itself has a loading message if finalWidth/Height are null/invalid */}
            <InteractiveGlobeView {...globeViewProps} />
        </div>
    );
}

export default GlobeTestPage;
