// Reserve part of the request budget for a retained generation. R2 binding
// promises cannot be cancelled; callers cancel late bodies and check this
// signal before issuing another operation.
export async function snapshotReadBudget(parent, timeoutMs, work) {
  const controller = new AbortController();
  const abort = () => controller.abort(parent.reason);
  if (parent.aborted) abort();
  else parent.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(Object.assign(new Error('Snapshot read timed out'),
    { code: 'R2_READ_TIMEOUT' })), timeoutMs);
  let onAbort;
  const cancelled = new Promise((_, reject) => {
    onAbort = () => reject(controller.signal.reason);
    if (controller.signal.aborted) onAbort();
    else controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    controller.signal.throwIfAborted();
    return await Promise.race([work(controller.signal), cancelled]);
  } finally {
    clearTimeout(timer);
    parent.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
