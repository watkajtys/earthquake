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
} from '../utils/seismicUtils';

// Constants
const VIRTUAL_STATIONS = [
  { name: "Station Alpha", lat: 34.0522, lon: -118.2437 }, // Los Angeles
  { name: "Station Bravo", lat: 40.7128, lon: -74.0060 },  // New York
  { name: "Station Charlie", lat: 35.6895, lon: 139.6917 }, // Tokyo
  // Add a station in the southern hemisphere for variety if needed
  { name: "Station Delta", lat: -33.8688, lon: 151.2093 }, // Sydney
];

const P_WAVE_COLOR = "rgba(0, 0, 255, 0.5)"; // Blue, semi-transparent
const S_WAVE_COLOR = "rgba(255, 0, 0, 0.5)"; // Red, semi-transparent

const SVG_WIDTH = 600;
const SVG_HEIGHT = 400; // Increased height for text and better visual
const EARTH_RADIUS_SVG = SVG_WIDTH / 2 * 0.8; // Scaled Earth radius for SVG
const MAX_DEPTH_SVG = EARTH_RADIUS_SVG * 0.5; // Max depth visualization exaggerated

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
    const elapsedMilliseconds = timestamp - startTimeRef.current;
    const newAnimationTime = elapsedMilliseconds / 1000; // Convert to seconds

    setAnimationTime(newAnimationTime);

    // Determine if animation should continue
    const maxSTime = Math.max(...stationCalcs.filter(s => s.sWaveTime !== "N/A").map(s => parseFloat(s.sWaveTime)), 0);
    const animationDurationLimit = maxSTime > 0 ? maxSTime + 10 : 60; // Add a buffer or default to 60s

    if (newAnimationTime < animationDurationLimit && stationCalcs.length > 0) {
      animationFrameId.current = requestAnimationFrame(animate);
    } else {
        // Optionally reset or finalize animation states here
        if (newAnimationTime >= animationDurationLimit) {
            console.log("Animation limit reached or all waves passed.");
        }
    }
  }, [stationCalcs]);

  // Start and stop animation
  useEffect(() => {
    if (earthquakeData && stationCalcs.length > 0) {
      startTimeRef.current = null; // Reset start time for new earthquake/data
      setAnimationTime(0); // Reset animation time
      animationFrameId.current = requestAnimationFrame(animate);
    } else {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        startTimeRef.current = null;
        setAnimationTime(0);
      }
    }
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [earthquakeData, stationCalcs, animate]);


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
        {/* Earth's surface (semicircle) */}
        <path
          d={`M ${svgCenterX - EARTH_RADIUS_SVG},${svgCenterY}
              A ${EARTH_RADIUS_SVG},${EARTH_RADIUS_SVG} 0 0 1 ${svgCenterX + EARTH_RADIUS_SVG},${svgCenterY}`}
          stroke="#654321" // Brown for earth crust
          strokeWidth="2"
          fill="#f0e68c" // Khaki for earth fill
        />
        {/* Line to represent the earth's "flat" surface for stations if needed, or just use the arc */}
         <line x1={svgCenterX - EARTH_RADIUS_SVG} y1={svgCenterY} x2={svgCenterX + EARTH_RADIUS_SVG} y2={svgCenterY} stroke="#654321" strokeWidth="2"/>


        {/* Hypocenter */}
        <circle cx={hypocenterX} cy={hypocenterY} r="5" fill="black" />
        <text x={hypocenterX + 8} y={hypocenterY + 4} fontSize="10px">Hypocenter</text>

        {/* P-Wave */}
        {animationTime > 0 && pWaveRadiusSVG > 0 && (
          <circle
            cx={hypocenterX}
            cy={hypocenterY}
            r={pWaveRadiusSVG}
            fill="none"
            stroke={P_WAVE_COLOR}
            strokeWidth="3"
            opacity="0.7"
          />
        )}

        {/* S-Wave */}
        {animationTime > 0 && sWaveRadiusSVG > 0 && (
          <circle
            cx={hypocenterX}
            cy={hypocenterY}
            r={sWaveRadiusSVG}
            fill="none"
            stroke={S_WAVE_COLOR}
            strokeWidth="3"
            opacity="0.7"
          />
        )}

        {/* Stations & Text */}
        {stationPositions.map((station, index) => {
          const pWaveArrived = station.pWaveTime !== "N/A" && animationTime >= parseFloat(station.pWaveTime);
          const sWaveArrived = station.sWaveTime !== "N/A" && animationTime >= parseFloat(station.sWaveTime);
          let stationColor = "grey";
          if (pWaveArrived) stationColor = P_WAVE_COLOR;
          if (sWaveArrived) stationColor = S_WAVE_COLOR;

          return (
            <g key={station.name}>
              <circle cx={station.svgX} cy={station.svgY} r="6" fill={stationColor} stroke="black" />
              {/* Station Name */}
              <text x={station.svgX} y={station.svgY - 25} textAnchor="middle" fontSize="10px" fill="#333">
                {station.name}
              </text>
              {/* Travel Times */}
              <text x={station.svgX} y={station.svgY - 10} textAnchor="middle" fontSize="9px" fill="#555">
                P: {station.pWaveTime}s, S: {station.sWaveTime}s
              </text>
               {/* Arrival Pings */}
              {pWaveArrived && !sWaveArrived && (
                <line x1={station.svgX} y1={station.svgY} x2={station.svgX} y2={station.svgY - 8} stroke={P_WAVE_COLOR} strokeWidth="2" />
              )}
              {sWaveArrived && (
                 <line x1={station.svgX} y1={station.svgY} x2={station.svgX} y2={station.svgY - 8} stroke={S_WAVE_COLOR} strokeWidth="3" />
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
