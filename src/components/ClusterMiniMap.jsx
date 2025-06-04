import React, { memo } from 'react';
import EarthquakeMap from './EarthquakeMap'; // Import the EarthquakeMap component

/**
 * Renders a mini map for a cluster of earthquakes.
 * The map is centered at the geographic average of all quakes in the cluster.
 * The latest earthquake in the cluster is highlighted with a pulsing marker.
 * Other earthquakes in the cluster are shown as smaller, non-pulsing markers.
 * The map automatically fits its bounds to display all earthquakes in the cluster.
 *
 * @param {object} props - The component's props.
 * @param {object} props.cluster - The cluster data. Must contain an `originalQuakes` array.
 * @param {Array<object>} props.cluster.originalQuakes - An array of earthquake objects. Each object is expected
 *   to have `id`, `geometry.coordinates` (lng, lat, depth), and `properties.mag` (magnitude),
 *   `properties.place`, and `properties.time`.
 * @returns {JSX.Element | null} The rendered EarthquakeMap component for the cluster or null if data is invalid.
 */
const ClusterMiniMap = ({ cluster }) => {
  if (!cluster) {
    return <div style={{ height: '200px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155' }} className="text-slate-400">Loading map data or map disabled</div>;
  }

  if (!cluster.originalQuakes || !Array.isArray(cluster.originalQuakes) || cluster.originalQuakes.length === 0) {
    return <div style={{ height: '200px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155' }} className="text-slate-400">No earthquakes in this cluster to display on map</div>;
  }

  const { originalQuakes } = cluster;

  // 1. Identify Latest Quake
  let latestQuake = null;
  if (originalQuakes.length > 0) {
    latestQuake = originalQuakes.reduce((latest, current) => {
      const latestTime = latest?.properties?.time;
      const currentTime = current?.properties?.time;
      if (typeof latestTime !== 'number') return current; // Handle missing time on 'latest'
      if (typeof currentTime !== 'number') return latest; // Handle missing time on 'current'
      return (currentTime > latestTime) ? current : latest;
    });
  }

  // Ensure latestQuake and its essential properties exist
  if (!latestQuake || !latestQuake.properties || typeof latestQuake.properties.mag !== 'number' ||
      typeof latestQuake.properties.time !== 'number' || // Also check time for consistency
      !latestQuake.geometry || !Array.isArray(latestQuake.geometry.coordinates) ||
      latestQuake.geometry.coordinates.length < 2) {
    console.error("Latest quake data is malformed or essential fields are missing in ClusterMiniMap:", latestQuake);
    return <div style={{ height: '200px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155' }} className="text-slate-400">Latest quake data in cluster is malformed.</div>;
  }

  // 2. Calculate Geographic Center (avgLat, avgLng)
  let sumLat = 0;
  let sumLng = 0;
  let validCoordCount = 0;
  originalQuakes.forEach(quake => {
    if (quake.geometry && Array.isArray(quake.geometry.coordinates) && quake.geometry.coordinates.length >= 2) {
      const lat = parseFloat(quake.geometry.coordinates[1]);
      const lng = parseFloat(quake.geometry.coordinates[0]);
      if (!isNaN(lat) && !isNaN(lng)) {
        sumLat += lat;
        sumLng += lng;
        validCoordCount++;
      }
    }
  });

  let avgLat = null;
  let avgLng = null;

  if (validCoordCount > 0) {
    avgLat = sumLat / validCoordCount;
    avgLng = sumLng / validCoordCount;
  } else {
    // Fallback if no valid coordinates found - center on the latest quake itself
    // This shouldn't happen if latestQuake is valid, but as a safeguard.
    avgLat = latestQuake.geometry.coordinates[1];
    avgLng = latestQuake.geometry.coordinates[0];
    console.warn("No valid coordinates found for averaging in cluster. Centering on latest quake.");
  }

  // 3. Determine otherQuakes (excluding the latestQuake)
  const otherQuakes = originalQuakes.filter(quake => quake.id !== latestQuake.id);

  // 4. Prepare props for EarthquakeMap
  const mapProps = {
    mapCenterLatitude: avgLat,
    mapCenterLongitude: avgLng,
    highlightQuakeLatitude: latestQuake.geometry.coordinates[1],
    highlightQuakeLongitude: latestQuake.geometry.coordinates[0],
    highlightQuakeMagnitude: latestQuake.properties.mag,
    highlightQuakeTitle: latestQuake.properties.place || latestQuake.properties.title || 'Latest Quake',
    nearbyQuakes: otherQuakes,
    fitMapToBounds: true,
    shakeMapUrl: null, // Clusters don't have a single ShakeMap URL
    mainQuakeDetailUrl: null, // Or potentially a link to the latest quake's detail view if available
                               // e.g., latestQuake.properties.detail (if such a prop exists)
    defaultZoom: 8, // EarthquakeMap has a default, but can be explicit
  };

  return (
    <div style={{ height: '200px', width: '100%' }}>
      <EarthquakeMap {...mapProps} />
    </div>
  );
};

export default memo(ClusterMiniMap);
