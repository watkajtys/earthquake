#!/usr/bin/env node
// This is the only routine production publisher. Importing it never runs a release.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir, devNull } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ACCOUNT = 'f7e27d63f4766d7fb6a0f5b4789e2cdb';
const WORKER = 'earthquake';
const PAUSED_REVISION = 'e6ed7248fa0c250bd3fd83c250c71a8bccd07310';
const PAUSED_VERSION = '79754405-4027-46cb-b004-42e41dedfb77';
const DATABASE = '8a0a26e9-ba3c-4984-9023-c1803f611a05';
const ACTIVATION_ATTESTATION = {
  schemaVersion: 1,
  accountId: ACCOUNT,
  databaseId: DATABASE,
  pausedRevision: PAUSED_REVISION,
  pausedVersionId: PAUSED_VERSION,
  pausedObservationSha256: 'e58a7483741def2995c69ecbdcae8b6d4f74c09a146db77eb71e9614cadf9e40',
  migrationSqlSha256: '4aa9a6a5b081f6de4c58d1ff26ab5c7b22606ac2fd9eb124428d99252da3062c',
  backupManifestSha256: 'b50562c279126a1cd297f1d45eb451edac5b36f78206df3f56ff99d1af580898',
  listBeforeImagesManifestSha256: '602b8c8221821b2e59de9660dfdd91982193959bf6484ad2c6c8b592e0482401',
  immediateBookmarkReceiptSha256: '8258b0e9a317b0d083122435917c7b7e46880b10587209a8d5e6b412f8264158',
  liveD1ReadbackSha256: '0146530a514cf69c2ded80a01245d7dcccb5eaa6a3b8752f49e740fa30d88bc0',
  pausedIdentityReceiptSha256: 'e4eb425bc1e8998d19f12e8feb0c65c598708b2722687aea4a3094456b535473',
};
const D1_ACTIVATION_READBACK_SQL = "SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1; " +
  "SELECT name, type, sql FROM sqlite_master WHERE name IN ('UsgsIngestionState','UsgsIngestionRuns','UsgsIngestionIssues','idx_usgs_ingestion_runs_feed_due') ORDER BY name; " +
  'SELECT COUNT(*) AS n FROM UsgsIngestionState; ' +
  'SELECT COUNT(*) AS n FROM UsgsIngestionRuns; ' +
  'SELECT COUNT(*) AS n FROM UsgsIngestionIssues;';
const ORIGINS = ['https://earthquakeslive.com', 'https://earthquake.matty-f7e.workers.dev'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_COVERAGE_CRON = '2-59/5 * * * *';

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

export async function verifyActivationAttestation() {
  const path = resolve(ROOT, 'docs/remediation/DURABLE-0022-ACTIVATION.json');
  const attestation = JSON.parse(await readFile(path, 'utf8'));
  assert.deepEqual(attestation, ACTIVATION_ATTESTATION,
    'The committed activation attestation differs from the reviewed receipts.');
}

export function verifyLiveD1Readback(queries, { requireEmpty = false } = {}) {
  requireCheck(Array.isArray(queries) && queries.length === 5,
    'Production D1 migration readback is incomplete.');
  requireCheck(queries.every(query => query?.success === true &&
    query.meta?.changed_db === false && query.meta?.rows_written === 0),
  'Production D1 migration readback was not read-only or did not succeed.');
  const results = queries.map(query => query?.results);
  assert.deepEqual(results[0], [{ name: '0022_durable_usgs_ingestion.sql' }],
    'Production D1 migration 0022 is not the latest applied migration.');
  requireCheck(Array.isArray(results[1]) && results[1].length === 4 &&
    createHash('sha256').update(JSON.stringify(results[1])).digest('hex') ===
      '28f4d63d2b43967b980fb42b504a6d81a9dd2709eed9c8be98ba72bdb86c4c2b',
  'Production D1 ingestion schema differs from rehearsed migration 0022.');
  for (const [index, label] of [[2, 'state'], [3, 'runs'], [4, 'issues']]) {
    const count = results[index]?.[0]?.n;
    requireCheck(results[index]?.length === 1 && Number.isSafeInteger(count) && count >= 0,
      `Production D1 ingestion ${label} count is invalid.`);
    if (requireEmpty) requireCheck(count === 0,
      `Production D1 ingestion ${label} is not empty before activation.`);
  }
}

export function parseArgs(args, env = process.env) {
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    requireCheck(['--env', '--revision', '--report'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--'), 'Use --env production [--revision <full SHA>] [--report <path>].');
    requireCheck(!values[args[i]], `Duplicate argument: ${args[i]}`);
    values[args[i]] = args[i + 1];
  }
  requireCheck(values['--env'] === 'production', 'An explicit --env production is required.');
  const revision = values['--revision'] || env.WORKERS_CI_COMMIT_SHA || env.GITHUB_SHA;
  requireCheck(/^[0-9a-f]{40}$/.test(revision || ''), 'Supply the expected full Git SHA with --revision or WORKERS_CI_COMMIT_SHA/GITHUB_SHA.');
  for (const ciRevision of [env.WORKERS_CI_COMMIT_SHA, env.GITHUB_SHA].filter(Boolean)) {
    requireCheck(ciRevision === revision, 'The expected revision differs from the CI revision.');
  }
  return { environment: 'production', revision, reportPath: values['--report'] || `.reconciliation.local/releases/${revision}-${Date.now()}.json` };
}

export function validateConfig(config, { allowActivation = false } = {}) {
  requireCheck(config.name === WORKER && config.account_id === ACCOUNT, 'Production account/Worker differs from the reviewed target.');
  requireCheck(config.main === resolve(ROOT, 'src/worker.js'), 'Production must use the active src/worker.js entrypoint.');
  requireCheck(config.assets?.binding === 'ASSETS' && config.assets.run_worker_first === true, 'Worker-first ASSETS configuration is required.');
  requireCheck(config.version_metadata?.binding === 'WORKER_VERSION_METADATA', 'Version metadata binding is required.');
  requireCheck(config.vars?.DEPLOYMENT_ENVIRONMENT === 'production', 'Production environment identity is required.');
  const paused = config.vars?.LIST_PUBLICATION_PAUSED === 'true' && config.vars?.DURABLE_INGESTION_ENABLED === undefined;
  const active = config.vars?.LIST_PUBLICATION_PAUSED === 'false' && config.vars?.DURABLE_INGESTION_ENABLED === 'true';
  const monthCoverage = config.vars?.MONTH_COVERAGE_ENABLED === 'true';
  requireCheck(config.vars?.MONTH_COVERAGE_ENABLED === undefined || monthCoverage,
    'Month coverage must be explicitly enabled or absent.');
  requireCheck(!monthCoverage || active, 'Month coverage requires the active durable writer.');
  requireCheck(paused || (allowActivation && active),
    'Production list publication requires both reviewed activation bindings.');
  for (const [field, names] of [['kv_namespaces', ['CLUSTER_KV', 'USGS_LAST_RESPONSE_KV', 'STATIC_KV']], ['d1_databases', ['DB']], ['r2_buckets', ['GEOJSON_BUCKET']]]) {
    assert.deepEqual(config[field].map(item => item.binding).sort(), names.sort(), `Unexpected ${field} configuration`);
  }
  if (active) requireCheck(config.d1_databases[0].database_id === DATABASE &&
    config.r2_buckets[0].bucket_name === 'geojson-bucket',
  'Activation must target the reviewed production D1 database and R2 bucket.');
  requireCheck(config.queues.producers.length === 1 && config.queues.producers[0].binding === 'GEOJSON_QUEUE' && config.queues.consumers.length === 1, 'Expected queue producer and consumer are required.');
  assert.deepEqual([...config.triggers.crons].sort(),
    ['*/5 * * * *', '*/10 * * * *', '*/30 * * * *', '0 0 * * *',
      ...(monthCoverage ? [MONTH_COVERAGE_CRON] : [])].sort(), 'Unexpected production crons');
  assert.deepEqual(config.routes, [{ pattern: 'earthquakeslive.com', custom_domain: true }], 'Unexpected production domain');
  requireCheck(config.workers_dev === true, 'The secondary public Worker host must remain enabled.');
}

export function verifyBindings(bindings, config, revision) {
  requireCheck(Array.isArray(bindings), 'Configuration readback has no bindings.');
  const expected = [
    { name: 'ASSETS', type: 'assets' },
    ...config.kv_namespaces.map(item => ({ name: item.binding, type: 'kv_namespace', namespace_id: item.id })),
    ...config.d1_databases.map(item => ({ name: item.binding, type: 'd1', id: item.database_id })),
    ...config.r2_buckets.map(item => ({ name: item.binding, type: 'r2_bucket', bucket_name: item.bucket_name })),
    ...config.queues.producers.map(item => ({ name: item.binding, type: 'queue', queue_name: item.queue })),
  ];
  if (revision) expected.push(
    { name: 'WORKER_VERSION_METADATA', type: 'version_metadata' },
    { name: 'DEPLOYMENT_ENVIRONMENT', type: 'plain_text', text: 'production' },
    { name: 'LIST_PUBLICATION_PAUSED', type: 'plain_text', text: config.vars.LIST_PUBLICATION_PAUSED },
    { name: 'RELEASE_REVISION', type: 'plain_text', text: revision },
  );
  if (revision && config.vars.DURABLE_INGESTION_ENABLED === 'true') expected.push(
    { name: 'DURABLE_INGESTION_ENABLED', type: 'plain_text', text: 'true' },
  );
  else if (revision) requireCheck(!bindings.some(item => item.name === 'DURABLE_INGESTION_ENABLED'),
    'Durable ingestion must remain disabled for a paused release.');
  if (revision && config.vars.MONTH_COVERAGE_ENABLED === 'true') expected.push(
    { name: 'MONTH_COVERAGE_ENABLED', type: 'plain_text', text: 'true' },
  );
  else if (revision) requireCheck(!bindings.some(item => item.name === 'MONTH_COVERAGE_ENABLED'),
    'Month coverage must be absent for this release.');
  for (const wanted of expected) {
    const actual = bindings.find(item => item.name === wanted.name);
    requireCheck(actual && Object.entries(wanted).every(([key, value]) => (key === 'id' ? actual.id || actual.database_id : actual[key]) === value), `Missing or incorrect binding: ${wanted.name}`);
  }
}

export function currentVersion(deployments) {
  const latest = deployments?.deployments?.[0];
  requireCheck(latest?.versions?.length === 1 && latest.versions[0].percentage === 100 && UUID.test(latest.versions[0].version_id), 'Expected exactly one deployed version at 100%; inspect gradual or missing deployments manually.');
  return latest.versions[0].version_id;
}

export function verifyConfiguration(state, config, revision) {
  verifyBindings(state.settings.bindings, config, revision);
  assert.deepEqual(state.schedules.schedules.map(item => item.cron).sort(), [...config.triggers.crons].sort(), 'Deployed crons differ from production config');
  requireCheck(state.domains.some(item => item.hostname === 'earthquakeslive.com' && item.service === WORKER && item.environment === 'production'), 'Custom domain does not target the production Worker.');
  requireCheck(state.subdomain.enabled === true, 'Public workers.dev host is disabled.');
  for (const configured of config.queues.consumers) {
    const queue = state.queues.find(item => item.queue_name === configured.queue);
    const consumers = queue?.consumers?.filter(item => (item.script === WORKER || item.service === WORKER) && (!item.environment || item.environment === 'production')) || [];
    requireCheck(consumers.length === 1, 'Production queue consumer is missing or ambiguous.');
    const expected = { batch_size: configured.max_batch_size, max_wait_time_ms: configured.max_batch_timeout * 1000, max_retries: configured.max_retries, retry_delay: configured.retry_delay };
    for (const [key, value] of Object.entries(expected)) if (value !== undefined) requireCheck(consumers[0].settings?.[key] === value, `Queue consumer ${key} differs from production config.`);
  }
}

export async function readConfiguration(api, config) {
  const script = `/accounts/${ACCOUNT}/workers/scripts/${WORKER}`;
  const [settings, schedules, domains, subdomain, ...queueResults] = await Promise.all([
    api(`${script}/settings`), api(`${script}/schedules`),
    api(`/accounts/${ACCOUNT}/workers/domains?service=${WORKER}&environment=production`),
    api(`${script}/subdomain`),
    ...config.queues.consumers.map(item => api(`/accounts/${ACCOUNT}/queues?name=${encodeURIComponent(item.queue)}&page=1`)),
  ]);
  return { settings, schedules, domains, subdomain, queues: queueResults.flat() };
}

class ReleaseCheckError extends Error {
  constructor(code, attempts = 1, httpStatus) {
    super(code);
    this.diagnostic = { code, attempts, ...(Number.isInteger(httpStatus) ? { httpStatus } : {}) };
  }
}

export async function verifyIdentity(fetchImpl, origin, revision, versionId, {
  previousIdentity,
  assertCurrentVersion,
  maxWaitMs = 90_000,
  retryDelayMs = 5_000,
  maxAttempts = 19,
  now = Date.now,
  wait = milliseconds => new Promise(resolveWait => setTimeout(resolveWait, milliseconds)),
} = {}) {
  // Only the exact known previous release may receive initial rollout grace.
  // Missing identity/bindings, auth failures and foreign releases are never retried.
  const canRetryPrevious = previousIdentity && UUID.test(previousIdentity.versionId) &&
    /^[0-9a-f]{40}$/.test(previousIdentity.revision || '') && typeof assertCurrentVersion === 'function';
  const deadline = now() + maxWaitMs;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (now() >= deadline) throw new ReleaseCheckError('IDENTITY_PROPAGATION_TIMEOUT', attempt - 1);
    const checkCurrentVersion = async () => {
      try { if (assertCurrentVersion) await assertCurrentVersion(); }
      catch (error) {
        if (error instanceof ReleaseCheckError) error.diagnostic.attempts = attempt;
        throw error;
      }
    };
    await checkCurrentVersion();
    if (now() >= deadline) throw new ReleaseCheckError('IDENTITY_PROPAGATION_TIMEOUT', attempt - 1);
    let response;
    try {
      response = await fetchImpl(`${origin}/api/release-identity?revision=${revision}&attempt=${attempt}`, {
        method: 'GET', redirect: 'error', cache: 'no-store',
        headers: { 'User-Agent': 'Earthquake-Deployment-Smoke/1.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(Math.max(1, Math.min(15_000, deadline - now()))),
      });
    } catch { throw new ReleaseCheckError('IDENTITY_TRANSPORT_FAILURE', attempt); }
    if (response.status !== 200) throw new ReleaseCheckError('IDENTITY_HTTP_STATUS', attempt, response.status);
    if (!/application\/json/i.test(response.headers.get('content-type') || '')) throw new ReleaseCheckError('IDENTITY_CONTENT_TYPE', attempt, response.status);
    if (!/\bno-store\b/i.test(response.headers.get('cache-control') || '')) throw new ReleaseCheckError('IDENTITY_CACHE_POLICY', attempt, response.status);
    let body;
    try { body = await response.json(); }
    catch { throw new ReleaseCheckError('IDENTITY_INVALID_JSON', attempt, response.status); }
    if (body?.status !== 'ok' || body?.environment !== 'production') throw new ReleaseCheckError('IDENTITY_INVALID_ENVIRONMENT_OR_STATUS', attempt, response.status);
    if (body.revision === revision && body.versionId === versionId) {
      await checkCurrentVersion();
      if (now() >= deadline) throw new ReleaseCheckError('IDENTITY_PROPAGATION_TIMEOUT', attempt, response.status);
      return { attempts: attempt };
    }
    if (!canRetryPrevious || body.versionId !== previousIdentity.versionId || body.revision !== previousIdentity.revision) {
      throw new ReleaseCheckError('IDENTITY_UNEXPECTED_RELEASE', attempt, response.status);
    }
    await checkCurrentVersion();
    if (attempt === maxAttempts || now() >= deadline) throw new ReleaseCheckError('IDENTITY_PROPAGATION_TIMEOUT', attempt, response.status);
    await wait(Math.min(retryDelayMs, deadline - now()));
  }
  throw new ReleaseCheckError('IDENTITY_PROPAGATION_TIMEOUT', maxAttempts);
}

// Dependencies are injected so orchestration tests cannot upload or access real APIs.
export async function releaseProduction(options, deps) {
  const report = { schemaVersion: 1, environment: options.environment, worker: WORKER, revision: options.revision, startedAt: deps.now(), previousVersion: null, newVersion: null, checks: [], status: 'failed', uploadAttempted: false };
  let stage = 'preflight';
  const check = async (name, operation) => {
    stage = name;
    const result = await operation();
    report.checks.push({ name, status: 'passed', at: deps.now(),
      ...(Number.isInteger(result?.attempts) ? { attempts: result.attempts } : {}) });
  };
  const deploymentsPath = `/accounts/${ACCOUNT}/workers/scripts/${WORKER}/deployments`;
  let previousIdentity;
  let firstActivation = false;
  try {
    requireCheck(options.environment === 'production' && /^[0-9a-f]{40}$/.test(options.revision), 'Explicit production environment and full revision are required.');
    const config = await deps.readConfig();
    const active = config.vars?.DURABLE_INGESTION_ENABLED === 'true';
    validateConfig(config, { allowActivation: active });
    await check('source', () => deps.verifySource(options.revision));
    await check('metadata-access-and-baseline', async () => {
      report.previousVersion = currentVersion(await deps.api(deploymentsPath));
      const previous = await deps.api(`/accounts/${ACCOUNT}/workers/scripts/${WORKER}/versions/${report.previousVersion}`);
      const previousRevision = previous.annotations?.['workers/tag'];
      const previousBinding = previous.resources?.bindings?.find(binding => binding.name === 'RELEASE_REVISION');
      if (previous.id === report.previousVersion && /^[0-9a-f]{40}$/.test(previousRevision || '') && previousBinding?.text === previousRevision) {
        previousIdentity = { versionId: report.previousVersion, revision: previousRevision };
      }
      firstActivation = active && report.previousVersion === PAUSED_VERSION;
      if (active) requireCheck(previousIdentity?.versionId === report.previousVersion,
        'The active release requires an exact deployed predecessor identity.');
      if (firstActivation) requireCheck(previousIdentity.revision === PAUSED_REVISION,
        'The paused predecessor revision differs from the reviewed activation base.');
      let baselineConfig = firstActivation
        ? { ...config, vars: { ...config.vars, LIST_PUBLICATION_PAUSED: 'true', DURABLE_INGESTION_ENABLED: undefined } }
        : config;
      const previousCoverage = previous.resources?.bindings?.find(binding => binding.name === 'MONTH_COVERAGE_ENABLED');
      requireCheck(previousCoverage === undefined ||
        (previousCoverage.type === 'plain_text' && previousCoverage.text === 'true'),
      'The predecessor has an unrecognized month coverage binding.');
      if (config.vars?.MONTH_COVERAGE_ENABLED === 'true') {
        requireCheck(!firstActivation, 'Month coverage must follow durable writer activation.');
      }
      // Baseline settings follow the exact predecessor in either direction:
      // first enablement and a reviewed disable release both require its
      // unchanged flag/schedule. Post-upload checks use the candidate config.
      baselineConfig = { ...baselineConfig,
        vars: { ...baselineConfig.vars, MONTH_COVERAGE_ENABLED: previousCoverage?.text },
        triggers: { ...baselineConfig.triggers,
          crons: [...baselineConfig.triggers.crons.filter(cron => cron !== MONTH_COVERAGE_CRON),
            ...(previousCoverage ? [MONTH_COVERAGE_CRON] : [])] },
      };
      verifyConfiguration(await readConfiguration(deps.api, config), baselineConfig,
        active ? previousIdentity.revision : undefined);
    });
    if (active) {
      await check('activation-attestation', () => deps.verifyActivationAttestation());
      await check('live-d1-0022', () => deps.verifyLiveD1({ requireEmpty: firstActivation }));
    }
    await check('tests', () => deps.run('npm', ['test'], { timeout: 15 * 60_000 }));
    // Wrangler's configured custom build runs Vite before packaging/upload. Keep
    // the explicit build gate too, so its success is recorded before publication.
    await check('frontend-build', () => deps.run('npm', ['run', 'build'], { timeout: 5 * 60_000 }));
    await check('production-package', () => deps.run('wrangler', ['deploy', '--env', 'production', '--dry-run'], { timeout: 5 * 60_000 }));
    await check('predecessor-archive', () => {
      requireCheck(previousIdentity?.versionId === report.previousVersion,
        'Exact deployed predecessor identity is required for the asset archive gate.');
      return deps.verifyPredecessorArchive(previousIdentity);
    });
    await check('source-before-upload', () => deps.verifySource(options.revision));
    if (active) await check('live-d1-0022-before-upload',
      () => deps.verifyLiveD1({ requireEmpty: firstActivation }));
    await check('version-before-upload', async () => {
      requireCheck(currentVersion(await deps.api(deploymentsPath)) === report.previousVersion, 'Concurrent deployment before upload; release stopped.');
    });
    await check('deploy', async () => {
      report.uploadAttempted = true;
      report.newVersion = await deps.deploy(options.revision);
      requireCheck(UUID.test(report.newVersion), 'Wrangler did not return an unambiguous deployed version ID.');
    });
    const liveCheck = async () => {
      if (currentVersion(await deps.api(deploymentsPath)) !== report.newVersion) throw new ReleaseCheckError('CONCURRENT_DEPLOYMENT');
    };
    await check('version-after-upload', liveCheck);
    await check('configuration', async () => {
      verifyConfiguration(await readConfiguration(deps.api, config), config, options.revision);
      const version = await deps.api(`/accounts/${ACCOUNT}/workers/scripts/${WORKER}/versions/${report.newVersion}`);
      requireCheck(version.id === report.newVersion && version.annotations?.['workers/tag'] === options.revision, 'Uploaded version/tag does not match the expected release.');
      verifyBindings(version.resources?.bindings, config, options.revision);
    });
    for (const origin of ORIGINS) {
      await check(`identity:${origin}`, () => deps.identity(origin, options.revision, report.newVersion, { previousIdentity, assertCurrentVersion: liveCheck }));
      await check(`smoke:${origin}`, () => deps.run('node', ['scripts/smoke-deployment.mjs', origin], { timeout: 5 * 60_000 }));
      await check(`identity-after-smoke:${origin}`, () => deps.identity(origin, options.revision, report.newVersion, { assertCurrentVersion: liveCheck }));
      await check(`version-after-smoke:${origin}`, liveCheck);
    }
    report.status = 'passed';
  } catch (error) {
    // Do not serialize exception messages or API bodies: they can contain secrets.
    report.failedCheck = stage;
    if (error instanceof ReleaseCheckError) report.failureDiagnostic = error.diagnostic;
    report.checks.push({ name: stage, status: 'failed', at: deps.now() });
    report.recovery = report.uploadAttempted
      ? 'Publication was attempted and may have succeeded. Read the current deployment/configuration, contain competing triggers, and select a compatible known-good version before an explicit rollback. The previous version is a candidate, not an automatic rollback target.'
      : 'No upload was attempted. Resolve the failed check and rerun for the same reviewed revision.';
    deps.log(`Release failed during ${stage}.${report.failureDiagnostic ? ` Diagnostic: ${JSON.stringify(report.failureDiagnostic)}.` : ''} ${report.recovery}`);
  } finally {
    report.finishedAt = deps.now();
    await deps.writeReport(options.reportPath, report);
  }
  return report;
}

function runCommand(command, args, { timeout = 60_000, capture = false, env = process.env } = {}) {
  const executable = command === 'wrangler' ? process.execPath : command === 'node' ? process.execPath : command;
  const argv = command === 'wrangler' ? [resolve(ROOT, 'node_modules/wrangler/bin/wrangler.js'), ...args] : args;
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, argv, { cwd: ROOT, env, stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'], detached: process.platform !== 'win32' });
    let output = '';
    const stop = () => { try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); } catch { /* already exited */ } };
    const timer = setTimeout(stop, timeout);
    child.stdout?.on('data', chunk => { output += chunk; if (output.length > 8_000_000) stop(); });
    // Captured stderr is deliberately discarded (git errors may include remote URLs).
    child.stderr?.on('data', () => {});
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); code === 0 ? resolvePromise(output.trim()) : reject(new Error(`${command} failed or timed out`)); });
  });
}

export async function readWranglerCredentials(run = runCommand) {
  // Official Wrangler credential retrieval; capture only in memory, never inherit
  // stdout or print/serialize the credentials (including JSON parse errors).
  let credentials;
  const authDirectory = await mkdtemp(resolve(tmpdir(), 'earthquake-auth-'));
  const authLog = resolve(authDirectory, 'discard.log');
  try {
    // Wrangler logs even JSON stdout to disk; route that private log to /dev/null.
    await symlink(devNull, authLog);
    credentials = JSON.parse(await run('wrangler', ['auth', 'token', '--json'], {
      capture: true, env: { ...process.env, WRANGLER_LOG_PATH: authLog, WRANGLER_SEND_METRICS: 'false' },
    }));
  } catch { throw new Error('Wrangler authentication unavailable; no upload attempted.'); }
  finally { await rm(authDirectory, { recursive: true, force: true }); }
  requireCheck(['oauth', 'api_token'].includes(credentials.type) && typeof credentials.token === 'string' && credentials.token.length > 0, 'Use Wrangler OAuth login or a scoped CLOUDFLARE_API_TOKEN.');
  return credentials;
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    console.log('Usage: npm run release:production -- --revision <full SHA> [--report <path>]\nRequires a clean checkout and Wrangler authentication with deployment plus Workers/domain/queue read access.');
    return;
  }
  const options = parseArgs(args);
  requireCheck(!process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID === ACCOUNT, 'CLOUDFLARE_ACCOUNT_ID differs from the reviewed production account.');
  let credentials = await readWranglerCredentials();
  const { unstable_readConfig } = await import('wrangler');
  const api = async path => {
    const request = () => fetch(`https://api.cloudflare.com/client/v4${path}`, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${credentials.token}` } });
    let response = await request();
    if (response.status === 401) {
      credentials = await readWranglerCredentials();
      response = await request();
    }
    requireCheck(response.ok, 'Cloudflare readback unavailable; check token permissions.');
    const data = await response.json();
    requireCheck(data.success === true && data.result != null, 'Cloudflare readback was incomplete.');
    return data.result;
  };
  const report = await releaseProduction(options, {
    now: () => new Date().toISOString(), log: console.error,
    readConfig: () => unstable_readConfig({ config: resolve(ROOT, 'wrangler.toml'), env: 'production' }, { hideWarnings: true }),
    verifySource: async revision => {
      requireCheck(await runCommand('git', ['rev-parse', 'HEAD'], { capture: true }) === revision, 'Expected revision is not HEAD.');
      requireCheck(await runCommand('git', ['status', '--porcelain', '--untracked-files=normal'], { capture: true }) === '', 'Release requires a clean checkout, including untracked source files.');
    },
    verifyActivationAttestation,
    verifyLiveD1: async ({ requireEmpty }) => {
      const output = await runCommand('wrangler', ['d1', 'execute', 'DB', '--env', 'production', '--remote', '--json',
        '--command', D1_ACTIVATION_READBACK_SQL], { capture: true, timeout: 60_000 });
      verifyLiveD1Readback(JSON.parse(output), { requireEmpty });
    },
    run: runCommand, api,
    verifyPredecessorArchive: ({ revision, versionId }) => runCommand('node',
      ['scripts/verify-predecessor-archive.mjs', '--revision', revision, '--version', versionId],
      { timeout: 10 * 60_000 }),
    identity: (origin, revision, version, identityOptions) => verifyIdentity(fetch, origin, revision, version, identityOptions),
    deploy: async revision => {
      const directory = await mkdtemp(resolve(tmpdir(), 'earthquake-release-'));
      const output = resolve(directory, 'wrangler.jsonl');
      try {
        await runCommand('wrangler', ['deploy', '--env', 'production', '--tag', revision, '--var', `RELEASE_REVISION:${revision}`, '--var', 'DEPLOYMENT_ENVIRONMENT:production'], { timeout: 10 * 60_000, env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: output } });
        const deployments = (await readFile(output, 'utf8')).trim().split('\n').map(line => JSON.parse(line)).filter(item => item.type === 'deploy');
        requireCheck(deployments.length === 1 && deployments[0].worker_name === WORKER && deployments[0].wrangler_environment === 'production', 'Wrangler output does not match the intended production deployment.');
        return deployments[0].version_id;
      } finally { await rm(directory, { recursive: true, force: true }); }
    },
    writeReport: async (path, result) => {
      const target = resolve(ROOT, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
      console.log(`Release result: ${target} (${result.status})`);
    },
  });
  if (report.status !== 'passed') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
