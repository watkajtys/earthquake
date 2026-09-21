// In-memory R2 semantics for producer/API/actual Worker tests. Conditional checks
// happen at write execution, not at promise creation. Native ReadableStream
// bodies allow bounded-reader tests to exercise the production implementation.
export function createMemorySummaryBucket() {
  const objects = new Map();
  const calls = [];
  const hooks = {};
  let version = 0;
  const encode = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
  const object = (key, stored, includeBody) => ({
    key, etag: stored.etag, httpEtag: `"${stored.etag}"`, size: stored.bytes.byteLength,
    ...(includeBody ? {
      body: new ReadableStream({ start(controller) { controller.enqueue(stored.bytes.slice()); controller.close(); } }),
      text: async () => new TextDecoder().decode(stored.bytes),
      json: async () => JSON.parse(new TextDecoder().decode(stored.bytes)),
    } : {}),
  });
  const bucket = {
    objects, calls, hooks,
    seed(key, value) {
      const bytes = value instanceof Uint8Array ? value : encode(value);
      objects.set(key, { bytes, etag: `memory-etag-${++version}` });
    },
    readJson(key) {
      const entry = objects.get(key);
      return entry ? JSON.parse(new TextDecoder().decode(entry.bytes)) : null;
    },
    async get(key) {
      calls.push({ method: 'get', key });
      await hooks.beforeGet?.(key);
      const stored = objects.get(key);
      const result = stored ? object(key, stored, true) : null;
      return hooks.afterGet ? hooks.afterGet(key, result) : result;
    },
    async put(key, value, options = {}) {
      calls.push({ method: 'put', key, options });
      await hooks.beforePut?.(key, value, options);
      const stored = objects.get(key);
      const condition = options.onlyIf || {};
      if ((condition.etagMatches !== undefined && stored?.etag !== condition.etagMatches) ||
          (condition.etagDoesNotMatch === '*' && stored) ||
          (condition.etagDoesNotMatch !== undefined && condition.etagDoesNotMatch !== '*' && stored?.etag === condition.etagDoesNotMatch)) return null;
      bucket.seed(key, value);
      const result = object(key, objects.get(key), false);
      return hooks.afterPut ? hooks.afterPut(key, result) : result;
    },
  };
  return bucket;
}
