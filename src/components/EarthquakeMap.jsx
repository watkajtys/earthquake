import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet';
import { Link } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import tectonicPlatesData from '../assets/TectonicPlateBoundaries.json'; // Corrected path
import { getMagnitudeColor, formatTimeAgo } from '../utils/utils.js'; // Corrected path

// Corrects issues with Leaflet's default icon paths in some bundlers.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

/**
 * Custom Leaflet DivIcon for displaying the earthquake epicenter.
 * Features a pulsing animation for better visibility.
 * The animation (`pulse`) is defined in global CSS (e.g., App.css).
 * @param {number} magnitude - The earthquake magnitude to determine the icon color.
 * @returns {L.DivIcon} A Leaflet DivIcon instance.
 */
const createEpicenterIcon = (magnitude) => {
  const fillColor = getMagnitudeColor(magnitude);

  const rings = Array(3).fill(0).map((_, i) => `
    <circle
      cx="0" cy="0" r="5"
      stroke="${fillColor}" stroke-width="4" fill="none" stroke-opacity="0.6">
      <animate attributeName="r" from="5" to="30" dur="2.5s" begin="${i * 0.8}s" repeatCount="indefinite"/>
      <animate attributeName="stroke-opacity" from="0.6" to="0" dur="2.5s" begin="${i * 0.8}s" repeatCount="indefinite"/>
    </circle>
    <circle
      cx="0" cy="0" r="5"
      stroke="${fillColor}" stroke-width="2" fill="none" stroke-opacity="1">
      <animate attributeName="r" from="5" to="25" dur="2.5s" begin="${i * 0.8}s" repeatCount="indefinite"/>
      <animate attributeName="stroke-opacity" from="1" to="0" dur="2.5s" begin="${i * 0.8}s" repeatCount="indefinite"/>
    </circle>
  `).join('');

  return new L.DivIcon({
    html: `
      <svg width="60" height="60" viewBox="0 0 72 72">
        <g transform="translate(36,36)">
          ${rings}
          <circle cx="0" cy="0" r="6" fill="${fillColor}" stroke="#FFFFFF" stroke-width="1.5"/>
        </g>
      </svg>`,
    className: 'custom-pulsing-icon', // Used to override default Leaflet icon background/border
    iconSize: [60, 60], // Size of the icon
    iconAnchor: [30, 30], // Anchor point of the icon (center for this SVG)
  });
};

/**
 * Creates a custom Leaflet DivIcon for a nearby earthquake.
 * @param {number} magnitude - The earthquake magnitude to determine the icon color.
 * @param {number} time - The time of the earthquake (timestamp).
 * @returns {L.DivIcon} A Leaflet DivIcon instance.
 */
const createNearbyQuakeIcon = (magnitude, time) => {
  const fillColor = getMagnitudeColor(magnitude);
  const currentTime = Date.now();
  const ageInDays = (currentTime - time) / (1000 * 60 * 60 * 24);

  let opacity;
  if (ageInDays < 1) {
    opacity = 1.0;
  } else if (ageInDays < 7) {
    opacity = 0.8;
  } else if (ageInDays < 14) {
    opacity = 0.6;
  } else {
    opacity = 0.4;
  }

  // Convert opacity to 2-digit hex string
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
 * The styling is based on the `Boundary_Type` property of the GeoJSON feature,
 * similar to how it's done in the `InteractiveGlobeView` component.
 *
 * @param {object} feature - The GeoJSON feature object for a tectonic plate boundary.
 * @param {object} feature.properties - Properties of the feature.
 * @param {string} [feature.properties.Boundary_Type] - The type of plate boundary (e.g., 'Convergent', 'Divergent', 'Transform').
 * @returns {object} A Leaflet path style object (color, weight, opacity).
 */
const getTectonicPlateStyle = (feature) => {
  let color = 'rgba(255, 165, 0, 0.8)'; // Default: Orange
  const type = feature?.properties?.Boundary_Type;

  if (type === 'Convergent') {
    color = 'rgba(220, 20, 60, 0.8)'; // Crimson
  } else if (type === 'Divergent') {
    color = 'rgba(60, 179, 113, 0.8)'; // MediumSeaGreen
  } else if (type === 'Transform') {
    color = 'rgba(70, 130, 180, 0.8)'; // SteelBlue
  }

  return {
    color: color,
    weight: 1, // Consistent with InteractiveGlobeView's stroke weight
    opacity: 0.8, // Opacity is handled by the RGBA color string
  };
};

/**
 * `EarthquakeMap` component renders a Leaflet map displaying an earthquake epicenter,
 * its title, a link to its ShakeMap (if available), and tectonic plate boundaries.
 *
 * @param {object} props - The component's props.
 * @param {number} props.latitude - The latitude of the earthquake epicenter.
 * @param {number} props.longitude - The longitude of the earthquake epicenter.
 * @param {number} props.magnitude - The magnitude of the earthquake.
 * @param {string} props.title - The title of the earthquake event.
 * @param {string} [props.shakeMapUrl] - Optional URL to the ShakeMap details page for the earthquake.
 * @param {Array} [props.nearbyQuakes=[]] - Optional array of nearby earthquake objects.
 * @param {string} [props.mainQuakeDetailUrl] - Optional URL for the main quake's internal detail view.
 * @returns {JSX.Element} The rendered EarthquakeMap component.
 */
const EarthquakeMap = ({ latitude, longitude, magnitude, title, shakeMapUrl, nearbyQuakes = [], mainQuakeDetailUrl }) => {
  const position = [latitude, longitude];

  const mapStyle = {
    height: '100%',
    width: '100%',
  };

  return (
    <MapContainer center={position} zoom={8} style={mapStyle}>
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      />
      <Marker position={position} icon={createEpicenterIcon(magnitude)}>
        <Popup>
          <strong>{title}</strong>
          <br />
          Magnitude: {magnitude}
          {mainQuakeDetailUrl && (
            <>
              <br />
              <Link to={`/quake/${encodeURIComponent(mainQuakeDetailUrl)}`} className="text-blue-500 hover:underline">
                View Details
              </Link>
            </>
          )}
          {!mainQuakeDetailUrl && shakeMapUrl && ( // Fallback to ShakeMap if no detail URL provided
            <>
              <br />
              <a href={shakeMapUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                ShakeMap Details (External)
              </a>
            </>
          )}
        </Popup>
      </Marker>
      {nearbyQuakes.map((quake, index) => (
        <Marker
          key={index}
          position={[quake.geometry.coordinates[1], quake.geometry.coordinates[0]]}
          icon={createNearbyQuakeIcon(quake.properties.mag, quake.properties.time)}
        >
          <Popup>
            Magnitude: {quake.properties.mag}
            <br />
            {quake.properties.title}
            <br />
            Time: {formatTimeAgo(quake.properties.time)}
            <br />
            <Link to={`/quake/${encodeURIComponent(quake.properties.detail)}`} className="text-blue-500 hover:underline">
              View Details
            </Link>
          </Popup>
        </Marker>
      ))}
      <GeoJSON data={tectonicPlatesData} style={getTectonicPlateStyle} />
    </MapContainer>
  );
};

export default EarthquakeMap;
