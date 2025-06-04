import React, { useState, useEffect, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';

/**
 * @file TriangulationAnimation.jsx
 * React component to display a triangulation animation for an earthquake and seismic stations.
 */

// Define the dimensions for the SVG canvas.
const SVG_WIDTH = 800; // Width of the SVG drawing area in pixels.
const SVG_HEIGHT = 600; // Height of the SVG drawing area in pixels.
// Padding around the content within the SVG canvas to prevent elements from touching the edges.
const PADDING = 50; // SVG padding in pixels on all sides.
// Duration for the circle expansion animation from 0 to their target radius.
const ANIMATION_DURATION_MS = 4000; // Animation time in milliseconds (e.g., 4 seconds).

/**
 * Renders a triangulation animation using SVG.
 *
 * @param {object} props - The component's props.
 * @param {object} props.triangulationData - Data required for the triangulation animation.
 * @param {object} props.triangulationData.earthquakeDetails - Details of the earthquake.
 * @param {object[]} props.triangulationData.stations - Array of seismic station data.
 * @returns {JSX.Element} The TriangulationAnimation component.
 */
const TriangulationAnimation = ({ triangulationData }) => {
  // State to hold the current animated radius for each station's distance circle.
  // It's an object where keys are station IDs and values are their current SVG radius.
  const [animatedRadii, setAnimatedRadii] = useState({});
  // State to track if the animation has completed.
  const [animationComplete, setAnimationComplete] = useState(false);

  const { earthquakeDetails, stations } = triangulationData || {};

  // Memoize scale functions and scaled elements to prevent recalculations on every render unless dependencies change.
  // This is crucial for performance as these calculations can be intensive.
  const { scaleX, scaleY, scaledStations, scaledEarthquake, kmToPixelRatio } = useMemo(() => {
    // Ensure essential data is available before proceeding with calculations.
    if (!earthquakeDetails || !stations || stations.length === 0) {
      // Return default/empty values if data is missing.
      return {
        scaleX: () => 0,
        scaleY: () => 0,
        scaledStations: [],
        scaledEarthquake: null,
        kmToPixelRatio: 0
      };
    }

    // Collect all latitudes and longitudes to determine the geographic bounds.
    const allLats = [
      earthquakeDetails.latitude,
      ...stations.map(s => s.location.latitude)
    ];
    const allLons = [
      earthquakeDetails.longitude,
      ...stations.map(s => s.location.longitude)
    ];

    // Calculate the minimum and maximum latitude and longitude.
    const minLat = Math.min(...allLats);
    const maxLat = Math.max(...allLats);
    const minLon = Math.min(...allLons);
    const maxLon = Math.max(...allLons);

    // Calculate the geographic range for latitudes and longitudes.
    // A minimum range (e.g., 1 degree) is enforced to prevent division by zero if all points are identical or very close.
    const latRange = Math.max(maxLat - minLat, 0.001); // Use a small minimum to avoid division by zero if all points are identical.
    const lonRange = Math.max(maxLon - minLon, 0.001); // Similar for longitude.

    // Create a scaling function for X coordinates (longitude to SVG width).
    // Maps a longitude value to its corresponding X position within the SVG canvas, considering padding.
    const localScaleX = (lon) => {
      return PADDING + ((lon - minLon) / lonRange) * (SVG_WIDTH - 2 * PADDING);
    };

    // Create a scaling function for Y coordinates (latitude to SVG height).
    // Maps a latitude value to its corresponding Y position.
    // Importantly, it inverts the Y-axis because SVG Y coordinates increase downwards,
    // whereas latitude increases upwards.
    const localScaleY = (lat) => {
      return PADDING + ((maxLat - lat) / latRange) * (SVG_HEIGHT - 2 * PADDING);
    };

    // Transform station data to include their scaled SVG coordinates.
    const sStations = stations.map(station => ({
      ...station,
      x: localScaleX(station.location.longitude),
      y: localScaleY(station.location.latitude),
    }));

    // Transform earthquake details to include its scaled SVG coordinates.
    const sEarthquake = {
      ...earthquakeDetails,
      x: localScaleX(earthquakeDetails.longitude),
      y: localScaleY(earthquakeDetails.latitude),
    };

    // --- kmToPixelRatio Calculation ---
    // This section determines the scaling factor to convert distances from kilometers
    // (station.distanceKm) to SVG pixel units for the radii of the animated circles.

    // Approximate geographic width and height of the area in kilometers.
    // Uses standard approximations for degrees to kilometers.
    const geoWidthKm = (maxLon - minLon) * 111.320 * Math.cos(minLat * Math.PI / 180); // km per degree longitude (varies by latitude)
    const geoHeightKm = (maxLat - minLat) * 110.574; // km per degree latitude (relatively constant)

    // The usable width and height of the SVG canvas after accounting for padding.
    const svgUsableWidth = SVG_WIDTH - 2 * PADDING;
    const svgUsableHeight = SVG_HEIGHT - 2 * PADDING;

    // Find the maximum distanceKm among all stations. This helps in fallback scaling.
    let overallMaxRadiusKm = 0;
    if (stations && stations.length > 0) {
        overallMaxRadiusKm = Math.max(...stations.map(s => s.distanceKm).filter(d => typeof d === 'number'));
    }
    if (overallMaxRadiusKm === 0 && stations.length > 0) { // If all distances are 0 (e.g. epicenter is a station)
        overallMaxRadiusKm = 0.1; // Prevent division by zero, give a tiny radius
    }


    // Determine kmToPixelRatio with fallbacks for various geographic extents:
    let calculatedKmToPixelRatio;
    if (geoWidthKm < 1 && geoHeightKm < 1 && overallMaxRadiusKm > 0) {
        // Case 1: All points are virtually identical (area is tiny).
        // Scale based on fitting the largest `distanceKm` within the smaller SVG dimension.
        calculatedKmToPixelRatio = Math.min(svgUsableWidth, svgUsableHeight) / (overallMaxRadiusKm * 2.2); // *2 for diameter, *1.1 for padding
    } else if (geoWidthKm < 1 && overallMaxRadiusKm > 0) {
        // Case 2: Geographic area is a very narrow vertical strip.
        // Scale primarily based on height.
        calculatedKmToPixelRatio = svgUsableHeight / (geoHeightKm > 1 ? geoHeightKm : overallMaxRadiusKm * 2.2);
    } else if (geoHeightKm < 1 && overallMaxRadiusKm > 0) {
        // Case 3: Geographic area is a very narrow horizontal strip.
        // Scale primarily based on width.
        calculatedKmToPixelRatio = svgUsableWidth / (geoWidthKm > 1 ? geoWidthKm : overallMaxRadiusKm * 2.2);
    } else {
        // Case 4: Normal geographic extent.
        // Calculate scale factors for both width and height and use the smaller one
        // to ensure the entire geographic area (and thus all distance circles) fits.
        const scaleFactorX = geoWidthKm > 1 ? svgUsableWidth / geoWidthKm : Infinity;
        const scaleFactorY = geoHeightKm > 1 ? svgUsableHeight / geoHeightKm : Infinity;
        calculatedKmToPixelRatio = Math.min(scaleFactorX, scaleFactorY);
    }

    // Final check: If kmToPixelRatio is still not finite (e.g., geoRanges were zero, overallMaxRadiusKm was zero),
    // provide a default fallback to prevent errors.
    if (!isFinite(calculatedKmToPixelRatio) || calculatedKmToPixelRatio === 0) {
        if (overallMaxRadiusKm > 0) {
            // If there's a max radius, scale based on that to fit the SVG.
             calculatedKmToPixelRatio = Math.min(svgUsableWidth, svgUsableHeight) / (overallMaxRadiusKm * 2.2);
        } else {
            calculatedKmToPixelRatio = 1; // Absolute fallback: 1 pixel per km (likely means no meaningful distances).
        }
    }

    return {
        scaleX: localScaleX,
        scaleY: localScaleY,
        scaledStations: sStations,
        scaledEarthquake: sEarthquake,
        kmToPixelRatio: calculatedKmToPixelRatio // The crucial ratio for scaling distances to SVG radii.
    };

  }, [earthquakeDetails, stations]); // Dependencies for the useMemo hook.


  // useEffect for managing the animation of expanding circles.
  // This effect runs when scaledStations or kmToPixelRatio changes (i.e., when new data is processed).
  useEffect(() => {
    // If there are no stations to animate or scaling is not ready, mark animation as complete and exit.
    if (!scaledStations || scaledStations.length === 0 || !kmToPixelRatio || kmToPixelRatio === 0) {
      setAnimationComplete(true);
      return;
    }

    // Reset animation state for a new run.
    setAnimationComplete(false);
    // Initialize animatedRadii: all station circles start with a radius of 0.
    const initialRadii = {};
    scaledStations.forEach(s => { initialRadii[s.id] = 0; });
    setAnimatedRadii(initialRadii);

    let startTime; // To store the timestamp when the animation begins.
    let rafId; // To store the ID returned by requestAnimationFrame, for cancellation.

    // The core animation function, called recursively via requestAnimationFrame.
    const animationStep = (timestamp) => {
      if (!startTime) {
        startTime = timestamp; // Record the start time on the first frame.
      }
      const elapsedTime = timestamp - startTime; // Time elapsed since animation started.
      // Calculate progress: a value from 0 (start) to 1 (end of ANIMATION_DURATION_MS).
      const progress = Math.min(elapsedTime / ANIMATION_DURATION_MS, 1);

      const currentRadii = {}; // To hold the new radii for this frame.

      scaledStations.forEach(station => {
        // Calculate the target SVG radius for this station based on its distanceKm and the scaling factor.
        const targetRadius = station.distanceKm * kmToPixelRatio;
        // Calculate the current radius based on animation progress.
        const newRadius = targetRadius * progress;
        currentRadii[station.id] = newRadius;
      });

      setAnimatedRadii(currentRadii); // Update the state with the new radii, triggering a re-render.

      // If progress is less than 1, the animation is not yet complete.
      if (progress < 1) {
        rafId = requestAnimationFrame(animationStep); // Request the next frame.
      } else {
        // Animation has reached its duration. Ensure all radii are set to their final target values.
        const finalRadii = {};
         scaledStations.forEach(station => {
            finalRadii[station.id] = station.distanceKm * kmToPixelRatio;
        });
        setAnimatedRadii(finalRadii);
        setAnimationComplete(true); // Mark animation as complete.
        // console.log("Animation complete. Final radii:", finalRadii); // For debugging
      }
    };

    // Start the animation loop.
    rafId = requestAnimationFrame(animationStep);

    // Cleanup function: called when the component unmounts or before the effect re-runs.
    return () => {
      cancelAnimationFrame(rafId); // Stop the animation loop to prevent memory leaks.
      setAnimationComplete(true); // Ensure state consistency on cleanup.
    };
  }, [scaledStations, kmToPixelRatio]); // Dependencies: effect re-runs if these change.

  // Handle loading or incomplete data states before rendering the SVG.
  if (!earthquakeDetails || !stations || stations.length === 0) {
    return (
      <div className="triangulation-animation-container text-center p-4">
        <p>Triangulation data not available or incomplete.</p>
      </div>
    );
  }

  if (!scaledEarthquake || scaledStations.length === 0) {
      return (
      <div className="triangulation-animation-container text-center p-4">
        <p>Preparing animation data...</p>
        {/* This can happen briefly while useMemo calculates */}
      </div>
    );
  }

  return (
    <div className="triangulation-animation-container flex flex-col items-center">
      <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} style={{ border: '1px solid #ccc', width: '100%', maxWidth: `${SVG_WIDTH}px` }}>
        {/* Render expanding circles (animated) */}
        {scaledStations.map(station => (
          <circle
            key={`wave-${station.id}`}
            cx={station.x}
            cy={station.y}
            r={animatedRadii[station.id] || 0}
            fill="rgba(100, 100, 200, 0.2)"
            stroke="rgba(100, 100, 200, 0.5)"
            strokeWidth="1"
          />
        ))}

        {/* Render stations */}
        {scaledStations.map(station => (
          <g key={`station-group-${station.id}`}>
            <circle cx={station.x} cy={station.y} r="6" fill="blue" />
            <text x={station.x + 8} y={station.y + 4} fontSize="12" fill="#333">
              {station.name}
            </text>
          </g>
        ))}

        {/* Render earthquake epicenter */}
        {scaledEarthquake && (
          <g>
            {/* Simple star representation for epicenter */}
            <polygon
              points={`${scaledEarthquake.x},${scaledEarthquake.y - 12} ${scaledEarthquake.x + 7},${scaledEarthquake.y + 9} ${scaledEarthquake.x - 11},${scaledEarthquake.y - 4} ${scaledEarthquake.x + 11},${scaledEarthquake.y - 4} ${scaledEarthquake.x - 7},${scaledEarthquake.y + 9}`}
              fill="red"
              stroke="darkred"
            />
            <text x={scaledEarthquake.x + 15} y={scaledEarthquake.y + 5} fontSize="12" fill="red" fontWeight="bold">
              Epicenter
            </text>
          </g>
        )}
      </svg>
       <button
        onClick={() => {
            // Restart animation logic:
            // 1. Reset animatedRadii to initial state (all zeros).
            // 2. Set animationComplete to false.
            // This will cause the animation `useEffect` to re-evaluate. Since `scaledStations`
            // and `kmToPixelRatio` (its dependencies) haven't changed, the effect might not
            // re-run automatically just by resetting state *used inside* it.
            // However, the animation loop itself checks `animationComplete` and `progress`.
            // By resetting `animatedRadii` and `animationComplete`, the existing `useEffect`
            // (if it were to be re-triggered by a key change or prop change) or a new
            // animation sequence (if explicitly started) would begin from scratch.
            // The current setup relies on the fact that the rendering of circles uses `animatedRadii`.
            // For a more robust restart, typically you'd change a `key` prop on a child component
            // or have an explicit "generation" counter in state that the useEffect depends on.
            // Here, we reset the state that the animation loop itself uses to progress and terminate.
            // The animation `useEffect` will pick up the new `animationComplete = false` state
            // and re-initialize its own internal `startTime` for the animationStep.
            if (!scaledStations || scaledStations.length === 0) return; // Guard if no stations

            const initialRadii = {};
            scaledStations.forEach(s => { initialRadii[s.id] = 0; });
            setAnimatedRadii(initialRadii);
            setAnimationComplete(false); // This is key to allow the animation `useEffect`'s loop to run again.
        }}
        disabled={!animationComplete || !scaledStations || scaledStations.length === 0}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        Replay Animation
      </button>
    </div>
  );
};

TriangulationAnimation.propTypes = {
  triangulationData: PropTypes.shape({
    earthquakeDetails: PropTypes.shape({
      id: PropTypes.string.isRequired,
      time: PropTypes.number.isRequired,
      latitude: PropTypes.number.isRequired,
      longitude: PropTypes.number.isRequired,
      depth: PropTypes.number.isRequired,
      magnitude: PropTypes.number.isRequired,
      place: PropTypes.string.isRequired,
    }), // Not .isRequired, as whole triangulationData can be null
    stations: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.string.isRequired,
        name: PropTypes.string.isRequired,
        location: PropTypes.shape({
          latitude: PropTypes.number.isRequired,
          longitude: PropTypes.number.isRequired,
        }).isRequired,
        distanceKm: PropTypes.number.isRequired,
        pWaveTravelTime: PropTypes.number.isRequired,
        sWaveTravelTime: PropTypes.number.isRequired,
      })
    ), // Not .isRequired
  }), // Not .isRequired, handled by the component
};

export default TriangulationAnimation;
