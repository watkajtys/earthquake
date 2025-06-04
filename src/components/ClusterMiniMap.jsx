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

// Accept dimensionSourceRef prop
const ClusterMiniMap = ({ cluster, getMagnitudeColor, dimensionSourceRef }) => {
  const mapRef = useRef(null); // Ref for the Leaflet map instance
  const mapHostRef = useRef(null); // Ref for the direct parent of MapContainer within this component
  const [containerWidth, setContainerWidth] = useState(0); // Width derived from dimensionSourceRef
  const [initialCenter, setInitialCenter] = useState(null);
  const [initialZoomVal, setInitialZoomVal] = useState(null);

  // Effect 1: Determine map center and zoom (Unchanged)
  useEffect(() => {
    if (!cluster || !cluster.originalQuakes || cluster.originalQuakes.length === 0) {
      setInitialCenter(null); setInitialZoomVal(null); return;
    }
    const { originalQuakes } = cluster;
    let calculatedCenter, calculatedZoom;
    if (originalQuakes.length === 1) {
      const q = originalQuakes[0];
      calculatedCenter = [q.geometry.coordinates[1], q.geometry.coordinates[0]];
      calculatedZoom = 10;
    } else {
      const lats = originalQuakes.map(q => q.geometry.coordinates[1]);
      const lngs = originalQuakes.map(q => q.geometry.coordinates[0]);
      calculatedCenter = [lats.reduce((s, l) => s + l, 0) / lats.length, lngs.reduce((s, l) => s + l, 0) / lngs.length];
      const bounds = L.latLngBounds(originalQuakes.map(q => [q.geometry.coordinates[1], q.geometry.coordinates[0]]));
      if (bounds.getSouthWest().equals(bounds.getNorthEast()) || (Math.abs(bounds.getNorthEast().lat - bounds.getSouthWest().lat) < 0.001 && Math.abs(bounds.getNorthEast().lng - bounds.getSouthWest().lng) < 0.001)) {
        calculatedZoom = 10;
      } else {
        calculatedZoom = 7;
      }
    }
    setInitialCenter(calculatedCenter); setInitialZoomVal(calculatedZoom);
  }, [cluster]);

  // Effect 2: Setup ResizeObserver on dimensionSourceRef (MODIFIED)
  useEffect(() => {
    // Observe the dimensionSourceRef for width changes
    if (!dimensionSourceRef || !dimensionSourceRef.current) {
      // If the source ref is not provided, or not yet available, we can't get dimensions.
      // Optionally, set width to 0 or handle as an error/warning.
      // For now, if it's not there, width will remain 0 and map won't load.
      setContainerWidth(0);
      return;
    }

    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        const newWidth = entry.contentRect.width > 0 ? entry.contentRect.width : 0;
        setContainerWidth(prevWidth => newWidth !== prevWidth ? newWidth : prevWidth);
      }
    });
    observer.observe(dimensionSourceRef.current);

    // Also try to get initial width from dimensionSourceRef, as ResizeObserver might be async
    const initialObservedWidth = dimensionSourceRef.current.getBoundingClientRect().width;
     if (initialObservedWidth > 0) {
        setContainerWidth(initialObservedWidth);
     }


    return () => {
      if (dimensionSourceRef.current) { // Check ref before unobserving
        observer.unobserve(dimensionSourceRef.current);
      }
      observer.disconnect();
    };
  }, [dimensionSourceRef]); // Re-run if dimensionSourceRef itself changes (though unlikely for a stable ref)

  // Effect 3: Invalidate map size (Previously Effect 4 - Unchanged logic, but depends on new containerWidth source)
  useEffect(() => {
    if (containerWidth > 0 && mapRef.current) {
      mapRef.current.invalidateSize();
    }
  }, [containerWidth, mapRef]);

  // Effect 4: Fit bounds (Previously Effect 5 - Unchanged logic)
  useEffect(() => {
    if (mapRef.current && initialCenter && initialZoomVal !== null && containerWidth > 0) {
      if (cluster && cluster.originalQuakes && cluster.originalQuakes.length > 1 && initialZoomVal === 7) {
        const bounds = L.latLngBounds(cluster.originalQuakes.map(q => [q.geometry.coordinates[1], q.geometry.coordinates[0]]));
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

  // Render conditions
  const placeholderStyle = { height: '350px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155' };

  if (!initialCenter || initialZoomVal === null) {
    return <div style={placeholderStyle} className="text-slate-400">Initializing map parameters...</div>;
  }

  // The mapHostRef div is always rendered with its fixed height and 100% width.
  // Its content (MapContainer or placeholder text) depends on containerWidth derived from dimensionSourceRef.
  return (
    <div ref={mapHostRef} style={{ width: '100%', height: '350px' }}>
      {containerWidth > 0 ? (
        <MapContainer
          center={initialCenter}
          zoom={initialZoomVal}
          style={{ height: '100%', width: '100%' }} // Map fills mapHostRef
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
        // Placeholder text shown if containerWidth (from dimensionSourceRef) is 0
        cluster && cluster.originalQuakes && cluster.originalQuakes.length > 0 ?
          <div style={placeholderStyle} className="text-slate-400">Loading map...</div> :
          <div style={placeholderStyle} className="text-slate-400">Awaiting dimensions from modal...</div>
      )}
    </div>
  );
};

export default memo(ClusterMiniMap);
