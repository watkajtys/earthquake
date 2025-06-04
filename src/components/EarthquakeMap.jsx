import React, { useRef, useEffect, memo } from 'react';
import PropTypes from 'prop-types';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet';
import { Link } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import tectonicPlatesData from '../assets/TectonicPlateBoundaries.json';
import { getMagnitudeColor, formatTimeAgo } from '../utils/utils.js';

// Corrects issues with Leaflet's default icon paths in some bundlers.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

/**
 * Custom Leaflet DivIcon for displaying the highlighted earthquake (epicenter).
 * Features a pulsing animation for better visibility.
 * The animation (`pulse`) is defined in global CSS (e.g., App.css or index.css).
 * @param {number} magnitude - The earthquake magnitude to determine the icon color.
 * @returns {L.DivIcon} A Leaflet DivIcon instance.
 */
const createEpicenterIcon = (magnitude) => {
  const fillColor = getMagnitudeColor(magnitude);
  // SVG for pulsing rings animation.
  const rings = Array(3).fill(0).map((_, i) => `
    <circle cx="0" cy="0" r="5" stroke="${fillColor}" stroke-width="4" fill="none" stroke-opacity="0.6">
      <animate attributeName="r" from="5" to="30" dur="2.5s" begin="${i * 0.8}s" repeatCount="indefinite"/>
      <animate attributeName="stroke-opacity" from="0.6" to="0" dur="2.5s" begin="${i * 0.8}s" repeatCount="indefinite"/>
    </circle>
    <circle cx="0" cy="0" r="5" stroke="${fillColor}" stroke-width="2" fill="none" stroke-opacity="1">
      <animate attributeName="r" from="5" to="25" dur="2.5s" begin="${i * 0.8}s" repeatCount="indefinite"/>
      <animate attributeName="stroke-opacity" from="1" to="0" dur="2.5s" begin="${i * 0.8}s" repeatCount="indefinite"/>
    </circle>
  `).join('');
  return new L.DivIcon({
    html: `<svg width="60" height="60" viewBox="0 0 72 72"><g transform="translate(36,36)">${rings}<circle cx="0" cy="0" r="6" fill="${fillColor}" stroke="#FFFFFF" stroke-width="1.5"/></g></svg>`,
    className: 'custom-pulsing-icon', // Used to override default Leaflet icon background/border
    iconSize: [60, 60],
    iconAnchor: [30, 30], // Anchor point of the icon (center for this SVG)
  });
};

/**
 * Creates a custom Leaflet DivIcon for a nearby earthquake.
 * Opacity varies based on the age of the quake.
 * @param {number} magnitude - The earthquake magnitude to determine the icon color.
 * @param {number} time - The time of the earthquake (timestamp).
 * @returns {L.DivIcon} A Leaflet DivIcon instance.
 */
const createNearbyQuakeIcon = (magnitude, time) => {
  const fillColor = getMagnitudeColor(magnitude);
  const currentTime = Date.now();
  const ageInDays = (currentTime - time) / (1000 * 60 * 60 * 24);
  let opacity;
  if (ageInDays < 1) opacity = 1.0;
  else if (ageInDays < 7) opacity = 0.8;
  else if (ageInDays < 14) opacity = 0.6;
  else opacity = 0.4;
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
 * Color varies based on the boundary type (Convergent, Divergent, Transform).
 * @param {object} feature - The GeoJSON feature representing a tectonic plate boundary.
 * @returns {object} Leaflet path style options for the feature.
 */
const getTectonicPlateStyle = (feature) => {
  let color = 'rgba(255, 165, 0, 0.8)'; // Default: Orange
  const type = feature?.properties?.Boundary_Type;
  if (type === 'Convergent') color = 'rgba(220, 20, 60, 0.8)'; // Crimson
  else if (type === 'Divergent') color = 'rgba(60, 179, 113, 0.8)'; // MediumSeaGreen
  else if (type === 'Transform') color = 'rgba(70, 130, 180, 0.8)'; // SteelBlue
  return { color, weight: 1, opacity: 0.8 };
};

/**
 * `EarthquakeMap` is a React component that renders a Leaflet map.
 *
 * Key Features:
 * - Displays a main "highlighted" earthquake with a pulsing marker and popup information.
 * - Can display additional "nearby" earthquakes with smaller, less prominent markers.
 * - Shows tectonic plate boundaries.
 * - Map View Control:
 *   - The map is initially centered using `mapCenterLatitude` and `mapCenterLongitude`.
 *   - If `fitMapToBounds` is true, the map view dynamically adjusts to encompass the
 *     highlighted quake (if provided) and all nearby quakes. Padding is added to ensure
 *     markers are not at the very edge of the map.
 *   - If `fitMapToBounds` is true and only one point (highlighted quake or a single nearby quake
 *     if no highlight quake) is available, the map centers on that point with `defaultZoom`.
 *   - If `fitMapToBounds` is true and no points are available (no highlight, no nearby),
 *     it centers on `mapCenterLatitude/Longitude` with `defaultZoom`.
 *   - If `fitMapToBounds` is false, the map remains centered on `mapCenterLatitude/Longitude`
 *     with `defaultZoom`, regardless of quake locations.
 *
 * Props are type-checked using PropTypes, and defaults are provided for optional props.
 * The component is memoized using `React.memo` for performance optimization.
 */
const EarthquakeMap = ({
  mapCenterLatitude,
  mapCenterLongitude,
  highlightQuakeLatitude,
  highlightQuakeLongitude,
  highlightQuakeMagnitude,
  highlightQuakeTitle,
  shakeMapUrl,
  nearbyQuakes,
  mainQuakeDetailUrl,
  fitMapToBounds,
  defaultZoom,
}) => {
  const mapRef = useRef(null); // Ref to access the Leaflet map instance directly.

  // Derived state: initial center for the map.
  const initialMapCenter = [mapCenterLatitude, mapCenterLongitude];
  // Derived state: position of the main quake to be highlighted. Null if not provided.
  const highlightedQuakePosition = highlightQuakeLatitude !== undefined && highlightQuakeLongitude !== undefined
    ? [highlightQuakeLatitude, highlightQuakeLongitude]
    : null;

  const mapStyle = {
    height: '100%',
    width: '100%',
  };

  // This useEffect hook is responsible for adjusting the map's view (center and zoom)
  // based on the provided props, particularly `fitMapToBounds`.
  useEffect(() => {
    const mapInstance = mapRef.current;
    if (!mapInstance) {
      return; // Map is not yet available.
    }

    if (fitMapToBounds) {
      // Logic for when the map should fit its bounds to the displayed quakes.
      const allPoints = [];
      if (highlightedQuakePosition) {
        allPoints.push(highlightedQuakePosition); // Add highlighted quake first.
      }
      nearbyQuakes.forEach(quake => {
        // Ensure nearby quakes have valid coordinates before adding.
        if (quake.geometry && quake.geometry.coordinates) {
          const lat = parseFloat(quake.geometry.coordinates[1]);
          const lon = parseFloat(quake.geometry.coordinates[0]);
          if (!isNaN(lat) && !isNaN(lon)) {
            allPoints.push([lat, lon]);
          }
        }
      });

      if (allPoints.length > 1) {
        // If there are multiple points, calculate bounds and fit the map.
        const bounds = L.latLngBounds(allPoints.map(point => L.latLng(point[0], point[1])));
        mapInstance.fitBounds(bounds, { padding: [50, 50] }); // Padding ensures markers aren't at the edge.
      } else if (allPoints.length === 1) {
        // If only one point, center on that point with the default zoom.
        mapInstance.setView(L.latLng(allPoints[0][0], allPoints[0][1]), defaultZoom);
      } else {
        // No points to fit (e.g., no highlight quake, no nearby quakes).
        // Default to centering on the initialMapCenter with defaultZoom.
        mapInstance.setView(L.latLng(initialMapCenter[0], initialMapCenter[1]), defaultZoom);
      }
    } else {
      // If `fitMapToBounds` is false, explicitly set the view to the initial map center and default zoom.
      // This ensures the map resets to this view if `fitMapToBounds` changes from true to false.
      mapInstance.setView(L.latLng(initialMapCenter[0], initialMapCenter[1]), defaultZoom);
    }
  }, [
    // Dependencies for the useEffect:
    mapCenterLatitude, mapCenterLongitude,   // Changes to map's desired center.
    highlightQuakeLatitude, highlightQuakeLongitude, // Changes to the highlighted quake's position.
    nearbyQuakes,                           // Changes in the list of nearby quakes.
    fitMapToBounds,                         // Change in the bounds fitting behavior.
    defaultZoom,                            // Change in the default zoom level.
    mapRef,                                 // The map instance ref (though mapRef.current is used, mapRef itself is stable).
    initialMapCenter,                       // Derived from mapCenterLat/Lon, ensures effect runs if these change.
    highlightedQuakePosition                // Derived from highlightQuakeLat/Lon.
  ]);

  return (
    <MapContainer
      center={initialMapCenter} // Initial center, may be overridden by useEffect.
      zoom={defaultZoom}       // Initial zoom, may be overridden by useEffect.
      style={mapStyle}
      ref={mapRef}             // Assign the ref to the MapContainer.
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      />

      {/* Render the main highlighted earthquake marker if its position and magnitude are valid. */}
      {highlightedQuakePosition && highlightQuakeMagnitude !== undefined && (
        <Marker position={highlightedQuakePosition} icon={createEpicenterIcon(highlightQuakeMagnitude)}>
          <Popup>
            <strong>{highlightQuakeTitle || 'Highlighted Quake'}</strong>
            <br />
            Magnitude: {highlightQuakeMagnitude}
            {mainQuakeDetailUrl && (
              <>
                <br />
                <Link to={`/quake/${encodeURIComponent(mainQuakeDetailUrl)}`} className="text-blue-500 hover:underline">
                  View Details
                </Link>
              </>
            )}
            {!mainQuakeDetailUrl && shakeMapUrl && ( // Fallback to ShakeMap link if no mainQuakeDetailUrl
              <>
                <br />
                <a href={shakeMapUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                  ShakeMap Details (External)
                </a>
              </>
            )}
          </Popup>
        </Marker>
      )}

      {/* Render markers for nearby earthquakes. */}
      {nearbyQuakes.map((quake, index) => {
        // Basic validation for nearby quake data before attempting to render.
        if (!quake.geometry || !quake.geometry.coordinates || typeof quake.properties?.mag !== 'number' || typeof quake.properties?.time !== 'number') {
          console.warn("Skipping rendering of nearby quake due to missing data:", quake);
          return null; // Skip this marker if data is incomplete.
        }
        return (
          <Marker
            key={quake.id || index} // Use quake.id if available, otherwise fallback to index.
            position={[quake.geometry.coordinates[1], quake.geometry.coordinates[0]]}
            icon={createNearbyQuakeIcon(quake.properties.mag, quake.properties.time)}
          >
            <Popup>
              Magnitude: {quake.properties.mag.toFixed(1)}
              <br />
              {quake.properties.place || quake.properties.title || 'N/A'} {/* Use place, fallback to title, then N/A. */}
              <br />
              Time: {formatTimeAgo(quake.properties.time)}
              <br />
              {quake.properties.detail && ( // Link to detail view if available.
                 <Link to={`/quake/${encodeURIComponent(quake.properties.detail)}`} className="text-blue-500 hover:underline">
                   View Details
                 </Link>
              )}
            </Popup>
          </Marker>
        );
      })}

      {/* Render Tectonic Plate Boundaries. */}
      <GeoJSON data={tectonicPlatesData} style={getTectonicPlateStyle} />
    </MapContainer>
  );
};

// PropTypes for type checking and component documentation.
EarthquakeMap.propTypes = {
  mapCenterLatitude: PropTypes.number.isRequired,
  mapCenterLongitude: PropTypes.number.isRequired,
  highlightQuakeLatitude: PropTypes.number,
  highlightQuakeLongitude: PropTypes.number,
  highlightQuakeMagnitude: PropTypes.number,
  highlightQuakeTitle: PropTypes.string,
  shakeMapUrl: PropTypes.string,
  nearbyQuakes: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    geometry: PropTypes.shape({
        coordinates: PropTypes.arrayOf(PropTypes.number).isRequired
    }).isRequired,
    properties: PropTypes.shape({
        mag: PropTypes.number,
        place: PropTypes.string,
        title: PropTypes.string,
        time: PropTypes.number,
        detail: PropTypes.string
    }).isRequired,
  })),
  mainQuakeDetailUrl: PropTypes.string,
  fitMapToBounds: PropTypes.bool,
  defaultZoom: PropTypes.number,
};

// Default values for optional props.
EarthquakeMap.defaultProps = {
  highlightQuakeLatitude: undefined,
  highlightQuakeLongitude: undefined,
  highlightQuakeMagnitude: undefined,
  highlightQuakeTitle: '', // Default title for highlighted quake if none provided.
  shakeMapUrl: null,
  nearbyQuakes: [],
  mainQuakeDetailUrl: null,
  fitMapToBounds: false,
  defaultZoom: 8,
};

export default memo(EarthquakeMap);
