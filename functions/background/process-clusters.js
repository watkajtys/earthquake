
/**
 * @file functions/background/process-clusters.js
 * @description Background worker task to calculate and store significant cluster definitions in D1.
 * This is a scheduled task, decoupled from the live user-facing API.
 */

import { findActiveClustersOptimized } from '../utils/spatialClusterUtils.js';
import { storeClusterDefinition } from '../utils/d1ClusterUtils.js';
import { CLUSTER_MIN_QUAKES, DEFINED_CLUSTER_MIN_MAGNITUDE } from '../../src/constants/appConstants.js';
import { randomUUID } from 'node:crypto';

// --- Helper functions (copied from the original calculate-clusters.POST.js) ---

function getStrongestQuake(cluster) {
  if (!cluster || cluster.length === 0) return null;
  return cluster.reduce((maxQuake, currentQuake) =>
    (currentQuake.properties.mag > maxQuake.properties.mag) ? currentQuake : maxQuake, cluster[0]);
}

function getMinMagnitude(cluster) {
  if (!cluster || cluster.length === 0) return null;
  return cluster.reduce((min, q) => Math.min(min, q.properties.mag), cluster[0].properties.mag);
}

function getMeanMagnitude(cluster) {
  if (!cluster || cluster.length === 0) return null;
  const sum = cluster.reduce((acc, q) => acc + q.properties.mag, 0);
  return sum / cluster.length;
}

function getStartTime(cluster) {
  if (!cluster || cluster.length === 0) return null;
  return cluster.reduce((min, q) => Math.min(min, q.properties.time), cluster[0].properties.time);
}

function getEndTime(cluster) {
  if (!cluster || cluster.length === 0) return null;
  return cluster.reduce((max, q) => Math.max(max, q.properties.time), cluster[0].properties.time);
}

function getDepthRangeString(cluster) {
  if (!cluster || cluster.length === 0) return "Unknown";
  const depths = cluster
    .map(q => q.geometry?.coordinates?.[2])
    .filter(d => d !== undefined && d !== null && typeof d === 'number');
  if (depths.length === 0) return "Unknown";
  const minDepth = Math.min(...depths);
  const maxDepth = Math.max(...depths);
  return `${minDepth.toFixed(1)}-${maxDepth.toFixed(1)}km`;
}

function generateSlug(quakeCount, locationName, maxMagnitude, stableKey) {
  const safeLocationBase = (locationName || "unknown-location")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  const keyParts = stableKey.split('_');
  let stableKeyIdentifier = "";
  if (keyParts.length >= 4) {
    const timePart = keyParts[2];
    const geoPart = keyParts[3].replace(/\./g, 'd').replace(/[^a-z0-9-]/g, '').substring(0, 15);
    stableKeyIdentifier = `${timePart}-${geoPart}`;
  } else {
    let hash = 0;
    for (let i = 0; i < stableKey.length; i++) {
      const char = stableKey.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    stableKeyIdentifier = `skh${Math.abs(hash).toString(36).substring(0, 6)}`;
  }

  const magStr = typeof maxMagnitude === 'number' ? maxMagnitude.toFixed(1) : 'unknown';
  const countStr = Number.isFinite(quakeCount) ? quakeCount : 'multiple';
  const locationSlugPart = safeLocationBase.slice(0, 30).replace(/^-+|-+$/g, '');

  return `${countStr}-quakes-near-${locationSlugPart}-m${magStr}-${stableKeyIdentifier}`;
}

function generateTitle(quakeCount, locationName, maxMagnitude) {
  const safeLocation = locationName || "Unknown Location";
  return `Cluster: ${quakeCount} events near ${safeLocation}, max M${maxMagnitude.toFixed(1)}`;
}

function generateDescription(quakeCount, locationName, maxMagnitude, durationHours) {
  const safeLocation = locationName || "Unknown Location";
  const durationStr = durationHours > 0 ? `approx ${durationHours.toFixed(1)} hours` : "a short period";
  return `A cluster of ${quakeCount} earthquakes occurred near ${locationName}. Strongest: M${maxMagnitude.toFixed(1)}. Duration: ${durationStr}.`;
}

function generateStableClusterKey(calculatedCluster, strongestQuakeInCalcCluster) {
  const D_STABLE_KEY_VERSION = "v1";

  let locationComponent = "unknown-location";
  if (strongestQuakeInCalcCluster && strongestQuakeInCalcCluster.properties && strongestQuakeInCalcCluster.properties.place) {
    const place = strongestQuakeInCalcCluster.properties.place;
    const parts = place.split(" of ");
    const generalPlace = parts.length > 1 ? parts[parts.length - 1] : place;
    locationComponent = generalPlace.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').substring(0, 30);
    if (!locationComponent) locationComponent = "unknown-location";
  }

  const startTime = getStartTime(calculatedCluster);
  const sixHoursInMillis = 6 * 60 * 60 * 1000;
  const timeComponent = Math.floor(startTime / sixHoursInMillis);

  let geoComponent = "0.0-0.0";
  if (strongestQuakeInCalcCluster && strongestQuakeInCalcCluster.geometry && strongestQuakeInCalcCluster.geometry.coordinates) {
    const lon = strongestQuakeInCalcCluster.geometry.coordinates[0];
    const lat = strongestQuakeInCalcCluster.geometry.coordinates[1];
    if (typeof lon === 'number' && typeof lat === 'number') {
      geoComponent = `${lat.toFixed(1)}-${lon.toFixed(1)}`;
    }
  }
  return `${D_STABLE_KEY_VERSION}_${locationComponent}_${timeComponent}_${geoComponent}`;
}


// --- Main Processing Logic ---

export async function processAndStoreSignificantClusters(env) {
  console.log("BACKGROUND_PROCESS: Starting significant cluster processing.");

  const { DB } = env;
  if (!DB) {
    console.error("BACKGROUND_PROCESS: D1 Database (DB) binding not found. Aborting.");
    return;
  }

  // 1. Fetch the latest, comprehensive earthquake data from our own API.
  // This ensures we are processing the same data that users see.
  let earthquakes = [];
  try {
    // We call the get-earthquakes endpoint to get all recent quakes from D1.
    // This is more reliable than hitting the USGS proxy directly.
    const response = await fetch("https://earthquakeslive.com/api/get-earthquakes?timeWindow=last_30_days&minMag=1");
    if (!response.ok) {
      throw new Error(`Failed to fetch earthquakes: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    earthquakes = data.features;
    console.log(`BACKGROUND_PROCESS: Fetched ${earthquakes.length} earthquakes for processing.`);
  } catch (error) {
    console.error("BACKGROUND_PROCESS: Failed to fetch earthquake data.", error);
    return;
  }

  if (earthquakes.length === 0) {
    console.log("BACKGROUND_PROCESS: No earthquakes to process. Exiting.");
    return;
  }

  // 2. Calculate clusters using the most robust algorithm.
  const clusters = findActiveClustersOptimized(earthquakes, 100, CLUSTER_MIN_QUAKES);
  console.log(`BACKGROUND_PROCESS: Calculated ${clusters.length} potential clusters.`);

  // 3. Process and store only the significant ones in D1.
  let significantClusterCount = 0;
  let processedCount = 0;
  let errorCount = 0;

  for (const calculatedCluster of clusters) {
    if (!calculatedCluster || calculatedCluster.length === 0) continue;

    const strongestQuakeInCalcCluster = getStrongestQuake(calculatedCluster);
    if (!strongestQuakeInCalcCluster) continue;

    const clusterMaxMag = strongestQuakeInCalcCluster.properties.mag;

    if (calculatedCluster.length >= CLUSTER_MIN_QUAKES && clusterMaxMag >= DEFINED_CLUSTER_MIN_MAGNITUDE) {
      significantClusterCount++;

      const stableKey = generateStableClusterKey(calculatedCluster, strongestQuakeInCalcCluster);
      
      try {
        const existingStmt = DB.prepare("SELECT id, slug, version FROM ClusterDefinitions WHERE stableKey = ?").bind(stableKey);
        const existingDefinition = await existingStmt.first();

        const quakeCount = calculatedCluster.length;
        const startTime = getStartTime(calculatedCluster);
        const endTime = getEndTime(calculatedCluster);
        const durationHours = (endTime > startTime) ? (endTime - startTime) / (1000 * 60 * 60) : 0;
        const locationName = strongestQuakeInCalcCluster.properties.place || "Unknown Location";
        const maxMagnitude = clusterMaxMag;
        const newEarthquakeIds = calculatedCluster.map(q => q.id);
        const newStrongestQuakeId = strongestQuakeInCalcCluster.id;
        const newMinMagnitude = getMinMagnitude(calculatedCluster);
        const newMeanMagnitude = getMeanMagnitude(calculatedCluster);
        const newDepthRange = getDepthRangeString(calculatedCluster);
        const newCentroidLat = strongestQuakeInCalcCluster.geometry.coordinates[1] || 0;
        const newCentroidLon = strongestQuakeInCalcCluster.geometry.coordinates[0] || 0;
        const newTitle = generateTitle(quakeCount, locationName, maxMagnitude);
        const newDescription = generateDescription(quakeCount, locationName, maxMagnitude, durationHours);
        const newSignificanceScore = quakeCount > 0 ? maxMagnitude * Math.log10(quakeCount) : 0;

        if (existingDefinition) {
          // Update existing definition
          const updatedVersion = (existingDefinition.version || 1) + 1;
          const updateSql = `
            UPDATE ClusterDefinitions
            SET earthquakeIds = ?, quakeCount = ?, strongestQuakeId = ?, maxMagnitude = ?,
                minMagnitude = ?, meanMagnitude = ?, endTime = ?, durationHours = ?,
                locationName = ?, centroidLat = ?, centroidLon = ?, depthRange = ?,
                title = ?, description = ?, significanceScore = ?, version = ?,
                updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?`;
          
          await DB.prepare(updateSql).bind(
            JSON.stringify(newEarthquakeIds), quakeCount, newStrongestQuakeId, maxMagnitude,
            newMinMagnitude, newMeanMagnitude, endTime, durationHours,
            locationName, newCentroidLat, newCentroidLon, newDepthRange,
            newTitle, newDescription, newSignificanceScore, updatedVersion,
            existingDefinition.id
          ).run();
          processedCount++;
        } else {
          // Create new definition
          const newClusterId = randomUUID();
          const newSlug = generateSlug(quakeCount, locationName, maxMagnitude, stableKey);

          const clusterDataForStoreUtil = {
            id: newClusterId,
            stableKey: stableKey,
            earthquakeIds: newEarthquakeIds,
            quakeCount: quakeCount,
            strongestQuakeId: newStrongestQuakeId,
            maxMagnitude: maxMagnitude,
            minMagnitude: newMinMagnitude,
            meanMagnitude: newMeanMagnitude,
            startTime: startTime,
            endTime: endTime,
            durationHours: durationHours,
            locationName: locationName,
            centroidLat: newCentroidLat,
            centroidLon: newCentroidLon,
            radiusKm: 0,
            depthRange: newDepthRange,
            slug: newSlug,
            title: newTitle,
            description: newDescription,
            significanceScore: newSignificanceScore,
            version: 1,
          };

          const result = await storeClusterDefinition(DB, clusterDataForStoreUtil);

          if (result.success) {
            processedCount++;
          } else {
            console.error(`BACKGROUND_PROCESS: Failed to store new definition for cluster ${newClusterId}: ${result.error}`);
            errorCount++;
          }
        }
      } catch (e) {
        console.error(`BACKGROUND_PROCESS: Exception while processing cluster with stableKey ${stableKey}: ${e.message}`, e.stack);
        errorCount++;
      }
    }
  }

  console.log(`BACKGROUND_PROCESS: Finished. Found ${significantClusterCount} significant clusters. Processed (stored/updated): ${processedCount}, Errors: ${errorCount}.`);
}
