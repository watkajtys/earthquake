import React, { useRef, useEffect, memo, useState } from 'react'; // Added useState
// PropTypes import removed
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet';
import { Link } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
// import tectonicPlatesData from '../assets/TectonicPlateBoundaries.json'; // Removed for dynamic import
import { getMagnitudeColor, formatTimeAgo } from '../utils/utils.js';

// Corrects issues with Leaflet's default icon paths in some bundlers.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

/**
 * Creates a custom Leaflet DivIcon for the main highlighted earthquake (epicenter).
 * The icon features a pulsing animation for enhanced visibility, with color determined by magnitude.
 * The pulsing animation CSS (`custom-pulsing-icon` and its keyframes) should be defined globally.
 *
 * @param {number} magnitude - The earthquake magnitude, used to determine the icon's color via `getMagnitudeColor`.
 * @returns {L.DivIcon} A Leaflet `L.DivIcon` instance configured for the epicenter.
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
    className: 'custom-pulsing-icon',
    iconSize: [60, 60],
    iconAnchor: [30, 30],
  });
};

/**
 * Creates a custom Leaflet DivIcon for displaying nearby earthquakes.
 * The icon's color is based on magnitude, and its opacity is reduced for older quakes
 * (less than 1 day: 1.0, <7 days: 0.8, <14 days: 0.6, otherwise: 0.4).
 *
 * @param {number} magnitude - The earthquake magnitude, used for color coding.
 * @param {number} time - The timestamp of the earthquake, used to calculate its age and opacity.
 * @returns {L.DivIcon} A Leaflet `L.DivIcon` instance for a nearby quake.
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
 * Defines the styling for tectonic plate boundary GeoJSON features.
 * The color of the boundary line varies based on its type (Convergent, Divergent, Transform).
 *
 * @param {Object} feature - The GeoJSON feature representing a tectonic plate boundary.
 *                           Expected to have `feature.properties.Boundary_Type`.
 * @returns {Object} A Leaflet path style options object for the feature.
 */
const getTectonicPlateStyle = (feature) => {
  let color = 'rgba(255, 165, 0, 0.8)'; // Default for other/unknown types
  const type = feature?.properties?.Boundary_Type;
  if (type === 'Convergent') color = 'rgba(220, 20, 60, 0.8)';
  else if (type === 'Divergent') color = 'rgba(60, 179, 113, 0.8)';
  else if (type === 'Transform') color = 'rgba(70, 130, 180, 0.8)'; // Blue for Transform
  return { color, weight: 1, opacity: 0.8 };
};

/**
 * Renders an interactive Leaflet map to display earthquake information.
 * Key features include:
 * - Displaying a main highlighted earthquake with a pulsing icon.
 * - Showing nearby earthquakes with icons whose opacity varies by age.
 * - Optionally displaying tectonic plate boundaries (dynamically imported GeoJSON).
 * - Ability to fit the map bounds to show all displayed quakes or center on a specific point.
 * - Customizable map zoom and center.
 * The component is memoized for performance optimization.
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {number} props.mapCenterLatitude - Initial latitude for the map center.
 * @param {number} props.mapCenterLongitude - Initial longitude for the map center.
 * @param {number} [props.highlightQuakeLatitude] - Latitude of the main earthquake to highlight.
 * @param {number} [props.highlightQuakeLongitude] - Longitude of the main earthquake to highlight.
 * @param {number} [props.highlightQuakeMagnitude] - Magnitude of the main earthquake, used for icon styling.
 * @param {string} [props.highlightQuakeTitle=''] - Title for the popup of the highlighted earthquake.
 * @param {string|null} [props.shakeMapUrl=null] - URL to a ShakeMap for the highlighted earthquake (external link).
 * @param {Array<Object>} [props.nearbyQuakes=[]] - Array of nearby earthquake objects (USGS GeoJSON feature structure) to display.
 *   Each object should have `id`, `geometry.coordinates`, `properties.mag`, `properties.time`, and optionally `properties.place`/`title`, `properties.detail`.
 * @param {string|null} [props.mainQuakeDetailUrl=null] - Internal application URL for the detail page of the highlighted quake.
 * @param {boolean} [props.fitMapToBounds=false] - If true, the map will adjust its bounds to show all plotted quakes. If false, it uses `defaultZoom`.
 * @param {number} [props.defaultZoom=8] - Default zoom level for the map if not fitting to bounds or if only one point is shown.
 * @returns {JSX.Element} The EarthquakeMap component.
 */
const EarthquakeMap = ({
  mapCenterLatitude,
  mapCenterLongitude,
  highlightQuakeLatitude = undefined,
  highlightQuakeLongitude = undefined,
  highlightQuakeMagnitude = undefined,
  highlightQuakeTitle = '',
  shakeMapUrl = null,
  nearbyQuakes = [],
  mainQuakeDetailUrl = null,
  fitMapToBounds = false,
  defaultZoom = 8,
}) => {
  const mapRef = useRef(null);
  const [tectonicPlatesDataJson, setTectonicPlatesDataJson] = useState(null);
  const [isTectonicPlatesLoading, setIsTectonicPlatesLoading] = useState(true);

  const initialMapCenter = [mapCenterLatitude, mapCenterLongitude];
  const highlightedQuakePosition = highlightQuakeLatitude !== undefined && highlightQuakeLongitude !== undefined
    ? [highlightQuakeLatitude, highlightQuakeLongitude]
    : null;

  const mapStyle = {
    height: '100%',
    width: '100%',
  };

  useEffect(() => {
    const mapInstance = mapRef.current;
    if (!mapInstance) {
      return;
    }

    if (fitMapToBounds) {
      const allPoints = [];
      if (highlightedQuakePosition) {
        allPoints.push(highlightedQuakePosition);
      }
      nearbyQuakes.forEach(quake => {
        if (quake.geometry && quake.geometry.coordinates) {
          const lat = parseFloat(quake.geometry.coordinates[1]);
          const lon = parseFloat(quake.geometry.coordinates[0]);
          if (!isNaN(lat) && !isNaN(lon)) {
            allPoints.push([lat, lon]);
          }
        }
      });

      if (allPoints.length > 1) {
        const bounds = L.latLngBounds(allPoints.map(point => L.latLng(point[0], point[1])));
        mapInstance.fitBounds(bounds, { padding: [50, 50] });
      } else if (allPoints.length === 1) {
        mapInstance.setView(L.latLng(allPoints[0][0], allPoints[0][1]), defaultZoom);
      } else {
        mapInstance.setView(L.latLng(initialMapCenter[0], initialMapCenter[1]), defaultZoom);
      }
    } else {
      mapInstance.setView(L.latLng(initialMapCenter[0], initialMapCenter[1]), defaultZoom);
    }
  }, [
    mapCenterLatitude, mapCenterLongitude,
    highlightQuakeLatitude, highlightQuakeLongitude,
    nearbyQuakes,
    fitMapToBounds,
    defaultZoom,
    mapRef,
    initialMapCenter,
    highlightedQuakePosition
  ]);

  useEffect(() => {
    let isMounted = true;
    const loadTectonicPlates = async () => {
      setIsTectonicPlatesLoading(true);
      try {
        const platesData = await import('../assets/TectonicPlateBoundaries.json');
        if (isMounted) {
          setTectonicPlatesDataJson(platesData.default);
        }
      } catch (error) {
        console.error("Error loading tectonic plates data:", error);
      } finally {
        if (isMounted) {
          setIsTectonicPlatesLoading(false);
        }
      }
    };
    loadTectonicPlates();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <MapContainer
      center={initialMapCenter}
      zoom={defaultZoom}
      style={mapStyle}
      ref={mapRef}
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      />

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
            {!mainQuakeDetailUrl && shakeMapUrl && (
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

      {nearbyQuakes.map((quake, index) => {
        if (!quake.geometry || !quake.geometry.coordinates || typeof quake.properties?.mag !== 'number' || typeof quake.properties?.time !== 'number') {
          console.warn("Skipping rendering of nearby quake due to missing data:", quake);
          return null;
        }
        return (
          <Marker
            key={quake.id || index}
            position={[quake.geometry.coordinates[1], quake.geometry.coordinates[0]]}
            icon={createNearbyQuakeIcon(quake.properties.mag, quake.properties.time)}
          >
            <Popup>
              Magnitude: {quake.properties.mag.toFixed(1)}
              <br />
              {quake.properties.place || quake.properties.title || 'N/A'}
              <br />
              Time: {formatTimeAgo(quake.properties.time)}
              <br />
              {quake.properties.detail && (
                 <Link to={`/quake/${encodeURIComponent(quake.properties.detail)}`} className="text-blue-500 hover:underline">
                   View Details
                 </Link>
              )}
            </Popup>
          </Marker>
        );
      })}

      {!isTectonicPlatesLoading && tectonicPlatesDataJson && (
        <GeoJSON data={tectonicPlatesDataJson} style={getTectonicPlateStyle} />
      )}
    </MapContainer>
  );
};

// PropTypes and defaultProps blocks removed.

export default memo(EarthquakeMap);
