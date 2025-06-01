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

  if (!cluster || !cluster.originalQuakes || cluster.originalQuakes.length === 0) {
    return null;
  }

  const { originalQuakes } = cluster;

  let mapCenter;
  let initialZoom;

  if (originalQuakes.length === 1) {
    const singleQuake = originalQuakes[0];
    mapCenter = [singleQuake.geometry.coordinates[1], singleQuake.geometry.coordinates[0]];
    initialZoom = 10; // Zoom level for a single quake
  } else {
    // Calculate map center for multiple quakes (average lat/lng)
    const latitudes = originalQuakes.map(quake => quake.geometry.coordinates[1]);
    const longitudes = originalQuakes.map(quake => quake.geometry.coordinates[0]);
    const avgLat = latitudes.reduce((sum, lat) => sum + lat, 0) / latitudes.length;
    const avgLng = longitudes.reduce((sum, lng) => sum + lng, 0) / longitudes.length;
    mapCenter = [avgLat, avgLng]; // This center is fine for concentrated points too.

    // Calculate bounds to check for very concentrated clusters
    const bounds = L.latLngBounds(
      originalQuakes.map(quake => [
        quake.geometry.coordinates[1],
        quake.geometry.coordinates[0],
      ])
    );

    if (
      bounds.getSouthWest().equals(bounds.getNorthEast()) ||
      (Math.abs(bounds.getNorthEast().lat - bounds.getSouthWest().lat) < 0.001 && // Refined threshold
       Math.abs(bounds.getNorthEast().lng - bounds.getSouthWest().lng) < 0.001)  // Refined threshold
    ) {
      initialZoom = 10; // Increased zoom for pinpoint clusters
    } else {
      initialZoom = 7; // Fallback zoom, fitBounds will adjust this for spread out clusters
    }
  }

  useEffect(() => {
    // Call fitBounds only if originalQuakes.length > 1 AND initialZoom was NOT set to 13 (pinpoint)
    // or 10 (single quake). The initialZoom for spread out clusters is 7.
    if (mapRef.current && originalQuakes.length > 1 && initialZoom === 7) {
      const bounds = L.latLngBounds(
        originalQuakes.map(quake => [
          quake.geometry.coordinates[1],
          quake.geometry.coordinates[0],
        ])
      );
      // The initialZoom check above should be sufficient to prevent re-zooming pinpoint clusters.
      mapRef.current.fitBounds(bounds, { padding: [0, 0] });
    }
    // For a single quake (initialZoom=10) or pinpoint cluster (initialZoom=13),
    // the view is already set by mapCenter and initialZoom on MapContainer.
  }, [originalQuakes, mapRef, initialZoom]); // Added initialZoom to dependency array as its value now determines effect behavior.
                                 // originalQuakes is the primary data dependency.

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
