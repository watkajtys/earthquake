import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import tectonicPlatesData from './TectonicPlateBoundaries.json';
import { getMagnitudeColor } from './utils'; // Import getMagnitudeColor

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
      cx="0" cy="0" r="3"
      stroke="${fillColor}" stroke-width="4" fill="none" stroke-opacity="0.6">
      <animate attributeName="r" from="3" to="20" dur="2.5s" begin="${i * 0.8}s" repeatCount="indefinite"/>
      <animate attributeName="stroke-opacity" from="0.6" to="0" dur="2.5s" begin="${i * 0.8}s" repeatCount="indefinite"/>
    </circle>
    <circle
      cx="0" cy="0" r="3"
      stroke="${fillColor}" stroke-width="2" fill="none" stroke-opacity="1">
      <animate attributeName="r" from="3" to="17" dur="2.5s" begin="${i * 0.8}s" repeatCount="indefinite"/>
      <animate attributeName="stroke-opacity" from="1" to="0" dur="2.5s" begin="${i * 0.8}s" repeatCount="indefinite"/>
    </circle>
  `).join('');

  return new L.DivIcon({
    html: `
      <svg width="48" height="48" viewBox="0 0 60 60">
        <g transform="translate(30,30)">
          ${rings}
          <circle cx="0" cy="0" r="4" fill="${fillColor}" stroke="#FFFFFF" stroke-width="1.5"/>
        </g>
      </svg>`,
    className: 'custom-pulsing-icon', // Used to override default Leaflet icon background/border
    iconSize: [48, 48], // Size of the icon
    iconAnchor: [24, 24], // Anchor point of the icon (center for this SVG)
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
 * @returns {JSX.Element} The rendered EarthquakeMap component.
 */
const EarthquakeMap = ({ latitude, longitude, magnitude, title, shakeMapUrl }) => {
  const position = [latitude, longitude];

  const mapStyle = {
    height: '100%',
    width: '100%',
  };

  return (
    <MapContainer center={position} zoom={5} style={mapStyle}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      <Marker position={position} icon={createEpicenterIcon(magnitude)}>
        <Popup>
          <strong>{title}</strong>
          <br />
          Magnitude: {magnitude}
          <br />
          {shakeMapUrl && (
            <a href={shakeMapUrl} target="_blank" rel="noopener noreferrer">
              ShakeMap Details
            </a>
          )}
        </Popup>
      </Marker>
      <GeoJSON data={tectonicPlatesData} style={getTectonicPlateStyle} />
    </MapContainer>
  );
};

export default EarthquakeMap;
