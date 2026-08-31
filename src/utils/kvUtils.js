async function getFeaturesFromKV(kvNamespace, key) {
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
    console.log(
      `[kvUtils-get] Successfully retrieved and parsed features for key "${key}".`,
    );
    return features;
  } catch (error) {
    console.error(
      `[kvUtils-get] Error retrieving or parsing key "${key}" from KV:`,
      error.message,
      error.name,
    );
    return null;
  }
}
function setFeaturesToKV(kvNamespace, key, features, executionContext) {
  if (!kvNamespace) {
    console.error("[kvUtils-set] KV Namespace binding not provided.");
    return;
  }
  if (!key) {
    console.error("[kvUtils-set] Key not provided for KV storage.");
    return;
  }
  if (!features || !Array.isArray(features)) {
    console.error(
      "[kvUtils-set] Features data is invalid or not provided for KV storage.",
    );
    return;
  }
  if (!executionContext || typeof executionContext.waitUntil !== "function") {
    console.error(
      "[kvUtils-set] executionContext with a valid waitUntil function not provided. KV set will not be performed reliably in the background.",
    );
    return;
  }
  try {
    const value = JSON.stringify(features);
    const promise = kvNamespace
      .put(key, value)
      .then(() => {
        console.log(
          `[kvUtils-set] Successfully stored features for key "${key}" in KV.`,
        );
      })
      .catch((error) => {
        console.error(
          `[kvUtils-set] Error storing features for key "${key}" in KV:`,
          error.message,
          error.name,
        );
      });
    executionContext.waitUntil(promise);
  } catch (error) {
    console.error(
      `[kvUtils-set] Error preparing data for KV storage (key "${key}"):`,
      error.message,
      error.name,
    );
  }
}

export { getFeaturesFromKV, setFeaturesToKV };
