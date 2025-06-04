import React, { useEffect, useRef, memo, useState } from 'react'; // Added useEffect, useRef, useState
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import tectonicPlatesData from '../assets/TectonicPlateBoundaries.json'; // Corrected path
// Assuming getMagnitudeColor will be provided as a prop or imported if generalized
// import { getMagnitudeColor } from './utils';

/**
 * Formats the time difference between now and a given timestamp into a human-readable string.
 * e.g., "2 hours ago", "3 days ago", "just now".
 * @param {number} timestamp - The earthquake's time in milliseconds since epoch.
 * @returns {string} A string representing how long ago the earthquake occurred.
 */
const formatTimeAgo = (timestamp) => {
  const now = new Date();
  const secondsPast = (now.getTime() - timestamp) / 1000;

  if (secondsPast < 60) {
    return 'just now';
  }
  if (secondsPast < 3600) {
    const minutes = Math.round(secondsPast / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }
  if (secondsPast <= 86400) { // 24 hours
    const hours = Math.round(secondsPast / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  // For days, we can be more approximate or use a library for more complex date formatting if needed.
  const days = Math.round(secondsPast / 86400);
  if (days <= 30) { // Roughly up to a month
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
  // For more than 30 days, you might want to show the date or "over a month ago"
  // For this scope, "X days ago" is fine.
  return `${days} day${days > 1 ? 's' : ''} ago`;
};

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
 *   to have `id`, `geometry.coordinates` (lng, lat, depth), `properties.mag` (magnitude),
 *   `properties.place`, and `properties.time`.
 * @param {function} props.getMagnitudeColor - A function that takes an earthquake's magnitude
 *   and returns a color string for its marker.
 * @param {function} props.onQuakeSelect - Callback function to handle when a quake is selected.
 * @param {object} props.containerRef - A React ref for the container element to observe for resizing.
 * @returns {JSX.Element | null} The rendered Leaflet map component or null if cluster data is invalid.
 */
const ClusterMiniMap = ({ cluster, getMagnitudeColor, onQuakeSelect, containerRef }) => {
  const mapRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (containerRef && containerRef.current) {
      const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
          if (entry.contentRect.width > 0) {
            // setContainerWidth(entry.contentRect.width);
            // Invalidate map size when container width changes to ensure it rerenders correctly
            if (mapRef.current) {
              mapRef.current.invalidateSize();
            }
          }
        }
      });

      resizeObserver.observe(containerRef.current);

      // Initial check
      const initialWidth = containerRef.current.getBoundingClientRect().width;
      if (initialWidth > 0) {
        setContainerWidth(initialWidth);
      }


      return () => {
        if (containerRef.current) { // Check if ref still exists before trying to unobserve
            resizeObserver.unobserve(containerRef.current);
        }
        resizeObserver.disconnect();
      };
    }
  }, [containerRef, mapRef]); // mapRef added as dependency to re-run if it changes, though less likely

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
    // Also ensure containerWidth is available (map is visible and has size)
    if (mapRef.current && originalQuakes.length > 1 && initialZoom === 7 && containerWidth > 0) {
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
  }, [originalQuakes, mapRef, initialZoom, containerWidth]); // Added initialZoom and containerWidth to dependency array.
                                 // originalQuakes is the primary data dependency.

  // Render null or a placeholder if the container isn't ready (e.g., width is 0)
  // This prevents Leaflet errors if it tries to initialize in a zero-size container.
  if (containerWidth === 0 && originalQuakes.length > 0) { // Check originalQuakes to avoid flash when initially no cluster
      return <div style={{ height: '200px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155' }} className="text-slate-400">Loading map...</div>;
  }


  return (
    <MapContainer
      center={mapCenter}
      zoom={initialZoom}
      style={{ height: '200px', width: '100%' }} // Width is 100% of its container
      scrollWheelZoom={false}
      ref={mapRef}
      maxZoom={18}
      // key={containerWidth} // Optionally, force remount if width changes drastically, though invalidateSize is preferred
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
          eventHandlers={{
            click: () => {
              // Ensure onQuakeSelect is a function before calling it
              if (typeof onQuakeSelect === 'function') {
                onQuakeSelect(quake.id);
              }
            },
          }} // This closes the eventHandlers prop
        >   {/* This > closes the CircleMarker opening tag */}
          <Tooltip>
            <div>Magnitude: {quake.properties.mag.toFixed(1)}</div>
            <div>{quake.properties.place}</div>
            <div>{formatTimeAgo(quake.properties.time)}</div>
            <div style={{ marginTop: '5px', fontStyle: 'italic', fontSize: '0.9em' }}>
              Click marker for details
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
};

export default memo(ClusterMiniMap);
