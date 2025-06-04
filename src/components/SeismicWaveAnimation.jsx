import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext';
import {
  calculateHypocentralDistance,
  // calculatePWaveTravelTime, // Will be calculated manually for variable speeds
  // calculateSWaveTravelTime, // Will be calculated manually for variable speeds
  AVERAGE_P_WAVE_VELOCITY_KM_S,
  AVERAGE_S_WAVE_VELOCITY_KM_S,
  P_WAVE_FAST_KM_S,
  S_WAVE_FAST_KM_S,
  P_WAVE_SLOW_KM_S,
  S_WAVE_SLOW_KM_S,
  P_WAVE_PING_COLOR, // Imported
  S_WAVE_PING_COLOR, // Imported
} from '../utils/seismicUtils';

// Constants
const VIRTUAL_STATIONS = [
    { name: "Station Alpha", lat: 2.46, lon: 0.0 }, // Approx P-time: 50s (slowest speed of 5.5km/s, for epicenter 0,0, depth 30km)
    { name: "Station Bravo", lat: 0.0, lon: 4.5 },   // Approx P-time: 91s (slowest)
    { name: "Station Charlie", lat: -6.3, lon: 0.0 }, // Approx P-time: 127s (slowest)
    { name: "Station Delta", lat: 7.38, lon: 0.0 }  // Approx P-time: 149s (slowest)
];

const P_WAVE_BASE_COLOR = "0, 0, 255"; // RGB for blue
const S_WAVE_BASE_COLOR = "255, 0, 0"; // RGB for red

// PING_COLOR constants are now imported from seismicUtils.js

const SVG_WIDTH = 600;
const SVG_HEIGHT = 400; // Increased height for text and better visual
const EARTH_RADIUS_SVG = SVG_WIDTH / 2 * 0.8; // Scaled Earth radius for SVG
const MAX_DEPTH_SVG = EARTH_RADIUS_SVG * 0.5; // Max depth visualization exaggerated
const MAX_ANIMATION_SECONDS = 300; // Loop duration: increased for debugging visibility
const VISUAL_SPEED_MULTIPLIER = 15.0; // Makes the animation appear 15x as fast

// Component
const SeismicWaveAnimation = ({ earthquake: earthquakeProp, speedScenario = 'average' }) => {
  const { lastMajorQuake } = useEarthquakeDataState();
  const [earthquakeData, setEarthquakeData] = useState(null);
  const [stationCalcs, setStationCalcs] = useState([]);
  const [animationTime, setAnimationTime] = useState(0);
  const animationFrameId = useRef(null);
  const startTimeRef = useRef(null);

  // Determine which earthquake data to use
  useEffect(() => {
    const currentEarthquake = earthquakeProp || lastMajorQuake;
    if (currentEarthquake) {
      setEarthquakeData({
        lat: currentEarthquake.geometry.coordinates[1],
        lon: currentEarthquake.geometry.coordinates[0],
        depth: currentEarthquake.geometry.coordinates[2],
        magnitude: currentEarthquake.properties.mag,
      });
    } else {
      setEarthquakeData(null);
    }
  }, [earthquakeProp, lastMajorQuake]);

  // Calculate station distances and travel times
  useEffect(() => {
    if (earthquakeData) {
      const calcs = VIRTUAL_STATIONS.map((station, index) => {
        const hypocentralDistance = calculateHypocentralDistance(
          { geometry: { coordinates: [earthquakeData.lon, earthquakeData.lat, earthquakeData.depth] } },
          station.lat,
          station.lon
        );

        if (isNaN(hypocentralDistance) || hypocentralDistance < 0) {
          return { ...station, hypocentralDistance: "N/A", pWaveTime: "N/A", sWaveTime: "N/A", pWaveSpeed: "N/A", sWaveSpeed: "N/A" };
        }

        let pWaveSpeedToUse = AVERAGE_P_WAVE_VELOCITY_KM_S;
        let sWaveSpeedToUse = AVERAGE_S_WAVE_VELOCITY_KM_S;

        if (speedScenario === 'variable') {
          if (index === 0) { // First station
            pWaveSpeedToUse = P_WAVE_FAST_KM_S;
            sWaveSpeedToUse = S_WAVE_FAST_KM_S;
          } else if (index === 1) { // Second station
            pWaveSpeedToUse = P_WAVE_SLOW_KM_S;
            sWaveSpeedToUse = S_WAVE_SLOW_KM_S;
          }
          // Subsequent stations use AVERAGE speeds by default initialization
        }

        const pWaveTime = hypocentralDistance > 0 ? hypocentralDistance / pWaveSpeedToUse : 0;
        const sWaveTime = hypocentralDistance > 0 ? hypocentralDistance / sWaveSpeedToUse : 0;

        return {
          ...station,
          hypocentralDistance: hypocentralDistance.toFixed(0),
          pWaveTime: pWaveTime.toFixed(1),
          sWaveTime: sWaveTime.toFixed(1),
          pWaveSpeed: pWaveSpeedToUse.toFixed(1), // For potential display or debugging
          sWaveSpeed: sWaveSpeedToUse.toFixed(1), // For potential display or debugging
        };
      });
      setStationCalcs(calcs);
    } else {
      setStationCalcs([]);
    }
  }, [earthquakeData, speedScenario]);

  // Animation loop
  const animate = useCallback((timestamp) => {
    if (!startTimeRef.current) {
      startTimeRef.current = timestamp;
    }
    const elapsedRealTimeSeconds = (timestamp - startTimeRef.current) / 1000;

    // newAnimationTime now represents the simulated seismic time, progressing faster
    let newAnimationTime = elapsedRealTimeSeconds * VISUAL_SPEED_MULTIPLIER;

    if (newAnimationTime > MAX_ANIMATION_SECONDS) {
      // Reset to 0 to loop the full MAX_ANIMATION_SECONDS of simulated seismic time
      newAnimationTime = 0;
      startTimeRef.current = timestamp; // Restart the "real time" counter for the new visual loop
    }

    setAnimationTime(newAnimationTime); // This is the simulated seismic time

    // Continue animation as long as component is mounted and data is available
    if (stationCalcs.length > 0) { // Ensure there are stations to animate for
        animationFrameId.current = requestAnimationFrame(animate);
    } else {
        // If no stationCalcs (e.g. earthquakeData became null), stop animation.
        // This case is mostly handled by the Start and stop animation useEffect.
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
            startTimeRef.current = null;
            setAnimationTime(0);
        }
    }
  }, [stationCalcs]); // stationCalcs dependency ensures that if it becomes empty, loop might re-evaluate stopping.

  // Start and stop animation
  useEffect(() => {
    if (earthquakeData && stationCalcs.length > 0) {
      startTimeRef.current = null;
      setAnimationTime(0);

      // Ensure any previous animation frame is cleared before starting a new one
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      animationFrameId.current = requestAnimationFrame(animate);
    } else {
      // Handles cleanup if earthquakeData or stationCalcs become null/empty
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      startTimeRef.current = null;
      setAnimationTime(0);
    }
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [earthquakeData, stationCalcs, animate]); // animate is in dependency array


  if (!earthquakeData) {
    return <p>No earthquake data available for animation.</p>;
  }

  // --- SVG Rendering Calculations ---
  const svgCenterX = SVG_WIDTH / 2;
  const svgCenterY = SVG_HEIGHT * 0.75; // Position earth lower to give space for text

  // Hypocenter position (simplified 2D projection)
  // Scale depth: 0 depth is on surface, max depth is MAX_DEPTH_SVG pixels down
  const scaledDepth = Math.min(MAX_DEPTH_SVG, (earthquakeData.depth / 700) * MAX_DEPTH_SVG); // Assuming 700km is a deep quake for scaling
  const hypocenterX = svgCenterX;
  const hypocenterY = svgCenterY - EARTH_RADIUS_SVG + scaledDepth; // Y increases downwards

  // P & S Wave radii
  const pWaveRadiusSVG = (animationTime * AVERAGE_P_WAVE_VELOCITY_KM_S) * (EARTH_RADIUS_SVG / 6371); // Scale real km to SVG pixels
  const sWaveRadiusSVG = (animationTime * AVERAGE_S_WAVE_VELOCITY_KM_S) * (EARTH_RADIUS_SVG / 6371);

  // DEBUGGING CONSOLE LOGS - Step 1
  // console.log(`Animation Time: ${animationTime?.toFixed(1)}s`);
  // console.log(`P-Wave Velocity: ${AVERAGE_P_WAVE_VELOCITY_KM_S} km/s, S-Wave Velocity: ${AVERAGE_S_WAVE_VELOCITY_KM_S} km/s`);
  // console.log(`Calculated SVG Radii - P: ${pWaveRadiusSVG?.toFixed(1)}, S: ${sWaveRadiusSVG?.toFixed(1)}`);
  // console.log(`Earth Radius SVG: ${EARTH_RADIUS_SVG}, Max Depth SVG: ${MAX_DEPTH_SVG}`);
  // console.log(`Hypocenter: X=${hypocenterX}, Y=${hypocenterY}`);


  // Station positions on the SVG (approximate for a flat cross-section)
  // This is a very simplified representation. A true projection would be more complex.
  // For this visualization, we'll place them along the arc of the semicircle.
  // We can calculate an angle based on a simplified "distance" from a reference point (e.g. 0 longitude at epicenter's latitude)
  // Or, more simply, distribute them somewhat evenly for visual purposes if they are far apart.
  const stationPositions = stationCalcs.map((station, index) => {
    // Simplified: distribute along the top arc.
    // This doesn't use their actual geo distance accurately for placement on the 2D SVG arc,
    // but rather provides distinct visual markers.
    const angle = (Math.PI / (VIRTUAL_STATIONS.length + 1)) * (index + 1) - (Math.PI /2) ; // Distribute from -PI/2 to PI/2
    return {
      ...station,
      svgX: svgCenterX + EARTH_RADIUS_SVG * Math.cos(angle),
      svgY: svgCenterY + EARTH_RADIUS_SVG * Math.sin(angle), // sin for y on a circle starting at -90deg
    };
  });


  return (
    <div style={{ textAlign: 'center' }}>
      <h3>Seismic Wave Propagation</h3>
      <p>Earthquake Magnitude: {earthquakeData.magnitude.toFixed(1)} | Depth: {earthquakeData.depth.toFixed(0)} km</p>
      <p>Animation Time: {animationTime.toFixed(1)}s</p>
      <p style={{ fontSize: '0.8em', color: '#aaa', marginBottom: '5px' }}>
        Mode: {speedScenario === 'variable' ? 'Illustrative Variable Speeds' : 'Illustrative Average Speeds'}
      </p>
      <svg width={SVG_WIDTH} height={SVG_HEIGHT} style={{ border: '1px solid #ccc', overflow: 'hidden' }}>
        <defs>
          <radialGradient id="pWaveGradient">
            <stop offset="0%" stopColor={`rgba(${P_WAVE_BASE_COLOR}, 0.6)`} />
            <stop offset="70%" stopColor={`rgba(${P_WAVE_BASE_COLOR}, 0.2)`} />
            <stop offset="100%" stopColor={`rgba(${P_WAVE_BASE_COLOR}, 0.05)`} />
          </radialGradient>
          <radialGradient id="sWaveGradient">
            <stop offset="0%" stopColor={`rgba(${S_WAVE_BASE_COLOR}, 0.6)`} />
            <stop offset="70%" stopColor={`rgba(${S_WAVE_BASE_COLOR}, 0.2)`} />
            <stop offset="100%" stopColor={`rgba(${S_WAVE_BASE_COLOR}, 0.05)`} />
          </radialGradient>
          <clipPath id="earthClipPath">
            <path
              d={`M ${svgCenterX - EARTH_RADIUS_SVG},${svgCenterY}
                  A ${EARTH_RADIUS_SVG},${EARTH_RADIUS_SVG} 0 0 1 ${svgCenterX + EARTH_RADIUS_SVG},${svgCenterY}
                  L ${svgCenterX - EARTH_RADIUS_SVG},${svgCenterY} Z`}
            />
          </clipPath>
        </defs>

        {/* Earth's surface (semicircle) */}
        <path
          d={`M ${svgCenterX - EARTH_RADIUS_SVG},${svgCenterY}
              A ${EARTH_RADIUS_SVG},${EARTH_RADIUS_SVG} 0 0 1 ${svgCenterX + EARTH_RADIUS_SVG},${svgCenterY}`}
          stroke="#5c4033" // Darker Brown for earth crust outline
          strokeWidth="2.5" // Slightly thicker
          fill="#f5deb3" // Wheat color for earth fill - a bit lighter than khaki
        />
        {/* Line to represent the earth's "flat" surface for stations if needed, or just use the arc */}
         <line x1={svgCenterX - EARTH_RADIUS_SVG} y1={svgCenterY} x2={svgCenterX + EARTH_RADIUS_SVG} y2={svgCenterY} stroke="#5c4033" strokeWidth="2.5"/>


        {/* Hypocenter */}
        <circle cx={hypocenterX} cy={hypocenterY} r="6" fill="black" stroke="white" strokeWidth="1" />
        <text x={hypocenterX + 10} y={hypocenterY + 4} fontSize="11px" fill="black" fontWeight="bold">Hypocenter</text>

        {/* P-Wave */}
        {animationTime > 0 && pWaveRadiusSVG > 0 && (
          (() => {
            const pWaveProps = {
              cx: hypocenterX,
              cy: hypocenterY,
              r: pWaveRadiusSVG,
              fill: "url(#pWaveGradient)",
              stroke: `rgba(${P_WAVE_BASE_COLOR}, 0.8)`,
              strokeWidth: "3", // Increased for debugging visibility
              clipPath: "url(#earthClipPath)"
            };
            // console.log("P-Wave props:", pWaveProps); // DEBUGGING CONSOLE LOGS - Step 2
            return <circle {...pWaveProps} />;
          })()
        )}

        {/* S-Wave */}
        {animationTime > 0 && sWaveRadiusSVG > 0 && (
          (() => {
            const sWaveProps = {
              cx: hypocenterX,
              cy: hypocenterY,
              r: sWaveRadiusSVG,
              fill: "url(#sWaveGradient)",
              stroke: `rgba(${S_WAVE_BASE_COLOR}, 0.8)`,
              strokeWidth: "3", // Increased for debugging visibility
              clipPath: "url(#earthClipPath)"
            };
            // console.log("S-Wave props:", sWaveProps); // DEBUGGING CONSOLE LOGS - Step 2
            return <circle {...sWaveProps} />;
          })()
        )}

        {/* Stations & Text */}
        {stationPositions.map((station, index) => {
          const pWaveArrived = station.pWaveTime !== "N/A" && animationTime >= parseFloat(station.pWaveTime);
          const sWaveArrived = station.sWaveTime !== "N/A" && animationTime >= parseFloat(station.sWaveTime);

          let stationFillColor = "#808080"; // Grey
          let stationStrokeColor = "black";
          let stationStrokeWidth = 1;

          if (pWaveArrived) {
            stationFillColor = `rgba(${P_WAVE_BASE_COLOR}, 0.7)`; // More solid than wave itself
            stationStrokeColor = `rgba(${P_WAVE_BASE_COLOR}, 1)`;
            stationStrokeWidth = 1.5;
          }
          if (sWaveArrived) {
            stationFillColor = `rgba(${S_WAVE_BASE_COLOR}, 0.7)`;
            stationStrokeColor = `rgba(${S_WAVE_BASE_COLOR}, 1)`;
            stationStrokeWidth = 1.5;
          }


          return (
            <g key={station.name}>
              <circle
                cx={station.svgX}
                cy={station.svgY}
                r="7" // Slightly larger station markers
                fill={stationFillColor}
                stroke={stationStrokeColor}
                strokeWidth={stationStrokeWidth}
              />
              {/* Station Name */}
              <text x={station.svgX} y={station.svgY - 28} textAnchor="middle" fontSize="11px" fontWeight="bold" fill="#1a202c">
                {station.name}
              </text>
              {/* Travel Times */}
              <text x={station.svgX} y={station.svgY - 12} textAnchor="middle" fontSize="10px" fill="#4a5568">
                P: {station.pWaveTime}s, S: {station.sWaveTime}s
              </text>
               {/* Arrival Pings */}
              {pWaveArrived && !sWaveArrived && (
                <line x1={station.svgX} y1={station.svgY - 8} x2={station.svgX} y2={station.svgY - 18} stroke={P_WAVE_PING_COLOR} strokeWidth="2.5" />
              )}
              {sWaveArrived && (
                 <line x1={station.svgX} y1={station.svgY - 8} x2={station.svgX} y2={station.svgY - 18} stroke={S_WAVE_PING_COLOR} strokeWidth="2.5" />
              )}
            </g>
          );
        })}
      </svg>
      <style jsx>{`
        p {
          margin: 5px 0;
          font-size: 0.9em;
        }
        h3 {
          margin-bottom: 10px;
        }
      `}</style>
    </div>
  );
};

export default SeismicWaveAnimation;
