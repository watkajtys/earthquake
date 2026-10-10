// Binding operations cannot be aborted. Bound the caller and never start another
// write after a timeout; a late conditional write still has its original fence.
const failure = (code, message) => Object.assign(new Error(message), { code });
function transient(error, kind) {
  if (kind === 'source') return ['USGS_NETWORK_ERROR', 'USGS_TIMEOUT'].includes(error?.code) ||
    (error?.code === 'USGS_UPSTREAM_ERROR' && [429, 500, 502, 503, 504].includes(error.upstreamStatus));
  const message = typeof error?.message === 'string' ? error.message.slice(0, 1024) : '';
  return /^(?:get|head|put):.*\((?:10001|10043)\)$/i.test(message) ||
    /^R2 (?:GET|HEAD|PUT) failed:.*\b500\b.*\bInternal(?: Server)? Error\b/i.test(message) ||
    /^(?:Network connection lost\.?|The network connection was lost\.?)$/i.test(message) ||
    ['NETWORK_CONNECTION_LOST', 'ECONNRESET'].includes(error?.code);
}
export function publicationBudget(timeoutMs = 30_000) {
  const controller = new AbortController();
  const expires = Date.now() + timeoutMs;
  const timer = setTimeout(() => controller.abort(failure('FEED_PUBLICATION_TIMEOUT', 'Feed publication deadline')), timeoutMs);
  const signal = controller.signal;
  return { signal, remaining: () => Math.max(0, expires - Date.now()), close: () => clearTimeout(timer) };
}
async function bounded(operation, budget, maximumMs, kind) {
  budget.signal.throwIfAborted();
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    const abort = () => { controller.abort(budget.signal.reason); reject(budget.signal.reason); };
    budget.signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { const error = kind === 'source' ? Object.assign(failure('USGS_TIMEOUT', 'USGS request timed out'), { status: 504 }) : failure('FEED_OPERATION_TIMEOUT', 'Feed publication operation deadline');
      controller.abort(error); reject(error); }, Math.min(maximumMs, budget.remaining()));
    controller.signal.addEventListener('abort', () => budget.signal.removeEventListener('abort', abort), { once: true });
    // The listener is also removed on successful completion below.
    controller.cleanup = () => budget.signal.removeEventListener('abort', abort);
  });
  try {
    return await Promise.race([deadline, (async () => {
      const value = await operation(controller.signal);
      if (controller.signal.aborted || budget.signal.aborted) {
        void value?.body?.cancel().catch(() => {});
        throw controller.signal.reason || budget.signal.reason;
      }
      return value;
    })()]);
  } finally { clearTimeout(timer); controller.cleanup(); }
}
export async function publicationOperation(operation, budget, { kind = 'r2', maximumMs = 8000, onAttempt = () => {} } = {}) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    onAttempt(attempt);
    try { return await bounded(operation, budget, maximumMs, kind); }
    catch (error) {
      const retryable = transient(error, kind);
      if (kind === 'r2' && retryable && error && typeof error === 'object') {
        const unavailable = typeof error.message === 'string' && /\(10043\)$/.test(error.message);
        error.code = error.code || (unavailable ? 'R2_SERVICE_UNAVAILABLE' : 'R2_TRANSIENT_ERROR');
        if (/\((10001|10043)\)$/.test(error.message || '')) error.upstreamStatus = unavailable ? 503 : 500;
      }
      if (attempt === 2 || !retryable) throw error;
      await bounded(() => new Promise(resolve => setTimeout(resolve, 75 + Math.random() * 75)), budget, 200);
    }
  }
}
export async function readPublicationPointer(bucket, key, maxBytes, budget) {
  const object = await publicationOperation(() => bucket.get(key), budget);
  if (object === null) return null;
  if (!object || !Number.isSafeInteger(object.size) || object.size < 1 || object.size > maxBytes || !object.etag || !object.body?.getReader) {
    void object?.body?.cancel().catch(() => {});
    throw failure('FEED_POINTER_INVALID', 'Invalid feed pointer object');
  }
  return bounded(async signal => {
    const reader = object.body.getReader();
    const abort = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener('abort', abort, { once: true });
    const chunks = []; let length = 0;
    try {
      for (;;) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        length += value.byteLength;
        if (length > maxBytes || length > object.size) throw failure('FEED_POINTER_SIZE_MISMATCH', 'Invalid feed pointer size');
        chunks.push(value);
      }
      if (length !== object.size) throw failure('FEED_POINTER_SIZE_MISMATCH', 'Invalid feed pointer size');
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let value;
      try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { throw failure('FEED_POINTER_JSON_INVALID', 'Invalid feed pointer JSON'); }
      return { value, etag: object.etag };
    } catch (error) { void reader.cancel().catch(() => {}); throw error; }
    finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
  }, budget, 8000);
}
