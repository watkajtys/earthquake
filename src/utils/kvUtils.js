// src/utils/kvUtils.js
/**
 * @file Utility functions for interacting with Cloudflare KV stores.
 */

/**
 * Retrieves and parses features from a KV namespace.
 *
 * @async
 * @param {object} kvNamespace - The Cloudflare KV namespace binding.
 * @param {string} key - The key to retrieve from the KV store.
 * @returns {Promise<Array<object>|null>} A promise that resolves to an array of features if found and parsed, otherwise null.
 *                                        Returns null if the key is not found or if there's an error during retrieval or parsing.
 */
export async function getFeaturesFromKV(kvNamespace, key) {
  if (!kvNamespace) {
    console.error("[kvUtils-get] KV Namespace binding not provided.");
    return null;
  }
  if (!key) {
    console.error("[kvUtils-get] Key not provided for KV retrieval.");
    return null;
  }

  try {
    const value = await kvNamespace.get(key);
    if (value === null) {
      console.log(`[kvUtils-get] Key "${key}" not found in KV store.`);
      return null;
    }
    const features = JSON.parse(value);
    console.log(`[kvUtils-get] Successfully retrieved and parsed features for key "${key}".`);
    return features;
  } catch (error) {
    console.error(`[kvUtils-get] Error retrieving or parsing key "${key}" from KV:`, error.message, error.name);
    return null;
  }
}

/**
 * Stringifies and stores features in a KV namespace.
 * This operation is performed in the background using waitUntil.
 *
 * @async
 * @param {object} kvNamespace - The Cloudflare KV namespace binding.
 * @param {string} key - The key under which to store the features.
 * @param {Array<object>} features - The array of feature objects to store.
 * @param {object} executionContext - The worker's execution context (e.g., `ctx` from `scheduled` or `context` from a Pages Function), used for `waitUntil`.
 * @returns {void} Does not return a direct promise for the KV put operation's completion,
 *                 as it's handled by executionContext.waitUntil. Logs success or error.
 */
export function setFeaturesToKV(kvNamespace, key, features, executionContext) {
  if (!kvNamespace) {
    console.error("[kvUtils-set] KV Namespace binding not provided.");
    return;
  }
  if (!key) {
    console.error("[kvUtils-set] Key not provided for KV storage.");
    return;
  }
  if (!features || !Array.isArray(features)) {
    console.error("[kvUtils-set] Features data is invalid or not provided for KV storage.");
    return;
  }
  if (!executionContext || typeof executionContext.waitUntil !== 'function') {
    console.error("[kvUtils-set] executionContext with a valid waitUntil function not provided. KV set will not be performed reliably in the background.");
    // Optionally, you could proceed without executionContext.waitUntil but it's not recommended for non-blocking operations.
    // For this implementation, we will not proceed if executionContext.waitUntil is missing to enforce best practices.
    return;
  }

  try {
    const value = JSON.stringify(features);
    const promise = kvNamespace.put(key, value)
      .then(() => {
        console.log(`[kvUtils-set] Successfully stored features for key "${key}" in KV.`);
      })
      .catch(error => {
        console.error(`[kvUtils-set] Error storing features for key "${key}" in KV:`, error.message, error.name);
      });
    executionContext.waitUntil(promise);
  } catch (error) {
    // This catch block is for errors during JSON.stringify or initial setup before the async put.
    console.error(`[kvUtils-set] Error preparing data for KV storage (key "${key}"):`, error.message, error.name);
    // No need to call executionContext.waitUntil here as the put operation itself hasn't started.
  }
}
