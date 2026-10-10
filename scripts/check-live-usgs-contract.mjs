#!/usr/bin/env node
// Optional live official-USGS check. No app request, persistence, fixtures or CI dependency.
import { fetchValidatedDetail } from '../functions/utils/usgs-transport.js';
const originalFetch = globalThis.fetch;
const results = [];
try {
  for (const [id, expected] of [['us6000sfvh', 'redirect-detail'], ['us7000s9fi', 'deleted']]) {
    const responses = [];
    let requests = 0;
    globalThis.fetch = async (url, options) => {
      if (new URL(url).origin !== 'https://earthquake.usgs.gov') throw new Error('Official USGS origin required');
      if (requests >= 2) throw new Error('Live check request bound reached');
      requests++;
      const response = await originalFetch(url, options);
      responses.push(response.status);
      return response;
    };
    let result;
    try {
      const detail = await fetchValidatedDetail(id, { timeoutMs: 10000 });
      result = { outcome: 'validated-detail', returnedId: detail.id };
    } catch (error) {
      result = { outcome: 'transport-error', code: error.code, status: error.status, upstreamStatus: error.upstreamStatus };
    }
    const matched = expected === 'redirect-detail'
      ? responses[0] === 302 && result.outcome === 'validated-detail'
      : result.code === 'USGS_EVENT_DELETED' && result.status === 410 && result.upstreamStatus === 409;
    results.push({ id, expected, requests, upstreamStatuses: responses, ...result, matched,
      ...(matched ? {} : { note: 'Current upstream response differs or could not be verified. Review these live observations; they do not establish a historical cause.' }) });
  }
} finally { globalThis.fetch = originalFetch; }
console.log(JSON.stringify({ capturedAt: new Date().toISOString(), source: 'official live USGS GET only; at most two requests per event', results }, null, 2));
if (results.some(result => !result.matched)) process.exitCode = 2;
