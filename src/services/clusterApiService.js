import { findActiveClusters as localFindActiveClusters } from '../utils/clusterUtils.js';

/**
 * Registers a cluster definition with the backend.
 * @param {object} clusterData - The cluster data to register.
 * @param {string} clusterData.clusterId - The ID of the cluster.
 * @param {string[]} clusterData.earthquakeIds - An array of earthquake IDs in the cluster.
 * @param {string} clusterData.strongestQuakeId - The ID of the strongest earthquake in the cluster.
 * @returns {Promise<boolean>} True if registration is successful, false otherwise.
 */
export async function registerClusterDefinition(clusterData) {
  if (!clusterData || !clusterData.clusterId || !clusterData.earthquakeIds || !clusterData.strongestQuakeId) {
    console.error("registerClusterDefinition: Invalid clusterData provided.", clusterData);
    return false;
  }

  try {
    const response = await fetch('/api/cluster-definition', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(clusterData),
    });

    if (response.status === 201) {
      console.log(`Cluster definition for ${clusterData.clusterId} registered successfully.`);
      return true;
    } else {
      const responseBody = await response.text(); // Using text() to avoid JSON parse error if body is not JSON
      console.error(
        `Failed to register cluster definition for ${clusterData.clusterId}. Status: ${response.status}`,
        responseBody
      );
      return false;
    }
  } catch (error) {
    console.error(`Network error while registering cluster definition for ${clusterData.clusterId}:`, error);
    return false;
  }
}

/**
 * Fetches a cluster definition from the backend.
 * @param {string} clusterId - The ID of the cluster to fetch.
 * @returns {Promise<object|null>} The cluster definition object if found,
 *                                 null if not found (404),
 *                                 or throws an error for other issues.
 */
export async function fetchClusterDefinition(clusterId) {
  if (!clusterId) {
    console.error("fetchClusterDefinition: Invalid clusterId provided.");
    throw new Error("Invalid clusterId");
  }

  try {
    const response = await fetch(`/api/cluster-definition?id=${encodeURIComponent(clusterId)}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.status === 200) {
      const data = await response.json();
      console.log(`Cluster definition for ${clusterId} fetched successfully.`);
      return data; // Expected { earthquakeIds, strongestQuakeId }
    } else if (response.status === 404) {
      console.log(`Cluster definition for ${clusterId} not found (404).`);
      return null;
    } else {
      const errorBody = await response.text();
      console.error(
        `Failed to fetch cluster definition for ${clusterId}. Status: ${response.status}`,
        errorBody
      );
      throw new Error(`Failed to fetch cluster definition. Status: ${response.status}`);
    }
  } catch (error) {
    console.error(`Network error while fetching cluster definition for ${clusterId}:`, error);
    throw error; // Re-throw network errors or errors from response.json()
  }
}

/**
 * Fetches active earthquake clusters from the backend with client-side fallback.
 * @param {Array<object>} earthquakes - Array of earthquake objects (original argument for potential fallback).
 * @param {number} maxDistanceKm - Maximum distance for clustering (original argument for potential fallback).
 * @param {number} minQuakes - Minimum quakes to form a cluster (original argument for potential fallback).
 * @returns {Promise<Array<Array<object>>>} An array of clusters.
 * @throws {Error} If the request fails and the fallback also fails.
 */
export async function fetchActiveClusters(earthquakes, maxDistanceKm, minQuakes) {
  // Store original arguments for fallback - they are already available as function parameters.
  if (!Array.isArray(earthquakes)) {
    console.error("fetchActiveClusters: Invalid earthquakes array provided.");
    throw new Error("Invalid earthquakes array");
  }
  if (typeof maxDistanceKm !== 'number' || maxDistanceKm <= 0) {
    console.error("fetchActiveClusters: Invalid maxDistanceKm provided.");
    throw new Error("Invalid maxDistanceKm");
  }
  if (typeof minQuakes !== 'number' || minQuakes <= 0) {
    console.error("fetchActiveClusters: Invalid minQuakes provided.");
    throw new Error("Invalid minQuakes");
  }

  try {
    const response = await fetch('/api/calculate-clusters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ earthquakes, maxDistanceKm, minQuakes,
        // Sending lastFetchTime and timeWindowHours if available/relevant for server cache
        // For now, assuming the server handles their absence if not critical for this client's context
      }),
    });

    const cacheHit = response.headers.get('X-Cache-Hit');

    if (response.ok && cacheHit === 'true') {
      console.log('Active clusters fetched successfully from server cache.');
      const data = await response.json();
      return data;
    } else if (response.ok && cacheHit !== 'true') {
      console.warn(`Server cache miss or stale data (X-Cache-Hit: ${cacheHit}). Falling back to local calculation.`);
      // Proceed to fallback (outside this block, after catch)
    } else { // !response.ok
      const errorBody = await response.text();
      console.error(
        `Failed to fetch active clusters from server. Status: ${response.status}. Body: ${errorBody}. Falling back to local calculation.`
      );
      // Proceed to fallback (outside this block, after catch)
    }
  } catch (error) {
    console.error('Network error while fetching active clusters. Falling back to local calculation:', error);
    // Proceed to fallback
  }

  // Fallback to local calculation
  try {
    console.log('Initiating client-side cluster calculation.');
    const localClusters = localFindActiveClusters(earthquakes, maxDistanceKm, minQuakes);
    console.log('Client-side cluster calculation successful.');
    return localClusters;
  } catch (localError) {
    console.error('Client-side cluster calculation also failed:', localError);
    throw localError; // Re-throw the error from local calculation
  }
}
