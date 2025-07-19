/**
 * @file EarthquakeMap.jsx
 * @description This component renders an interactive Leaflet map to display earthquake data.
 * It is highly customizable and can show a primary highlighted earthquake, nearby quakes,
 * and overlays for tectonic plates and active faults. The component is optimized for
 an performance
 * with features like dynamic data loading and spatial filtering.
 */
import React, { useRef, useEffect, memo, useState, useMemo } from 'react'; // Added useState and useMemo
// PropTypes import removed
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet';
import { Link } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
// import tectonicPlatesData from '../assets/TectonicPlateBoundaries.json'; // Removed for dynamic import
import { getMagnitudeColor, formatTimeAgo } from '../utils/utils.js';
import { 
  calculateBoundingBoxFromPoints, 
  filterGeoJSONByBoundingBox,
  initializeSpatialIndex,
  clearSpatialIndex
} from '../utils/geoSpatialUtils.js';

// Corrects issues with Leaflet's default icon paths in some bundlers.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

/**
 * Creates a custom Leaflet DivIcon for the main highlighted earthquake (epicenter).
 * This icon is designed to be highly visible, featuring a pulsing animation to draw attention.
 * The color of the icon is dynamically determined by the earthquake's magnitude, providing
 * an immediate visual cue about its intensity.
 *
 * The SVG-based icon consists of a central circle and multiple expanding, fading rings that
 * create the pulsing effect. The animation is defined using SMIL animations within the SVG,
 * ensuring it is self-contained and performs well.
 *
 * Note: A corresponding CSS class (`custom-pulsing-icon`) is assigned, which can be used
 * for additional styling if needed, but the core animation is handled by the SVG itself.
 *
 * @param {number} magnitude The magnitude of the earthquake. This value is passed to
 *   `getMagnitudeColor` to select the appropriate color for the icon.
 * @returns {L.DivIcon} A Leaflet `L.DivIcon` instance configured with the pulsing SVG
 *   and appropriate styling for the epicenter marker.
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
 * This icon is a simple circle whose color is determined by the earthquake's magnitude
 * and whose opacity is determined by its age. This provides a quick visual guide to both
 * the strength and recency of surrounding seismic events.
 *
 * The opacity is tiered based on the age of the quake:
 * - Less than 1 day old: 100% opacity
 * - 1 to 7 days old: 80% opacity
 * - 7 to 14 days old: 60% opacity
 * - Over 14 days old: 40% opacity
 *
 * This temporal fading helps users focus on the most recent and potentially relevant
 * seismic activity.
 *
 * @param {number} magnitude The magnitude of the earthquake, used for color coding via `getMagnitudeColor`.
 * @param {number} time The timestamp (in milliseconds since the epoch) of the earthquake,
 *   used to calculate its age and determine the icon's opacity.
 * @returns {L.DivIcon} A Leaflet `L.DivIcon` instance for a nearby quake marker.
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
 * Determines the Leaflet path style for a tectonic plate boundary GeoJSON feature.
 * The styling, specifically the line color, is determined by the `Boundary_Type`
 * property of the feature. This allows for easy visual differentiation between
 * different types of plate boundaries on the map.
 *
 * - Convergent boundaries are styled in crimson.
 * - Divergent boundaries are styled in medium sea green.
 * - Transform boundaries are styled in steel blue.
 * - Other or undefined boundary types are given a default orange color.
 *
 * @param {object} feature The GeoJSON feature representing a tectonic plate boundary.
 *   It is expected to have a `properties.Boundary_Type` string.
 * @returns {object} A Leaflet path style options object (`L.PathOptions`) used to style
 *   the GeoJSON layer. This object includes `color`, `weight`, and `opacity`.
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
 * Determines the Leaflet path style for a GEM active fault GeoJSON feature.
 * The line color is determined by the fault's `slip_type` property, providing a clear
 * visual classification of the fault type on the map. A thicker line weight is used
 * to distinguish these fault lines from tectonic plate boundaries.
 *
 * Color legend for fault slip types:
 * - **Normal**: Deep Pink
 * - **Reverse**: Lime Green
 * - **Dextral (right-lateral)**: Deep Sky Blue
 * - **Sinistral (left-lateral)**: Blue Violet
 * - **Dextral-Normal**: Orange
 * - **Unknown/Other**: White (default)
 *
 * @param {object} feature The GeoJSON feature for an active fault. It is expected to have
 *   a `properties.slip_type` string to determine the color.
 * @returns {object} A Leaflet path style options object (`L.PathOptions`) with settings
 *   for `color`, `weight`, and `opacity`.
 */
const getActiveFaultStyle = (feature) => {
  let color = 'rgba(255, 255, 255, 0.9)'; // Default white for unknown fault types
  const slipType = feature?.properties?.slip_type;
  if (slipType === 'Normal') color = 'rgba(255, 20, 147, 0.9)'; // Deep pink for Normal faults
  else if (slipType === 'Reverse') color = 'rgba(50, 205, 50, 0.9)'; // Lime green for Reverse faults
  else if (slipType === 'Dextral') color = 'rgba(0, 191, 255, 0.9)'; // Deep sky blue for Dextral (right-lateral)
  else if (slipType === 'Sinistral') color = 'rgba(138, 43, 226, 0.9)'; // Blue violet for Sinistral (left-lateral)
  else if (slipType === 'Dextral-Normal') color = 'rgba(255, 140, 0, 0.9)'; // Orange for combined Dextral-Normal
  return { color, weight: 2.5, opacity: 0.9 };
};

/**
 * Renders an interactive Leaflet map for displaying earthquake information.
 * This component is central to the application's UI, providing a geographical context
 * for seismic events.
 *
 * Key Features:
 * - **Main Earthquake Highlight**: Displays a primary earthquake with a distinctive,
 *   pulsing icon for high visibility. The icon's color is determined by the quake's magnitude.
 * - **Nearby Quakes Display**: Shows other recent earthquakes in the vicinity.
 *   The opacity of each marker is time-sensitive, fading for older events to provide
 *   a quick visual reference to their recency.
 * - **Tectonic Plates Layer**: Dynamically loads and renders GeoJSON data for tectonic
 *   plate boundaries, with styling based on the boundary type (Convergent, Divergent, Transform).
 * - **Active Faults Layer**: Displays active fault lines from the GEM Global Active Faults
 *   database. Faults are color-coded by their slip type (e.g., Normal, Reverse) for
 *   detailed seismological context. This layer is spatially filtered to only show faults
 *   within a certain radius of the displayed earthquakes, optimizing performance.
 * - **Dynamic Viewport Control**: The map can either be centered on a specific coordinate
 *   with a fixed zoom level or can automatically adjust its bounds to encompass all
 *   displayed earthquakes, ensuring all relevant data points are visible.
 * - **Interactive Popups**: Both earthquake markers and fault lines have popups that
 *   provide additional details, such as magnitude, time, and links to more information.
 * - **Performance Optimization**: The component is memoized with `React.memo` to prevent
 *   unnecessary re-renders. Data layers like tectonic plates and active faults are loaded
 *   asynchronously.
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
  const [activeFaultsDataJson, setActiveFaultsDataJson] = useState(null);
  const [isActiveFaultsLoading, setIsActiveFaultsLoading] = useState(true);
  const [fullActiveFaultsData, setFullActiveFaultsData] = useState(null);

  const initialMapCenter = useMemo(() => [mapCenterLatitude, mapCenterLongitude], [mapCenterLatitude, mapCenterLongitude]);
  const highlightedQuakePosition = useMemo(() => {
    if (highlightQuakeLatitude !== undefined && highlightQuakeLongitude !== undefined) {
      return [highlightQuakeLatitude, highlightQuakeLongitude];
    }
    return null;
  }, [highlightQuakeLatitude, highlightQuakeLongitude]);

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

  useEffect(() => {
    let isMounted = true;
    const loadActiveFaults = async () => {
      setIsActiveFaultsLoading(true);
      try {
        const faultsData = await import('../assets/gem_active_faults_harmonized.json');
        if (isMounted) {
          setFullActiveFaultsData(faultsData.default);
        }
      } catch (error) {
        console.error("Error loading active faults data:", error);
      } finally {
        if (isMounted) {
          setIsActiveFaultsLoading(false);
        }
      }
    };
    loadActiveFaults();
    return () => {
      isMounted = false;
    };
  }, []);

  // Spatial filtering effect for active faults
  useEffect(() => {
    if (!fullActiveFaultsData) {
      setActiveFaultsDataJson(null);
      return;
    }

    // Calculate bounding box from all earthquake points on the map
    const allEarthquakePoints = [];
    
    // Add highlighted earthquake position
    if (highlightedQuakePosition) {
      allEarthquakePoints.push(highlightedQuakePosition);
    }
    
    // Add nearby earthquakes
    nearbyQuakes.forEach(quake => {
      if (quake.geometry && quake.geometry.coordinates) {
        const lat = parseFloat(quake.geometry.coordinates[1]);
        const lng = parseFloat(quake.geometry.coordinates[0]);
        if (!isNaN(lat) && !isNaN(lng)) {
          allEarthquakePoints.push([lat, lng]);
        }
      }
    });
    
    // If no earthquake points, use map center as fallback
    if (allEarthquakePoints.length === 0) {
      allEarthquakePoints.push([mapCenterLatitude, mapCenterLongitude]);
    }
    
    // Calculate bounding box with 100km buffer for fault filtering
    const boundingBox = calculateBoundingBoxFromPoints(allEarthquakePoints, 100);
    
    if (boundingBox) {
      // Filter faults to only those within the bounding box
      const filteredFaults = filterGeoJSONByBoundingBox(fullActiveFaultsData, boundingBox);
      setActiveFaultsDataJson(filteredFaults);
      
      // Log filtering results for debugging
      const originalCount = fullActiveFaultsData.features.length;
      const filteredCount = filteredFaults.features.length;
      console.log(`Active faults filtered: ${originalCount} → ${filteredCount} (${Math.round(filteredCount/originalCount*100)}%)`);
    } else {
      // Fallback: no filtering
      setActiveFaultsDataJson(fullActiveFaultsData);
    }
  }, [
    fullActiveFaultsData, 
    highlightedQuakePosition, 
    nearbyQuakes, 
    mapCenterLatitude, 
    mapCenterLongitude
  ]);

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
        const coordinates = quake.geometry?.coordinates;
        if (
          !quake.geometry ||
          !Array.isArray(coordinates) || // Check if coordinates is an array
          coordinates.length < 2 ||      // Check for at least two elements (lon, lat)
          typeof quake.properties?.mag !== 'number' ||
          typeof quake.properties?.time !== 'number'
        ) {
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
      
      {!isActiveFaultsLoading && activeFaultsDataJson && (
        <GeoJSON 
          data={activeFaultsDataJson} 
          style={getActiveFaultStyle}
          onEachFeature={(feature, layer) => {
            if (feature.properties) {
              const slipType = feature.properties.slip_type;
              let slipDescription = slipType || 'Unknown';
              
              if (slipType === 'Normal') {
                slipDescription = 'Normal (pulls apart)';
              } else if (slipType === 'Reverse') {
                slipDescription = 'Reverse (pushes together)';
              } else if (slipType === 'Dextral') {
                slipDescription = 'Dextral (slides right)';
              } else if (slipType === 'Sinistral') {
                slipDescription = 'Sinistral (slides left)';
              } else if (slipType === 'Dextral-Normal') {
                slipDescription = 'Dextral-Normal (slides right + pulls apart)';
              }
              
              const popupContent = `
                <div>
                  <strong>${feature.properties.name || 'Unknown Fault'}</strong><br/>
                  <strong>Fault Type:</strong> ${slipDescription}<br/>
                  <strong>Net Slip Rate:</strong> ${feature.properties.net_slip_rate || 'Unknown'}<br/>
                  <strong>Data Source:</strong> ${feature.properties.catalog_name || 'Unknown'}
                </div>
              `;
              layer.bindPopup(popupContent);
            }
          }}
        />
      )}
    </MapContainer>
  );
};

// PropTypes and defaultProps blocks removed.

export default memo(EarthquakeMap);
