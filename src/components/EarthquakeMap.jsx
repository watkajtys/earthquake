import React, { useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet';
import { Link } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import tectonicPlatesData from '../assets/TectonicPlateBoundaries.json';
import { getMagnitudeColor, formatTimeAgo } from '../utils/utils.js';

// Corrects issues with Leaflet's default icon paths in some bundlers.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

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
    html: `<svg width="60" height="60" viewBox="0 0 72 72"><g transform="translate(36,36)">${rings}<circle cx="0" cy="0" r="6" fill="${fillColor}" stroke="#FFFFFF" stroke-width="1.5"/></g></svg>`,
    className: 'custom-pulsing-icon',
    iconSize: [60, 60],
    iconAnchor: [30, 30],
  });
};

const createNearbyQuakeIcon = (magnitude, time) => {
  const fillColor = getMagnitudeColor(magnitude);
  const currentTime = Date.now();
  const ageInDays = (currentTime - time) / (1000 * 60 * 60 * 24);
  let opacity;
  if (ageInDays < 1) opacity = 1.0;
  else if (ageInDays < 7) opacity = 0.8;
  else if (ageInDays < 14) opacity = 0.6;
  else opacity = 0.4;
  const alphaHex = Math.round(opacity * 255).toString(16).padStart(2, '0');
  const finalColor = fillColor + alphaHex;
  return new L.DivIcon({
    html: `<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="5" fill="${finalColor}" /></svg>`,
    className: 'custom-nearby-quake-icon',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
};

const getTectonicPlateStyle = (feature) => {
  let color = 'rgba(255, 165, 0, 0.8)';
  const type = feature?.properties?.Boundary_Type;
  if (type === 'Convergent') color = 'rgba(220, 20, 60, 0.8)';
  else if (type === 'Divergent') color = 'rgba(60, 179, 113, 0.8)';
  else if (type === 'Transform') color = 'rgba(70, 130, 180, 0.8)';
  return { color, weight: 1, opacity: 0.8 };
};

/**
 * `EarthquakeMap` component renders a Leaflet map.
 *
 * @param {object} props - The component's props.
 * @param {number} props.mapCenterLatitude - Latitude for the initial map center.
 * @param {number} props.mapCenterLongitude - Longitude for the initial map center.
 * @param {number} [props.highlightQuakeLatitude] - Latitude of the main quake to highlight.
 * @param {number} [props.highlightQuakeLongitude] - Longitude of the main quake to highlight.
 * @param {number} [props.highlightQuakeMagnitude] - Magnitude of the main quake to highlight.
 * @param {string} [props.highlightQuakeTitle] - Title of the main quake to highlight.
 * @param {string} [props.shakeMapUrl] - Optional URL to the ShakeMap details page for the highlighted quake.
 * @param {Array} [props.nearbyQuakes=[]] - Optional array of nearby earthquake objects.
 * @param {string} [props.mainQuakeDetailUrl] - Optional URL for the highlighted quake's internal detail view.
 * @param {boolean} [props.fitMapToBounds=false] - Whether to automatically fit the map to show all markers.
 * @param {number} [props.defaultZoom=8] - Default zoom level.
 * @returns {JSX.Element} The rendered EarthquakeMap component.
 */
const EarthquakeMap = ({
  mapCenterLatitude,
  mapCenterLongitude,
  highlightQuakeLatitude,
  highlightQuakeLongitude,
  highlightQuakeMagnitude,
  highlightQuakeTitle,
  shakeMapUrl,
  nearbyQuakes = [],
  mainQuakeDetailUrl,
  fitMapToBounds = false,
  defaultZoom = 8,
}) => {
  const mapRef = useRef(null);
  const initialMapCenter = [mapCenterLatitude, mapCenterLongitude];
  const highlightedQuakePosition = highlightQuakeLatitude !== undefined && highlightQuakeLongitude !== undefined
    ? [highlightQuakeLatitude, highlightQuakeLongitude]
    : null;

  const mapStyle = {
    height: '100%',
    width: '100%',
  };

  useEffect(() => {
    if (mapRef.current && fitMapToBounds) {
      const allPoints = [];
      if (highlightedQuakePosition) {
        allPoints.push(highlightedQuakePosition);
      }
      nearbyQuakes.forEach(quake => {
        if (quake.geometry && quake.geometry.coordinates) {
          // Ensure coordinates are valid numbers before pushing
          const lat = parseFloat(quake.geometry.coordinates[1]);
          const lon = parseFloat(quake.geometry.coordinates[0]);
          if (!isNaN(lat) && !isNaN(lon)) {
            allPoints.push([lat, lon]);
          }
        }
      });

      if (allPoints.length > 1) {
        const bounds = L.latLngBounds(allPoints.map(point => L.latLng(point[0], point[1])));
        mapRef.current.fitBounds(bounds, { padding: [50, 50] });
      } else if (allPoints.length === 1) {
        mapRef.current.setView(L.latLng(allPoints[0][0], allPoints[0][1]), defaultZoom);
      } else { // No points to fit, use initialMapCenter
        mapRef.current.setView(L.latLng(initialMapCenter[0], initialMapCenter[1]), defaultZoom);
      }
    } else if (mapRef.current) {
      mapRef.current.setView(L.latLng(initialMapCenter[0], initialMapCenter[1]), defaultZoom);
    }
  }, [
    mapCenterLatitude, mapCenterLongitude, // For initialMapCenter
    highlightQuakeLatitude, highlightQuakeLongitude, // For highlightedQuakePosition and allPoints
    nearbyQuakes,
    fitMapToBounds,
    defaultZoom,
    mapRef, // mapRef itself as a dependency
    initialMapCenter, // derived from mapCenterLat/Lon
    highlightedQuakePosition // derived from highlightQuakeLat/Lon
  ]);

  return (
    <MapContainer
      center={initialMapCenter}
      zoom={defaultZoom}
      style={mapStyle}
      ref={mapRef}
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      />
      {highlightedQuakePosition && highlightQuakeMagnitude !== undefined && (
        <Marker position={highlightedQuakePosition} icon={createEpicenterIcon(highlightQuakeMagnitude)}>
          <Popup>
            <strong>{highlightQuakeTitle || 'Highlighted Quake'}</strong>
            <br />
            Magnitude: {highlightQuakeMagnitude}
            {mainQuakeDetailUrl && (
              <>
                <br />
                <Link to={`/quake/${encodeURIComponent(mainQuakeDetailUrl)}`} className="text-blue-500 hover:underline">
                  View Details
                </Link>
              </>
            )}
            {!mainQuakeDetailUrl && shakeMapUrl && (
              <>
                <br />
                <a href={shakeMapUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                  ShakeMap Details (External)
                </a>
              </>
            )}
          </Popup>
        </Marker>
      )}
      {nearbyQuakes.map((quake, index) => {
        if (!quake.geometry || !quake.geometry.coordinates || typeof quake.properties?.mag !== 'number' || typeof quake.properties?.time !== 'number') {
          console.warn("Skipping rendering of nearby quake due to missing data:", quake);
          return null;
        }
        return (
          <Marker
            key={quake.id || index}
            position={[quake.geometry.coordinates[1], quake.geometry.coordinates[0]]}
            icon={createNearbyQuakeIcon(quake.properties.mag, quake.properties.time)}
          >
            <Popup>
              Magnitude: {quake.properties.mag.toFixed(1)}
              <br />
              {quake.properties.place || quake.properties.title || 'N/A'}
              <br />
              Time: {formatTimeAgo(quake.properties.time)}
              <br />
              {quake.properties.detail && (
                 <Link to={`/quake/${encodeURIComponent(quake.properties.detail)}`} className="text-blue-500 hover:underline">
                   View Details
                 </Link>
              )}
            </Popup>
          </Marker>
        );
      })}
      <GeoJSON data={tectonicPlatesData} style={getTectonicPlateStyle} />
    </MapContainer>
  );
};

export default EarthquakeMap;
