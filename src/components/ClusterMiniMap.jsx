import React, { useEffect, useRef, memo, useState } from 'react'; // Added useEffect, useRef, useState
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
 * @param {object} props.containerRef - A React ref for the container element to observe for resizing.
 * @returns {JSX.Element | null} The rendered Leaflet map component or null if cluster data is invalid.
 */
const ClusterMiniMap = ({ cluster, getMagnitudeColor, containerRef }) => {
  const mapRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (containerRef && containerRef.current) {
      const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
          if (entry.contentRect.width > 0) {
            setContainerWidth(entry.contentRect.width);
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

  // Animation state
  const [animatedQuakes, setAnimatedQuakes] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false); // Will be controlled by parent/buttons later

  // Sort quakes by time (oldest first) for animation
  // Assuming quake.properties.time exists and is a sortable timestamp
  const sortedQuakes = React.useMemo(() =>
    [...originalQuakes].sort((a, b) => a.properties.time - b.properties.time),
    [originalQuakes]
  );

  // Animation effect
  useEffect(() => {
    if (isPlaying && currentIndex < sortedQuakes.length) {
      const timer = setTimeout(() => {
        setAnimatedQuakes(prevQuakes => [...prevQuakes, sortedQuakes[currentIndex]]);
        setCurrentIndex(prevIndex => prevIndex + 1);
      }, 500); // Configurable delay (500ms)

      return () => clearTimeout(timer);
    } else if (currentIndex >= sortedQuakes.length && isPlaying) {
      setIsPlaying(false); // Stop animation when all quakes are shown
    }
  }, [isPlaying, currentIndex, sortedQuakes]);


  let mapCenter;
  let initialZoom;

  // Determine map center and zoom based on originalQuakes to ensure the map is framed correctly from the start
  const quakesToFrame = originalQuakes; // Use originalQuakes for initial framing

  if (quakesToFrame.length === 1) {
    const singleQuake = quakesToFrame[0];
    mapCenter = [singleQuake.geometry.coordinates[1], singleQuake.geometry.coordinates[0]];
    initialZoom = 10; // Zoom level for a single quake
  } else {
    // Calculate map center for multiple quakes (average lat/lng)
    const latitudes = quakesToFrame.map(quake => quake.geometry.coordinates[1]);
    const longitudes = quakesToFrame.map(quake => quake.geometry.coordinates[0]);
    const avgLat = latitudes.reduce((sum, lat) => sum + lat, 0) / latitudes.length;
    const avgLng = longitudes.reduce((sum, lng) => sum + lng, 0) / longitudes.length;
    mapCenter = [avgLat, avgLng]; // This center is fine for concentrated points too.

    // Calculate bounds to check for very concentrated clusters
    const bounds = L.latLngBounds(
      quakesToFrame.map(quake => [
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
    // Fit bounds based on originalQuakes to ensure the initial view is correct.
    if (mapRef.current && quakesToFrame.length > 1 && initialZoom === 7 && containerWidth > 0) {
      const bounds = L.latLngBounds(
        quakesToFrame.map(quake => [
          quake.geometry.coordinates[1],
          quake.geometry.coordinates[0],
        ])
      );
      mapRef.current.fitBounds(bounds, { padding: [0, 0] });
    }
  }, [quakesToFrame, mapRef, initialZoom, containerWidth]);

  // Render null or a placeholder if the container isn't ready
  if (containerWidth === 0 && quakesToFrame.length > 0) {
      return <div style={{ height: '200px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155' }} className="text-slate-400">Loading map...</div>;
  }

  // Determine which quakes to display: animatedQuakes if playing or paused with items,
  // or none if animation hasn't started (and animatedQuakes is empty).
  // Or, show all originalQuakes if not playing and animatedQuakes is empty (initial static view).
  // For this subtask, if not isPlaying and animatedQuakes is empty, show no quakes.
  const quakesToDisplay = (isPlaying || animatedQuakes.length > 0) ? animatedQuakes : [];

  // Control Handlers
  const handleReset = () => {
    setIsPlaying(false);
    setCurrentIndex(0);
    setAnimatedQuakes([]);
  };

  const handlePlay = () => {
    if (currentIndex >= sortedQuakes.length && sortedQuakes.length > 0) {
      // If animation finished, reset and play
      handleReset(); // This will set currentIndex to 0, animatedQuakes to []
      // We need to ensure isPlaying is set to true *after* reset state has been processed
      // or rely on an effect, but direct setting is simpler here if we sequence state updates.
      // A slight delay or useEffect to trigger play after reset might be more robust
      // For now, let's set isPlaying to true directly. If issues arise, we can refine.
      setIsPlaying(true);
    } else {
      setIsPlaying(true);
    }
  };

  const handlePause = () => {
    setIsPlaying(false);
  };


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
      {quakesToDisplay.map((quake, index) => {
        const isActive = isPlaying && index === animatedQuakes.length - 1;
        const pathOptions = {
          fillColor: getMagnitudeColor(quake.properties.mag),
          color: isActive ? 'yellow' : '#000', // Highlight border color: yellow
          weight: isActive ? 3 : 1, // Highlight border weight: 3
          opacity: 1,
          fillOpacity: isActive ? 0.9 : 0.7, // Slightly more opaque when active
        };

        return (
          <CircleMarker
            key={`${quake.id}-animated`}
            center={[quake.geometry.coordinates[1], quake.geometry.coordinates[0]]}
            pathOptions={pathOptions}
            radius={5 + quake.properties.mag / 2}
          >
            <Tooltip>
            M {quake.properties.mag.toFixed(1)} - {quake.properties.place}
          </Tooltip>
        </CircleMarker>
        );
      })}
      {/* Controls Container - modified for flow layout and modal styling */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '10px', padding: '5px 0' }}>
        {!isPlaying && (
          <button
            onClick={handlePlay}
            disabled={sortedQuakes.length === 0}
            className="bg-slate-600 hover:bg-slate-500 text-slate-100 font-medium py-2 px-3 rounded-lg text-xs shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {currentIndex >= sortedQuakes.length && sortedQuakes.length > 0 ? 'Replay' : 'Play'}
          </button>
        )}
        {isPlaying && (
          <button
            onClick={handlePause}
            className="bg-slate-600 hover:bg-slate-500 text-slate-100 font-medium py-2 px-3 rounded-lg text-xs shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-75"
          >
            Pause
          </button>
        )}
        <button
          onClick={handleReset}
          disabled={animatedQuakes.length === 0 && currentIndex === 0}
          className="bg-slate-600 hover:bg-slate-500 text-slate-100 font-medium py-2 px-3 rounded-lg text-xs shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Reset
        </button>
      </div>
    </MapContainer>
  );
};

export default memo(ClusterMiniMap);
