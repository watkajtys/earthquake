import React, { useEffect, useState, memo } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import tectonicPlatesData from '../assets/TectonicPlateBoundaries.json';

// Style function for Tectonic Plates (can be kept as is or moved if preferred)
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
  return { color, weight: 1, opacity: 1 };
};

const ClusterMiniMap = ({ cluster, getMagnitudeColor }) => {
  const originalQuakes = cluster && cluster.originalQuakes ? cluster.originalQuakes : [];
  const [map, setMap] = useState(null);

  useEffect(() => {
    if (!map) { // Check for map instance first
      return;
    }

    // Handle empty or invalid originalQuakes separately
    if (!originalQuakes || originalQuakes.length === 0) {
      map.setView([0, 0], 2);
      map.invalidateSize(false); // Explicit invalidateSize
      return; // No markers to process
    }

    if (originalQuakes.length === 1) {
      const quake = originalQuakes[0];
      // Ensure quake geometry and coordinates are valid before accessing
      if (quake && quake.geometry && quake.geometry.coordinates && quake.geometry.coordinates.length >= 2) {
          const latLng = [quake.geometry.coordinates[1], quake.geometry.coordinates[0]];
          map.setView(latLng, 8); // Restored from previous step
      } else {
          // Fallback for invalid single quake data
          map.setView([0,0], 2);
      }
      map.invalidateSize(false); // Explicit invalidateSize
    } else { // Multiple quakes
      const bounds = L.latLngBounds(
        originalQuakes.reduce((acc, quake) => {
          // Ensure each quake has valid geometry before adding to bounds
          if (quake && quake.geometry && quake.geometry.coordinates && quake.geometry.coordinates.length >= 2) {
            acc.push([quake.geometry.coordinates[1], quake.geometry.coordinates[0]]);
          }
          return acc;
        }, [])
      );

      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [10, 10] }); // Restored from previous step
      } else {
        // Fallback if bounds are not valid
        if (originalQuakes[0] && originalQuakes[0].geometry && originalQuakes[0].geometry.coordinates && originalQuakes[0].geometry.coordinates.length >=2) {
          const fallbackLatLng = [originalQuakes[0].geometry.coordinates[1], originalQuakes[0].geometry.coordinates[0]];
          map.setView(fallbackLatLng, 6);
        } else {
          map.setView([0,0], 2);
        }
      }
      map.invalidateSize(false); // Explicit invalidateSize
    }
  }, [map, originalQuakes]);

  let mapKey;
  if (!originalQuakes || originalQuakes.length === 0) {
    mapKey = 'empty-map';
  } else {
    try {
      // Ensure all quakes have an id, or filter them out / use index if id can be missing
      const ids = originalQuakes.map((q, index) => q && q.id ? q.id : `no-id-${index}`);
      mapKey = JSON.stringify(ids.sort());
    } catch (e) {
      console.error('Error generating mapKey:', e);
      mapKey = `map-fallback-${originalQuakes.length}-${Math.random()}`; // Fallback key
    }
  }

  return (
    <MapContainer
      key={mapKey}
      style={{ width: '100%', height: '100%' }}
      center={[0, 0]} // Initial center, will be overridden by setView/fitBounds
      zoom={2}        // Initial zoom, will be overridden
      scrollWheelZoom={false}
      whenCreated={setMap} // Capture map instance
      maxZoom={18}
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution='Tiles &copy; Esri &mdash; ... GIS User Community' // Truncated for brevity
      />
      <GeoJSON data={tectonicPlatesData} style={getTectonicPlateStyle} />
      {originalQuakes && originalQuakes.length > 0 && originalQuakes.map((quake) => {
      // Add checks for quake validity if necessary, e.g. if quake or quake.properties can be null/undefined
      if (!quake || !quake.properties || !quake.geometry || !quake.geometry.coordinates || quake.geometry.coordinates.length < 2) return null;
      return (
        <CircleMarker
          key={quake.id} // Assuming quake.id is reliable here
          center={[quake.geometry.coordinates[1], quake.geometry.coordinates[0]]}
          pathOptions={{
            fillColor: getMagnitudeColor(quake.properties.mag),
            color: '#000',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.7,
          }}
          radius={5 + quake.properties.mag / 2}
        >
          <Tooltip>
            M {quake.properties.mag.toFixed(1)} - {quake.properties.place}
          </Tooltip>
        </CircleMarker>
      );
    })}
    </MapContainer>
  );
};

export default memo(ClusterMiniMap); // Keep memoization
