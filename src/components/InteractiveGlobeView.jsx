// src/InteractiveGlobeView.jsx
import React, { useRef } // Removed useEffect, useState, useCallback
// import Globe from 'react-globe.gl'; // Temporarily removed for CSS-only sizing test
// import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx'; // Temporarily removed

// Utility function to take a color string (hex or rgba) and return a new rgba string
// with its opacity multiplied by `opacityFactor`.
// This function (makeColorDuller) can remain as it's not directly involved in sizing logic.
const makeColorDuller = (colorString, opacityFactor) => {
    const fallbackColor = 'rgba(128,128,128,0.5)';
    let r, g, b, currentAlpha = 1.0;
    if (typeof colorString !== 'string') return fallbackColor;
    try {
        if (colorString.startsWith('#')) {
            let hex = colorString.slice(1);
            if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
            if (hex.length === 6) {
                r = parseInt(hex.substring(0,2),16); g = parseInt(hex.substring(2,4),16); b = parseInt(hex.substring(4,6),16); currentAlpha = 1.0;
            } else return fallbackColor;
        } else if (colorString.startsWith('rgba(') && colorString.endsWith(')')) {
            const parts = colorString.substring(5, colorString.length-1).split(',');
            if (parts.length === 4) {
                r = parseInt(parts[0].trim(),10); g = parseInt(parts[1].trim(),10); b = parseInt(parts[2].trim(),10); currentAlpha = parseFloat(parts[3].trim());
            } else return fallbackColor;
        } else return fallbackColor;
        if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(currentAlpha)) return fallbackColor;
        const newAlpha = Math.max(0, Math.min(1, currentAlpha * opacityFactor));
        return `rgba(${r},${g},${b},${newAlpha.toFixed(3)})`;
    } catch (error) {
        console.error("Error processing color in makeColorDuller:", colorString, error);
        return fallbackColor;
    }
};


/**
 * Renders an interactive 3D globe (simplified for CSS sizing test).
 */
const InteractiveGlobeView = ({
    // Props are mostly unused in this simplified version for testing CSS sizing.
    // onQuakeClick,
    // getMagnitudeColorFunc,
    // coastlineGeoJson,
    // tectonicPlatesGeoJson,
    // highlightedQuakeId,
    // activeClusters = [],
    // atmosphereColor = "rgb(100,100,255)",
    // defaultFocusLat = 20,
    // defaultFocusLng = 0,
    // defaultFocusAltitude = 2.5,
    // allowUserDragRotation = true,
    // enableAutoRotation = true,
    // globeAutoRotateSpeed = 0.1
}) => {
    // const { globeEarthquakes, lastMajorQuake, previousMajorQuake } = useEarthquakeDataState(); // Temporarily removed

    // const globeRef = useRef(); // Temporarily removed
    const containerRef = useRef(null); // Keep ref to the main container
    // const [points, setPoints] = useState([]); // Temporarily removed
    // const [paths, setPaths] = useState([]); // Temporarily removed
    // const [globeDimensions, setGlobeDimensions] = useState({ width: null, height: null }); // REMOVED
    // const [isGlobeHovered, setIsGlobeHovered] = useState(false); // Temporarily removed
    // const [isDragging, setIsDragging] = useState(false); // Temporarily removed
    // const mouseMoveTimeoutRef = useRef(null); // Temporarily removed
    // const [ringsData, setRingsData] = useState([]); // Temporarily removed

    // ALL JAVASCRIPT DIMENSION LOGIC (useEffect, ResizeObserver, etc.) IS REMOVED FOR THIS TEST.
    // WE ARE RELYING PURELY ON CSS w-full h-full FOR THE CONTAINER.

    // console.log("Rendering InteractiveGlobeView (CSS Sized Only Test)"); // For debugging

    return (
        <div
            ref={containerRef}
            className="w-full h-full" // These are the key CSS classes being tested
            style={{
                position: 'relative',
                // cursor: 'default' // Can be removed for test
            }}
            // onMouseMove={handleContainerMouseMove} // Removed for test
            // onMouseLeave={handleContainerMouseLeave} // Removed for test
        >
            {/* Test div to see how CSS alone sizes it within the w-full h-full parent */}
            <div style={{
                width: '100%', // Takes full width of its parent (the div above)
                height: '100%', // Takes full height of its parent (the div above)
                backgroundColor: 'rgba(0, 255, 0, 0.3)', // Green semi-transparent
                display: 'flex',
                flexDirection: 'column', // So text stacks
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px dashed green',
                boxSizing: 'border-box' // Ensure padding/border don't add to size
            }}>
                <p style={{color: 'black', backgroundColor: 'white', padding: '2px'}}>CSS Sized Only Test</p>
                {/* We can't display JS-calculated dimensions here anymore */}
            </div>
            {/* The actual <Globe ... /> component is removed for this specific test */}
        </div>
    );
};

export default InteractiveGlobeView;