import React, { useEffect, useState, memo } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import tectonicPlatesData from '../assets/TectonicPlateBoundaries.json';

// Style function for Tectonic Plates (can be kept as is or moved if preferred)
const getTectonicPlateStyle = (feature) => {
  let color = 'rgba(255, 165, 0, 0.8)'; // Default: Orange
  const boundaryType = feature?.properties?.Boundary_Type;

  if (boundaryType === 'Convergent') {
    color = 'rgba(220, 20, 60, 0.8)'; // Crimson
  } else if (boundaryType === 'Divergent') {
    color = 'rgba(60, 179, 113, 0.8)'; // MediumSeaGreen
  } else if (boundaryType === 'Transform') {
    color = 'rgba(70, 130, 180, 0.8)'; // SteelBlue
  }
  return { color, weight: 1, opacity: 1 };
};

const ClusterMiniMap = ({ cluster, getMagnitudeColor }) => {
  // Initial guard clause
  if (!cluster || !cluster.originalQuakes || cluster.originalQuakes.length === 0) {
    return null;
  }

  const { originalQuakes } = cluster;
  const [map, setMap] = useState(null);

  useEffect(() => {
    if (!map || !originalQuakes || originalQuakes.length === 0) {
      return;
    }

    if (originalQuakes.length === 1) {
      const quake = originalQuakes[0];
      const latLng = [quake.geometry.coordinates[1], quake.geometry.coordinates[0]];
      map.setView(latLng, 8); // Zoom level 6 for single quake
    } else {
      const bounds = L.latLngBounds(
        originalQuakes.map(quake => [
          quake.geometry.coordinates[1],
          quake.geometry.coordinates[0],
        ])
      );
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [10, 10] }); // Padding for multiple quakes
      } else {
        // Fallback if bounds are not valid (e.g., all points identical or invalid)
        // This might happen if originalQuakes has multiple items but they are all at the exact same lat/lng
        // or if coordinates are bad.
        if (originalQuakes[0] && originalQuakes[0].geometry && originalQuakes[0].geometry.coordinates) {
            const fallbackLatLng = [originalQuakes[0].geometry.coordinates[1], originalQuakes[0].geometry.coordinates[0]];
            map.setView(fallbackLatLng, 6); // Default to first quake's location
        } else {
            map.setView([0,0], 2); // Absolute fallback
        }
      }
    }
  }, [map, originalQuakes]);

  // Generate a simple key for MapContainer to help with re-initialization if quakes change drastically
  const mapKey = originalQuakes.length + '-' + (originalQuakes[0] ? originalQuakes[0].id : 'empty');

  return (
    <MapContainer
      key={mapKey}
      style={{ width: '100%', height: '100%' }}
      center={[0, 0]} // Initial center, will be overridden by setView/fitBounds
      zoom={2}        // Initial zoom, will be overridden
      scrollWheelZoom={false}
      whenCreated={setMap} // Capture map instance
      maxZoom={18}
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution='Tiles &copy; Esri &mdash; ... GIS User Community' // Truncated for brevity
      />
      <GeoJSON data={tectonicPlatesData} style={getTectonicPlateStyle} />
      {originalQuakes.map((quake) => (
        <CircleMarker
          key={quake.id}
          center={[quake.geometry.coordinates[1], quake.geometry.coordinates[0]]}
          pathOptions={{
            fillColor: getMagnitudeColor(quake.properties.mag),
            color: '#000',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.7,
          }}
          radius={5 + quake.properties.mag / 2}
        >
          <Tooltip>
            M {quake.properties.mag.toFixed(1)} - {quake.properties.place}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
};

export default memo(ClusterMiniMap); // Keep memoization
