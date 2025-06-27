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
    // Dimensions from ResizeObserver on the wrapper element, initialized to 0 for safety with toFixed
    const [roDimensions, setRoDimensions] = useState({ width: 0, height: 0 });
    // Dimensions from window.visualViewport API, initialized to 0
    const [visualViewportDims, setVisualViewportDims] = useState({ vvWidth: 0, vvHeight: 0 });
    const [isVisualViewportAPISupported, setIsVisualViewportAPISupported] = useState(true);


    // Effect for ResizeObserver on the main wrapper (100vw/100svh element)
    useEffect(() => {
        const currentWrapperRef = wrapperRef.current;
        if (!currentWrapperRef) return;

        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                // Ensure we only set positive dimensions
                if (width > 0 && height > 0) {
                    setRoDimensions({ width, height });
                }
            }
        });

        resizeObserver.observe(currentWrapperRef);

        // Eager initial check
        const initialWidth = currentWrapperRef.offsetWidth;
        const initialHeight = currentWrapperRef.offsetHeight;
        if (initialWidth > 0 && initialHeight > 0) {
             setRoDimensions({ width: initialWidth, height: initialHeight });
        }

        return () => {
            // No need to check currentWrapperRef here as it's captured by closure.
            // If it was null at observe time, this effect wouldn't run to this point.
            // However, good practice to ensure it was observed before trying to unobserve.
            // For simplicity, if resizeObserver was created, currentWrapperRef was valid.
            resizeObserver.unobserve(currentWrapperRef);
        };
    }, []); // Empty dependency array means this runs once on mount and cleans up on unmount.

    // Effect for window.visualViewport
    useEffect(() => {
        // Check for visualViewport API support
        if (!window.visualViewport) {
            setIsVisualViewportAPISupported(false);
            return;
        }
        setIsVisualViewportAPISupported(true);

        const vv = window.visualViewport;

        const updateVisualViewport = () => {
            // Ensure vv still exists and properties are numbers before setting
            if (vv && typeof vv.width === 'number' && typeof vv.height === 'number') {
                setVisualViewportDims({ vvWidth: vv.width, vvHeight: vv.height });
            }
        };

        updateVisualViewport(); // Initial read

        vv.addEventListener('resize', updateVisualViewport);
        vv.addEventListener('scroll', updateVisualViewport);

        return () => {
            // vv captured in closure, still exists here if addEventListener was called
            vv.removeEventListener('resize', updateVisualViewport);
            vv.removeEventListener('scroll', updateVisualViewport);
        };
    }, []); // Empty: runs once on mount, cleans up on unmount.

    // Determine final dimensions to pass to InteractiveGlobeView
    let finalWidth = 0;
    let finalHeight = 0; // Default to 0 for safety with toFixed & explicit prop expectations
    let dimensionSource = "Not set";
    const ANOMALOUS_HEIGHT_THRESHOLD = 950; // If RO height is above this and wider than aspect ratio, suspect.
    const ANOMALOUS_ASPECT_RATIO_MULTIPLIER = 1.5; // e.g. height > width * 1.5

    // Prioritize VisualViewport if its dimensions are valid (greater than 0)
    if (visualViewportDims.vvWidth > 0 && visualViewportDims.vvHeight > 0) {
        finalWidth = visualViewportDims.vvWidth;
        finalHeight = visualViewportDims.vvHeight;
        dimensionSource = "VisualViewport";
    }
    // Fallback to ResizeObserver dimensions if they are valid
    else if (roDimensions.width > 0 && roDimensions.height > 0) {
        // Check for anomalous RO height
        if (roDimensions.height > ANOMALOUS_HEIGHT_THRESHOLD &&
            (roDimensions.width === 0 || roDimensions.height > roDimensions.width * ANOMALOUS_ASPECT_RATIO_MULTIPLIER) // check width is not 0 before division
        ) {
            dimensionSource = "RO (anomalous - waiting)";
            // Keep finalWidth and finalHeight as 0, so globe shows its internal loader or doesn't render with bad dimensions
        } else {
            finalWidth = roDimensions.width;
            finalHeight = roDimensions.height;
            dimensionSource = "ResizeObserver";
        }
    }
    // If neither is valid, finalWidth and finalHeight remain 0.

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
                width: '100%', // Fill parent (#root or body)
                height: '100%', // Fill parent (#root or body)
                backgroundColor: 'rgba(0, 0, 25, 1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                // position: 'fixed', top: '0', left: '0', zIndex: 9999 are removed
            }}
            id="globe-test-page-wrapper"
        >
            <div style={{
                position: 'absolute', // This debug display can remain absolutely positioned within the wrapper
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
                W: {roDimensions.width > 0 ? roDimensions.width.toFixed(2) + 'px' : String(roDimensions.width)}, H: {roDimensions.height > 0 ? roDimensions.height.toFixed(2) + 'px' : String(roDimensions.height)} <br />
                VV Dimensions (Supported: {isVisualViewportAPISupported ? 'Yes' : 'No'}): <br />
                W: {visualViewportDims.vvWidth > 0 ? visualViewportDims.vvWidth.toFixed(2) + 'px' : String(visualViewportDims.vvWidth)}, H: {visualViewportDims.vvHeight > 0 ? visualViewportDims.vvHeight.toFixed(2) + 'px' : String(visualViewportDims.vvHeight)} <br />
                Final Dimensions Used: <br />
                W: {finalWidth > 0 ? finalWidth.toFixed(2) + 'px' : String(finalWidth)}, H: {finalHeight > 0 ? finalHeight.toFixed(2) + 'px' : String(finalHeight)} (Source: {dimensionSource})
            </div>

            {/* No more Suspense for InteractiveGlobeView here, as it's imported directly */}
            {/* InteractiveGlobeView itself has a loading message if finalWidth/Height are null/invalid */}
            <InteractiveGlobeView {...globeViewProps} />
        </div>
    );
}

export default GlobeTestPage;
