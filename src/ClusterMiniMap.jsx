import React, { useEffect, useRef } from 'react'; // Added useEffect and useRef
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import tectonicPlatesData from './TectonicPlateBoundaries.json';
// Assuming getMagnitudeColor will be provided as a prop or imported if generalized
// import { getMagnitudeColor } from './utils';

// Style function for Tectonic Plates
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

  return {
    color: color,
    weight: 1, // Adjusted weight
    opacity: 1, // Opacity is handled by the RGBA color string, so path opacity is 1
  };
};

const ClusterMiniMap = ({ cluster, getMagnitudeColor }) => {
  const mapRef = useRef(null);

  if (!cluster || !cluster.originalQuakes || cluster.originalQuakes.length === 0) {
    return null;
  }

  const { originalQuakes } = cluster;

  let mapCenter;
  let initialZoom;

  if (originalQuakes.length === 1) {
    const singleQuake = originalQuakes[0];
    mapCenter = [singleQuake.geometry.coordinates[1], singleQuake.geometry.coordinates[0]];
    initialZoom = 6; // Zoom level for a single quake
  } else {
    // Calculate map center for multiple quakes (average lat/lng)
    const latitudes = originalQuakes.map(quake => quake.geometry.coordinates[1]);
    const longitudes = originalQuakes.map(quake => quake.geometry.coordinates[0]);
    const avgLat = latitudes.reduce((sum, lat) => sum + lat, 0) / latitudes.length;
    const avgLng = longitudes.reduce((sum, lng) => sum + lng, 0) / longitudes.length;
    mapCenter = [avgLat, avgLng];
    initialZoom = 2; // Fallback zoom, fitBounds will adjust this
  }

  useEffect(() => {
    if (mapRef.current && originalQuakes.length > 1) {
      const bounds = L.latLngBounds(
        originalQuakes.map(quake => [
          quake.geometry.coordinates[1],
          quake.geometry.coordinates[0],
        ])
      );
      mapRef.current.fitBounds(bounds, { padding: [20, 20] });
    }
    // For a single quake, the view is already set by mapCenter and initialZoom on MapContainer
  }, [originalQuakes, mapRef]); // mapRef dependency itself doesn't change, but its .current property does.
                                 // originalQuakes is the primary data dependency.

  return (
    <MapContainer
      center={mapCenter}
      zoom={initialZoom}
      style={{ height: '200px', width: '100%' }}
      scrollWheelZoom={false}
      ref={mapRef}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      <GeoJSON
        data={tectonicPlatesData}
        style={getTectonicPlateStyle}
      />
      {originalQuakes.map((quake) => (
        <CircleMarker
          key={quake.id}
          center={[quake.geometry.coordinates[1], quake.geometry.coordinates[0]]}
          pathOptions={{
            fillColor: getMagnitudeColor(quake.properties.mag),
            color: '#000', // Border color
            weight: 1,
            opacity: 1,
            fillOpacity: 0.7,
          }}
          radius={5 + quake.properties.mag / 2} // Radius proportional to magnitude
        >
          <Tooltip>
            M {quake.properties.mag.toFixed(1)} - {quake.properties.place}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
};

export default ClusterMiniMap;
