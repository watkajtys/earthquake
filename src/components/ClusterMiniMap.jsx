import React, { useEffect, useRef } from 'react'; // Added useEffect and useRef
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import tectonicPlatesData from '../assets/TectonicPlateBoundaries.json'; // Corrected path
// Assuming getMagnitudeColor will be provided as a prop or imported if generalized
// import { getMagnitudeColor } from './utils';

// Style function for Tectonic Plates
/**
 * Determines the style for tectonic plate boundary features on the map.
 * Color varies based on the boundary type (Convergent, Divergent, Transform).
 * @param {object} feature - The GeoJSON feature representing a tectonic plate boundary.
 * @returns {object} Leaflet path style options for the feature.
 */
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

/**
 * Renders a small Leaflet map to visualize the geographic distribution of earthquakes within a cluster.
 * It displays each earthquake as a CircleMarker, sized and colored by its magnitude,
 * and shows tectonic plate boundaries. The map automatically adjusts its center and zoom level
 * based on the spread of the earthquakes in the cluster.
 *
 * @param {object} props - The component's props.
 * @param {object} props.cluster - The cluster data. Must contain an `originalQuakes` array.
 * @param {Array<object>} props.cluster.originalQuakes - An array of earthquake objects. Each object is expected
 *   to have `id`, `geometry.coordinates` (lng, lat, depth), and `properties.mag` (magnitude) and `properties.place`.
 * @param {function} props.getMagnitudeColor - A function that takes an earthquake's magnitude
 *   and returns a color string for its marker.
 * @returns {JSX.Element | null} The rendered Leaflet map component or null if cluster data is invalid.
 */
const ClusterMiniMap = ({ cluster, getMagnitudeColor }) => {
  const mapRef = useRef(null);

  // Filter for plottable quakes first
  const plottableQuakes = (cluster?.originalQuakes || []).filter(q =>
    q.geometry &&
    Array.isArray(q.geometry.coordinates) &&
    typeof q.geometry.coordinates[0] === 'number' &&
    typeof q.geometry.coordinates[1] === 'number'
  );

  if (!plottableQuakes.length) { // If no quakes can be plotted, render a message
    return <div className="text-center text-slate-500 text-xs py-4">Map data unavailable for this cluster.</div>;
  }

  let mapCenter;
  let initialZoom;

  if (plottableQuakes.length === 1) {
    const singleQuake = plottableQuakes[0];
    mapCenter = [singleQuake.geometry.coordinates[1], singleQuake.geometry.coordinates[0]];
    initialZoom = 10; // Zoom level for a single quake
  } else {
    // Calculate map center for multiple quakes (average lat/lng)
    const latitudes = plottableQuakes.map(quake => quake.geometry.coordinates[1]);
    const longitudes = plottableQuakes.map(quake => quake.geometry.coordinates[0]);
    const avgLat = latitudes.reduce((sum, lat) => sum + lat, 0) / latitudes.length;
    const avgLng = longitudes.reduce((sum, lng) => sum + lng, 0) / longitudes.length;
    mapCenter = [avgLat, avgLng];

    // Calculate bounds to check for very concentrated clusters
    const bounds = L.latLngBounds(
      plottableQuakes.map(quake => [
        quake.geometry.coordinates[1],
        quake.geometry.coordinates[0],
      ])
    );

    if (
      bounds.getSouthWest().equals(bounds.getNorthEast()) ||
      (Math.abs(bounds.getNorthEast().lat - bounds.getSouthWest().lat) < 0.001 &&
       Math.abs(bounds.getNorthEast().lng - bounds.getSouthWest().lng) < 0.001)
    ) {
      initialZoom = 10; // Increased zoom for pinpoint clusters
    } else {
      initialZoom = 7; // Fallback zoom, fitBounds will adjust this
    }
  }

  useEffect(() => {
    // Call fitBounds only if plottableQuakes.length > 1 AND initialZoom was NOT set for pinpoint/single.
    if (mapRef.current && plottableQuakes.length > 1 && initialZoom === 7) {
      const bounds = L.latLngBounds(
        plottableQuakes.map(quake => [
          quake.geometry.coordinates[1],
          quake.geometry.coordinates[0],
        ])
      );
      mapRef.current.fitBounds(bounds, { padding: [0, 0] });
    }
  }, [plottableQuakes, mapRef, initialZoom]); // Use plottableQuakes in dependencies

  return (
    <MapContainer
      center={mapCenter}
      zoom={initialZoom}
      style={{ height: '200px', width: '100%' }}
      scrollWheelZoom={false}
      ref={mapRef}
      maxZoom={18}
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      />
      <GeoJSON
        data={tectonicPlatesData}
        style={getTectonicPlateStyle}
      />
      {plottableQuakes.map((quake) => (
        <CircleMarker
          key={quake.id}
          center={[quake.geometry.coordinates[1], quake.geometry.coordinates[0]]} // Already validated
          pathOptions={{
            fillColor: getMagnitudeColor(quake.properties?.mag), // Safe access
            color: '#000', // Border color
            weight: 1,
            opacity: 1,
            fillOpacity: 0.7,
          }}
          radius={5 + (quake.properties?.mag ?? 0) / 2} // Safe access and default for radius
        >
          <Tooltip>
            M {quake.properties?.mag?.toFixed(1) ?? 'N/A'} - {quake.properties?.place || 'Unknown place'}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
};

export default ClusterMiniMap;
