import React from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import tectonicPlatesData from './TectonicPlateBoundaries.json';
// Assuming getMagnitudeColor will be provided as a prop or imported if generalized
// import { getMagnitudeColor } from './utils';

// Style function for Tectonic Plates
const getTectonicPlateStyle = () => {
  return {
    color: '#ff7800', // Orange color for plate boundaries
    weight: 2,
    opacity: 0.65,
  };
};

const ClusterMiniMap = ({ cluster, getMagnitudeColor }) => {
  if (!cluster || !cluster.originalQuakes || cluster.originalQuakes.length === 0) {
    return null; // Or <div />;
  }

  const { originalQuakes } = cluster;

  // Calculate map center
  const latitudes = originalQuakes.map(quake => quake.geometry.coordinates[1]);
  const longitudes = originalQuakes.map(quake => quake.geometry.coordinates[0]);
  const avgLat = latitudes.reduce((sum, lat) => sum + lat, 0) / latitudes.length;
  const avgLng = longitudes.reduce((sum, lng) => sum + lng, 0) / longitudes.length;
  const mapCenter = [avgLat, avgLng];

  // Determine zoom level - this is a simplified approach
  // For a more accurate zoom, we'd calculate bounds and use map.fitBounds
  // let mapZoom = 2; // Default zoom
  // If there's only one quake, zoom in more
  // if (originalQuakes.length === 1) {
  //   mapZoom = 5;
  // } else {
    // Basic bounding box calculation to adjust zoom
    const latDiff = Math.max(...latitudes) - Math.min(...latitudes);
    const lngDiff = Math.max(...longitudes) - Math.min(...longitudes);
    const maxDiff = Math.max(latDiff, lngDiff);

    if (maxDiff < 1) mapZoom = 7;
    else if (maxDiff < 2) mapZoom = 6;
    else if (maxDiff < 5) mapZoom = 5;
    else if (maxDiff < 10) mapZoom = 4;
    else if (maxDiff < 20) mapZoom = 3;
    else mapZoom = 2;
  // }
  // A simpler fixed zoom for now, can be refined with map.fitBounds if leaflet instance is available
  let mapZoom = 3;
   if (originalQuakes.length > 0) {
    const bounds = L.latLngBounds(originalQuakes.map(quake => [quake.geometry.coordinates[1], quake.geometry.coordinates[0]]));
    // This is tricky without a map instance to call fitBounds on initially.
    // We might need to pass a ref to MapContainer and use a useEffect to fitBounds.
    // For now, we'll use a simpler zoom calculation or a fixed one.
    // If bounds are very small (e.g. single point or very close points)
    if (bounds.getSouthWest().equals(bounds.getNorthEast()) || (bounds.getNorthEast().lat - bounds.getSouthWest().lat < 1 && bounds.getNorthEast().lng - bounds.getSouthWest().lng < 1) ) {
        mapZoom = 6;
    } else if (bounds.getNorthEast().lat - bounds.getSouthWest().lat < 5 && bounds.getNorthEast().lng - bounds.getSouthWest().lng < 5) {
        mapZoom = 4;
    }
    // else keep mapZoom = 3 or 2
  }


  return (
    <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '200px', width: '100%' }} scrollWheelZoom={false}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
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
