import React, { memo } from 'react';
import EarthquakeMap from './EarthquakeMap'; // Import the EarthquakeMap component

/**
 * Renders a mini map for a cluster of earthquakes.
 *
 * The map displays:
 * 1. A highlighted marker for the most recent (latest) valid earthquake in the cluster.
 * 2. Other earthquakes from the cluster as smaller, non-pulsing markers.
 *
 * Map behavior:
 * - The map is centered at the geographic average (mean) of all valid earthquakes in the cluster.
 * - It automatically fits its bounds to ensure all earthquakes in the cluster are visible,
 *   due to `fitMapToBounds={true}` being passed to the underlying `EarthquakeMap`.
 *
 * Data validation:
 * - The component performs several checks to ensure valid data before attempting to render the map.
 * - It requires a valid `cluster` object with an `originalQuakes` array.
 * - It filters `originalQuakes` to find a valid "latest" quake for highlighting and to calculate
 *   a valid geographic center. If either cannot be determined, a placeholder message is shown.
 *
 * @param {object} props - The component's props.
 * @param {object} props.cluster - The cluster data. Must contain an `originalQuakes` array.
 * @param {Array<object>} props.cluster.originalQuakes - An array of earthquake objects. Each object is expected
 *   to have `id`, `geometry.coordinates` (lng, lat, depth), and `properties.mag` (magnitude),
 *   `properties.place` or `properties.title`, and `properties.time`.
 * @returns {JSX.Element | null} The rendered EarthquakeMap component for the cluster or a placeholder/null if data is invalid.
 */
const ClusterMiniMap = ({ cluster }) => {
  // Section: Initial data validation
  // Check for the presence of cluster data and the originalQuakes array.
  if (!cluster) {
    return <div style={{ height: '200px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155' }} className="text-slate-400">Loading map data or map disabled</div>;
  }

  if (!cluster.originalQuakes || !Array.isArray(cluster.originalQuakes) || cluster.originalQuakes.length === 0) {
    return <div style={{ height: '200px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155' }} className="text-slate-400">No earthquakes in this cluster to display on map</div>;
  }

  const { originalQuakes } = cluster;

  // Section: Identify Latest Quake
  // Filter originalQuakes to find quakes that are valid for being considered the "latest" highlighted quake.
  // Criteria for a valid quake for highlighting:
  // - Must have a `properties` object.
  // - `properties.time` must be a number.
  // - Must have a `geometry` object with `geometry.coordinates` as an array of at least two numbers.
  // - `properties.mag` must be a number.
  // - `properties.place` or `properties.title` must be a string.
  const validQuakesForLatest = originalQuakes.filter(q =>
    q.properties &&
    typeof q.properties.time === 'number' &&
    q.geometry &&
    Array.isArray(q.geometry.coordinates) &&
    q.geometry.coordinates.length >= 2 &&
    typeof q.geometry.coordinates[0] === 'number' && // lng
    typeof q.geometry.coordinates[1] === 'number' && // lat
    typeof q.properties.mag === 'number' &&
    (typeof q.properties.place === 'string' || typeof q.properties.title === 'string')
  );

  let latestQuake = null;
  if (validQuakesForLatest.length > 0) {
    // From the valid quakes, find the one with the maximum (most recent) time.
    latestQuake = validQuakesForLatest.reduce((latest, current) => {
      return (current.properties.time > latest.properties.time) ? current : latest;
    });
  }

  // Pre-render check: Ensure a valid latestQuake was identified.
  if (!latestQuake) {
    console.error("Could not determine a valid latest quake for highlighting in ClusterMiniMap:", originalQuakes);
    // If no valid quake can be highlighted, render a specific placeholder.
    return <div style={{ height: '200px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155' }} className="text-slate-400">Cannot determine highlight quake for cluster.</div>;
  }

  // Section: Calculate Geographic Center
  // Filter originalQuakes to find quakes with valid coordinates for calculating the geographic center.
  // Criteria for a valid quake for centering:
  // - Must have a `geometry` object with `geometry.coordinates` as an array of at least two parsable numbers.
  const validQuakesForCenter = originalQuakes.filter(q =>
    q.geometry &&
    Array.isArray(q.geometry.coordinates) &&
    q.geometry.coordinates.length >= 2 &&
    !isNaN(parseFloat(q.geometry.coordinates[1])) && // lat
    !isNaN(parseFloat(q.geometry.coordinates[0]))    // lng
  );

  let avgLat = null;
  let avgLng = null;

  if (validQuakesForCenter.length > 0) {
    let sumLat = 0;
    let sumLng = 0;
    validQuakesForCenter.forEach(quake => {
      sumLat += parseFloat(quake.geometry.coordinates[1]);
      sumLng += parseFloat(quake.geometry.coordinates[0]);
    });
    avgLat = sumLat / validQuakesForCenter.length;
    avgLng = sumLng / validQuakesForCenter.length;
  }

  // Pre-render check: Ensure a valid geographic center was calculated.
  // This is a safeguard. If a `latestQuake` was found, it should also be in `validQuakesForCenter`,
  // meaning `validQuakesForCenter` shouldn't be empty if `latestQuake` is not null.
  if (avgLat === null || avgLng === null) {
    console.error("Could not determine a valid geographic center for cluster in ClusterMiniMap:", originalQuakes);
    // If no valid center can be calculated, render a specific placeholder.
    return <div style={{ height: '200px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155' }} className="text-slate-400">Cannot determine map center for cluster.</div>;
  }

  // Section: Determine Other Quakes for Display
  // Create an array of quakes to be displayed as "nearby" markers, excluding the main highlighted (latest) quake.
  // This prevents rendering the same quake twice if EarthquakeMap doesn't de-duplicate.
  const otherQuakes = originalQuakes.filter(quake => quake.id !== latestQuake.id);

  // Section: Prepare Props for EarthquakeMap
  const mapProps = {
    mapCenterLatitude: avgLat,                                  // Center the map on the geographic average of the cluster.
    mapCenterLongitude: avgLng,                                 //
    highlightQuakeLatitude: latestQuake.geometry.coordinates[1],  // Latitude of the latest quake to highlight.
    highlightQuakeLongitude: latestQuake.geometry.coordinates[0], // Longitude of the latest quake to highlight.
    highlightQuakeMagnitude: latestQuake.properties.mag,        // Magnitude of the latest quake.
    highlightQuakeTitle: latestQuake.properties.place || latestQuake.properties.title || 'Latest Event', // Title for the highlighted quake.
    nearbyQuakes: otherQuakes,                                  // Other quakes in the cluster.
    fitMapToBounds: true,                                     // Instruct EarthquakeMap to fit bounds to show all points.
    shakeMapUrl: null,                                          // Clusters don't have a single ShakeMap URL.
    mainQuakeDetailUrl: null,                                   // No single detail URL for the entire cluster view.
                                                                // Could potentially link to the latestQuake's detail if available.
    defaultZoom: 8,                                             // Default zoom for EarthquakeMap (used if not fitting bounds or single point).
  };

  // Render the EarthquakeMap with the prepared props, wrapped in a div to maintain fixed height.
  return (
    <div style={{ width: '100%' }} className="h-[300px] md:h-[400px] lg:h-[450px]">
      <EarthquakeMap {...mapProps} />
    </div>
  );
};

export default memo(ClusterMiniMap);
