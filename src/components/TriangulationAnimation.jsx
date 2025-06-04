import React, { useState, useEffect, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';

/**
 * @file TriangulationAnimation.jsx
 * React component to display an animation of seismic P and S waves expanding from an earthquake epicenter.
 * Stations on the map react visually upon the arrival of these waves.
 *
 * This component features:
 * - **Epicentral Wave Propagation:** Visualizes P-waves (dashed, blue-ish) and S-waves (solid, green-ish)
 *   expanding outwards from the earthquake's epicenter. Their expansion speed is relative to calculated
 *   P and S wave travel times to the furthest station or overall animation duration.
 * - **Station Reactions:** Seismic stations on the map change their appearance (color and size) temporarily
 *   when P-waves arrive, and then again, more prominently, when S-waves arrive, based on their individual
 *   P and S wave travel times from the epicenter.
 * - **Dynamic Animation Duration:** The overall duration of one animation cycle is calculated based on the
 *   S-wave travel time to the furthest station. This duration is then sped up by a configurable factor
 *   and capped at a maximum value to ensure the animation is engaging and not overly long.
 * - **Play/Pause Control:** Users can play or pause the animation.
 * - **Automatic Looping:** When in "Play" mode, the animation automatically loops after a configurable delay
 *   once a cycle completes.
 * - **Visual Effects:** Includes subtle pulsing opacity for the epicentral waves and a slow pulsing scale
 *   effect for the epicenter marker to enhance visual engagement.
 */

// --- Animation & SVG Constants ---
/** Width of the SVG drawing area in pixels. */
const SVG_WIDTH = 800;
/** Height of the SVG drawing area in pixels. */
const SVG_HEIGHT = 600;
/** Padding around the content within the SVG canvas to prevent elements from touching the edges (in pixels). */
const PADDING = 50;
/**
 * Default duration for one animation cycle in milliseconds.
 * Used if `maxSWaveTimeSec` (maximum S-wave travel time) is 0 or not available from the data,
 * before applying speed-up factors or caps.
 */
const DEFAULT_ANIMATION_DURATION_MS = 5000;
/** Delay in milliseconds before the animation automatically restarts after a cycle completes (if in play mode). */
const LOOP_DELAY_MS = 3000;
/** Duration in milliseconds for the station "flash" effect (temporary visual change) upon P or S wave arrival. */
const STATION_ANIMATION_DURATION_MS = 500;


/**
 * Renders an animation of P and S waves expanding from an earthquake epicenter,
 * with seismic stations reacting visually to the wave arrivals.
 * Features play/pause controls, automatic looping, and dynamic visual effects.
 *
 * @param {object} props - The component's props.
 * @param {object} props.triangulationData - Data object containing earthquake and station details.
 *                                          Should be null if data is not yet loaded.
 * @param {object} props.triangulationData.earthquakeDetails - Contains properties of the earthquake,
 *                                                           such as latitude and longitude.
 * @param {object[]} props.triangulationData.stations - Array of station objects, each including its location,
 *                                                    distance from the epicenter (distanceKm),
 *                                                    P-wave travel time (pWaveTravelTime),
 *                                                    and S-wave travel time (sWaveTravelTime).
 * @returns {JSX.Element} The TriangulationAnimation component.
 */
const TriangulationAnimation = ({ triangulationData }) => {
  // --- Component State ---
  /**
   * Stores the current radii of P and S waves expanding from the epicenter.
   * @type {{ pWave: number, sWave: number }} - Radii in SVG pixel units.
   */
  const [epicentralWaveRadii, setEpicentralWaveRadii] = useState({ pWave: 0, sWave: 0 });

  /**
   * Stores the visual state of each seismic station.
   * @type {Object.<string, { pArrived: boolean, sArrived: boolean, pAnimating: boolean, sAnimating: boolean }>}
   * - `pArrived`: True if the P-wave has reached this station.
   * - `sArrived`: True if the S-wave has reached this station.
   * - `pAnimating`: True for `STATION_ANIMATION_DURATION_MS` when the P-wave arrives, for a visual flash.
   * - `sAnimating`: True for `STATION_ANIMATION_DURATION_MS` when the S-wave arrives.
   */
  const [stationStates, setStationStates] = useState({});

  /** Tracks if one full animation cycle has completed (all waves shown or duration ended). */
  const [animationCycleComplete, setAnimationCycleComplete] = useState(false);

  /**
   * Tracks the elapsed time within the current animation cycle (in milliseconds).
   * This drives wave expansion, station arrival checks, and some visual effects like opacity pulsing.
   */
  const [currentElapsedTime, setCurrentElapsedTime] = useState(0);

  /** Controls whether the animation is currently playing (`true`) or paused (`false`). Defaults to autoplay. */
  const [isPlaying, setIsPlaying] = useState(true);

  // --- Refs for Managing Animation Lifecycle ---
  /** Stores `currentElapsedTime` when the animation is paused, to allow correct resumption. */
  const pausedElapsedTimeRef = React.useRef(0);
  /**
   * Tracks if an automatic loop (via `setTimeout`) is currently scheduled.
   * This prevents multiple loops from being queued if play/pause is toggled rapidly during the loop delay.
   */
  const loopScheduledRef = React.useRef(false);
  /** Holds the ID of the `setTimeout` used for the main animation loop delay. Necessary for clearing this timeout. */
  const loopTimeoutRef = React.useRef(null);
  /**
   * Stores timeout IDs for individual station "flash" animations (when `pAnimating` or `sAnimating` is true).
   * Structure: { [`${station.id}_p`]: timeoutId, [`${station.id}_s`]: timeoutId, ... }
   * Used to clear these timeouts if the animation is paused or reset.
   */
  const stationAnimationTimeoutsRef = React.useRef({});


  const { earthquakeDetails, stations } = triangulationData || {};

  // --- Memoized Calculations ---
  // This hook pre-calculates various parameters essential for scaling coordinates, timing the animation,
  // and determining wave expansion limits. It recomputes these values only if `earthquakeDetails` or `stations` data changes.
  const {
    scaleX, // Function to map geographic longitude to SVG X-coordinate.
    scaleY, // Function to map geographic latitude to SVG Y-coordinate.
    scaledStations, // Array of station objects, augmented with `x` and `y` SVG coordinates.
    scaledEarthquake, // Earthquake object, augmented with `x` and `y` SVG coordinates for the epicenter.
    kmToPixelRatio, // Conversion factor: kilometers to SVG pixel units for wave radii.
    actualAnimationDurationMs, // Calculated total duration for one animation cycle (sped-up and capped).
    maxDistanceKmToFurthestStation, // Max distance (km) from the epicenter to any station; defines max epicentral wave radius.
    maxPWaveTravelTimeSeconds // P-wave travel time (seconds) to the station that the P-wave from epicenter would reach last among all stations. Used for scaling P-wave expansion.
  } = useMemo(() => {
    // If essential data is missing, return default/empty values to prevent errors.
    if (!earthquakeDetails || !stations || stations.length === 0) {
      return {
        scaleX: () => 0, scaleY: () => 0, scaledStations: [],
        scaledEarthquake: null, kmToPixelRatio: 0,
        actualAnimationDurationMs: DEFAULT_ANIMATION_DURATION_MS,
        maxDistanceKmToFurthestStation: 0, maxPWaveTravelTimeSeconds: 0
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
    const latRange = Math.max(maxLat - minLat, 0.001); // Avoid division by zero for single-point data.
    const lonRange = Math.max(maxLon - minLon, 0.001); // Avoid division by zero for single-point data.

    // Scaling function: Longitude to SVG X-coordinate.
    const localScaleX = (lon) => PADDING + ((lon - minLon) / lonRange) * (SVG_WIDTH - 2 * PADDING);
    // Scaling function: Latitude to SVG Y-coordinate (inverted for SVG's top-left origin).
    const localScaleY = (lat) => PADDING + ((maxLat - lat) / latRange) * (SVG_HEIGHT - 2 * PADDING);

    // --- Calculate Critical Animation Parameters ---
    let maxSWaveTimeSec = 0; // Max S-wave travel time to any station.
    let maxPWaveTimeSec = 0; // Max P-wave travel time (used for P-wave expansion from epicenter).
    let maxDistKm = 0;       // Max distance from epicenter to any station.

    const sStations = stations.map(station => {
      if (station.sWaveTravelTime > maxSWaveTimeSec) maxSWaveTimeSec = station.sWaveTravelTime;
      if (station.pWaveTravelTime > maxPWaveTimeSec) maxPWaveTimeSec = station.pWaveTravelTime;
      if (station.distanceKm > maxDistKm) maxDistKm = station.distanceKm;

      return { // Return station data augmented with scaled SVG coordinates.
        ...station,
        x: localScaleX(station.location.longitude),
        y: localScaleY(station.location.latitude),
      };
    });

    // Determine the overall animation duration for one cycle.
    // Based on the S-wave travel time to the furthest station, then sped up and capped.
    const speedUpFactor = 0.4; // Animation plays 2.5x faster than "real" scaled time.
    const maxDurationCapMs = 6000; // Max duration of 6 seconds for one cycle.
    const minDurationBufferMs = 1000; // Ensures at least 1s for animation, even for very quick events.

    let spedUpDuration;
    if (maxSWaveTimeSec > 0) {
      spedUpDuration = (maxSWaveTimeSec * 1000 * speedUpFactor) + minDurationBufferMs;
    } else {
      // If no S-wave times (e.g., single station, or data issue), use the default.
      spedUpDuration = DEFAULT_ANIMATION_DURATION_MS;
    }
    // Apply the cap.
    const calculatedOverallDuration = Math.min(spedUpDuration, maxDurationCapMs);

    // Scaled coordinates for the earthquake epicenter.
    const sEarthquake = {
      ...earthquakeDetails,
      x: localScaleX(earthquakeDetails.longitude),
      y: localScaleY(earthquakeDetails.latitude),
    };

    // --- kmToPixelRatio Calculation ---
    // Determines how to scale real-world kilometers (e.g., station.distanceKm or maxDistKm)
    // to SVG pixel units for wave radii.
    const geoWidthKm = (maxLon - minLon) * 111.320 * Math.cos(minLat * Math.PI / 180); // Approx km per degree longitude.
    const geoHeightKm = (maxLat - minLat) * 110.574; // Approx km per degree latitude.
    const svgUsableWidth = SVG_WIDTH - 2 * PADDING;
    const svgUsableHeight = SVG_HEIGHT - 2 * PADDING;

    // Use maxDistKm (epicenter to furthest station) for scaling epicentral waves,
    // rather than overallMaxRadiusKm which might be from a different context if data changes.
    let relevantMaxKmForScaling = maxDistKm > 0 ? maxDistKm : (stations.length > 0 ? Math.max(...stations.map(s => s.distanceKm).filter(d => typeof d === 'number' && d > 0)) : 0);
    if (relevantMaxKmForScaling === 0 && stations.length > 0) relevantMaxKmForScaling = 0.1; // Prevent zero division.

    let calculatedKmToPixelRatio;
    // Strategies to determine the best km-to-pixel ratio:
    if (geoWidthKm < 1 && geoHeightKm < 1 && relevantMaxKmForScaling > 0) { // Tiny geographic area, scale by max distance.
        calculatedKmToPixelRatio = Math.min(svgUsableWidth, svgUsableHeight) / (relevantMaxKmForScaling * 2.2); // *2.2 for diameter + padding.
    } else if (geoWidthKm < 1 && relevantMaxKmForScaling > 0) { // Vertical strip, scale by height.
        calculatedKmToPixelRatio = svgUsableHeight / (geoHeightKm > 1 ? geoHeightKm : relevantMaxKmForScaling * 2.2);
    } else if (geoHeightKm < 1 && relevantMaxKmForScaling > 0) { // Horizontal strip, scale by width.
        calculatedKmToPixelRatio = svgUsableWidth / (geoWidthKm > 1 ? geoWidthKm : relevantMaxKmForScaling * 2.2);
    } else { // Normal spread, scale by fitting the geographic area.
        const scaleFactorX = geoWidthKm > 1 ? svgUsableWidth / geoWidthKm : Infinity;
        const scaleFactorY = geoHeightKm > 1 ? svgUsableHeight / geoHeightKm : Infinity;
        calculatedKmToPixelRatio = Math.min(scaleFactorX, scaleFactorY);
    }
    // Final fallback if calculation failed or resulted in zero.
    if (!isFinite(calculatedKmToPixelRatio) || calculatedKmToPixelRatio === 0) {
        calculatedKmToPixelRatio = relevantMaxKmForScaling > 0
            ? Math.min(svgUsableWidth, svgUsableHeight) / (relevantMaxKmForScaling * 2.2)
            : 1; // Absolute fallback: 1 SVG pixel per km.
    }

    return {
        scaleX: localScaleX, scaleY: localScaleY,
        scaledStations: sStations,
        scaledEarthquake: sEarthquake,
        kmToPixelRatio: calculatedKmToPixelRatio,
        actualAnimationDurationMs: calculatedOverallDuration,
        maxDistanceKmToFurthestStation: maxDistKm, // Max distance from epicenter to any station.
        maxPWaveTravelTimeSeconds: maxPWaveTimeSec // P-wave travel time to that furthest P-wave relevant station.
    };
  }, [earthquakeDetails, stations]);


  // Effect to initialize or reset `stationStates` when `scaledStations` data changes.
  // This ensures that `stationStates` is in sync with the stations being animated.
  useEffect(() => {
    if (scaledStations && scaledStations.length > 0) {
      const initialStates = {};
      scaledStations.forEach(s => {
        // Initialize all station state flags to false.
        initialStates[s.id] = { pArrived: false, sArrived: false, pAnimating: false, sAnimating: false };
      });
      setStationStates(initialStates);
    }
  }, [scaledStations]); // Dependency: re-run if the list of scaled stations changes.


  // Main animation effect hook. Manages the animation loop, state updates, and timers.
  // Dependencies trigger re-run if data changes, play state changes, or a cycle completes.
  useEffect(() => {
    // --- Guard Clauses & Initial Setup ---
    // Do not run if not playing, or if essential data (stations, scaling info, epicenter) is missing.
    if (!isPlaying || !scaledStations || scaledStations.length === 0 || !kmToPixelRatio || kmToPixelRatio === 0 || !scaledEarthquake) {
      // If data is critically missing, mark cycle as complete to ensure UI consistency (e.g. Play button state).
      if (!scaledStations || scaledStations.length === 0 || !kmToPixelRatio || kmToPixelRatio === 0) {
        setAnimationCycleComplete(true);
      }
      return; // Halt effect execution.
    }

    // --- New Animation Cycle Start ---
    // This block executes if `animationCycleComplete` was true (previous cycle ended) and `isPlaying` is now true,
    // or if it's the very first run and `isPlaying` is true.
    if (animationCycleComplete) {
        setCurrentElapsedTime(0); // Reset elapsed time for the new cycle.
        pausedElapsedTimeRef.current = 0; // Clear any paused time from a previous cycle.

        // Reset states for all stations (wave arrival and animation flags).
        const resetStates = {};
        scaledStations.forEach(s => {
            resetStates[s.id] = { pArrived: false, sArrived: false, pAnimating: false, sAnimating: false };
        });
        setStationStates(resetStates);
        setEpicentralWaveRadii({ pWave: 0, sWave: 0 }); // Reset epicentral wave radii.
        setAnimationCycleComplete(false); // Mark that a new animation cycle is now active.
        loopScheduledRef.current = false; // Clear any pending loop schedule from the previous cycle.
    }

    // If starting a cycle completely fresh (not resuming from a pause mid-cycle),
    // ensure all animation-related states are at their initial values.
    if (pausedElapsedTimeRef.current === 0) {
        setEpicentralWaveRadii({ pWave: 0, sWave: 0 });
        const initialStationStates = {};
        scaledStations.forEach(s => { // Re-initialize station states (important if data changed).
            initialStationStates[s.id] = { pArrived: false, sArrived: false, pAnimating: false, sAnimating: false };
        });
        setStationStates(initialStationStates);
        setCurrentElapsedTime(0); // Reset elapsed time.
    }

    // --- Animation Loop Variables ---
    let startTime; // Timestamp when the current `requestAnimationFrame` sequence started or resumed.
    let rafId;     // ID of the `requestAnimationFrame` call, for cancellation.

    // Clear all existing station animation timeouts before starting a new animation step or cycle.
    // This prevents orphaned timeouts from previous frames or cycles from incorrectly altering state.
    Object.values(stationAnimationTimeoutsRef.current).forEach(clearTimeout);
    stationAnimationTimeoutsRef.current = {}; // Reset the store of timeout IDs.

    // --- Core Animation Step Function (executed by `requestAnimationFrame`) ---
    const animationStep = (timestamp) => {
      if (!startTime) {
        // Adjust startTime if resuming from a pause to maintain continuity.
        // `pausedElapsedTimeRef.current` holds how much time had already passed in the cycle before pausing.
        startTime = timestamp - pausedElapsedTimeRef.current;
      }

      const elapsedSinceStart = timestamp - startTime; // Total time elapsed since this animation sequence began (or resumed).
      // Ensure `currentCycleElapsedTime` doesn't exceed the total duration for this cycle.
      const currentCycleElapsedTime = Math.min(elapsedSinceStart, actualAnimationDurationMs);
      setCurrentElapsedTime(currentCycleElapsedTime); // Update state for rendering and other calculations.

      // --- Epicentral Wave Expansion Logic ---
      // Calculate current radius for the P-wave expanding from the epicenter.
      let pWaveRadius = 0;
      if (maxPWaveTravelTimeSeconds > 0) { // Normal case: P-wave has a travel time.
          // Progress is ratio of current time to time it takes P-wave to reach furthest station.
          const pWaveOverallProgress = Math.min(currentCycleElapsedTime / (maxPWaveTravelTimeSeconds * 1000), 1);
          // Radius is progress * scaled max distance.
          pWaveRadius = pWaveOverallProgress * (maxDistanceKmToFurthestStation * kmToPixelRatio);
      } else if (maxDistanceKmToFurthestStation > 0) { // Edge case: P-wave travel time is zero (instant).
          pWaveRadius = maxDistanceKmToFurthestStation * kmToPixelRatio;
      }

      // Calculate current radius for the S-wave expanding from the epicenter.
      // S-wave expands to cover `maxDistanceKmToFurthestStation` over the `actualAnimationDurationMs`.
      const sWaveOverallProgress = Math.min(currentCycleElapsedTime / actualAnimationDurationMs, 1);
      const sWaveRadius = sWaveOverallProgress * (maxDistanceKmToFurthestStation * kmToPixelRatio);
      setEpicentralWaveRadii({ pWave: pWaveRadius, sWave: sWaveRadius }); // Update state for SVG rendering.

      // --- Station State Update Logic (Wave Arrivals & Animations) ---
      let stationStatesChangedThisFrame = false; // Flag to optimize state updates.
      const nextStationStatesSnapshot = { ...stationStates }; // Work with a copy for batched update.

      scaledStations.forEach(station => {
        const currentStationPersistentState = stationStates[station.id] || { pArrived: false, sArrived: false, pAnimating: false, sAnimating: false };
        let individualStationChanged = false;

        // P-wave arrival and animation trigger for this station.
        if (!currentStationPersistentState.pArrived && currentCycleElapsedTime >= station.pWaveTravelTime * 1000) {
          nextStationStatesSnapshot[station.id] = { ...currentStationPersistentState, pArrived: true, pAnimating: true };
          individualStationChanged = true;
          // Set a timeout to turn off the pAnimating "flash" state after STATION_ANIMATION_DURATION_MS.
          const pTimeoutId = setTimeout(() => {
            setStationStates(prev => ({ ...prev, [station.id]: { ...prev[station.id], pAnimating: false } }));
          }, STATION_ANIMATION_DURATION_MS);
          stationAnimationTimeoutsRef.current[`${station.id}_p`] = pTimeoutId; // Store timeout ID for potential cleanup.
        }

        // S-wave arrival and animation trigger for this station.
        // Use the potentially updated state from P-wave arrival for s-wave check.
        const stateForSCheck = nextStationStatesSnapshot[station.id] || currentStationPersistentState;
        if (!stateForSCheck.sArrived && currentCycleElapsedTime >= station.sWaveTravelTime * 1000) {
          nextStationStatesSnapshot[station.id] = { ...stateForSCheck, sArrived: true, sAnimating: true };
          individualStationChanged = true;
          // Set a timeout to turn off the sAnimating "flash" state.
          const sTimeoutId = setTimeout(() => {
            setStationStates(prev => ({ ...prev, [station.id]: { ...prev[station.id], sAnimating: false } }));
          }, STATION_ANIMATION_DURATION_MS);
          stationAnimationTimeoutsRef.current[`${station.id}_s`] = sTimeoutId;
        }
        if (individualStationChanged) stationStatesChangedThisFrame = true;
      });

      // If any station's state changed, update the main `stationStates` state.
      // This is a single batch update if multiple stations change in the same frame.
      if (stationStatesChangedThisFrame) {
          setStationStates(nextStationStatesSnapshot);
      }

      // --- Continue or End Animation Cycle ---
      if (currentCycleElapsedTime < actualAnimationDurationMs) {
        // If animation cycle is not yet complete, request the next frame.
        rafId = requestAnimationFrame(animationStep);
      } else {
        // Animation cycle has completed.
        setAnimationCycleComplete(true); // Mark cycle as complete.
        pausedElapsedTimeRef.current = 0; // Reset paused time, as the cycle finished naturally.

        // If still playing and a loop isn't already scheduled, set up the next loop.
        if (isPlaying && !loopScheduledRef.current) {
          loopScheduledRef.current = true; // Mark that a loop is now scheduled.
          loopTimeoutRef.current = setTimeout(() => {
            // Before actually starting the next loop, re-check `isPlaying`.
            // This handles the case where "Pause" might have been clicked during the LOOP_DELAY_MS.
            if (isPlaying) {
              setAnimationCycleComplete(false); // This state change will trigger the main useEffect to start a new cycle.
            }
            loopScheduledRef.current = false; // Reset tracker as the timeout has resolved or pause intervened.
          }, LOOP_DELAY_MS);
        }
      }
    };

    // --- Start or Handle Pause ---
    if (isPlaying) {
      // If `isPlaying` is true, initiate the animation frame loop.
      rafId = requestAnimationFrame(animationStep);
    } else {
      // If `isPlaying` is false (i.e., animation was paused by user):
      // Store the `currentElapsedTime` in `pausedElapsedTimeRef`. This value will be used
      // to correctly resume the animation when `isPlaying` becomes true again.
      // The animation is effectively frozen as no new `requestAnimationFrame` is scheduled.
      pausedElapsedTimeRef.current = currentElapsedTime;
    }

    // --- Effect Cleanup Function ---
    // This function is critical for preventing memory leaks and ensuring correct behavior
    // when the component unmounts or when dependencies of this `useEffect` change (triggering a re-run).
    return () => {
      cancelAnimationFrame(rafId); // Stop any pending animation frame.
      clearTimeout(loopTimeoutRef.current); // Clear the main loop delay timeout.

      // Clear all active station animation timeouts.
      Object.values(stationAnimationTimeoutsRef.current).forEach(clearTimeout);
      stationAnimationTimeoutsRef.current = {}; // Reset the storage for these timeout IDs.

      // If the animation was actively playing when this cleanup runs (e.g., due to unmount or dependencies changing mid-animation),
      // save the current elapsed time. This is important if the effect re-runs due to data change while playing.
      if (isPlaying) {
          pausedElapsedTimeRef.current = currentElapsedTime;
      }

      // If a loop was scheduled but is now being cleaned up (e.g., because `isPlaying` changed to false, or unmount),
      // reset the `loopScheduledRef` to false. This ensures that if "Play" is clicked later,
      // a new loop can be correctly scheduled if the animation completes again.
      if (loopScheduledRef.current && !isPlaying) {
          loopScheduledRef.current = false;
      }
    };
  }, [ // Dependencies for the main animation useEffect:
    scaledStations, kmToPixelRatio, animationCycleComplete,
    actualAnimationDurationMs, isPlaying, scaledEarthquake,
    maxDistanceKmToFurthestStation, maxPWaveTravelTimeSeconds
    // Note: `stationStates` is intentionally not a direct dependency here to avoid rapid re-runs
    // from its own updates within `animationStep`. It's managed via functional updates (`setStationStates(prev => ...)`)
    // or by working with a snapshot within the `animationStep` scope.
]);

  // --- Play/Pause Button Click Handler ---
  // Display message if essential data is not yet available.
  if (!earthquakeDetails || !stations || stations.length === 0) {
    return <div className="triangulation-animation-container text-center p-4"><p>Triangulation data not available or incomplete.</p></div>;
  }

  // Check if stationStates is populated. Avoids errors on initial render.
  const isStationStatesReady = Object.keys(stationStates).length > 0 && scaledStations.every(s => stationStates[s.id]);

  if (!scaledEarthquake || scaledStations.length === 0 || (!isStationStatesReady && isPlaying)) {
      return <div className="triangulation-animation-container text-center p-4"><p>Preparing animation data...</p></div>;
  }

  return (
    <div className="triangulation-animation-container flex flex-col items-center">
      <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} style={{ border: '1px solid #ccc', width: '100%', maxWidth: `${SVG_WIDTH}px` }}>
        {/* Render Epicentral P and S Waves */}
        {scaledEarthquake && (
          <>
            {/* Epicentral P-Wave */}
            <circle
              cx={scaledEarthquake.x}
              cy={scaledEarthquake.y}
              r={epicentralWaveRadii.pWave}
              fill="rgba(100, 150, 255, 0.05)"
              stroke="rgba(100, 150, 255, 1)" // Solid stroke color
              strokeOpacity={0.5 + Math.sin(currentElapsedTime / 200) * 0.25} // Pulsing opacity
              strokeWidth="1.5"
              strokeDasharray="4,2"
            />
            {/* Epicentral S-Wave */}
            <circle
              cx={scaledEarthquake.x}
              cy={scaledEarthquake.y}
              r={epicentralWaveRadii.sWave}
              fill="rgba(100, 200, 150, 0.07)"
              stroke="rgba(100, 200, 150, 1)" // Solid stroke color
              strokeOpacity={0.5 + Math.sin(currentElapsedTime / 200 + Math.PI / 2) * 0.25} // Pulsing opacity, offset phase
              strokeWidth="2"
            />
          </>
        )}

        {/* Render Station Markers and Labels */}
        {scaledStations.map(station => {
          const state = stationStates[station.id] || { pArrived: false, sArrived: false, pAnimating: false, sAnimating: false };
          let stationFill = "grey"; // Default color for stations not yet reached
          let stationRadius = 5;    // Default radius
          let stationStroke = "#555";
          let stationStrokeWidth = 1;

          // Determine station appearance based on wave arrival and animation state
          if (state.sAnimating) {
            stationFill = "rgba(0, 220, 100, 0.9)"; // Bright green for S-wave arrival animation
            stationRadius = 10;
            stationStroke = "rgba(0, 100, 50, 1)";
            stationStrokeWidth = 1.5;
          } else if (state.pAnimating) {
            stationFill = "rgba(100, 150, 255, 0.8)"; // Bright blue for P-wave arrival animation
            stationRadius = 8;
            stationStroke = "rgba(50, 100, 200, 1)";
            stationStrokeWidth = 1.5;
          } else if (state.sArrived) {
            stationFill = "rgba(0, 180, 80, 0.6)";   // Persistent S-wave arrived color
            stationStroke = "rgba(0, 100, 50, 0.8)";
          } else if (state.pArrived) {
            stationFill = "rgba(100, 150, 255, 0.5)"; // Persistent P-wave arrived color
            stationStroke = "rgba(50, 100, 200, 0.8)";
          }

          return (
            <g key={`station-group-${station.id}`}>
              <circle
                cx={station.x}
                cy={station.y}
                r={stationRadius}
                fill={stationFill}
                stroke={stationStroke}
                strokeWidth={stationStrokeWidth}
              />
              <text x={station.x + stationRadius + 3} y={station.y + 4} fontSize="12" fill="#333">
                {station.name}
              </text>
            </g>
          );
        })}

        {/* Render Earthquake Epicenter Marker (on top) */}
        {scaledEarthquake && (() => {
          const epicenterScale = 1 + Math.sin(currentElapsedTime / 1000) * 0.05; // Slow pulse (0.95 to 1.05)
          return (
            <g transform={`translate(${scaledEarthquake.x} ${scaledEarthquake.y}) scale(${epicenterScale}) translate(${-scaledEarthquake.x} ${-scaledEarthquake.y})`}
               transform-origin={`${scaledEarthquake.x} ${scaledEarthquake.y}`}>
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
          );
        })()}
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
