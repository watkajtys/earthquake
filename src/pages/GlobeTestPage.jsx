// src/pages/GlobeTestPage.jsx
import React, { Suspense, lazy } from 'react';

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
    // These props are to ensure InteractiveGlobeView can render.
    // Data like actual earthquakes will come from the (likely empty or default) context.
    const essentialGlobeProps = {
        onQuakeClick: mockOnQuakeClick,
        getMagnitudeColorFunc: mockGetMagnitudeColor,
        coastlineGeoJson: null, // Keep it minimal
        tectonicPlatesGeoJson: null, // Keep it minimal
        highlightedQuakeId: null,
        activeClusters: [],
        atmosphereColor: "rgba(100,100,255,0.3)",
        defaultFocusLat: 0,
        defaultFocusLng: 0,
        defaultFocusAltitude: 2.5,
        allowUserDragRotation: true,
        enableAutoRotation: false,
        globeAutoRotateSpeed: 0.1
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100vw',
                height: '100svh', // Using svh as per diagnostic goal
                backgroundColor: 'rgba(0, 0, 25, 1)', // Dark blue background
                zIndex: 9999, // Ensure it's on top
                display: 'flex', // Added for centering fallback if needed
                alignItems: 'center', // Added for centering fallback
                justifyContent: 'center' // Added for centering fallback
            }}
            id="globe-test-page-wrapper" // For easier selection in devtools
        >
            <Suspense
                fallback={
                    <div style={{ color: 'white', fontSize: '2em', textAlign: 'center' }}>
                        Loading Globe for Diagnostic Test...
                    </div>
                }
            >
                {/*
                  The InteractiveGlobeView's own container has w-full and h-full.
                  So it will try to expand to the size of this blue fixed div.
                  Its internal dimension calculation logic (using ResizeObserver etc.)
                  is what we are testing against the 100vw/100svh viewport.
                */}
                <InteractiveGlobeView {...essentialGlobeProps} />
            </Suspense>
        </div>
    );
}

export default GlobeTestPage;
