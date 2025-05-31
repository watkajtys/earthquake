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

const EarthquakeMap = ({ latitude, longitude, title, shakeMapUrl }) => {
  const position = [latitude, longitude];

  const mapStyle = {
    height: '100vh',
    width: '100%',
    filter: 'grayscale(100%) brightness(90%) contrast(120%)',
  };

  const tectonicPlatesStyle = {
    color: '#555', // Dark gray for plate boundaries
    weight: 2,
  };

  return (
    <MapContainer center={position} zoom={5} style={mapStyle}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      <Marker position={position}>
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
      <GeoJSON data={tectonicPlatesData} style={tectonicPlatesStyle} />
    </MapContainer>
  );
};

export default EarthquakeMap;
