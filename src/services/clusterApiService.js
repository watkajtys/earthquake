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
export async function fetchActiveClusters() {
  try {
    const response = await fetch('/api/get-clusters', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`Active clusters fetched from server. Cache-Status: ${response.headers.get('X-Cache-Status')}`);
      return data;
    } else {
      const errorBody = await response.text();
      console.error(
        `Failed to fetch active clusters from server. Status: ${response.status}. Body: ${errorBody}.`
      );
      // Depending on requirements, you might want to return an empty array or throw an error.
      // For a non-critical feature, returning an empty array might be preferable.
      return [];
    }
  } catch (error) {
    console.error('Network error while fetching active clusters:', error);
    return []; // Return an empty array on network error to prevent UI crashes.
  }
}
