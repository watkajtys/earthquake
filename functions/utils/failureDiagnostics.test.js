import { describe, expect, it } from 'vitest';
import { failureDiagnostics, releaseDiagnostics } from './failureDiagnostics.js';
describe('safe failure diagnostics', () => {
  it('classifies known D1 resets only when the caller identifies D1 context', () => {
    const error = new Error('D1_ERROR: Network connection lost.');
    expect(failureDiagnostics(error).code).toBe('OPERATION_FAILED');
    expect(failureDiagnostics(error, { d1: true }).code).toBe('D1_TRANSIENT_ERROR');
    expect(failureDiagnostics(new Error('generic failure'), { d1: true }).code).toBe('OPERATION_FAILED');
  });
  it('preserves safe explicit codes but never serializes raw messages or invalid identifiers', () => {
    expect(failureDiagnostics(Object.assign(new Error('secret payload'), { code: 'INVALID_FEED_FEATURE_TIMESTAMPS', upstreamStatus: 503 })))
      .toEqual({ code: 'INVALID_FEED_FEATURE_TIMESTAMPS', stage: 'operation', upstreamStatus: 503 });
    expect(releaseDiagnostics({ RELEASE_REVISION: 'https://secret.invalid/?token=hidden' })).toEqual({ versionId: 'unknown', revision: 'unknown' });
  });
});
