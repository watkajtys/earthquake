async function updateStatsInKV(
  context,
  kvNamespace,
  key,
  increments,
  retries = 5,
) {
  const { env } = context;
  const kv = env[kvNamespace];
  if (!kv) {
    console.error(
      `[kv-stats-updater] KV namespace '${kvNamespace}' not found.`,
    );
    return;
  }
  for (let i = 0; i < retries; i++) {
    try {
      const { value, cas } = await kv.getWithMetadata(key, "json");
      const currentStats = value || {};
      const newStats = { ...currentStats };
      for (const [statKey, increment] of Object.entries(increments)) {
        newStats[statKey] = (newStats[statKey] || 0) + increment;
      }
      const options = { cas: cas || void 0 };
      await kv.put(key, JSON.stringify(newStats), options);
      console.log(
        `[kv-stats-updater] Successfully updated stats for key '${key}' in namespace '${kvNamespace}'.`,
      );
      return;
    } catch (e) {
      console.warn(
        `[kv-stats-updater] CAS mismatch or error on attempt ${i + 1} for key '${key}'. Retrying...`,
      );
      if (i < retries - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.random() * 50 * (i + 1)),
        );
        continue;
      } else {
        console.error(
          `[kv-stats-updater] Final attempt failed for key '${key}'.`,
        );
        throw new Error(
          `Failed to update KV stats for key '${key}' after ${retries} attempts.`,
        );
      }
    }
  }
}

export { updateStatsInKV };
