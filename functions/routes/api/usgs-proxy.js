import { fetchUsgsSummary, UsgsTransportError, validateUsgsSummaryUrl } from '../../utils/usgs-transport.js';

function errorResponse(message, status, code) {
  return new Response(JSON.stringify({ message, source: 'usgs-proxy-handler', ...(code && { code }) }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// Public reads intentionally have no persistence or ingestion dependencies.
export async function handleUsgsProxy({ request, env, executionContext }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const response = errorResponse('Method not allowed', 405);
    response.headers.set('Allow', 'GET, HEAD');
    return response;
  }
  const url = new URL(request.url);
  if (url.searchParams.has('isCron')) return errorResponse('Ingestion is not available through the public proxy', 400);
  if (!url.searchParams.get('apiUrl')) return errorResponse('Missing apiUrl query parameter for proxy request', 400);
  if (url.searchParams.getAll('apiUrl').length !== 1 || [...url.searchParams.keys()].some((key) => key !== 'apiUrl')) {
    return errorResponse('Unsupported proxy query parameters', 400);
  }
  try {
    const apiUrl = validateUsgsSummaryUrl(url.searchParams.get('apiUrl'));
    // Version the canonical key so the former unrestricted proxy's cache cannot be reused.
    const cacheUrl = new URL('/api/usgs-proxy', url.origin);
    cacheUrl.searchParams.set('apiUrl', apiUrl);
    cacheUrl.searchParams.set('cacheVersion', '2');
    const cache = globalThis.caches?.default;
    let response;
    if (cache) {
      try { response = await cache.match(cacheUrl.href); } catch { /* Cache failures do not prevent a public read. */ }
    }
    if (!response) {
      const data = await fetchUsgsSummary(apiUrl);
      const configured = Number(env?.WORKER_CACHE_DURATION_SECONDS);
      const seconds = Number.isInteger(configured) && configured > 0 && configured <= 3600 ? configured : 600;
      response = new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `s-maxage=${seconds}` },
      });
      if (cache) {
        const put = cache.put(cacheUrl.href, response.clone()).catch(() => {});
        if (executionContext?.waitUntil) executionContext.waitUntil(put);
        else await put;
      }
    }
    return request.method === 'HEAD' ? new Response(null, response) : response;
  } catch (error) {
    return errorResponse(
      error instanceof UsgsTransportError ? error.message : 'USGS request failed',
      error instanceof UsgsTransportError ? error.status : 502,
      error instanceof UsgsTransportError ? error.code : 'USGS_UPSTREAM_ERROR',
    );
  }
}
