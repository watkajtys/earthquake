import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import tectonicPlatesData from './TectonicPlateBoundaries.json';

// Custom icon for markers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Custom pulsing icon for the epicenter
const epicenterIcon = new L.DivIcon({
  html: `
    <svg width="24" height="24" viewBox="0 0 24 24" style="transform-origin: center; animation: pulse 1.5s infinite;">
      <circle cx="12" cy="12" r="8" fill="#ff0000" stroke="#fff" stroke-width="2"/>
      <circle cx="12" cy="12" r="4" fill="#ffae00"/>
    </svg>`,
  className: 'custom-pulsing-icon', // Important for removing default Leaflet icon styling
  iconSize: [24, 24],
  iconAnchor: [12, 12], // Anchor point of the icon (center)
});


const EarthquakeMap = ({ latitude, longitude, title, shakeMapUrl }) => {
  const position = [latitude, longitude];

  const mapStyle = {
    height: '100%', // Changed from 100vh to 100%
    width: '100%',
    filter: 'grayscale(100%) brightness(90%) contrast(120%)',
  };

  // Function to determine tectonic plate style, similar to InteractiveGlobeView
  const getTectonicPlateStyle = (feature) => {
    let color = 'rgba(255, 165, 0, 0.8)'; // Default Orange
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
      weight: 1, // Matching stroke: 1 from InteractiveGlobeView
      opacity: 0.8, // Ensured by the rgba color strings
    };
  };

  return (
    <MapContainer center={position} zoom={5} style={mapStyle}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      <Marker position={position} icon={epicenterIcon}>
        <Popup>
          <strong>{title}</strong>
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
