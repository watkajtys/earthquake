import { isTransientD1Error } from './d1Retry.js';
// Only explicitly bounded identifiers and numeric statuses enter diagnostics.
// Exception messages, stacks, URLs, headers and payloads are never serialized.
const identifier = (value, fallback) => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(value) ? value : fallback;
export function failureDiagnostics(error, { stage = 'operation', code = 'OPERATION_FAILED', d1 = false } = {}) {
  return {
    code: identifier(error?.code, d1 && isTransientD1Error(error) ? 'D1_TRANSIENT_ERROR' : code), stage: identifier(error?.stage, stage),
    ...(Number.isInteger(error?.upstreamStatus) && error.upstreamStatus >= 100 && error.upstreamStatus <= 599
      ? { upstreamStatus: error.upstreamStatus } : {}),
  };
}
export function releaseDiagnostics(env) {
  return { versionId: identifier(env?.WORKER_VERSION_METADATA?.id, 'unknown'),
    revision: identifier(env?.RELEASE_REVISION, 'unknown') };
}
