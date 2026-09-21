import { findActiveClustersOptimized } from '../utils/spatialClusterUtils.js';
import { storeClusterDefinition } from '../utils/d1ClusterUtils.js';
import { CLUSTER_MIN_QUAKES, DEFINED_CLUSTER_MIN_MAGNITUDE } from '../../src/constants/appConstants.js';

import { randomUUID } from "node:crypto";
function getStrongestQuake(cluster) {
  if (!cluster || cluster.length === 0) return null;
  return cluster.reduce(
    (maxQuake, currentQuake) =>
      currentQuake.properties.mag > maxQuake.properties.mag
        ? currentQuake
        : maxQuake,
    cluster[0],
  );
}
function getMinMagnitude(cluster) {
  if (!cluster || cluster.length === 0) return null;
  return cluster.reduce(
    (min, q) => Math.min(min, q.properties.mag),
    cluster[0].properties.mag,
  );
}
function getMeanMagnitude(cluster) {
  if (!cluster || cluster.length === 0) return null;
  const sum = cluster.reduce((acc, q) => acc + q.properties.mag, 0);
  return sum / cluster.length;
}
function getStartTime(cluster) {
  if (!cluster || cluster.length === 0) return null;
  return cluster.reduce(
    (min, q) => Math.min(min, q.properties.time),
    cluster[0].properties.time,
  );
}
function getEndTime(cluster) {
  if (!cluster || cluster.length === 0) return null;
  return cluster.reduce(
    (max, q) => Math.max(max, q.properties.time),
    cluster[0].properties.time,
  );
}
function getDepthRangeString(cluster) {
  if (!cluster || cluster.length === 0) return "Unknown";
  const depths = cluster
    .map((q) => q.geometry?.coordinates?.[2])
    .filter((d) => d !== void 0 && d !== null && typeof d === "number");
  if (depths.length === 0) return "Unknown";
  const minDepth = Math.min(...depths);
  const maxDepth = Math.max(...depths);
  return `${minDepth.toFixed(1)}-${maxDepth.toFixed(1)}km`;
}
function generateSlug(quakeCount, locationName, maxMagnitude, stableKey) {
  const safeLocationBase = (locationName || "unknown-location")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  const keyParts = stableKey.split("_");
  let stableKeyIdentifier = "";
  if (keyParts.length >= 4) {
    const timePart = keyParts[2];
    const geoPart = keyParts[3]
      .replace(/\./g, "d")
      .replace(/[^a-z0-9-]/g, "")
      .substring(0, 15);
    stableKeyIdentifier = `${timePart}-${geoPart}`;
  } else {
    let hash = 0;
    for (let i = 0; i < stableKey.length; i++) {
      const char = stableKey.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    stableKeyIdentifier = `skh${Math.abs(hash).toString(36).substring(0, 6)}`;
  }
  const magStr =
    typeof maxMagnitude === "number" ? maxMagnitude.toFixed(1) : "unknown";
  const countStr = Number.isFinite(quakeCount) ? quakeCount : "multiple";
  const locationSlugPart = safeLocationBase
    .slice(0, 30)
    .replace(/^-+|-+$/g, "");
  return `${countStr}-quakes-near-${locationSlugPart}-m${magStr}-${stableKeyIdentifier}`;
}
function generateTitle(quakeCount, locationName, maxMagnitude) {
  const safeLocation = locationName || "Unknown Location";
  return `Cluster: ${quakeCount} events near ${safeLocation}, max M${maxMagnitude.toFixed(1)}`;
}
function generateDescription(
  quakeCount,
  locationName,
  maxMagnitude,
  durationHours,
) {
  const durationStr =
    durationHours > 0
      ? `approx ${durationHours.toFixed(1)} hours`
      : "a short period";
  return `A cluster of ${quakeCount} earthquakes occurred near ${locationName}. Strongest: M${maxMagnitude.toFixed(1)}. Duration: ${durationStr}.`;
}
function generateStableClusterKey(
  calculatedCluster,
  strongestQuakeInCalcCluster,
) {
  const D_STABLE_KEY_VERSION = "v1";
  let locationComponent = "unknown-location";
  if (
    strongestQuakeInCalcCluster &&
    strongestQuakeInCalcCluster.properties &&
    strongestQuakeInCalcCluster.properties.place
  ) {
    const place = strongestQuakeInCalcCluster.properties.place;
    const parts = place.split(" of ");
    const generalPlace = parts.length > 1 ? parts[parts.length - 1] : place;
    locationComponent = generalPlace
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .substring(0, 30);
    if (!locationComponent) locationComponent = "unknown-location";
  }
  const startTime = getStartTime(calculatedCluster);
  const sixHoursInMillis = 6 * 60 * 60 * 1e3;
  const timeComponent = Math.floor(startTime / sixHoursInMillis);
  let geoComponent = "0.0-0.0";
  if (
    strongestQuakeInCalcCluster &&
    strongestQuakeInCalcCluster.geometry &&
    strongestQuakeInCalcCluster.geometry.coordinates
  ) {
    const lon = strongestQuakeInCalcCluster.geometry.coordinates[0];
    const lat = strongestQuakeInCalcCluster.geometry.coordinates[1];
    if (typeof lon === "number" && typeof lat === "number") {
      geoComponent = `${lat.toFixed(1)}-${lon.toFixed(1)}`;
    }
  }
  return `${D_STABLE_KEY_VERSION}_${locationComponent}_${timeComponent}_${geoComponent}`;
}
async function storeClusterDefinitions(db, clusters) {
  if (!db || !clusters || clusters.length === 0) {
    console.log(
      "storeClusterDefinitions: DB not available or no clusters to process.",
    );
    return;
  }
  console.log(
    `storeClusterDefinitions: Starting processing of ${clusters.length} clusters.`,
  );
  let significantClusterCount = 0;
  let processedCount = 0;
  let errorCount = 0;
  for (const calculatedCluster of clusters) {
    if (!calculatedCluster || calculatedCluster.length === 0) continue;
    const strongestQuakeInCalcCluster = getStrongestQuake(calculatedCluster);
    if (
      !strongestQuakeInCalcCluster ||
      !strongestQuakeInCalcCluster.properties ||
      !strongestQuakeInCalcCluster.id
    ) {
      console.warn(
        "storeClusterDefinitions: Skipping cluster due to missing strongest quake.",
      );
      continue;
    }
    const clusterMaxMag = strongestQuakeInCalcCluster.properties.mag;
    if (
      calculatedCluster.length >= CLUSTER_MIN_QUAKES &&
      clusterMaxMag >= DEFINED_CLUSTER_MIN_MAGNITUDE
    ) {
      significantClusterCount++;
      const stableKey = generateStableClusterKey(
        calculatedCluster,
        strongestQuakeInCalcCluster,
      );
      const quakeCount = calculatedCluster.length;
      const startTime = getStartTime(calculatedCluster);
      const endTime = getEndTime(calculatedCluster);
      const durationHours =
        endTime > startTime ? (endTime - startTime) / (1e3 * 60 * 60) : 0;
      const locationName =
        strongestQuakeInCalcCluster.properties.place || "Unknown Location";
      const maxMagnitude = clusterMaxMag;
      const newEarthquakeIds = calculatedCluster.map((q) => q.id);
      const newStrongestQuakeId = strongestQuakeInCalcCluster.id;
      const newMinMagnitude = getMinMagnitude(calculatedCluster);
      const newMeanMagnitude = getMeanMagnitude(calculatedCluster);
      const newDepthRange = getDepthRangeString(calculatedCluster);
      const newCentroidLat =
        strongestQuakeInCalcCluster.geometry.coordinates[1] || 0;
      const newCentroidLon =
        strongestQuakeInCalcCluster.geometry.coordinates[0] || 0;
      const newTitle = generateTitle(quakeCount, locationName, maxMagnitude);
      const newDescription = generateDescription(
        quakeCount,
        locationName,
        maxMagnitude,
        durationHours,
      );
      const newSignificanceScore =
        quakeCount > 0 ? maxMagnitude * Math.log10(quakeCount) : 0;
      try {
        const proposedId = randomUUID();
        const result = await storeClusterDefinition(db, {
          id: proposedId,
          stableKey,
          earthquakeIds: newEarthquakeIds,
          quakeCount,
          strongestQuakeId: newStrongestQuakeId,
          maxMagnitude,
          minMagnitude: newMinMagnitude,
          meanMagnitude: newMeanMagnitude,
          startTime,
          endTime,
          durationHours,
          locationName,
          centroidLat: newCentroidLat,
          centroidLon: newCentroidLon,
          radiusKm: 0,
          depthRange: newDepthRange,
          slug: generateSlug(quakeCount, locationName, maxMagnitude, stableKey),
          title: newTitle,
          description: newDescription,
          significanceScore: newSignificanceScore,
        });
        if (result?.success !== true) {
          throw new Error(result?.error || "Cluster persistence was not confirmed");
        }
        // Another invocation may already own this stableKey. Only the identity
        // returned by the atomic write is canonical, never our proposed UUID.
        console.log(`storeClusterDefinitions: Stored definition ${result.id} (${result.slug}).`);
        processedCount++;
      } catch (e) {
        console.error(
          `storeClusterDefinitions: Exception while processing cluster with stableKey ${stableKey}: ${e.message}`,
          e.stack,
        );
        errorCount++;
      }
    }
  }
  if (significantClusterCount === 0) {
    console.log(
      "storeClusterDefinitions: No significant clusters met criteria for definition storage.",
    );
  }
  console.log(
    `storeClusterDefinitions: Finished processing. Found ${significantClusterCount} significant clusters. Processed: ${processedCount}, Errors: ${errorCount}.`,
  );
  if (errorCount) throw new Error(`Cluster persistence failed for ${errorCount} definitions; retaining the previous published snapshot`);
}
var process_cluster_definitions_default = {
  async scheduled(controller, env) {
    console.log("process-cluster-definitions: Cron job started.");
    try {
      const thirtyDaysAgo = /* @__PURE__ */ new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoTimestamp = thirtyDaysAgo.getTime();
      const stmt = env.DB.prepare(
        "SELECT id, event_time, latitude, longitude, depth, magnitude, place FROM EarthquakeEvents WHERE event_time > ?",
      ).bind(thirtyDaysAgoTimestamp);
      const readResult = await stmt.all();
      if (readResult?.success !== true || !Array.isArray(readResult.results)) throw new Error("Recent-earthquake query failed");
      const { results } = readResult;
      if (results.length === 0) {
        console.log(
          "process-cluster-definitions: No recent earthquakes found. Exiting.",
        );
        return;
      }
      const earthquakes = results.map((row) => ({
        id: row.id,
        geometry: {
          coordinates: [row.longitude, row.latitude, row.depth],
          // GeoJSON is [lon, lat, depth]
        },
        properties: {
          time: row.event_time,
          mag: row.magnitude,
          place: row.place,
        },
      }));
      console.log(
        `process-cluster-definitions: Fetched ${earthquakes.length} recent earthquakes.`,
      );
      const maxDistanceKm = 50;
      const minQuakes = 3;
      const clusters = findActiveClustersOptimized(
        earthquakes,
        maxDistanceKm,
        minQuakes,
      );
      console.log(
        `process-cluster-definitions: Calculated ${clusters.length} clusters.`,
      );
      if (clusters.length > 0) {
        await storeClusterDefinitions(env.DB, clusters);
        const stmt2 = env.DB.prepare(
          `
          SELECT
            id,
            slug,
            title,
            description,
            locationName,
            centroidLat,
            centroidLon,
            radiusKm,
            depthRange,
            startTime,
            endTime,
            durationHours,
            quakeCount,
            strongestQuakeId,
            earthquakeIds,
            maxMagnitude,
            meanMagnitude,
            minMagnitude,
            significanceScore,
            version,
            updatedAt
          FROM ClusterDefinitions
          WHERE endTime >= ?
          ORDER BY significanceScore DESC
        `,
        ).bind(thirtyDaysAgoTimestamp);
        const clusterResult = await stmt2.all();
        if (clusterResult?.success !== true || !Array.isArray(clusterResult.results)) throw new Error("Active-cluster query failed");
        const activeClusters = clusterResult.results;
        try {
          const cacheKey = "active_clusters";
          await env.CLUSTER_KV.put(cacheKey, JSON.stringify(activeClusters), {
            expirationTtl: 3600,
            // Cache for 1 hour
          });
          console.log(
            `process-cluster-definitions: Successfully cached ${activeClusters.length} clusters in KV.`,
          );
        } catch (kvError) {
          console.error(
            "process-cluster-definitions: Failed to cache clusters in KV:",
            kvError.message,
            kvError.stack,
          );
          throw kvError;
        }
      }
      console.log(
        "process-cluster-definitions: Cron job finished successfully.",
      );
    } catch (error) {
      console.error(
        "process-cluster-definitions: Unhandled error in scheduled event:",
        error.message,
        error.stack,
      );
      throw error;
    }
  },
};

export { process_cluster_definitions_default as default };
