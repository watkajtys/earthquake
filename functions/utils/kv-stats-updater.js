/**
 * @file functions/utils/kv-stats-updater.js
 * @description Provides a utility for atomically updating statistics stored in a KV namespace.
 */

/**
 * Atomically updates a JSON object in KV by applying increments.
 * This function implements a read-modify-write loop with retries to handle concurrent updates.
 *
 * @param {object} context - The Cloudflare Function context containing .env and .ctx
 * @param {string} kvNamespace - The name of the KV namespace to use (e.g., 'USGS_LAST_RESPONSE_KV').
 * @param {string} key - The KV key where the stats object is stored.
 * @param {Object.<string, number>} increments - An object where keys are the stats to increment and values are the increment amounts.
 * @param {number} [retries=5] - The number of retries for the atomic update loop.
 */
export async function updateStatsInKV(context, kvNamespace, key, increments, retries = 5) {
  const { env } = context;
  const kv = env[kvNamespace];

  if (!kv) {
    console.error(`[kv-stats-updater] KV namespace '${kvNamespace}' not found.`);
    return;
  }

  for (let i = 0; i < retries; i++) {
    try {
      // Step 1: Read the current value and its cas identifier
      const { value, cas } = await kv.getWithMetadata(key, 'json');
      const currentStats = value || {};

      // Step 2: Apply the increments
      const newStats = { ...currentStats };
      for (const [statKey, increment] of Object.entries(increments)) {
        newStats[statKey] = (newStats[statKey] || 0) + increment;
      }

      // Step 3: Attempt to write the new value back, conditioned on the cas
      const options = { cas: cas || undefined }; // cas can be null for a new key, which should be undefined
      await kv.put(key, JSON.stringify(newStats), options);

      console.log(`[kv-stats-updater] Successfully updated stats for key '${key}' in namespace '${kvNamespace}'.`);
      return; // Success, exit the loop

    } catch (e) {
        console.warn(`[kv-stats-updater] CAS mismatch or error on attempt ${i + 1} for key '${key}'. Retrying...`);
        if (i < retries - 1) {
          // Add a small, randomized delay before retrying
          await new Promise(resolve => setTimeout(resolve, Math.random() * 50 * (i + 1)));
          continue;
        } else {
           console.error(`[kv-stats-updater] Final attempt failed for key '${key}'.`);
           throw new Error(`Failed to update KV stats for key '${key}' after ${retries} attempts.`);
        }
    }
  }
}
