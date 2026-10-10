// Only use for operations whose caller preserves idempotency and fencing.
// D1 retries reads itself; these retries address known transient write errors.
// https://developers.cloudflare.com/d1/best-practices/retry-queries/
export function isTransientD1Error(error) {
  for (let depth = 0; error && depth < 3; depth++, error = error.cause) {
    const message = typeof error.message === 'string' ? error.message : '';
    if (message.includes('Network connection lost') ||
        message.includes('storage caused object to be reset') ||
        message.includes('reset because its code was updated')) return true;
  }
  return false;
}

export async function retryTransientD1(operation, { enabled = true } = {}) {
  const startedAt = Date.now();
  for (let attempt = 1; ; attempt++) {
    try { return await operation(attempt); }
    catch (error) {
      if (!enabled || attempt >= 3 || !isTransientD1Error(error)) throw error;
      const delay = 50 * 2 ** (attempt - 1) * (1 + Math.random());
      if (Date.now() - startedAt + delay >= 2000) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
      if (Date.now() - startedAt >= 2000) throw error;
    }
  }
}
