import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Import tectonic plates data and styling function from EarthquakeMap.jsx or a shared utils file
// For now, let's assume they might be moved to utils or directly imported if kept in EarthquakeMap
// This might need adjustment based on actual project structure for shared resources.
import tectonicPlatesData from './TectonicPlateBoundaries.json';
import { getTectonicPlateStyle } from './utils'; // Import the utility function

// Corrects issues with Leaflet's default icon paths in some bundlers (copied from EarthquakeMap.jsx)
// This might not be strictly necessary if no default markers are used, but good for consistency.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

/**
 * `MiniMap` component renders a small Leaflet map, typically showing an overview
 * or a related geographical context, like an antipodal view.
 *
 * @param {object} props - The component's props.
 * @param {number} [props.centerLat=0] - The latitude for the center of the mini-map (used if no clusterQuakes).
 * @param {number} [props.centerLng=0] - The longitude for the center of the mini-map (used if no clusterQuakes).
 * @param {number} [props.zoomLevel=1] - The zoom level for the mini-map (used if no clusterQuakes or single clusterQuake).
 * @param {object} [props.mainQuakeCoordinates=null] - Optional coordinates for a main earthquake marker (single point mode).
 * @param {object} [props.antipodalMarkerCoordinates=null] - Optional coordinates for an antipodal marker (single point mode).
 * @param {Array<object>} [props.clusterQuakes=null] - Array of earthquake features for cluster display.
 */
const MiniMap = ({
  centerLat = 0,
  centerLng = 0,
  zoomLevel = 1,
  mainQuakeCoordinates = null,
  antipodalMarkerCoordinates = null,
  clusterQuakes = null
}) => {
  const [mapInstance, setMapInstance] = useState(null);
  const clusterMarkersLayerRef = useRef(null); // To manage cluster markers layer

  const position = [centerLat, centerLng]; // Default position if no clusterQuakes

  const mapStyle = {
    height: '220px', // Increased height for better overview
    width: '100%',   // Take full width of its container
    borderRadius: '8px',
    border: '1px solid #4A5568', // Tailwind gray-600
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)', // Tailwind shadow-lg
  };

  // A simple dot icon for the main quake location on the mini-map (optional)
  const mainQuakeIcon = mainQuakeCoordinates ? new L.DivIcon({
    html: `<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#FF0000" stroke="#FFFFFF" stroke-width="1"/></svg>`,
    className: 'custom-simple-dot-icon',
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  }) : null;

  // Icon for the antipodal point
  const antipodalIcon = antipodalMarkerCoordinates ? new L.DivIcon({
    html: `<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="#4A90E2" stroke="#FFFFFF" stroke-width="1.5"/></svg>`, // Blue dot
    className: 'custom-antipodal-dot-icon',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  }) : null;

  // Effect to handle map view and markers for clusterQuakes
  useEffect(() => {
    if (mapInstance) {
      // Clear previous cluster markers if any
      if (clusterMarkersLayerRef.current) {
        clusterMarkersLayerRef.current.clearLayers();
      }

      if (clusterQuakes && clusterQuakes.length > 0) {
        const points = clusterQuakes.map(quake => {
          const [lon, lat] = quake.geometry.coordinates;
          return L.latLng(lat, lon);
        });

        if (points.length > 0) {
          const bounds = L.latLngBounds(points);
          mapInstance.fitBounds(bounds.pad(0.15)); // 15% padding

          // Create a new feature group for cluster markers
          clusterMarkersLayerRef.current = L.featureGroup();

          points.forEach((point, index) => {
            const quake = clusterQuakes[index];
            L.circleMarker(point, {
              radius: 4,
              fillColor: "#ff7800", // A distinct orange color for cluster points
              color: "#000",
              weight: 0.5,
              opacity: 1,
              fillOpacity: 0.8
            }).bindTooltip(`M ${quake.properties.mag?.toFixed(1) || 'N/A'} - ${quake.properties.place || 'Unknown'}`)
              .addTo(clusterMarkersLayerRef.current);
          });
          clusterMarkersLayerRef.current.addTo(mapInstance);
        }
      } else {
        // Fallback to default center/zoom if no cluster or single point mode
        mapInstance.setView(position, zoomLevel);
      }
    }
  }, [mapInstance, clusterQuakes, position, zoomLevel]); // position and zoomLevel added for single point mode updates

  return (
    <MapContainer
        center={position}
        zoom={zoomLevel}
        style={mapStyle}
        dragging={false}
        zoomControl={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        attributionControl={false}
        whenCreated={setMapInstance} // Get map instance
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <GeoJSON
        data={tectonicPlatesData}
        style={(feature) => getTectonicPlateStyle(feature, { defaultWeight: 0.5, defaultOpacity: 0.7 })}
      />

      {/* Render single point markers only if clusterQuakes is not provided or empty */}
      {(!clusterQuakes || clusterQuakes.length === 0) && (
        <>
          {mainQuakeCoordinates && mainQuakeIcon && (
            <Marker position={[mainQuakeCoordinates.lat, mainQuakeCoordinates.lng]} icon={mainQuakeIcon} />
          )}
          {antipodalMarkerCoordinates && antipodalIcon && (
            <Marker position={[antipodalMarkerCoordinates.lat, antipodalMarkerCoordinates.lng]} icon={antipodalIcon} />
          )}
        </>
      )}
    </MapContainer>
  );
};

export default MiniMap;
