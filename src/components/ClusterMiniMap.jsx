import React, { memo } from 'react';
import EarthquakeMap from './EarthquakeMap'; // Import the EarthquakeMap component

/**
 * Renders a mini map for a cluster of earthquakes, focusing on the highest magnitude quake
 * and displaying other quakes in the cluster as nearby quakes.
 * This component is a wrapper around the EarthquakeMap component.
 *
 * @param {object} props - The component's props.
 * @param {object} props.cluster - The cluster data. Must contain an `originalQuakes` array.
 * @param {Array<object>} props.cluster.originalQuakes - An array of earthquake objects. Each object is expected
 *   to have `id`, `geometry.coordinates` (lng, lat, depth), and `properties.mag` (magnitude), `properties.place`.
 * @param {function} props.getMagnitudeColor - (Currently unused in this component as EarthquakeMap handles its own)
 * @param {object} props.containerRef - (Currently unused in this component)
 * @returns {JSX.Element | null} The rendered EarthquakeMap component for the cluster or null if data is invalid.
 */
const ClusterMiniMap = ({ cluster /*, getMagnitudeColor, containerRef */ }) => {
  if (!cluster) {
    return <div style={{ height: '200px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155' }} className="text-slate-400">Loading map data or map disabled</div>;
  }

  if (!cluster.originalQuakes || !Array.isArray(cluster.originalQuakes) || cluster.originalQuakes.length === 0) {
    return <div style={{ height: '200px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155' }} className="text-slate-400">No earthquakes in this cluster to display on map</div>;
  }

  const { originalQuakes } = cluster;

  // Find the earthquake with the highest magnitude
  // This check is technically after the originalQuakes.length === 0 check,
  // so originalQuakes is guaranteed to be a non-empty array here.
  const highestMagnitudeQuake = originalQuakes.reduce((prev, current) => {
    // Ensure properties and mag exist to prevent runtime errors during reduce
    const prevMag = prev?.properties?.mag;
    const currentMag = current?.properties?.mag;
    // Simple way to handle potentially missing mag: treat as lowest possible
    const effectivePrevMag = typeof prevMag === 'number' ? prevMag : -Infinity;
    const effectiveCurrentMag = typeof currentMag === 'number' ? currentMag : -Infinity;

    return (effectivePrevMag > effectiveCurrentMag) ? prev : current;
  });

  // This specific check for !highestMagnitudeQuake might be redundant if originalQuakes
  // are guaranteed to have .properties.mag and the array is not empty.
  // However, if quakes could lack `properties` or `mag`, this is a safeguard.
  // Also check if the result of reduce actually has the needed properties.
  if (!highestMagnitudeQuake || !highestMagnitudeQuake.properties || typeof highestMagnitudeQuake.properties.mag !== 'number' || !highestMagnitudeQuake.geometry || !Array.isArray(highestMagnitudeQuake.geometry.coordinates) || highestMagnitudeQuake.geometry.coordinates.length < 2) {
    console.error("Main quake data is malformed or essential fields are missing in ClusterMiniMap:", highestMagnitudeQuake);
    return <div style={{ height: '200px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155' }} className="text-slate-400">Could not identify main quake due to malformed data.</div>;
  }

  // Filter out the highest magnitude quake from the originalQuakes array for the nearbyQuakes prop
  const nearbyQuakes = originalQuakes.filter(
    quake => quake.id !== highestMagnitudeQuake.id
  );

  // Props for EarthquakeMap
  // Ensure highestMagnitudeQuake.geometry and .properties exist
  // At this point, highestMagnitudeQuake is confirmed to have the necessary structure
  // due to the checks performed after the reduce operation.
  const latitude = highestMagnitudeQuake.geometry.coordinates[1];
  const longitude = highestMagnitudeQuake.geometry.coordinates[0];
  const magnitude = highestMagnitudeQuake.properties.mag;
  const title = highestMagnitudeQuake.properties.place || 'Main Quake'; // Fallback title

  // The check for essential props (lat, lon, mag) is implicitly covered by the
  // more robust `highestMagnitudeQuake` check above. If that check passes,
  // these properties should be valid.

  // The MiniMap will have a fixed height, similar to its previous fixed height.
  // EarthquakeMap uses 100% height, so we wrap it in a div with a fixed height.
  return (
    <div style={{ height: '200px', width: '100%' }}>
      <EarthquakeMap
        latitude={latitude}
        longitude={longitude}
        magnitude={magnitude}
        title={title}
        nearbyQuakes={nearbyQuakes}
        fitMapToBounds={true} // Enable bounds fitting for clusters
        // shakeMapUrl and mainQuakeDetailUrl are not directly available for clusters in this context
        // Pass null or omit if EarthquakeMap handles undefined props gracefully
        shakeMapUrl={null}
        mainQuakeDetailUrl={null} // Or highestMagnitudeQuake.properties.detail if available and relevant
      />
    </div>
  );
};

export default memo(ClusterMiniMap);
