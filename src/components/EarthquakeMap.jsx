import React, { useRef, useEffect, memo } from 'react';
import PropTypes from 'prop-types'; // Re-add PropTypes import
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

/**
 * Custom Leaflet DivIcon for displaying the highlighted earthquake (epicenter).
 * Features a pulsing animation for better visibility.
 * The animation (`pulse`) is defined in global CSS (e.g., App.css or index.css).
 * @param {number} magnitude - The earthquake magnitude to determine the icon color.
 * @returns {L.DivIcon} A Leaflet DivIcon instance.
 */
const createEpicenterIcon = (magnitude) => {
  const fillColor = getMagnitudeColor(magnitude);
  // SVG for pulsing rings animation.
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

/**
 * Creates a custom Leaflet DivIcon for a nearby earthquake.
 * Opacity varies based on the age of the quake.
 * @param {number} magnitude - The earthquake magnitude to determine the icon color.
 * @param {number} time - The time of the earthquake (timestamp).
 * @returns {L.DivIcon} A Leaflet DivIcon instance.
 */
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

/**
 * Determines the style for tectonic plate boundary lines on the map.
 * Color varies based on the boundary type (Convergent, Divergent, Transform).
 * @param {object} feature - The GeoJSON feature representing a tectonic plate boundary.
 * @returns {object} Leaflet path style options for the feature.
 */
const getTectonicPlateStyle = (feature) => {
  let color = 'rgba(255, 165, 0, 0.8)';
  const type = feature?.properties?.Boundary_Type;
  if (type === 'Convergent') color = 'rgba(220, 20, 60, 0.8)';
  else if (type === 'Divergent') color = 'rgba(60, 179, 113, 0.8)';
  else if (type === 'Transform') color = 'rgba(70, 130, 180, 0.8)';
  return { color, weight: 1, opacity: 0.8 };
};

/**
 * `EarthquakeMap` is a React component that renders a Leaflet map.
 * (JSDoc updated to reflect PropTypes restoration)
 */
const EarthquakeMap = ({
  mapCenterLatitude, // Required
  mapCenterLongitude, // Required
  highlightQuakeLatitude, // Handled by defaultProps
  highlightQuakeLongitude, // Handled by defaultProps
  highlightQuakeMagnitude, // Handled by defaultProps
  highlightQuakeTitle, // Handled by defaultProps
  shakeMapUrl, // Handled by defaultProps
  nearbyQuakes, // Handled by defaultProps
  mainQuakeDetailUrl, // Handled by defaultProps
  fitMapToBounds, // Handled by defaultProps
  defaultZoom,    // Handled by defaultProps
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
    const mapInstance = mapRef.current;
    if (!mapInstance) {
      return;
    }

    if (fitMapToBounds) {
      const allPoints = [];
      if (highlightedQuakePosition) {
        allPoints.push(highlightedQuakePosition);
      }
      nearbyQuakes.forEach(quake => {
        if (quake.geometry && quake.geometry.coordinates) {
          const lat = parseFloat(quake.geometry.coordinates[1]);
          const lon = parseFloat(quake.geometry.coordinates[0]);
          if (!isNaN(lat) && !isNaN(lon)) {
            allPoints.push([lat, lon]);
          }
        }
      });

      if (allPoints.length > 1) {
        const bounds = L.latLngBounds(allPoints.map(point => L.latLng(point[0], point[1])));
        mapInstance.fitBounds(bounds, { padding: [50, 50] });
      } else if (allPoints.length === 1) {
        mapInstance.setView(L.latLng(allPoints[0][0], allPoints[0][1]), defaultZoom);
      } else {
        mapInstance.setView(L.latLng(initialMapCenter[0], initialMapCenter[1]), defaultZoom);
      }
    } else {
      mapInstance.setView(L.latLng(initialMapCenter[0], initialMapCenter[1]), defaultZoom);
    }
  }, [
    mapCenterLatitude, mapCenterLongitude,
    highlightQuakeLatitude, highlightQuakeLongitude,
    nearbyQuakes,
    fitMapToBounds,
    defaultZoom,
    mapRef,
    initialMapCenter,
    highlightedQuakePosition
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

// Re-add PropTypes
EarthquakeMap.propTypes = {
  mapCenterLatitude: PropTypes.number.isRequired,
  mapCenterLongitude: PropTypes.number.isRequired,
  highlightQuakeLatitude: PropTypes.number,
  highlightQuakeLongitude: PropTypes.number,
  highlightQuakeMagnitude: PropTypes.number,
  highlightQuakeTitle: PropTypes.string,
  shakeMapUrl: PropTypes.string,
  nearbyQuakes: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    geometry: PropTypes.shape({
        coordinates: PropTypes.arrayOf(PropTypes.number).isRequired
    }).isRequired,
    properties: PropTypes.shape({
        mag: PropTypes.number,
        place: PropTypes.string,
        title: PropTypes.string,
        time: PropTypes.number,
        detail: PropTypes.string
    }).isRequired,
  })),
  mainQuakeDetailUrl: PropTypes.string,
  fitMapToBounds: PropTypes.bool,
  defaultZoom: PropTypes.number,
};

// Re-add defaultProps
EarthquakeMap.defaultProps = {
  highlightQuakeLatitude: undefined,
  highlightQuakeLongitude: undefined,
  highlightQuakeMagnitude: undefined,
  highlightQuakeTitle: '',
  shakeMapUrl: null,
  nearbyQuakes: [],
  mainQuakeDetailUrl: null,
  fitMapToBounds: false,
  defaultZoom: 8,
};

export default memo(EarthquakeMap);
