// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { resolve } from 'node:path';
import { parseArgs, validateConfig, verifyBindings, verifyConfiguration, verifyIdentity, currentVersion, releaseProduction, readWranglerCredentials } from './release-production.mjs';

const REVISION = 'a'.repeat(40);
const OLD = '11111111-1111-1111-1111-111111111111';
const NEW = '22222222-2222-2222-2222-222222222222';
const REPLACEMENT = '33333333-3333-3333-3333-333333333333';
const config = {
  name: 'earthquake', account_id: 'f7e27d63f4766d7fb6a0f5b4789e2cdb', main: resolve('src/worker.js'),
  assets: { binding: 'ASSETS', run_worker_first: true }, version_metadata: { binding: 'WORKER_VERSION_METADATA' },
  vars: { DEPLOYMENT_ENVIRONMENT: 'production' }, workers_dev: true,
  kv_namespaces: ['CLUSTER_KV', 'USGS_LAST_RESPONSE_KV', 'STATIC_KV'].map(binding => ({ binding, id: `id-${binding}` })),
  d1_databases: [{ binding: 'DB', database_id: 'db-id' }], r2_buckets: [{ binding: 'GEOJSON_BUCKET', bucket_name: 'geojson-bucket' }],
  queues: { producers: [{ binding: 'GEOJSON_QUEUE', queue: 'geojson-queue' }], consumers: [{ queue: 'geojson-queue', max_batch_size: 10, max_batch_timeout: 5, max_retries: 3, retry_delay: 0 }] },
  triggers: { crons: ['*/5 * * * *', '*/10 * * * *', '*/30 * * * *', '0 0 * * *'] },
  routes: [{ pattern: 'earthquakeslive.com', custom_domain: true }],
};
function bindings() {
  return [
    { name: 'ASSETS', type: 'assets' }, ...config.kv_namespaces.map(item => ({ name: item.binding, type: 'kv_namespace', namespace_id: item.id })),
    { name: 'DB', type: 'd1', id: 'db-id' }, { name: 'GEOJSON_BUCKET', type: 'r2_bucket', bucket_name: 'geojson-bucket' },
    { name: 'GEOJSON_QUEUE', type: 'queue', queue_name: 'geojson-queue' }, { name: 'WORKER_VERSION_METADATA', type: 'version_metadata' },
    { name: 'DEPLOYMENT_ENVIRONMENT', type: 'plain_text', text: 'production' }, { name: 'RELEASE_REVISION', type: 'plain_text', text: REVISION },
  ];
}
function state() {
  return { settings: { bindings: bindings() }, schedules: { schedules: config.triggers.crons.map(cron => ({ cron })) },
    domains: [{ hostname: 'earthquakeslive.com', service: 'earthquake', environment: 'production' }], subdomain: { enabled: true },
    queues: [{ queue_name: 'geojson-queue', consumers: [{ script: 'earthquake', settings: { batch_size: 10, max_wait_time_ms: 5000, max_retries: 3, retry_delay: 0 } }] }],
  };
}
function fixture() {
  let deployed = false;
  const live = state();
  const deps = {
    now: () => '2026-09-21T00:00:00.000Z', readConfig: async () => config, verifySource: vi.fn(async () => {}),
    api: vi.fn(async path => {
      if (path.endsWith('/deployments')) return { deployments: [{ versions: [{ version_id: deployed ? NEW : OLD, percentage: 100 }] }] };
      if (path.endsWith('/settings')) return live.settings;
      if (path.endsWith('/schedules')) return live.schedules;
      if (path.includes('/workers/domains?')) return live.domains;
      if (path.endsWith('/subdomain')) return live.subdomain;
      if (path.includes('/queues?')) return live.queues;
      if (path.includes('/versions/')) return { id: NEW, annotations: { 'workers/tag': REVISION }, resources: { bindings: live.settings.bindings } };
      throw new Error('Unexpected API path');
    }),
    run: vi.fn(async () => {}), deploy: vi.fn(async () => { deployed = true; return NEW; }),
    identity: vi.fn(async () => {}), writeReport: vi.fn(async () => {}), log: vi.fn(),
  };
  return { deps, live, options: { environment: 'production', revision: REVISION, reportPath: 'unused.json' } };
}

describe('production release controls', () => {
  it('requires explicit production and an exact expected revision', () => {
    for (const args of [[], ['--env', 'preview'], ['--env', 'production'], ['--env', 'production', '--revision', 'main']]) expect(() => parseArgs(args, {})).toThrow();
    expect(parseArgs(['--env', 'production'], { WORKERS_CI_COMMIT_SHA: REVISION }).revision).toBe(REVISION);
    expect(() => parseArgs(['--env', 'production', '--revision', REVISION], { GITHUB_SHA: 'b'.repeat(40) })).toThrow();
    expect(() => parseArgs(['--env', 'production', '--name', 'other'], {})).toThrow();
  });
  it('parses production using installed Wrangler schema and isolates preview', async () => {
    const { unstable_readConfig } = await import('wrangler');
    const actual = unstable_readConfig({ config: 'wrangler.toml', env: 'production' }, { hideWarnings: true });
    expect(() => validateConfig(actual)).not.toThrow();
    const preview = unstable_readConfig({ config: 'wrangler.toml', env: 'preview' }, { hideWarnings: true });
    expect(preview.triggers.crons).toEqual([]);
    expect(preview.d1_databases[0].database_id).not.toBe(actual.d1_databases[0].database_id);
    expect(() => validateConfig(preview)).toThrow();
  });
  it('runs gates before upload and checks both hosts before and after smoke', async () => {
    const { deps, options } = fixture();
    const result = await releaseProduction(options, deps);
    expect(result.status).toBe('passed'); expect(result.previousVersion).toBe(OLD); expect(result.newVersion).toBe(NEW);
    expect(deps.run.mock.calls.map(([command, args]) => [command, ...args])).toEqual([
      ['npm', 'test'], ['npm', 'run', 'build'], ['wrangler', 'deploy', '--env', 'production', '--dry-run'],
      ['node', 'scripts/smoke-deployment.mjs', 'https://earthquakeslive.com'], ['node', 'scripts/smoke-deployment.mjs', 'https://earthquake.matty-f7e.workers.dev'],
    ]);
    expect(deps.run.mock.invocationCallOrder[2]).toBeLessThan(deps.deploy.mock.invocationCallOrder[0]);
    expect(deps.identity).toHaveBeenCalledTimes(4); expect(deps.verifySource).toHaveBeenCalledTimes(2);
    expect(deps.writeReport).toHaveBeenCalledWith('unused.json', result);
  });
  it.each(['tests', 'frontend-build', 'production-package'])('never uploads when %s fails', async stage => {
    const { deps, options } = fixture(); const target = ['tests', 'frontend-build', 'production-package'].indexOf(stage);
    let call = 0; deps.run.mockImplementation(async () => { if (call++ === target) throw new Error('failure with sensitive body'); });
    const result = await releaseProduction(options, deps);
    expect(result.status).toBe('failed'); expect(result.failedCheck).toBe(stage); expect(deps.deploy).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('sensitive body');
  });
  it('refuses changed source before upload', async () => {
    const { deps, options } = fixture(); deps.verifySource.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('dirty'));
    expect((await releaseProduction(options, deps)).failedCheck).toBe('source-before-upload'); expect(deps.deploy).not.toHaveBeenCalled();
  });
  it('propagates upload failure as potentially published, without automatic rollback', async () => {
    const { deps, options } = fixture(); deps.deploy.mockRejectedValue(new Error('upload failed'));
    const result = await releaseProduction(options, deps);
    expect(result.failedCheck).toBe('deploy'); expect(result.uploadAttempted).toBe(true); expect(result.recovery).toContain('may have succeeded');
    expect(deps.identity).not.toHaveBeenCalled();
  });
  it('fails before upload when metadata access is denied', async () => {
    const { deps, options } = fixture(); deps.api.mockRejectedValue(new Error('403'));
    expect((await releaseProduction(options, deps)).failedCheck).toBe('metadata-access-and-baseline'); expect(deps.deploy).not.toHaveBeenCalled();
  });
  it('rejects an asset-only deployment and incorrect resource identities', () => {
    expect(() => verifyBindings([{ name: 'ASSETS', type: 'assets' }], config, REVISION)).toThrow();
    const wrong = bindings(); wrong.find(item => item.name === 'DB').id = 'preview-db';
    expect(() => verifyBindings(wrong, config, REVISION)).toThrow();
  });
  it.each(['schedules', 'domains', 'queues', 'subdomain'])('rejects incorrect %s readback', key => {
    const live = state(); live[key] = key === 'schedules' ? { schedules: [] } : key === 'subdomain' ? { enabled: false } : [];
    expect(() => verifyConfiguration(live, config, REVISION)).toThrow();
  });
  it('fails post-upload when required binding is missing', async () => {
    const { deps, options, live } = fixture(); deps.deploy.mockImplementation(async () => { live.settings.bindings = [{ name: 'ASSETS', type: 'assets' }]; return NEW; });
    const api = deps.api.getMockImplementation(); deps.api.mockImplementation(path => path.endsWith('/deployments') && deps.deploy.mock.calls.length ? { deployments: [{ versions: [{ version_id: NEW, percentage: 100 }] }] } : api(path));
    expect((await releaseProduction(options, deps)).failedCheck).toBe('configuration');
  });
  it.each(['before-upload', 'after-upload', 'after-smoke'])('detects concurrent replacement %s', timing => {
    return (async () => {
      const { deps, options } = fixture(); const api = deps.api.getMockImplementation(); let reads = 0;
      deps.api.mockImplementation(path => {
        if (path.endsWith('/deployments') && ++reads === ({ 'before-upload': 2, 'after-upload': 3, 'after-smoke': 4 }[timing])) return { deployments: [{ versions: [{ version_id: REPLACEMENT, percentage: 100 }] }] };
        return api(path);
      });
      const result = await releaseProduction(options, deps); expect(result.status).toBe('failed');
      expect(result.failedCheck).toContain(timing === 'after-smoke' ? 'version-after-smoke' : `version-${timing}`);
      if (timing === 'before-upload') expect(deps.deploy).not.toHaveBeenCalled();
    })();
  });
  it('propagates smoke failures', async () => {
    const { deps, options } = fixture(); deps.run.mockImplementation(async command => { if (command === 'node') throw new Error('smoke'); });
    const result = await releaseProduction(options, deps); expect(result.status).toBe('failed'); expect(result.failedCheck).toContain('smoke:');
  });
  it('does not accept gradual deployments as an unambiguous version', () => {
    expect(() => currentVersion({ deployments: [{ versions: [{ version_id: NEW, percentage: 50 }, { version_id: OLD, percentage: 50 }] }] })).toThrow();
  });
});

describe('identity verification', () => {
  const identity = { status: 'ok', environment: 'production', revision: REVISION, versionId: NEW };
  function fetcher(data, headers = { 'content-type': 'application/json', 'cache-control': 'no-store' }) { return vi.fn(async () => new Response(JSON.stringify(data), { headers })); }
  it('uses a bounded GET without redirects and checks no-store', async () => {
    const fetch = fetcher(identity); await verifyIdentity(fetch, 'https://earthquakeslive.com', REVISION, NEW);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store' }); expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it.each([{}, [], { ...identity, revision: 'b'.repeat(40) }, { ...identity, versionId: OLD }, { ...identity, status: 'error' }, { ...identity, environment: 'preview' }])('rejects HTTP-200 incorrect identity %j', async body => {
    await expect(verifyIdentity(fetcher(body), 'https://earthquakeslive.com', REVISION, NEW)).rejects.toThrow();
  });
  it('rejects cacheable identity', async () => {
    await expect(verifyIdentity(fetcher(identity, { 'content-type': 'application/json' }), 'https://earthquakeslive.com', REVISION, NEW)).rejects.toThrow();
  });
});


describe('private Wrangler authentication', () => {
  it('captures credentials and discards the Wrangler debug log', async () => {
    const run = vi.fn(async () => JSON.stringify({ type: 'oauth', token: 'private-fixture-token' }));
    expect(await readWranglerCredentials(run)).toEqual({ type: 'oauth', token: 'private-fixture-token' });
    expect(run.mock.calls[0].slice(0, 2)).toEqual(['wrangler', ['auth', 'token', '--json']]);
    expect(run.mock.calls[0][2].capture).toBe(true);
    expect(run.mock.calls[0][2].env.WRANGLER_LOG_PATH).toMatch(/earthquake-auth-.*discard.log$/);
  });
  it('never exposes invalid credential JSON in an error', async () => {
    await expect(readWranglerCredentials(async () => 'invalid secret token')).rejects.toThrow('Wrangler authentication unavailable');
  });
});
