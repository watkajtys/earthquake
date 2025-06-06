import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { calculatePWaveTravelTime, calculateSWaveTravelTime, calculateDistance as importedCalculateDistance } from '../utils/seismicUtils'; // Ensure calculateDistance is imported

// Correct Leaflet's default icon path issues
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// ILLUSTRATIVE_STATIONS removed

const getMagnitudeColor = (magnitude) => {
  if (magnitude === null || magnitude === undefined) return '#6B7280';
  if (magnitude < 1.0) return '#06B6D4';
  if (magnitude < 2.5) return '#059669';
  if (magnitude < 4.0) return '#F59E0B';
  if (magnitude < 5.0) return '#EF4444';
  if (magnitude < 6.0) return '#DC2626';
  if (magnitude < 7.0) return '#B91C1C';
  return '#991B1B';
};

const createEpicenterIcon = (magnitude) => {
  const fillColor = getMagnitudeColor(magnitude);
  const rings = Array(3).fill(0).map((_, i) => `
    <circle cx="0" cy="0" r="5" stroke="${fillColor}" stroke-width="4" fill="none" stroke-opacity="0.6">
      <animate attributeName="r" from="5" to="30" dur="2.5s" begin="${i * 0.8}s" repeatCount="indefinite"/>
      <animate attributeName="stroke-opacity" from="0.6" to="0" dur="2.5s" begin="${i * 0.8}s" repeatCount="indefinite"/>
    </circle>
    <circle cx="0" cy="0" r="5" stroke="${fillColor}" stroke-width="2" fill="none" stroke-opacity="1">
      <animate attributeName="r" from="5" to="25" dur="2.5s" begin="${i * 0.8}s" repeatCount="indefinite"/>
      <animate attributeName="stroke-opacity" from="1" to="0" dur="2.5s" begin="${i * 0.8}s" repeatCount="indefinite"/>
    </circle>
  `).join('');
  return new L.DivIcon({
    html: `<div aria-label="Earthquake epicenter"><svg width="60" height="60" viewBox="0 0 72 72"><g transform="translate(36,36)">${rings}<circle cx="0" cy="0" r="6" fill="${fillColor}" stroke="#FFFFFF" stroke-width="1.5"/></g></svg></div>`,
    className: 'custom-pulsing-icon',
    iconSize: [60, 60],
    iconAnchor: [30, 30],
  });
};

const stationIconDefault = new L.DivIcon({
    html: `<div aria-label="Seismic station"><svg viewBox="0 0 20 32" width="20" height="32" xmlns="http://www.w3.org/2000/svg"><path d="M10 0C4.48 0 0 4.48 0 10c0 8.04 10 22 10 22s10-13.96 10-22c0-5.52-4.48-10-10-10zm0 14c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" fill="#60A5FA"/></svg></div>`,
    className: 'custom-station-icon', iconSize: [20, 32], iconAnchor: [10, 32], popupAnchor: [0, -32]
});
const stationIconPArrived = new L.DivIcon({
    html: `<div aria-label="Seismic station P-wave arrived"><svg viewBox="0 0 20 32" width="20" height="32" xmlns="http://www.w3.org/2000/svg"><path d="M10 0C4.48 0 0 4.48 0 10c0 8.04 10 22 10 22s10-13.96 10-22c0-5.52-4.48-10-10-10zm0 14c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" fill="#2563EB"/></svg></div>`,
    className: 'custom-station-icon p-arrived', iconSize: [20, 32], iconAnchor: [10, 32], popupAnchor: [0, -32]
});
const stationIconSArrived = new L.DivIcon({
    html: `<div aria-label="Seismic station S-wave arrived"><svg viewBox="0 0 20 32" width="20" height="32" xmlns="http://www.w3.org/2000/svg"><path d="M10 0C4.48 0 0 4.48 0 10c0 8.04 10 22 10 22s10-13.96 10-22c0-5.52-4.48-10-10-10zm0 14c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" fill="#EF4444"/></svg></div>`,
    className: 'custom-station-icon s-arrived', iconSize: [20, 32], iconAnchor: [10, 32], popupAnchor: [0, -32]
});

const AVERAGE_P_WAVE_VELOCITY_KM_S = 6.5;
const AVERAGE_S_WAVE_VELOCITY_KM_S = 3.75;

const PSWaveAnimationMap = ({ earthquake, stations }) => { // Added stations prop
  if (!earthquake || !earthquake.geometry || !earthquake.properties) {
    return <div className="text-center p-4">Error: Earthquake data is missing or invalid.</div>;
  }
  // Add a check for stations prop if it's critical for initial render,
  // though useEffect will handle empty/invalid stations.
  // if (!stations) {
  //   return <div className="text-center p-4">Error: Stations data is missing.</div>;
  // }

  const { geometry, properties } = earthquake;
  const epicenterPosition = [geometry.coordinates[1], geometry.coordinates[0]];
  const epicenterDepth = geometry.coordinates[2];
  const earthquakeMagnitude = properties.mag;
  const earthquakeTime = new Date(properties.time);

  const mapRef = useRef(null);
  const animationFrameId = useRef(null);
  const animationStartTime = useRef(null);
  const loopTimeoutId = useRef(null);

  const [stationData, setStationData] = useState([]); // Initialize as empty
  const [maxTravelTime, setMaxTravelTime] = useState(0);
  const [pWaveRadius, setPWaveRadius] = useState(0);
  const [sWaveRadius, setSWaveRadius] = useState(0);
  const [animationRunning, setAnimationRunning] = useState(false); // Start paused
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isLoopingEnabled, setIsLoopingEnabled] = useState(true);

  // Use imported calculateDistance, aliased to avoid conflict if any local one existed.
  const calculateDistance = useCallback(importedCalculateDistance, []);

  const resetAnimationFull = useCallback(() => {
    setAnimationRunning(false);
    if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    animationFrameId.current = null;
    if (loopTimeoutId.current) clearTimeout(loopTimeoutId.current);
    loopTimeoutId.current = null;

    setPWaveRadius(0);
    setSWaveRadius(0);
    setElapsedTime(0);
    // When resetting, stationData's core (id, name, position) is preserved if derived from props,
    // only arrival flags are reset.
    setStationData(prevStations => prevStations.map(s => ({ ...s, pWaveArrived: false, sWaveArrived: false })));
    animationStartTime.current = null;
  }, []); // Empty dependency array as it uses setters and refs only

  // Effect to process earthquake and stations prop
  useEffect(() => {
    if (!earthquake || !stations || stations.length === 0) {
        setStationData([]);
        setMaxTravelTime(0);
        resetAnimationFull(); // Perform a full reset if critical data is missing
        return;
    }

    const { geometry } = earthquake;
    const epicenterLat = geometry.coordinates[1];
    const epicenterLon = geometry.coordinates[0];
    const depth = geometry.coordinates[2];

    let currentMaxTravelTime = 0;
    const processedStations = stations.map(station => {
        const flatDistance = calculateDistance(
            epicenterLat,
            epicenterLon,
            station.position[0],
            station.position[1]
        );
        const slantDistance = Math.sqrt(Math.pow(flatDistance, 2) + Math.pow(depth, 2));
        const pTime = calculatePWaveTravelTime(slantDistance);
        const sTime = calculateSWaveTravelTime(slantDistance);

        if (sTime > currentMaxTravelTime) {
            currentMaxTravelTime = sTime;
        }
        return {
            ...station,
            distance: slantDistance,
            pWaveTime: pTime,
            sWaveTime: sTime,
            pWaveArrived: false,
            sWaveArrived: false
        };
    });

    setStationData(processedStations);
    setMaxTravelTime(currentMaxTravelTime);

    // Reset animation state for new earthquake/stations and auto-start
    resetAnimationFull();
    if (currentMaxTravelTime > 0) {
        setAnimationRunning(true);
    }
  }, [earthquake, stations, calculateDistance, resetAnimationFull]); // Dependencies

  // Animation Loop Effect
  useEffect(() => {
    if (animationRunning && maxTravelTime > 0) {
      // Ensure animationStartTime is correctly set for play/resume
      if (!animationStartTime.current || elapsedTime === 0) {
          animationStartTime.current = performance.now() - elapsedTime * 1000;
      }

      const animate = (currentTime) => {
        if (!animationStartTime.current) animationStartTime.current = currentTime; // Handles if it was null
        const timeSinceStartMs = currentTime - animationStartTime.current;
        let currentElapsedTimeSec = timeSinceStartMs / 1000;

        if (currentElapsedTimeSec >= maxTravelTime) {
          currentElapsedTimeSec = maxTravelTime; // Cap at maxTravelTime
          setElapsedTime(maxTravelTime);
          setPWaveRadius(AVERAGE_P_WAVE_VELOCITY_KM_S * maxTravelTime);
          setSWaveRadius(AVERAGE_S_WAVE_VELOCITY_KM_S * maxTravelTime);
          setStationData(prevStations => prevStations.map(station => ({
            ...station,
            pWaveArrived: station.pWaveTime !== null && maxTravelTime >= station.pWaveTime,
            sWaveArrived: station.sWaveTime !== null && maxTravelTime >= station.sWaveTime,
          })));

          if (isLoopingEnabled) {
            if (loopTimeoutId.current) clearTimeout(loopTimeoutId.current);
            loopTimeoutId.current = setTimeout(() => {
              setPWaveRadius(0);
              setSWaveRadius(0);
              setElapsedTime(0);
              setStationData(prev => prev.map(s => ({ ...s, pWaveArrived: false, sWaveArrived: false })));
              animationStartTime.current = null; // Reset for the new loop iteration
              if (animationRunning) { // Check if still running (not paused during timeout)
                animationFrameId.current = requestAnimationFrame(animate);
              }
            }, 1500);
          } else {
            setAnimationRunning(false);
          }
          return; // End this frame
        }

        setElapsedTime(currentElapsedTimeSec);
        setPWaveRadius(AVERAGE_P_WAVE_VELOCITY_KM_S * currentElapsedTimeSec);
        setSWaveRadius(AVERAGE_S_WAVE_VELOCITY_KM_S * currentElapsedTimeSec);
        setStationData(prevStations => prevStations.map(station => ({
          ...station,
          pWaveArrived: station.pWaveArrived || (station.pWaveTime !== null && currentElapsedTimeSec >= station.pWaveTime),
          sWaveArrived: station.sWaveArrived || (station.sWaveTime !== null && currentElapsedTimeSec >= station.sWaveTime),
        })));
        animationFrameId.current = requestAnimationFrame(animate);
      };
      animationFrameId.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
      if (loopTimeoutId.current) clearTimeout(loopTimeoutId.current);
      loopTimeoutId.current = null;
    };
  }, [animationRunning, maxTravelTime, isLoopingEnabled, elapsedTime]); // Added elapsedTime to correctly manage resume


  const handlePlayPauseToggle = () => {
    const newAnimationRunningState = !animationRunning;
    setAnimationRunning(newAnimationRunningState);

    if (newAnimationRunningState) { // Trying to play
      if (elapsedTime >= maxTravelTime && !isLoopingEnabled) { // Animation ended and not looping
        // Reset to play from start
        resetAnimationFull();
        // setAnimationRunning(true) will be called by resetAnimationFull if currentMaxTravelTime > 0
        // but we need to ensure it starts if resetAnimationFull doesn't trigger it due to maxTravelTime being 0 initially.
        // For safety, explicitly set it if we intend to play.
        // The resetAnimationFull will call setAnimationRunning(false), so we re-assert our intent.
        // However, the main auto-start is in the earthquake useEffect. This button is manual.
        // If maxTravelTime is 0, it won't play anyway.
        // The logic here is simplified: reset and the main effect will pick it up if conditions are right.
        // Or, more directly:
        setPWaveRadius(0);
        setSWaveRadius(0);
        setElapsedTime(0);
        setStationData(prevStations => prevStations.map(s => ({ ...s, pWaveArrived: false, sWaveArrived: false })));
        animationStartTime.current = null;
        // Set animationRunning to true again because resetAnimationFull sets it to false.
        // The useEffect for animationRunning will then pick it up.
        setAnimationRunning(true);
      } else if (!animationStartTime.current && elapsedTime > 0) {
        // Resuming: adjust start time based on current elapsed time
        animationStartTime.current = performance.now() - elapsedTime * 1000;
      }
      // If elapsedTime is 0, animationStartTime will be set by the animation useEffect.
    } else { // Trying to pause
      if (loopTimeoutId.current) {
        clearTimeout(loopTimeoutId.current);
        loopTimeoutId.current = null;
      }
      // animationFrameId is cleared by the animation useEffect cleanup
    }
  };

  const handleResetButtonClick = () => {
    resetAnimationFull();
    // If user wants to immediately play after reset, they can click play.
    // Or, if we want reset to imply play if it was playing before:
    // const wasRunning = animationRunning;
    // resetAnimationFull();
    // if (wasRunning && maxTravelTime > 0) setAnimationRunning(true);
    // For now, reset just resets and stops. The earthquake useEffect will auto-play on new data.
  };

  const mapStyle = { height: '600px', width: '100%' };
  const earthquakeId = earthquake.id || JSON.stringify(earthquake.geometry);

  return (
    <div className="p-4 border rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-2">P & S Wave Travel Time Animation</h2>
      <p className="mb-1">Earthquake: {properties.title || 'N/A'} (Depth: {epicenterDepth.toFixed(1)} km)</p>
      <p className="mb-1">Magnitude: {earthquakeMagnitude}</p>
      <p className="mb-3">Time: {earthquakeTime.toLocaleString()}</p>

      <button
        onClick={handlePlayPauseToggle}
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mb-3 mr-2"
        disabled={maxTravelTime === 0}
      >
        {animationRunning ? 'Pause Animation' : (elapsedTime > 0 && elapsedTime < maxTravelTime ? 'Resume Animation' : 'Play Animation')}
      </button>
      <button
        onClick={handleResetButtonClick}
        className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded mb-3"
        disabled={elapsedTime === 0 && !animationRunning}
      >
        Reset Animation
      </button>
      <label className="ml-4 text-sm inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={isLoopingEnabled}
          onChange={() => setIsLoopingEnabled(prev => !prev)}
          className="mr-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        Loop Animation
      </label>
      <span className="ml-4 text-sm align-middle">
        Elapsed Time: {elapsedTime.toFixed(1)}s / {maxTravelTime > 0 ? maxTravelTime.toFixed(1) : 'N/A'}s
      </span>

      <MapContainer center={epicenterPosition} zoom={3} style={mapStyle} ref={mapRef} key={earthquakeId}>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        />
        <Marker
          position={epicenterPosition}
          icon={createEpicenterIcon(earthquakeMagnitude)}
          alt="Earthquake epicenter" // Added alt prop
        >
          <Popup> Epicenter: {properties.title || 'Earthquake'} <br /> Magnitude: {earthquakeMagnitude} <br /> Depth: {epicenterDepth.toFixed(1)} km </Popup>
        </Marker>
        {stationData.map(station => {
          let currentIcon = stationIconDefault;
          if (station.sWaveArrived) currentIcon = stationIconSArrived;
          else if (station.pWaveArrived) currentIcon = stationIconPArrived;
          return (
            <Marker
              key={station.id}
              position={station.position}
              icon={currentIcon}
              alt={station.name ? `Seismic station: ${station.name}` : 'Seismic station'} // Added alt prop
            >
              <Popup>
                <b>{station.name}</b> <br />
                Distance: {station.distance ? station.distance.toFixed(0) : 'N/A'} km <br />
                P-Wave Time: {station.pWaveTime ? station.pWaveTime.toFixed(1) + 's' : 'N/A'}
                {station.pWaveArrived && <span style={{color: 'blue', fontWeight: 'bold'}}> (Arrived)</span>} <br />
                S-Wave Time: {station.sWaveTime ? station.sWaveTime.toFixed(1) + 's' : 'N/A'}
                {station.sWaveArrived && <span style={{color: 'red', fontWeight: 'bold'}}> (Arrived)</span>}
              </Popup>
            </Marker>
          );
        })}
        {pWaveRadius > 0 && <Circle center={epicenterPosition} radius={pWaveRadius * 1000} pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.1, weight: 1 }} />}
        {sWaveRadius > 0 && <Circle center={epicenterPosition} radius={sWaveRadius * 1000} pathOptions={{ color: 'red', fillColor: 'red', fillOpacity: 0.1, weight: 1 }} />}
      </MapContainer>
      <div className="mt-2 text-xs text-gray-500">
        Note: Wave velocities are simplified averages (P: {AVERAGE_P_WAVE_VELOCITY_KM_S} km/s, S: {AVERAGE_S_WAVE_VELOCITY_KM_S} km/s). Max animation time: {maxTravelTime > 0 ? maxTravelTime.toFixed(1) : 'N/A'}s.
      </div>
    </div>
  );
};

export default PSWaveAnimationMap;
