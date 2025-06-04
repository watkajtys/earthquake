import React, { useState, useEffect, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';

/**
 * @file TriangulationAnimation.jsx
 * React component to display a conceptual triangulation animation for an earthquake and seismic stations.
 * Features visualization of P and S waves, automatic looping, play/pause controls,
 * pulsing wave opacity, and an epicenter highlight effect upon wave convergence.
 * The animation duration is dynamically adjusted based on the maximum S-wave travel time.
 */

// --- Animation & SVG Constants ---
// Defines the dimensions for the SVG canvas.
const SVG_WIDTH = 800; // Width of the SVG drawing area in pixels.
const SVG_HEIGHT = 600; // Height of the SVG drawing area in pixels.
// Padding around the content within the SVG canvas to prevent elements from touching the edges.
const PADDING = 50; // SVG padding in pixels on all sides.
// Default overall duration for one animation cycle if the maximum S-wave travel time isn't available or is zero.
const DEFAULT_ANIMATION_DURATION_MS = 5000; // Default animation cycle time in milliseconds.
// Delay after one animation cycle completes before automatically restarting (if in play mode).
const LOOP_DELAY_MS = 3000; // Delay in milliseconds before the next loop begins.
// Duration for the epicenter highlight (flash) effect when waves conceptually converge.
const HIGHLIGHT_DURATION_MS = 700; // Duration of the highlight effect in milliseconds.

/**
 * Renders a P/S wave triangulation animation using SVG with play/pause and looping.
 *
 * @param {object} props - The component's props.
 * @param {object} props.triangulationData - Data for the animation, including earthquake details and station information.
 *                                          Expected to be null if no data is loaded.
 * @param {object} props.triangulationData.earthquakeDetails - Details of the earthquake (lat, lon, etc.).
 * @param {object[]} props.triangulationData.stations - Array of seismic station data, including P/S wave travel times.
 * @returns {JSX.Element} The TriangulationAnimation component.
 */
const TriangulationAnimation = ({ triangulationData }) => {
  // --- Component State ---
  // Stores the current radii for P and S waves for each station.
  // Example: { "STN1": { pRadius: 50, sRadius: 30 }, ... }
  const [animatedRadii, setAnimatedRadii] = useState({});
  // Tracks if one full animation cycle (all S-waves complete or duration ends) has finished.
  const [animationCycleComplete, setAnimationCycleComplete] = useState(false);
  // Tracks the elapsed time within the current animation cycle. Drives wave expansion and opacity pulsing.
  const [currentElapsedTime, setCurrentElapsedTime] = useState(0);
  // Controls the visibility of the epicenter highlight effect.
  const [epicenterHighlightActive, setEpicenterHighlightActive] = useState(false);
  // Determines if the animation is currently playing or paused.
  const [isPlaying, setIsPlaying] = useState(true); // Autoplays on mount if data is available.

  // --- Refs for Managing Animation Lifecycle ---
  // Stores the `currentElapsedTime` when the animation is paused, to allow correct resumption.
  const pausedElapsedTimeRef = React.useRef(0);
  // Stores `performance.now()` when paused; used for more complex pause/resume scenarios (not strictly needed with current simpler resume logic).
  const lastPauseTimeRef = React.useRef(0);
  // Tracks if a loop (via `setTimeout`) is currently scheduled. Prevents multiple loops if play/pause is toggled rapidly.
  const loopScheduledRef = React.useRef(false);
  // Holds the ID of the `setTimeout` for the main animation loop. Used for clearing the timeout.
  const loopTimeoutRef = React.useRef(null); // Changed to be a ref for direct access in cleanup/handlers
  // Holds the ID of the `setTimeout` for the epicenter highlight. Used for clearing.
  const highlightTimeoutRef = React.useRef(null); // Changed to be a ref


  const { earthquakeDetails, stations } = triangulationData || {};

  // --- Memoized Calculations ---
  // Calculates scaling functions, scaled station/earthquake coordinates, km-to-pixel ratio,
  // and the actual duration of one animation cycle.
  // This is memoized to recompute only when `earthquakeDetails` or `stations` data changes.
  const {
    scaleX,
    scaleY,
    scaledStations,
    scaledEarthquake,
    kmToPixelRatio,
    actualAnimationDurationMs // Dynamically determined duration for one animation cycle.
  } = useMemo(() => {
    // Guard clause: return default values if essential data is missing.
    if (!earthquakeDetails || !stations || stations.length === 0) {
      return {
        scaleX: () => 0, scaleY: () => 0, scaledStations: [],
        scaledEarthquake: null, kmToPixelRatio: 0, actualAnimationDurationMs: DEFAULT_ANIMATION_DURATION_MS
      };
    }

    // Determine geographic bounds of all points (epicenter and stations).
    const allLats = [earthquakeDetails.latitude, ...stations.map(s => s.location.latitude)];
    const allLons = [earthquakeDetails.longitude, ...stations.map(s => s.location.longitude)];
    const minLat = Math.min(...allLats);
    const maxLat = Math.max(...allLats);
    const minLon = Math.min(...allLons);
    const maxLon = Math.max(...allLons);

    // Calculate geographic range, ensuring a minimum to prevent division by zero.
    const latRange = Math.max(maxLat - minLat, 0.001);
    const lonRange = Math.max(maxLon - minLon, 0.001);

    // Scaling function: Longitude to SVG X-coordinate.
    const localScaleX = (lon) => PADDING + ((lon - minLon) / lonRange) * (SVG_WIDTH - 2 * PADDING);
    // Scaling function: Latitude to SVG Y-coordinate (inverted for SVG).
    const localScaleY = (lat) => PADDING + ((maxLat - lat) / latRange) * (SVG_HEIGHT - 2 * PADDING);

    // Calculate max S-wave travel time to determine animation duration.
    let maxSWaveTimeSeconds = 0;
    const sStations = stations.map(station => {
      if (station.sWaveTravelTime > maxSWaveTimeSeconds) {
        maxSWaveTimeSeconds = station.sWaveTravelTime;
      }
      return { // Return scaled station data.
        ...station,
        x: localScaleX(station.location.longitude),
        y: localScaleY(station.location.latitude),
      };
    });

    // `actualAnimationDurationMs` is the greater of max S-wave time (+buffer) or a default.
    // This ensures the animation is long enough for all waves to be visualized.
    const calculatedDuration = maxSWaveTimeSeconds > 0
      ? (maxSWaveTimeSeconds * 1000) + 1000 // Add 1s buffer
      : DEFAULT_ANIMATION_DURATION_MS;

    // Scaled coordinates for the earthquake epicenter.
    const sEarthquake = {
      ...earthquakeDetails,
      x: localScaleX(earthquakeDetails.longitude),
      y: localScaleY(earthquakeDetails.latitude),
    };

    // --- kmToPixelRatio Calculation ---
    // --- kmToPixelRatio Calculation ---
    // Determines how to scale real-world kilometers (station.distanceKm) to SVG pixels for radii.
    const geoWidthKm = (maxLon - minLon) * 111.320 * Math.cos(minLat * Math.PI / 180);
    const geoHeightKm = (maxLat - minLat) * 110.574;
    const svgUsableWidth = SVG_WIDTH - 2 * PADDING;
    const svgUsableHeight = SVG_HEIGHT - 2 * PADDING;
    let overallMaxRadiusKm = stations.length > 0
      ? Math.max(...stations.map(s => s.distanceKm).filter(d => typeof d === 'number' && d > 0))
      : 0;
    if (overallMaxRadiusKm === 0 && stations.length > 0) overallMaxRadiusKm = 0.1; // Prevent zero division

    let calculatedKmToPixelRatio;
    // Various strategies to determine the best km-to-pixel ratio based on geographic spread vs. max distance.
    if (geoWidthKm < 1 && geoHeightKm < 1 && overallMaxRadiusKm > 0) { // Tiny area, scale by max distance
        calculatedKmToPixelRatio = Math.min(svgUsableWidth, svgUsableHeight) / (overallMaxRadiusKm * 2.2);
    } else if (geoWidthKm < 1 && overallMaxRadiusKm > 0) { // Vertical strip
        calculatedKmToPixelRatio = svgUsableHeight / (geoHeightKm > 1 ? geoHeightKm : overallMaxRadiusKm * 2.2);
    } else if (geoHeightKm < 1 && overallMaxRadiusKm > 0) { // Horizontal strip
        calculatedKmToPixelRatio = svgUsableWidth / (geoWidthKm > 1 ? geoWidthKm : overallMaxRadiusKm * 2.2);
    } else { // Normal spread, scale by fitting geographic area
        const scaleFactorX = geoWidthKm > 1 ? svgUsableWidth / geoWidthKm : Infinity;
        const scaleFactorY = geoHeightKm > 1 ? svgUsableHeight / geoHeightKm : Infinity;
        calculatedKmToPixelRatio = Math.min(scaleFactorX, scaleFactorY);
    }
    if (!isFinite(calculatedKmToPixelRatio) || calculatedKmToPixelRatio === 0) { // Fallback if calculation failed
        calculatedKmToPixelRatio = overallMaxRadiusKm > 0
            ? Math.min(svgUsableWidth, svgUsableHeight) / (overallMaxRadiusKm * 2.2)
            : 1; // Absolute fallback
    }

    return {
        scaleX: localScaleX, scaleY: localScaleY,
        scaledStations: sStations,
        scaledEarthquake: { ...earthquakeDetails, x: localScaleX(earthquakeDetails.longitude), y: localScaleY(earthquakeDetails.latitude) },
        kmToPixelRatio: calculatedKmToPixelRatio,
        actualAnimationDurationMs: calculatedDuration
    };
  }, [earthquakeDetails, stations]);


  // --- Main Animation Effect Hook ---
  // This useEffect hook manages the entire animation lifecycle, including play/pause,
  // wave expansion, looping, and visual effects like opacity pulsing and epicenter highlight.
  // Dependencies:
  // - `scaledStations`, `kmToPixelRatio`, `actualAnimationDurationMs`: Recalculated if input data changes.
  // - `animationCycleComplete`: When this flips from true to false (by loop or play button), a new cycle starts.
  // - `isPlaying`: Controls whether the animation runs or is paused.
  useEffect(() => {
    // --- Effect Guard Clauses ---
    // If not playing, or essential data for animation isn't ready, exit the effect.
    if (!isPlaying || !scaledStations || scaledStations.length === 0 || !kmToPixelRatio || kmToPixelRatio === 0) {
      // If data is missing (not just paused), ensure `animationCycleComplete` is true
      // so the UI (e.g., play button) is in a consistent state.
      if (!scaledStations || scaledStations.length === 0 || !kmToPixelRatio || kmToPixelRatio === 0) {
        setAnimationCycleComplete(true);
      }
      return; // Exit if not playing or data not ready.
    }

    // --- New Animation Cycle Setup ---
    // This block runs if `isPlaying` is true AND (`animationCycleComplete` was just flipped to false OR it's the initial run).
    if (animationCycleComplete) {
        // This means a previous cycle ended, and now `isPlaying` is true, and `animationCycleComplete` was set to false to trigger a new loop.
        // Reset states for the new cycle.
        setCurrentElapsedTime(0);
        pausedElapsedTimeRef.current = 0; // Ensure no carry-over from a potential previous paused state.
        setAnimationCycleComplete(false); // Mark that a new cycle is actively starting/running.
        loopScheduledRef.current = false; // Reset loop scheduling tracker.
    }

    // Initialize radii for all stations if we are starting a cycle from scratch (not resuming a pause).
    if (pausedElapsedTimeRef.current === 0) {
        const initialRadiiState = {};
        scaledStations.forEach(s => { initialRadiiState[s.id] = { pRadius: 0, sRadius: 0 }; });
        setAnimatedRadii(initialRadiiState);
        setCurrentElapsedTime(0); // Explicitly reset elapsed time for this new cycle.
    }

    // Ensure epicenter highlight is off at the beginning of any active animation phase.
    setEpicenterHighlightActive(false);

    // --- Animation Loop Variables ---
    let startTime; // Timestamp when the current requestAnimationFrame sequence started.
    let rafId;     // ID of the current requestAnimationFrame, for cancellation.

    // --- Core Animation Step Function (called by requestAnimationFrame) ---
    const animationStep = (timestamp) => {
      if (!startTime) {
        // Initialize startTime. If resuming from pause, adjust for the time already elapsed.
        startTime = timestamp - pausedElapsedTimeRef.current;
      }

      // Calculate elapsed time for the current animation cycle.
      const elapsed = timestamp - startTime;
      // Cap elapsed time at the cycle's total duration to prevent overshooting, esp. when resuming.
      const currentCycleElapsedTime = Math.min(elapsed, actualAnimationDurationMs);
      setCurrentElapsedTime(currentCycleElapsedTime); // Update state for opacity pulsing and general tracking.

      // --- Calculate P and S Wave Radii for Each Station ---
      const newAnimatedRadii = {};
      scaledStations.forEach(station => {
        const maxScaledStationRadius = station.distanceKm * kmToPixelRatio; // Target radius in SVG units.

        // P-wave: Calculate progress (0-1) based on its travel time vs. currentCycleElapsedTime.
        const pWaveDurationMs = station.pWaveTravelTime > 0 ? station.pWaveTravelTime * 1000 : 0;
        const pWaveProgress = pWaveDurationMs === 0 ? 1 : Math.min(currentCycleElapsedTime / pWaveDurationMs, 1);
        const pRadius = pWaveProgress * maxScaledStationRadius;

        // S-wave: Similar calculation.
        const sWaveDurationMs = station.sWaveTravelTime > 0 ? station.sWaveTravelTime * 1000 : 0;
        const sWaveProgress = sWaveDurationMs === 0 ? 1 : Math.min(currentCycleElapsedTime / sWaveDurationMs, 1);
        const sRadius = sWaveProgress * maxScaledStationRadius;

        newAnimatedRadii[station.id] = { pRadius, sRadius };
      });
      setAnimatedRadii(newAnimatedRadii); // Update state to re-render SVG circles.

      // --- Continue or End Animation Cycle ---
      if (currentCycleElapsedTime < actualAnimationDurationMs) {
        // If cycle not yet complete, request the next animation frame.
        rafId = requestAnimationFrame(animationStep);
      } else {
        // Cycle has completed. Set final radii to ensure they are exact.
        const finalRadiiState = {};
        scaledStations.forEach(station => {
            const maxScaledStationRadius = station.distanceKm * kmToPixelRatio;
            // Ensure waves that should have completed are at max radius.
            const pFinal = (station.pWaveTravelTime === 0 || station.pWaveTravelTime * 1000 <= actualAnimationDurationMs) ? maxScaledStationRadius : (actualAnimationDurationMs / (station.pWaveTravelTime * 1000)) * maxScaledStationRadius;
            const sFinal = (station.sWaveTravelTime === 0 || station.sWaveTravelTime * 1000 <= actualAnimationDurationMs) ? maxScaledStationRadius : (actualAnimationDurationMs / (station.sWaveTravelTime * 1000)) * maxScaledStationRadius;
            finalRadiiState[station.id] = { pRadius: pFinal, sRadius: sFinal };
        });
        setAnimatedRadii(finalRadiiState);
        setAnimationCycleComplete(true); // Mark the cycle as complete.
        pausedElapsedTimeRef.current = 0; // Reset paused time as this cycle is done.

        // --- Trigger Post-Cycle Effects (Highlight & Loop) ---
        // Only proceed with these if the animation is still in "playing" state.
        if (isPlaying && !loopScheduledRef.current) {
          // Epicenter Highlight:
          setEpicenterHighlightActive(true);
          highlightTimeoutRef.current = setTimeout(() => {
            setEpicenterHighlightActive(false);
          }, HIGHLIGHT_DURATION_MS);

          // Automatic Looping:
          loopScheduledRef.current = true; // Indicate a loop is now scheduled.
          loopTimeoutRef.current = setTimeout(() => {
            // Before starting the next loop, check if still `isPlaying`.
            // This handles cases where "Pause" might have been clicked during the LOOP_DELAY_MS.
            if (isPlaying) {
              setAnimationCycleComplete(false); // This will trigger the useEffect to start a new animation cycle.
            }
            loopScheduledRef.current = false; // Reset tracker after timeout resolves or if paused.
          }, LOOP_DELAY_MS);
        }
      }
    };

    // --- Start or Handle Pause ---
    if (isPlaying) {
      // If isPlaying is true, start the animation loop.
      rafId = requestAnimationFrame(animationStep);
    } else {
      // If isPlaying is false (i.e., animation was paused):
      // Store the current elapsed time. The animation will be effectively frozen
      // because this effect will exit, and no new rafId will be scheduled.
      // The `animationStep` function will not be called again until `isPlaying` becomes true.
      pausedElapsedTimeRef.current = currentElapsedTime;
    }

    // --- Effect Cleanup Function ---
    // This function is crucial for preventing memory leaks and incorrect behavior.
    // It runs when:
    //  1. The component unmounts.
    //  2. Any of the effect's dependencies change, before the effect re-runs.
    //     (e.g., if `isPlaying` changes, this cleanup runs for the "old" `isPlaying` state).
    return () => {
      cancelAnimationFrame(rafId); // Stop any ongoing animation frame request.
      clearTimeout(highlightTimeoutRef.current); // Clear pending highlight timeout.
      clearTimeout(loopTimeoutRef.current);     // Clear pending loop timeout.

      // If the animation was playing and is now being stopped (either by unmount or pause),
      // ensure `pausedElapsedTimeRef` accurately reflects the progress.
      if (isPlaying) {
          pausedElapsedTimeRef.current = currentElapsedTime;
      }
      // If a loop was scheduled but is now being cleaned up (e.g. due to pause), reset the tracker.
      // This ensures that if "Play" is hit again, a new loop can be correctly scheduled if needed.
      if (loopScheduledRef.current && !isPlaying) { // Only reset if paused during a scheduled loop
          loopScheduledRef.current = false;
      }
    };
  }, [scaledStations, kmToPixelRatio, animationCycleComplete, actualAnimationDurationMs, isPlaying]); // Dependencies

  // --- Play/Pause Button Handler ---
  const handlePlayPauseToggle = () => {
    setIsPlaying(prevIsPlaying => {
      const nextIsPlaying = !prevIsPlaying; // Determine the new play state.

      if (nextIsPlaying) {
        // --- Logic when switching to "Playing" ---
        // If a full animation cycle was complete and a loop was scheduled (meaning we were in the LOOP_DELAY_MS):
        if (animationCycleComplete && loopScheduledRef.current) {
          // User wants to play immediately, effectively skipping the rest of the loop delay.
          // Clear the pending loop timeout (done by useEffect cleanup when isPlaying changed, but good to be sure).
          clearTimeout(loopTimeoutRef.current);
          loopScheduledRef.current = false; // Mark that the scheduled loop is now void.

          // Reset for a fresh animation cycle.
          pausedElapsedTimeRef.current = 0;
          setCurrentElapsedTime(0);
          // Flipping `animationCycleComplete` to false while `isPlaying` is true will trigger the main useEffect to start a new cycle.
          setAnimationCycleComplete(false);
        } else if (animationCycleComplete && !loopScheduledRef.current) {
            // This scenario means a cycle finished, but no loop was scheduled (e.g., was paused right after completion).
            // Or, the loop delay finished but it was paused exactly then.
            // Treat as starting a fresh cycle.
            pausedElapsedTimeRef.current = 0;
            setCurrentElapsedTime(0);
            setAnimationCycleComplete(false);
        }
        // If resuming from a pause mid-animation (`pausedElapsedTimeRef.current > 0`),
        // the main `useEffect` will handle using this value to continue correctly.
        // `lastPauseTimeRef` is not strictly needed for the current resume logic but kept for potential future enhancements.
      } else {
        // --- Logic when switching to "Paused" ---
        // Store the current time (mostly for debugging or more complex pause scenarios).
        lastPauseTimeRef.current = performance.now();
        // The main `useEffect`'s cleanup function will handle:
        //  - Cancelling `requestAnimationFrame`.
        //  - Clearing timeouts.
        //  - Storing `currentElapsedTime` into `pausedElapsedTimeRef.current`.
        //  - Resetting `loopScheduledRef.current` if paused during a scheduled loop.
      }
      return nextIsPlaying; // Return the new state for `setIsPlaying`.
    });
  };

  // --- Render Logic ---
  // Display message if essential data is not yet available.
  if (!earthquakeDetails || !stations || stations.length === 0) {
    return <div className="triangulation-animation-container text-center p-4"><p>Triangulation data not available or incomplete.</p></div>;
  }

  // Check if radii data is populated. Avoids errors on initial render or if station data is faulty.
  // Show "Preparing..." if trying to play but radii aren't ready.
  const isRadiiDataReady = Object.keys(animatedRadii).length > 0 && scaledStations.every(s => animatedRadii[s.id]);
  if (!scaledEarthquake || scaledStations.length === 0 || (!isRadiiDataReady && isPlaying)) {
      return <div className="triangulation-animation-container text-center p-4"><p>Preparing animation data...</p></div>;
  }

  return (
    <div className="triangulation-animation-container flex flex-col items-center">
      <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} style={{ border: '1px solid #ccc', width: '100%', maxWidth: `${SVG_WIDTH}px` }}>
        {/* Render P and S wave circles for each station */}
        {scaledStations.map(station => {
          // Fallback for initial render before animatedRadii is fully populated for all stations.
          const radii = animatedRadii[station.id] || { pRadius: 0, sRadius: 0 };
          // Calculate dynamic stroke opacity for pulsing effect.
          const pWaveOpacity = 0.5 + Math.sin(currentElapsedTime / 200) * 0.25; // Oscillates between 0.25 and 0.75
          const sWaveOpacity = 0.5 + Math.sin(currentElapsedTime / 200 + Math.PI / 2) * 0.25; // Same, but phase-shifted

          return (
            <React.Fragment key={`waves-${station.id}`}>
              {/* P-Wave Circle: dashed, blue-ish */}
              <circle cx={station.x} cy={station.y} r={radii.pRadius} fill="rgba(100, 150, 255, 0.05)" stroke="rgba(100, 150, 255, 1)" strokeOpacity={pWaveOpacity} strokeWidth="1.5" strokeDasharray="4,2" />
              {/* S-Wave Circle: solid, green-ish */}
              <circle cx={station.x} cy={station.y} r={radii.sRadius} fill="rgba(100, 200, 150, 0.07)" stroke="rgba(100, 200, 150, 1)" strokeOpacity={sWaveOpacity} strokeWidth="2" />
            </React.Fragment>
          );
        })}
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
            {/* Epicenter Highlight Effect - a flashing circle behind the star */}
            {epicenterHighlightActive && (
              <circle
                cx={scaledEarthquake.x}
                cy={scaledEarthquake.y}
                r="20" // Size of the highlight flash
                fill="rgba(255, 0, 0, 0.4)"
                stroke="rgba(255,0,0,0.6)"
                strokeWidth="2"
              >
                <animate
                  attributeName="opacity"
                  values="0;0.7;0"
                  dur={`${HIGHLIGHT_DURATION_MS}ms`}
                  repeatCount="1"
                />
              </circle>
            )}
            {/* Actual Epicenter Marker (Star) */}
            <polygon
              points={`${scaledEarthquake.x},${scaledEarthquake.y - 12} ${scaledEarthquake.x + 7},${scaledEarthquake.y + 9} ${scaledEarthquake.x - 11},${scaledEarthquake.y - 4} ${scaledEarthquake.x + 11},${scaledEarthquake.y - 4} ${scaledEarthquake.x - 7},${scaledEarthquake.y + 9}`}
              fill="red"
              stroke="darkred"
              strokeWidth="1"
            />
            <text x={scaledEarthquake.x + 15} y={scaledEarthquake.y + 5} fontSize="12" fill="red" fontWeight="bold">
              Epicenter
            </text>
          </g>
        )}
      </svg>
       <button
        onClick={() => {
            if (!scaledStations || scaledStations.length === 0) return; // No data, no action
            handlePlayPauseToggle();
        }}
        disabled={!scaledStations || scaledStations.length === 0 || !kmToPixelRatio }
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>
    </div>
  );
};

// PropType for earthquakeDetails needs to be less strict if it can be null initially
// However, the component logic already handles cases where triangulationData or its parts are null/undefined.
// The main check is for `triangulationData` itself at the top.
TriangulationAnimation.propTypes = {
  triangulationData: PropTypes.shape({
    earthquakeDetails: PropTypes.shape({ // This can be null if triangulationData is null
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
