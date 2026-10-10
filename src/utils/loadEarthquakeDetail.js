import { isValidUsgsEventId, readBoundedJsonResponse, USGS_LIMITS } from '../../functions/utils/usgs-transport.js';

export class DetailLoadError extends Error {
  constructor(message, { code = 'DETAIL_LOAD_FAILED', status, retryable = false } = {}) {
    super(message); this.name = 'DetailLoadError';
    this.code = code; this.status = status; this.retryable = retryable;
  }
}

export async function loadEarthquakeDetail(id, { signal, timeoutMs = 15_000 } = {}) {
  if (!isValidUsgsEventId(id)) throw new DetailLoadError('Invalid earthquake identifier.');
  const controller = new AbortController();
  let timer, abortParent;
  const deadline = new Promise((_, reject) => {
    abortParent = () => {
      const error = new DetailLoadError('Earthquake detail request cancelled.', { code: 'DETAIL_CLIENT_ABORTED' });
      controller.abort(error); reject(error);
    };
    if (signal?.aborted) abortParent(); else signal?.addEventListener('abort', abortParent, { once: true });
    timer = setTimeout(() => {
      const error = new DetailLoadError('The detail request timed out. Please try again.', { code: 'DETAIL_CLIENT_TIMEOUT', retryable: true });
      controller.abort(error); reject(error);
    }, timeoutMs);
  });
  const pause = () => new Promise((resolve, reject) => {
    controller.signal.throwIfAborted();
    const finish = () => { controller.signal.removeEventListener('abort', abort); resolve(); };
    const delay = setTimeout(finish, 100);
    const abort = () => { clearTimeout(delay); controller.signal.removeEventListener('abort', abort); reject(controller.signal.reason); };
    controller.signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([deadline, (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          controller.signal.throwIfAborted();
          let response;
          try { response = await fetch(`/api/earthquake/${encodeURIComponent(id)}`, { signal: controller.signal }); }
          catch {
            controller.signal.throwIfAborted();
            throw new DetailLoadError('The network request failed. Please try again.', { code: 'DETAIL_NETWORK_ERROR', retryable: true });
          }
          if (controller.signal.aborted) void response.body?.cancel().catch(() => {});
          controller.signal.throwIfAborted();
          if (!response.ok) {
            let body;
            try { body = await readBoundedJsonResponse(response, 4096, controller.signal); }
            catch { controller.signal.throwIfAborted(); }
            if (response.status === 410) throw new DetailLoadError('This earthquake was removed from the USGS catalog.', { status: 410, code: 'DETAIL_GONE' });
            const message = typeof body?.message === 'string' ? body.message.slice(0, 500) : 'Failed to fetch';
            throw new DetailLoadError(`Application API error! Status: ${response.status}. Message: ${message}`, {
              status: response.status, code: 'DETAIL_HTTP_ERROR', retryable: [429, 500, 502, 503, 504].includes(response.status),
            });
          }
          let data;
          try { data = await readBoundedJsonResponse(response, USGS_LIMITS.detailBytes, controller.signal); }
          catch {
            controller.signal.throwIfAborted();
            throw new DetailLoadError('The earthquake detail response is invalid.', { code: 'DETAIL_INVALID_PAYLOAD' });
          }
          const aliases = typeof data?.properties?.ids === 'string' && data.properties.ids.length <= 10_000
            ? data.properties.ids.split(',').filter(Boolean) : [];
          if (!isValidUsgsEventId(data?.id) || (data.id !== id && (!aliases.every(isValidUsgsEventId) || !aliases.includes(id))) ||
              !data.properties || typeof data.properties !== 'object' || Array.isArray(data.properties) ||
              !Array.isArray(data.geometry?.coordinates) || data.geometry.coordinates.length !== 3 ||
              !data.geometry.coordinates.every(Number.isFinite)) throw new DetailLoadError('The earthquake detail response is invalid.', { code: 'DETAIL_INVALID_PAYLOAD' });
          controller.signal.throwIfAborted();
          return data;
        } catch (error) {
          controller.signal.throwIfAborted();
          if (attempt > 0 || !error.retryable) throw error;
          await pause();
        }
      }
    })()]);
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abortParent);
  }
}
