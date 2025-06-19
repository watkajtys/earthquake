import { findActiveClusters as localFindActiveClusters } from '../utils/clusterUtils.js';

/**
 * @file clusterApiService.js
 * @description Service functions for interacting with the backend API related to earthquake cluster definitions and calculations.
 * This includes registering new cluster definitions, fetching existing ones, and calculating active clusters
 * with a client-side fallback mechanism.
 */

/**
 * Registers a cluster definition with the backend via a POST request to `/api/cluster-definition`.
 * @param {Object} clusterData - The cluster data to register.
 * @param {string} clusterData.clusterId - The ID of the cluster.
 * @param {string[]} clusterData.earthquakeIds - An array of earthquake IDs forming the cluster.
 * @param {string} clusterData.strongestQuakeId - The ID of the most significant earthquake in the cluster.
 * @returns {Promise<boolean>} A promise that resolves to `true` if registration is successful (201 Created), or `false` otherwise.
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
 * Fetches a specific cluster definition from the backend via a GET request to `/api/cluster-definition?id=<clusterId>`.
 * @param {string} clusterId - The ID of the cluster to fetch.
 * @returns {Promise<Object|null>} A promise that resolves to the cluster definition object
 *   (expected to contain `earthquakeIds`, `strongestQuakeId`, and optionally `updatedAt`) if found (200 OK),
 *   `null` if not found (404), or throws an error for other server/network issues.
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
 * Fetches a specific cluster definition along with all its associated earthquake GeoJSON feature data.
 *
 * @export
 * @async
 * @param {string} clusterId - The ID of the cluster to fetch.
 * @returns {Promise<Object|null>} A promise that resolves to the cluster definition object
 *   (including a `quakes` array property containing the GeoJSON features) if found (200 OK),
 *   `null` if not found (404), or throws an error for other server/network issues.
 * @throws {Error} If `clusterId` is invalid, or if the fetch operation fails due to network
 *                 or server issues (other than 404), or if JSON parsing fails.
 */
export async function fetchClusterWithQuakes(clusterId) {
  if (!clusterId) {
    console.error("fetchClusterWithQuakes: Invalid clusterId provided.");
    throw new Error("Invalid clusterId");
  }

  try {
    const response = await fetch(`/api/cluster-detail-with-quakes?id=${encodeURIComponent(clusterId)}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.status === 200) {
      const data = await response.json();
      console.log(`Cluster with quakes for ${clusterId} fetched successfully.`);
      return data; // Expected full cluster definition including 'quakes' array
    } else if (response.status === 404) {
      console.log(`Cluster with quakes for ${clusterId} not found (404).`);
      return null;
    } else {
      const errorBody = await response.text();
      console.error(
        `Failed to fetch cluster with quakes for ${clusterId}. Status: ${response.status}`,
        errorBody
      );
      throw new Error(`Failed to fetch cluster with quakes. Status: ${response.status}`);
    }
  } catch (error) {
    // This catches network errors, or errors from response.json() if status was 200 but body wasn't valid JSON.
    console.error(`Network or parsing error while fetching cluster with quakes for ${clusterId}:`, error);
    throw error; // Re-throw the caught error
  }
}

/**
 * Fetches active earthquake clusters. It first attempts to retrieve them from a backend service
 * at `/api/calculate-clusters`. This backend service is responsible for calculating and potentially
 * caching the clusters (e.g., using data sourced from D1). The request body to the backend
 * includes the current list of earthquakes and clustering parameters.
 *
 * If the server request fails, or if the server indicates a cache miss or stale data
 * (e.g., via the `X-Cache-Hit` header), this function falls back to calculating clusters
 * client-side using the `localFindActiveClusters` utility.
 *
 * @param {Array<Object>} earthquakes - Array of earthquake objects (typically GeoJSON features) to be clustered.
 * @param {number} maxDistanceKm - Maximum distance in kilometers for earthquakes to be considered in the same cluster.
 * @param {number} minQuakes - Minimum number of earthquakes required to form a valid cluster.
 * @returns {Promise<Array<Array<Object>>>} A promise that resolves to an array of clusters. Each cluster is an array of earthquake objects.
 * @throws {Error} If the backend request fails and the client-side fallback calculation also fails, or if input parameters are invalid.
 */
export async function fetchActiveClusters(earthquakes, maxDistanceKm, minQuakes) {
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
      body: JSON.stringify({ earthquakes, maxDistanceKm, minQuakes }),
    });

    const cacheHit = response.headers.get('X-Cache-Hit');

    if (response.ok) {
      const data = await response.json();
      let parsedClusters = null;

      if (data && data.clusters && Array.isArray(data.clusters)) {
        console.log(`Active clusters fetched from server (parsed as object with .clusters property). Cache-Hit: ${cacheHit}`);
        parsedClusters = data.clusters;
      } else if (data && Array.isArray(data)) {
        // This path handles cases where the server might directly return an array of clusters,
        // which was an older expectation for cacheHit === 'true' path.
        console.log(`Active clusters fetched from server (parsed as direct array). Cache-Hit: ${cacheHit}`);
        parsedClusters = data;
      } else {
        console.warn(`Unexpected data structure from server. Cache-Hit: ${cacheHit}. Will attempt local calculation.`);
        // parsedClusters remains null, proceed to local calculation
      }

      if (parsedClusters !== null) {
        if (cacheHit === 'true') {
          // Successfully got valid cluster data from server cache
          return parsedClusters;
        } else {
          // Server response was OK, data structure was valid, but it was not a cache hit (or header absent).
          // The original logic implies falling back to local calculation in this case.
          console.warn(`Server data received (Cache-Hit: ${cacheHit}), but policy is to fall back to local calculation for non-cache-hits or when X-Cache-Hit is not explicitly 'true'.`);
          // Fall through to local calculation by not returning here.
        }
      }
      // If parsedClusters is null (unexpected structure), fall through to local calculation.

    } else { // !response.ok
      const errorBody = await response.text();
      console.error(
        `Failed to fetch active clusters from server. Status: ${response.status}. Body: ${errorBody}. Falling back to local calculation.`
      );
    }
  } catch (error) {
    console.error('Network error while fetching active clusters. Falling back to local calculation:', error);
  }

  // Fallback to local calculation
  try {
    console.log('Initiating client-side cluster calculation using localFindActiveClusters.');
    const localClusters = localFindActiveClusters(earthquakes, maxDistanceKm, minQuakes);
    console.log('Client-side cluster calculation successful.');
    return localClusters;
  } catch (localError) {
    console.error('Client-side cluster calculation also failed:', localError);
    throw localError; // Re-throw if local calculation also fails
  }
}
