import React, { useEffect, useRef, memo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import tectonicPlatesData from '../assets/TectonicPlateBoundaries.json';

// Style function for Tectonic Plates (getTectonicPlateStyle - unchanged)
const getTectonicPlateStyle = (feature) => {
  let color = 'rgba(255, 165, 0, 0.8)';
  const boundaryType = feature?.properties?.Boundary_Type;
  if (boundaryType === 'Convergent') color = 'rgba(220, 20, 60, 0.8)';
  else if (boundaryType === 'Divergent') color = 'rgba(60, 179, 113, 0.8)';
  else if (boundaryType === 'Transform') color = 'rgba(70, 130, 180, 0.8)';
  return { color: color, weight: 1, opacity: 1 };
};

const ClusterMiniMap = ({ cluster, getMagnitudeColor }) => {
  const mapRef = useRef(null); // For Leaflet map instance
  const mapContainerParentRef = useRef(null); // For the div wrapping MapContainer
  const [containerWidth, setContainerWidth] = useState(0);
  const [initialCenter, setInitialCenter] = useState(null);
  const [initialZoomVal, setInitialZoomVal] = useState(null);

  // Effect 1: Determine map center and zoom based on cluster data (Unchanged)
  useEffect(() => {
    if (!cluster || !cluster.originalQuakes || cluster.originalQuakes.length === 0) {
      setInitialCenter(null);
      setInitialZoomVal(null);
      return;
    }
    const { originalQuakes } = cluster;
    let calculatedCenter;
    let calculatedZoom;

    if (originalQuakes.length === 1) {
      const singleQuake = originalQuakes[0];
      calculatedCenter = [singleQuake.geometry.coordinates[1], singleQuake.geometry.coordinates[0]];
      calculatedZoom = 10;
    } else {
      const latitudes = originalQuakes.map(quake => quake.geometry.coordinates[1]);
      const longitudes = originalQuakes.map(quake => quake.geometry.coordinates[0]);
      const avgLat = latitudes.reduce((sum, lat) => sum + lat, 0) / latitudes.length;
      const avgLng = longitudes.reduce((sum, lng) => sum + lng, 0) / longitudes.length;
      calculatedCenter = [avgLat, avgLng];

      const bounds = L.latLngBounds(originalQuakes.map(quake => [quake.geometry.coordinates[1], quake.geometry.coordinates[0]]));
      if (bounds.getSouthWest().equals(bounds.getNorthEast()) ||
          (Math.abs(bounds.getNorthEast().lat - bounds.getSouthWest().lat) < 0.001 &&
           Math.abs(bounds.getNorthEast().lng - bounds.getSouthWest().lng) < 0.001)) {
        calculatedZoom = 10;
      } else {
        calculatedZoom = 7; // fitBounds will adjust this later if needed
      }
    }
    setInitialCenter(calculatedCenter);
    setInitialZoomVal(calculatedZoom);
  }, [cluster]);

  // Effect 2: Setup ResizeObserver (MODIFIED - No immediate getBoundingClientRect for width)
  useEffect(() => {
    if (!mapContainerParentRef.current) return;

    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        // Set width from observer entry. If it's 0 or less, set to 0.
        const newWidth = entry.contentRect.width > 0 ? entry.contentRect.width : 0;
        setContainerWidth(newWidth);
      }
    });
    observer.observe(mapContainerParentRef.current);

    return () => {
      if (mapContainerParentRef.current) {
        observer.unobserve(mapContainerParentRef.current);
      }
      observer.disconnect();
    };
  }, []); // Runs once on mount

  // Effect 3: Invalidate map size when containerWidth changes and map is ready (Unchanged)
  useEffect(() => {
    if (containerWidth > 0 && mapRef.current) {
      mapRef.current.invalidateSize();
    }
  }, [containerWidth, mapRef]);

  // Effect 4: Fit bounds when map is ready and relevant props change (Unchanged)
   useEffect(() => {
    if (mapRef.current && initialCenter && initialZoomVal !== null && containerWidth > 0) {
      if (cluster && cluster.originalQuakes && cluster.originalQuakes.length > 1 && initialZoomVal === 7) {
        const bounds = L.latLngBounds(
          cluster.originalQuakes.map(quake => [
            quake.geometry.coordinates[1],
            quake.geometry.coordinates[0],
          ])
        );
        if (!bounds.getSouthWest().equals(bounds.getNorthEast())) {
             mapRef.current.fitBounds(bounds, { padding: [0, 0] });
        } else {
            mapRef.current.setView(initialCenter, 10);
        }
      } else if (initialCenter && initialZoomVal !== null) {
        mapRef.current.setView(initialCenter, initialZoomVal);
      }
    }
  }, [cluster, initialCenter, initialZoomVal, mapRef, containerWidth]);

  // Render conditions (Heights are 350px)
  const placeholderStyle = { height: '350px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155' };

  if (!initialCenter || initialZoomVal === null) {
    return <div style={placeholderStyle} className="text-slate-400">Initializing map parameters...</div>;
  }

  // Render MapContainer only if containerWidth is determined and positive
  // The mapContainerParentRef div is always rendered to be observed.
  return (
    <div ref={mapContainerParentRef} style={{ width: '100%', height: '350px' }}>
      {containerWidth > 0 ? (
        <MapContainer
          center={initialCenter}
          zoom={initialZoomVal}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
          ref={mapRef}
          maxZoom={18}
        >
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
          />
          <GeoJSON data={tectonicPlatesData} style={getTectonicPlateStyle} />
          {cluster && cluster.originalQuakes && cluster.originalQuakes.map((quake) => (
            <CircleMarker
              key={quake.id}
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
          ))}
        </MapContainer>
      ) : (
        // Show "Loading map..." or "Awaiting dimensions..." based on data presence
        cluster && cluster.originalQuakes && cluster.originalQuakes.length > 0 ?
          <div style={placeholderStyle} className="text-slate-400">Loading map...</div> :
          <div style={placeholderStyle} className="text-slate-400">Awaiting dimensions...</div>
      )}
    </div>
  );
};

export default memo(ClusterMiniMap);
