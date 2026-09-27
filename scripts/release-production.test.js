// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs, validateConfig, verifyBindings, verifyConfiguration, verifyIdentity, currentVersion, releaseProduction, readWranglerCredentials, verifyActivationAttestation, verifyLiveD1Readback } from './release-production.mjs';

const REVISION = 'a'.repeat(40);
const OLD_REVISION = 'b'.repeat(40);
const OLD = '11111111-1111-1111-1111-111111111111';
const NEW = '22222222-2222-2222-2222-222222222222';
const REPLACEMENT = '33333333-3333-3333-3333-333333333333';
const config = {
  name: 'earthquake', account_id: 'f7e27d63f4766d7fb6a0f5b4789e2cdb', main: resolve('src/worker.js'),
  assets: { binding: 'ASSETS', run_worker_first: true }, version_metadata: { binding: 'WORKER_VERSION_METADATA' },
  vars: { DEPLOYMENT_ENVIRONMENT: 'production', LIST_PUBLICATION_PAUSED: 'true' }, workers_dev: true,
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
    { name: 'DEPLOYMENT_ENVIRONMENT', type: 'plain_text', text: 'production' },
    { name: 'LIST_PUBLICATION_PAUSED', type: 'plain_text', text: 'true' },
    { name: 'RELEASE_REVISION', type: 'plain_text', text: REVISION },
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
      if (path.endsWith(`/versions/${OLD}`)) return { id: OLD, annotations: { 'workers/tag': OLD_REVISION }, resources: { bindings: bindings().map(binding => binding.name === 'RELEASE_REVISION' ? { ...binding, text: OLD_REVISION } : binding) } };
      if (path.includes('/versions/')) return { id: NEW, annotations: { 'workers/tag': REVISION }, resources: { bindings: live.settings.bindings } };
      throw new Error('Unexpected API path');
    }),
    run: vi.fn(async () => {}), verifyPredecessorArchive: vi.fn(async () => {}),
    deploy: vi.fn(async () => { deployed = true; return NEW; }),
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
    expect(() => validateConfig(actual)).toThrow();
    expect(() => validateConfig(actual, { allowActivation: true })).not.toThrow();
    const preview = unstable_readConfig({ config: 'wrangler.toml', env: 'preview' }, { hideWarnings: true });
    expect(preview.triggers.crons).toEqual([]);
    expect(preview.vars.MONTH_COVERAGE_ENABLED).toBeUndefined();
    expect(actual.vars.MONTH_COVERAGE_ENABLED).toBe('true');
    expect(actual.triggers.crons).toContain('2-59/5 * * * *');
    expect(preview.d1_databases[0].database_id).not.toBe(actual.d1_databases[0].database_id);
    expect(() => validateConfig(preview)).toThrow();
  });
  it('requires deliberate opt in for both production activation bindings', () => {
    expect(() => validateConfig({ ...config, vars: { DEPLOYMENT_ENVIRONMENT: 'production' } })).toThrow();
    expect(() => validateConfig({ ...config, vars: { ...config.vars, LIST_PUBLICATION_PAUSED: 'false' } })).toThrow();
    expect(() => validateConfig({ ...config, vars: { ...config.vars, DURABLE_INGESTION_ENABLED: 'true' } })).toThrow();
    expect(() => verifyBindings(bindings().filter(item => item.name !== 'LIST_PUBLICATION_PAUSED'), config, REVISION)).toThrow();
    expect(() => verifyBindings([...bindings(), { name: 'DURABLE_INGESTION_ENABLED', type: 'plain_text', text: 'true' }], config, REVISION)).toThrow();
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
    expect(deps.verifyPredecessorArchive).toHaveBeenCalledExactlyOnceWith({ revision: OLD_REVISION, versionId: OLD });
    expect(deps.run.mock.invocationCallOrder[2]).toBeLessThan(deps.verifyPredecessorArchive.mock.invocationCallOrder[0]);
    expect(deps.verifyPredecessorArchive.mock.invocationCallOrder[0]).toBeLessThan(deps.deploy.mock.invocationCallOrder[0]);
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
  it('fails before upload when any predecessor archive check fails', async () => {
    const { deps, options } = fixture();
    deps.verifyPredecessorArchive.mockRejectedValue(new Error('Missing archived predecessor bytes'));
    const result = await releaseProduction(options, deps);
    expect(result.failedCheck).toBe('predecessor-archive');
    expect(result.uploadAttempted).toBe(false);
    expect(deps.deploy).not.toHaveBeenCalled();
    expect(deps.verifySource).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain('Missing archived predecessor bytes');
  });
  it('fails before upload when the deployed predecessor has no exact revision identity', async () => {
    const { deps, options } = fixture();
    const api = deps.api.getMockImplementation();
    deps.api.mockImplementation(path => path.endsWith(`/versions/${OLD}`)
      ? { id: OLD, annotations: { 'workers/tag': OLD_REVISION }, resources: { bindings: [] } }
      : api(path));
    const result = await releaseProduction(options, deps);
    expect(result.failedCheck).toBe('predecessor-archive');
    expect(deps.verifyPredecessorArchive).not.toHaveBeenCalled();
    expect(deps.deploy).not.toHaveBeenCalled();
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

describe('month coverage release transition', () => {
  const cron = '2-59/5 * * * *';
  const database = '8a0a26e9-ba3c-4984-9023-c1803f611a05';
  const coverageConfig = { ...config,
    vars: { DEPLOYMENT_ENVIRONMENT: 'production', LIST_PUBLICATION_PAUSED: 'false',
      DURABLE_INGESTION_ENABLED: 'true', MONTH_COVERAGE_ENABLED: 'true' },
    d1_databases: [{ binding: 'DB', database_id: database }],
    triggers: { crons: [...config.triggers.crons, cron] },
  };
  const coverageBindings = (revision, enabled) => [
    ...bindings().map(binding => binding.name === 'DB' ? { ...binding, id: database }
      : binding.name === 'LIST_PUBLICATION_PAUSED' ? { ...binding, text: 'false' }
        : binding.name === 'RELEASE_REVISION' ? { ...binding, text: revision } : binding),
    { name: 'DURABLE_INGESTION_ENABLED', type: 'plain_text', text: 'true' },
    ...(enabled ? [{ name: 'MONTH_COVERAGE_ENABLED', type: 'plain_text', text: 'true' }] : []),
  ];
  function coverageFixture(previouslyEnabled = false, candidateEnabled = true) {
    const result = fixture();
    const { deps, live } = result;
    const candidateConfig = candidateEnabled ? coverageConfig : { ...coverageConfig,
      vars: { ...coverageConfig.vars, MONTH_COVERAGE_ENABLED: undefined }, triggers: config.triggers };
    live.settings.bindings = coverageBindings(OLD_REVISION, previouslyEnabled);
    live.schedules.schedules = (previouslyEnabled ? coverageConfig : config).triggers.crons.map(cron => ({ cron }));
    deps.readConfig = async () => candidateConfig;
    deps.verifyActivationAttestation = vi.fn(async () => {});
    deps.verifyLiveD1 = vi.fn(async () => {});
    const api = deps.api.getMockImplementation();
    deps.api.mockImplementation(path => path.endsWith(`/versions/${OLD}`)
      ? { id: OLD, annotations: { 'workers/tag': OLD_REVISION },
        resources: { bindings: coverageBindings(OLD_REVISION, previouslyEnabled) } }
      : api(path));
    const deploy = deps.deploy.getMockImplementation();
    deps.deploy.mockImplementation(async () => {
      const version = await deploy();
      live.settings.bindings = coverageBindings(REVISION, candidateEnabled);
      live.schedules.schedules = candidateConfig.triggers.crons.map(cron => ({ cron }));
      return version;
    });
    return result;
  }

  it('requires the coverage flag and dedicated schedule together with the active writer', () => {
    expect(() => validateConfig(coverageConfig, { allowActivation: true })).not.toThrow();
    expect(() => validateConfig({ ...coverageConfig, triggers: config.triggers }, { allowActivation: true })).toThrow(/crons/);
    expect(() => validateConfig({ ...coverageConfig,
      vars: { ...coverageConfig.vars, MONTH_COVERAGE_ENABLED: undefined } }, { allowActivation: true })).toThrow(/crons/);
    expect(() => validateConfig({ ...coverageConfig,
      vars: { ...coverageConfig.vars, MONTH_COVERAGE_ENABLED: 'false' } }, { allowActivation: true })).toThrow(/explicitly enabled/);
    expect(() => validateConfig({ ...coverageConfig,
      vars: { ...coverageConfig.vars, DURABLE_INGESTION_ENABLED: undefined } }, { allowActivation: true })).toThrow(/active durable writer/);
  });

  it.each([false, true])('releases from a verified predecessor with coverage enabled=%s', async previouslyEnabled => {
    const { deps, options } = coverageFixture(previouslyEnabled);
    const result = await releaseProduction(options, deps);
    expect(result.status).toBe('passed');
    expect(deps.verifyLiveD1).toHaveBeenCalledTimes(2);
    expect(deps.verifyLiveD1).toHaveBeenNthCalledWith(1, { requireEmpty: false });
    expect(deps.verifyLiveD1).toHaveBeenNthCalledWith(2, { requireEmpty: false });
  });

  it('disables coverage from an exactly verified enabled predecessor', async () => {
    const { deps, options, live } = coverageFixture(true, false);
    const result = await releaseProduction(options, deps);
    expect(result.status).toBe('passed');
    expect(deps.deploy).toHaveBeenCalledOnce();
    expect(live.settings.bindings.some(binding => binding.name === 'MONTH_COVERAGE_ENABLED')).toBe(false);
    expect(live.schedules.schedules.some(schedule => schedule.cron === cron)).toBe(false);
  });

  it.each(['flag', 'cron'])('rejects an enabled predecessor missing its %s before a disable release', async field => {
    const { deps, options, live } = coverageFixture(true, false);
    if (field === 'flag') live.settings.bindings = coverageBindings(OLD_REVISION, false);
    else live.schedules.schedules = config.triggers.crons.map(cron => ({ cron }));
    const result = await releaseProduction(options, deps);
    expect(result.failedCheck).toBe('metadata-access-and-baseline');
    expect(deps.deploy).not.toHaveBeenCalled();
  });

  it.each(['flag', 'cron'])('rejects a lingering %s after a disable release', async field => {
    const { deps, options, live } = coverageFixture(true, false);
    const deploy = deps.deploy.getMockImplementation();
    deps.deploy.mockImplementation(async () => {
      const version = await deploy();
      if (field === 'flag') live.settings.bindings = coverageBindings(REVISION, true);
      else live.schedules.schedules.push({ cron });
      return version;
    });
    const result = await releaseProduction(options, deps);
    expect(result.failedCheck).toBe('configuration');
    expect(result.uploadAttempted).toBe(true);
  });

  it.each(['flag', 'cron'])('rejects unexpected %s on the predecessor before upload', async field => {
    const { deps, options, live } = coverageFixture();
    if (field === 'flag') live.settings.bindings = coverageBindings(OLD_REVISION, true);
    else live.schedules.schedules.push({ cron });
    const result = await releaseProduction(options, deps);
    expect(result.failedCheck).toBe('metadata-access-and-baseline');
    expect(deps.deploy).not.toHaveBeenCalled();
  });

  it.each(['flag', 'cron'])('rejects missing %s after publication', async field => {
    const { deps, options, live } = coverageFixture();
    const deploy = deps.deploy.getMockImplementation();
    deps.deploy.mockImplementation(async () => {
      const version = await deploy();
      if (field === 'flag') live.settings.bindings = coverageBindings(REVISION, false);
      else live.schedules.schedules = config.triggers.crons.map(cron => ({ cron }));
      return version;
    });
    const result = await releaseProduction(options, deps);
    expect(result.failedCheck).toBe('configuration');
    expect(result.uploadAttempted).toBe(true);
  });

  it('requires the exact enabled flag in version binding readback', () => {
    const bad = coverageBindings(REVISION, true);
    bad.find(binding => binding.name === 'MONTH_COVERAGE_ENABLED').text = 'false';
    expect(() => verifyBindings(bad, coverageConfig, REVISION)).toThrow(/MONTH_COVERAGE_ENABLED/);
  });

  it('rejects an unrecognized predecessor coverage flag even when mutable settings differ', async () => {
    const { deps, options } = coverageFixture(true);
    const api = deps.api.getMockImplementation();
    deps.api.mockImplementation(async path => {
      const value = await api(path);
      if (path.endsWith(`/versions/${OLD}`)) {
        value.resources.bindings.find(binding => binding.name === 'MONTH_COVERAGE_ENABLED').text = 'false';
      }
      return value;
    });
    const result = await releaseProduction(options, deps);
    expect(result.failedCheck).toBe('metadata-access-and-baseline');
    expect(deps.deploy).not.toHaveBeenCalled();
  });
});

describe('identity verification', () => {
  const identity = { status: 'ok', environment: 'production', revision: REVISION, versionId: NEW };
  function fetcher(data, headers = { 'content-type': 'application/json', 'cache-control': 'no-store' }) { return vi.fn(async () => new Response(JSON.stringify(data), { headers })); }
  it('uses a bounded GET without redirects and checks no-store', async () => {
    const fetch = fetcher(identity); await verifyIdentity(fetch, 'https://earthquakeslive.com', REVISION, NEW);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store', headers: { 'User-Agent': 'Earthquake-Deployment-Smoke/1.0', Accept: 'application/json' } }); expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
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


const currentIdentity = { status: 'ok', environment: 'production', revision: REVISION, versionId: NEW };
const oldIdentity = { ...currentIdentity, revision: OLD_REVISION, versionId: OLD };
function identityResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function propagationOptions(overrides = {}) {
  let time = 0;
  return {
    previousIdentity: { versionId: OLD, revision: OLD_REVISION },
    assertCurrentVersion: vi.fn(async () => {}),
    now: () => time,
    wait: vi.fn(async delay => { time += delay; }),
    ...overrides,
  };
}

describe('bounded identity rollout propagation', () => {
  it('accepts only the exact preceding identity during initial propagation then verifies the new version', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(identityResponse(oldIdentity)).mockResolvedValueOnce(identityResponse(oldIdentity)).mockResolvedValueOnce(identityResponse(currentIdentity));
    const options = propagationOptions();
    await expect(verifyIdentity(fetch, 'https://earthquakeslive.com', REVISION, NEW, options)).resolves.toEqual({ attempts: 3 });
    expect(options.wait.mock.calls).toEqual([[5000], [5000]]);
    expect(options.assertCurrentVersion).toHaveBeenCalledTimes(6);
    expect(fetch.mock.calls[2][0]).toContain('attempt=3');
  });

  it('fails at the wall-clock bound when the preceding identity never converges', async () => {
    const fetch = vi.fn(async () => identityResponse(oldIdentity));
    const options = propagationOptions({ maxWaitMs: 12000 });
    await expect(verifyIdentity(fetch, 'https://earthquakeslive.com', REVISION, NEW, options)).rejects.toMatchObject({ diagnostic: { code: 'IDENTITY_PROPAGATION_TIMEOUT', attempts: 3 } });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(options.wait.mock.calls).toEqual([[5000], [5000], [2000]]);
  });

  it('also caps attempts when a stalled injected clock cannot advance the deadline', async () => {
    const fetch = vi.fn(async () => identityResponse(oldIdentity));
    const options = propagationOptions({ now: () => 0, wait: vi.fn(async () => {}), maxAttempts: 3 });
    await expect(verifyIdentity(fetch, 'https://earthquakeslive.com', REVISION, NEW, options)).rejects.toMatchObject({ diagnostic: { code: 'IDENTITY_PROPAGATION_TIMEOUT', attempts: 3 } });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each([
    [{ ...oldIdentity, revision: 'c'.repeat(40) }, 200, 'IDENTITY_UNEXPECTED_RELEASE'],
    [{ ...currentIdentity, revision: OLD_REVISION }, 200, 'IDENTITY_UNEXPECTED_RELEASE'],
    [{ ...oldIdentity, versionId: REPLACEMENT }, 200, 'IDENTITY_UNEXPECTED_RELEASE'],
    [{ ...oldIdentity, environment: 'preview' }, 200, 'IDENTITY_INVALID_ENVIRONMENT_OR_STATUS'],
    [{ status: 'error', secret: 'sensitive response body' }, 503, 'IDENTITY_HTTP_STATUS'],
    [{ secret: 'sensitive response body' }, 403, 'IDENTITY_HTTP_STATUS'],
  ])('never retries wrong identity, environment, binding failure or authorization failure %#', async (body, status, code) => {
    const fetch = vi.fn(async () => identityResponse(body, status));
    const options = propagationOptions();
    await expect(verifyIdentity(fetch, 'https://earthquakeslive.com', REVISION, NEW, options)).rejects.toMatchObject({ diagnostic: { code, attempts: 1, httpStatus: status } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(options.wait).not.toHaveBeenCalled();
  });

  it('keeps post-smoke checks strict and does not grant previous-release grace without control-plane validation', async () => {
    for (const options of [{}, { previousIdentity: { versionId: OLD, revision: OLD_REVISION } }]) {
      const fetch = vi.fn(async () => identityResponse(oldIdentity));
      await expect(verifyIdentity(fetch, 'https://earthquakeslive.com', REVISION, NEW, options)).rejects.toMatchObject({ diagnostic: { code: 'IDENTITY_UNEXPECTED_RELEASE' } });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it('does not retry transport failures or serialize sensitive transport errors', async () => {
    const fetch = vi.fn(async () => { throw new Error('private token and request data'); });
    const options = propagationOptions();
    await expect(verifyIdentity(fetch, 'https://earthquakeslive.com', REVISION, NEW, options)).rejects.toMatchObject({ diagnostic: { code: 'IDENTITY_TRANSPORT_FAILURE', attempts: 1 } });
    expect(options.wait).not.toHaveBeenCalled();
  });

  it('stops when another deployment replaces this release during a propagation wait', async () => {
    const { deps, options } = fixture();
    const originalApi = deps.api.getMockImplementation();
    let replaced = false;
    deps.api.mockImplementation(path => path.endsWith('/deployments') && replaced ? { deployments: [{ versions: [{ version_id: REPLACEMENT, percentage: 100 }] }] } : originalApi(path));
    const fetch = vi.fn(async () => identityResponse(oldIdentity));
    deps.identity.mockImplementation((origin, revision, version, identityOptions) => verifyIdentity(fetch, origin, revision, version, {
      ...identityOptions, wait: async () => { replaced = true; },
    }));
    const report = await releaseProduction(options, deps);
    expect(report.status).toBe('failed');
    expect(report.failedCheck).toBe('identity:https://earthquakeslive.com');
    expect(report.failureDiagnostic.code).toBe('CONCURRENT_DEPLOYMENT');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(deps.run.mock.calls.some(([command]) => command === 'node')).toBe(false);
  });

  it('checks for concurrent replacement even when HTTP already serves the expected identity', async () => {
    const { deps, options } = fixture();
    const originalApi = deps.api.getMockImplementation();
    let replaced = false;
    deps.api.mockImplementation(path => path.endsWith('/deployments') && replaced ? { deployments: [{ versions: [{ version_id: REPLACEMENT, percentage: 100 }] }] } : originalApi(path));
    deps.identity.mockImplementation((origin, revision, version, identityOptions) => verifyIdentity(async () => {
      replaced = true; return identityResponse(currentIdentity);
    }, origin, revision, version, identityOptions));
    const report = await releaseProduction(options, deps);
    expect(report.status).toBe('failed');
    expect(report.failureDiagnostic.code).toBe('CONCURRENT_DEPLOYMENT');
  });

  it('reports numeric/enum diagnostics for a permanent403 without disclosing body or message', async () => {
    const { deps, options } = fixture();
    const fetch = vi.fn(async () => identityResponse({ secret: 'private body contents' }, 403));
    deps.identity.mockImplementation((origin, revision, version, identityOptions) => verifyIdentity(fetch, origin, revision, version, identityOptions));
    const report = await releaseProduction(options, deps);
    expect(report.failureDiagnostic).toEqual({ code: 'IDENTITY_HTTP_STATUS', attempts: 1, httpStatus: 403 });
    expect(JSON.stringify(report)).not.toContain('private body');
    expect(JSON.stringify(deps.log.mock.calls)).not.toContain('private body');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('records successful attempt counts but does not grant grace after smoke', async () => {
    const { deps, options } = fixture();
    let first = true;
    const fetch = vi.fn(async () => {
      const body = first ? oldIdentity : currentIdentity; first = false; return identityResponse(body);
    });
    deps.identity.mockImplementation((origin, revision, version, identityOptions) => verifyIdentity(fetch, origin, revision, version, { ...identityOptions, wait: async () => {} }));
    const report = await releaseProduction(options, deps);
    expect(report.status).toBe('passed');
    expect(report.checks.find(check => check.name === 'identity:https://earthquakeslive.com').attempts).toBe(2);
    expect(deps.identity.mock.calls[1][3].previousIdentity).toBeUndefined();
  });
});


it('does not accept an otherwise matching identity after the propagation deadline', async () => {
  let time = 0;
  const options = propagationOptions({ now: () => time, maxWaitMs: 10000, assertCurrentVersion: async () => { time += 6000; } });
  await expect(verifyIdentity(async () => identityResponse(currentIdentity), 'https://earthquakeslive.com', REVISION, NEW, options)).rejects.toMatchObject({ diagnostic: { code: 'IDENTITY_PROPAGATION_TIMEOUT', attempts: 1 } });
});

it('blocks upload when baseline version tag and revision binding disagree', async () => {
  const { deps, options } = fixture();
  const api = deps.api.getMockImplementation();
  deps.api.mockImplementation(path => path.endsWith(`/versions/${OLD}`) ? { id: OLD, annotations: { 'workers/tag': OLD_REVISION }, resources: { bindings: [{ name: 'RELEASE_REVISION', text: 'c'.repeat(40) }] } } : api(path));
  const fetch = vi.fn(async () => identityResponse(oldIdentity));
  deps.identity.mockImplementation((origin, revision, version, identityOptions) => verifyIdentity(fetch, origin, revision, version, identityOptions));
  const report = await releaseProduction(options, deps);
  expect(report.failedCheck).toBe('predecessor-archive');
  expect(deps.deploy).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

describe('one-time durable activation release', () => {
  const PAUSED_REVISION = 'e6ed7248fa0c250bd3fd83c250c71a8bccd07310';
  const PAUSED_VERSION = '79754405-4027-46cb-b004-42e41dedfb77';
  const DATABASE = '8a0a26e9-ba3c-4984-9023-c1803f611a05';
  const activeConfig = { ...config,
    vars: { DEPLOYMENT_ENVIRONMENT: 'production', LIST_PUBLICATION_PAUSED: 'false', DURABLE_INGESTION_ENABLED: 'true' },
    d1_databases: [{ binding: 'DB', database_id: DATABASE }],
  };
  const pausedBindings = () => bindings().map(item => item.name === 'DB' ? { ...item, id: DATABASE }
    : item.name === 'RELEASE_REVISION' ? { ...item, text: PAUSED_REVISION } : item);
  const activeBindings = () => [
    ...pausedBindings().map(item => item.name === 'LIST_PUBLICATION_PAUSED' ? { ...item, text: 'false' }
      : item.name === 'RELEASE_REVISION' ? { ...item, text: REVISION } : item),
    { name: 'DURABLE_INGESTION_ENABLED', type: 'plain_text', text: 'true' },
  ];
  function activationFixture() {
    const { deps, options, live } = fixture();
    let deployed = false;
    live.settings.bindings = pausedBindings();
    deps.readConfig = async () => activeConfig;
    deps.verifyActivationAttestation = vi.fn(async () => {});
    deps.verifyLiveD1 = vi.fn(async () => {});
    deps.api = vi.fn(async path => {
      if (path.endsWith('/deployments')) return { deployments: [{ versions: [{ version_id: deployed ? NEW : PAUSED_VERSION, percentage: 100 }] }] };
      if (path.endsWith('/settings')) return live.settings;
      if (path.endsWith('/schedules')) return live.schedules;
      if (path.includes('/workers/domains?')) return live.domains;
      if (path.endsWith('/subdomain')) return live.subdomain;
      if (path.includes('/queues?')) return live.queues;
      if (path.endsWith(`/versions/${PAUSED_VERSION}`)) return { id: PAUSED_VERSION,
        annotations: { 'workers/tag': PAUSED_REVISION }, resources: { bindings: pausedBindings() } };
      if (path.endsWith(`/versions/${NEW}`)) return { id: NEW,
        annotations: { 'workers/tag': REVISION }, resources: { bindings: activeBindings() } };
      throw new Error('Unexpected API path');
    });
    deps.deploy = vi.fn(async () => { deployed = true; live.settings.bindings = activeBindings(); return NEW; });
    return { deps, options, live };
  }
  it('accepts only the reviewed attestation bytes and exact live D1 schema', async () => {
    await expect(verifyActivationAttestation()).resolves.toBeUndefined();
    const result = results => ({ success: true, meta: { changed_db: false, rows_written: 0 }, results });
    const migration = await readFile(new URL('../migrations/0022_durable_usgs_ingestion.sql', import.meta.url), 'utf8');
    const schema = [...migration.matchAll(/CREATE (TABLE|INDEX) (\w+)[\s\S]*?(?=;)/g)]
      .map(([sql, kind, name]) => ({ name, type: kind.toLowerCase(), sql }))
      .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    const queries = [
      result([{ name: '0022_durable_usgs_ingestion.sql' }]),
      result(schema), result([{ n: 0 }]), result([{ n: 0 }]), result([{ n: 0 }]),
    ];
    expect(() => verifyLiveD1Readback(queries, { requireEmpty: true })).not.toThrow();
    expect(() => verifyLiveD1Readback([queries[0], result(schema.map((row, i) => i === 1
      ? { ...row, sql: `${row.sql} /* changed */` } : row)), ...queries.slice(2)],
    { requireEmpty: true })).toThrow(/schema differs/);
    expect(() => verifyLiveD1Readback([...queries.slice(0, 3), result([{ n: 1 }]), queries[4]],
      { requireEmpty: true })).toThrow(/not empty/);
    expect(() => verifyLiveD1Readback([...queries.slice(0, 4), { ...queries[4], meta: { changed_db: true, rows_written: 1 } }])).toThrow(/read-only/);
  });
  it('validates the exact paused predecessor, receipts and live schema before upload', async () => {
    const { deps, options } = activationFixture();
    const result = await releaseProduction(options, deps);
    expect(result.status).toBe('passed');
    expect(result.previousVersion).toBe(PAUSED_VERSION);
    expect(deps.verifyActivationAttestation).toHaveBeenCalledOnce();
    expect(deps.verifyLiveD1).toHaveBeenCalledTimes(2);
    expect(deps.verifyLiveD1).toHaveBeenNthCalledWith(1, { requireEmpty: true });
    expect(deps.verifyLiveD1).toHaveBeenNthCalledWith(2, { requireEmpty: true });
    expect(deps.verifyLiveD1.mock.invocationCallOrder[1]).toBeLessThan(deps.deploy.mock.invocationCallOrder[0]);
    const deploymentReads = deps.api.mock.calls.flatMap(([path], i) =>
      path.endsWith('/deployments') ? [deps.api.mock.invocationCallOrder[i]] : []);
    expect(deps.verifyLiveD1.mock.invocationCallOrder[1]).toBeLessThan(deploymentReads[1]);
  });
  it('refuses activation if the live D1 check fails', async () => {
    const { deps, options } = activationFixture();
    deps.verifyLiveD1.mockRejectedValue(new Error('private readback body'));
    const result = await releaseProduction(options, deps);
    expect(result.failedCheck).toBe('live-d1-0022');
    expect(result.uploadAttempted).toBe(false);
    expect(deps.deploy).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('private readback body');
  });
  it('rechecks live D1 after the long test and archive gates, immediately before upload', async () => {
    const { deps, options } = activationFixture();
    deps.verifyLiveD1.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('schema changed'));
    const result = await releaseProduction(options, deps);
    expect(result.failedCheck).toBe('live-d1-0022-before-upload');
    expect(result.uploadAttempted).toBe(false);
    expect(deps.deploy).not.toHaveBeenCalled();
  });
  it('refuses a different paused predecessor revision', async () => {
    const { deps, options } = activationFixture();
    const api = deps.api.getMockImplementation();
    deps.api.mockImplementation(path => path.endsWith(`/versions/${PAUSED_VERSION}`)
      ? { id: PAUSED_VERSION, annotations: { 'workers/tag': OLD_REVISION },
        resources: { bindings: pausedBindings().map(item => item.name === 'RELEASE_REVISION'
          ? { ...item, text: OLD_REVISION } : item) } } : api(path));
    const result = await releaseProduction(options, deps);
    expect(result.failedCheck).toBe('metadata-access-and-baseline');
    expect(deps.deploy).not.toHaveBeenCalled();
  });
});
