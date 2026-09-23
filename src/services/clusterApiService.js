import { validateSummaryEnvelope, MAX_SUMMARY_CURSOR_LENGTH, MAX_SUMMARY_PAGE_BYTES, SUMMARY_DEFAULT_LIMIT } from '../../shared/clusterSummaryContract.js';

/**
 * @file clusterApiService.js
 * @description Service functions for interacting with the backend API related to earthquake cluster definitions and calculations.
 * Includes definition/detail requests and bounded pages of stored cluster summaries.
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
export async function fetchClusterWithQuakes(selector, { signal } = {}) {
  const entries = typeof selector === 'string' ? [['id', selector]] : Object.entries(selector || {});
  if (entries.length !== 1 || !['id', 'clusterId', 'slug', 'route'].includes(entries[0][0]) ||
      typeof entries[0][1] !== 'string' || !entries[0][1]) throw new Error('Invalid cluster selector');
  const query = new URLSearchParams(entries);
  const response = await fetch(`/api/cluster-detail-with-quakes?${query}`, {
    method: 'GET', headers: { Accept: 'application/json' }, signal,
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Cluster details request failed (HTTP ${response.status}).`);
  const data = await response.json();
  if (!data || typeof data.id !== 'string' || !Array.isArray(data.quakes)) throw new Error('Invalid cluster details response.');
  return data;
}

// The overview consumes only compact, immutable snapshot pages. It never falls
// back to the legacy full-definition endpoint on failure.
export const CLUSTER_SUMMARY_MAX_BYTES = MAX_SUMMARY_PAGE_BYTES;
export const CLUSTER_SUMMARY_PAGE_SIZE = SUMMARY_DEFAULT_LIMIT;
const SUMMARY_DEADLINE_MS = 30_000;

export async function fetchActiveClusters({ signal, cursor } = {}) {
  if (cursor !== undefined && (typeof cursor !== 'string' || !cursor || cursor.length > MAX_SUMMARY_CURSOR_LENGTH)) {
    throw new Error('Invalid cluster continuation cursor.');
  }
  const query = cursor === undefined ? 'view=overview&limit=100' : new URLSearchParams({ cursor }).toString();
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(new DOMException('Cluster request timed out. Please retry.', 'TimeoutError')), SUMMARY_DEADLINE_MS);
  let reader;
  let abortListener;
  try {
    const cancelled = new Promise((_, reject) => {
      abortListener = () => {
        void reader?.cancel().catch(() => {});
        reject(controller.signal.reason || new DOMException('Aborted', 'AbortError'));
      };
      if (controller.signal.aborted) abortListener();
      else controller.signal.addEventListener('abort', abortListener, { once: true });
    });
    const work = (async () => {
      const response = await fetch(`/api/cluster-summaries?${query}`, {
        method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal,
      });
      if (controller.signal.aborted) {
        void response.body?.cancel().catch(() => {});
        throw controller.signal.reason;
      }
      if (Number(response.headers.get('content-length')) > CLUSTER_SUMMARY_MAX_BYTES) {
        void response.body?.cancel().catch(() => {});
        throw new Error('Cluster summary response is too large.');
      }
      if (!response.body) throw new Error('Invalid cluster summary response.');
      reader = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (controller.signal.aborted) throw controller.signal.reason;
        if (done) break;
        bytes += value.byteLength;
        if (bytes > CLUSTER_SUMMARY_MAX_BYTES) {
          void reader.cancel().catch(() => {});
          throw new Error('Cluster summary response is too large.');
        }
        chunks.push(value);
      }
      const buffer = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
      let data;
      try { data = JSON.parse(new TextDecoder().decode(buffer)); }
      catch { throw new Error(`Invalid cluster summary response (HTTP ${response.status}).`); }
      if (!response.ok) {
        const error = new Error(`Cluster summaries request failed (HTTP ${response.status}).`);
        if (response.status === 410 && data?.code === 'GENERATION_EXPIRED') error.code = 'GENERATION_EXPIRED';
        throw error;
      }
      const page = validateClusterSummaryPage(data);
      // The JSON envelope remains compatible with older clients. New clients
      // use this response header to time a verified unchanged observation.
      const observed = response.headers.get('X-Summary-Observed-At');
      if (observed && /^(0|[1-9]\d*)$/.test(observed)) {
        const observedAtMs = Number(observed);
        if (Number.isSafeInteger(observedAtMs) && observedAtMs >= page.sourceObservedAtMs &&
            observedAtMs <= Date.now() + 5 * 60_000) return { ...page, lastObservedAtMs: observedAtMs };
      }
      return page;
    })();
    return await Promise.race([work, cancelled]);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
    controller.signal.removeEventListener('abort', abortListener);
  }
}

export function validateClusterSummaryPage(data) {
  validateSummaryEnvelope(data);
  if (!Number.isFinite(new Date(data.generatedAtMs).getTime()) || typeof data.stale !== 'boolean' || data.items.length > CLUSTER_SUMMARY_PAGE_SIZE ||
      (data.nextCursor !== null && (data.items.length !== CLUSTER_SUMMARY_PAGE_SIZE || data.items.length >= data.totalCount))) {
    throw new Error('Invalid cluster summary response.');
  }
  return data;
}
