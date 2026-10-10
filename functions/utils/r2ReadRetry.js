// https://developers.cloudflare.com/r2/api/error-codes/
// Only storage transport failures are retryable. Missing objects and every
// subsequent metadata/JSON/checksum validation remain terminal for this read.
function transientFailure(error, method) {
  const message = typeof error?.message === 'string' ? error.message.slice(0, 1024) : '';
  // Workers binding error codes are suffixes, distinct from HTTP statuses.
  const bindingCode = new RegExp(`^${method}:.*\\((10001|10043)\\)$`, 'i').exec(message)?.[1];
  if (bindingCode || new RegExp(`^R2 ${method} failed:.*\\b500\\b.*\\bInternal(?: Server)? Error\\b`, 'i').test(message)) {
    return { code: bindingCode === '10043' ? 'R2_SERVICE_UNAVAILABLE' : 'R2_INTERNAL_ERROR',
      upstreamStatus: bindingCode === '10043' ? 503 : 500 };
  }
  if (['NETWORK_CONNECTION_LOST', 'ECONNRESET'].includes(error?.code) ||
      /^(?:Network connection lost\.?|The network connection was lost\.?|NetworkError: A network error occurred\.?)$/i.test(message)) {
    return { code: 'R2_NETWORK_ERROR' };
  }
  return null;
}

async function pause(signal) {
  signal.throwIfAborted();
  await new Promise((resolve, reject) => {
    const finish = () => { signal.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, 100);
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function readR2(bucket, method, key, signal) {
  if (!['get', 'head'].includes(method)) throw new Error('Unsupported R2 read method');
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted();
    try {
      const object = await bucket[method](key);
      if (signal.aborted) void object?.body?.cancel().catch(() => {});
      signal.throwIfAborted();
      return object;
    } catch (error) {
      signal.throwIfAborted();
      const transient = transientFailure(error, method);
      if (!transient) throw error;
      if (attempt === 1) {
        const failure = new Error('R2 read failed', { cause: error });
        Object.assign(failure, transient);
        throw failure;
      }
      await pause(signal);
    }
  }
}
