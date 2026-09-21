#!/usr/bin/env node
// This is the only routine production publisher. Importing it never runs a release.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir, devNull } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ACCOUNT = 'f7e27d63f4766d7fb6a0f5b4789e2cdb';
const WORKER = 'earthquake';
const ORIGINS = ['https://earthquakeslive.com', 'https://earthquake.matty-f7e.workers.dev'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
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

export function validateConfig(config) {
  requireCheck(config.name === WORKER && config.account_id === ACCOUNT, 'Production account/Worker differs from the reviewed target.');
  requireCheck(config.main === resolve(ROOT, 'src/worker.js'), 'Production must use the active src/worker.js entrypoint.');
  requireCheck(config.assets?.binding === 'ASSETS' && config.assets.run_worker_first === true, 'Worker-first ASSETS configuration is required.');
  requireCheck(config.version_metadata?.binding === 'WORKER_VERSION_METADATA', 'Version metadata binding is required.');
  requireCheck(config.vars?.DEPLOYMENT_ENVIRONMENT === 'production', 'Production environment identity is required.');
  for (const [field, names] of [['kv_namespaces', ['CLUSTER_KV', 'USGS_LAST_RESPONSE_KV', 'STATIC_KV']], ['d1_databases', ['DB']], ['r2_buckets', ['GEOJSON_BUCKET']]]) {
    assert.deepEqual(config[field].map(item => item.binding).sort(), names.sort(), `Unexpected ${field} configuration`);
  }
  requireCheck(config.queues.producers.length === 1 && config.queues.producers[0].binding === 'GEOJSON_QUEUE' && config.queues.consumers.length === 1, 'Expected queue producer and consumer are required.');
  assert.deepEqual([...config.triggers.crons].sort(), ['*/5 * * * *', '*/10 * * * *', '*/30 * * * *', '0 0 * * *'].sort(), 'Unexpected production crons');
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
    { name: 'RELEASE_REVISION', type: 'plain_text', text: revision },
  );
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

export async function verifyIdentity(fetchImpl, origin, revision, versionId) {
  const response = await fetchImpl(`${origin}/api/release-identity?revision=${revision}`, { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  requireCheck(response.status === 200 && /application\/json/i.test(response.headers.get('content-type') || ''), 'Release identity must return HTTP 200 JSON.');
  requireCheck(/\bno-store\b/i.test(response.headers.get('cache-control') || ''), 'Release identity must be no-store.');
  const body = await response.json();
  requireCheck(body.status === 'ok' && body.environment === 'production' && body.revision === revision && body.versionId === versionId, 'Serving release identity does not match the expected environment, revision and version.');
}

// Dependencies are injected so orchestration tests cannot upload or access real APIs.
export async function releaseProduction(options, deps) {
  const report = { schemaVersion: 1, environment: options.environment, worker: WORKER, revision: options.revision, startedAt: deps.now(), previousVersion: null, newVersion: null, checks: [], status: 'failed', uploadAttempted: false };
  let stage = 'preflight';
  const check = async (name, operation) => {
    stage = name;
    await operation();
    report.checks.push({ name, status: 'passed', at: deps.now() });
  };
  const deploymentsPath = `/accounts/${ACCOUNT}/workers/scripts/${WORKER}/deployments`;
  try {
    requireCheck(options.environment === 'production' && /^[0-9a-f]{40}$/.test(options.revision), 'Explicit production environment and full revision are required.');
    const config = await deps.readConfig();
    validateConfig(config);
    await check('source', () => deps.verifySource(options.revision));
    await check('metadata-access-and-baseline', async () => {
      report.previousVersion = currentVersion(await deps.api(deploymentsPath));
      verifyConfiguration(await readConfiguration(deps.api, config), config);
    });
    await check('tests', () => deps.run('npm', ['test'], { timeout: 15 * 60_000 }));
    // Wrangler's configured custom build runs Vite before packaging/upload. Keep
    // the explicit build gate too, so its success is recorded before publication.
    await check('frontend-build', () => deps.run('npm', ['run', 'build'], { timeout: 5 * 60_000 }));
    await check('production-package', () => deps.run('wrangler', ['deploy', '--env', 'production', '--dry-run'], { timeout: 5 * 60_000 }));
    await check('source-before-upload', () => deps.verifySource(options.revision));
    await check('version-before-upload', async () => {
      requireCheck(currentVersion(await deps.api(deploymentsPath)) === report.previousVersion, 'Concurrent deployment before upload; release stopped.');
    });
    await check('deploy', async () => {
      report.uploadAttempted = true;
      report.newVersion = await deps.deploy(options.revision);
      requireCheck(UUID.test(report.newVersion), 'Wrangler did not return an unambiguous deployed version ID.');
    });
    const liveCheck = async () => requireCheck(currentVersion(await deps.api(deploymentsPath)) === report.newVersion, 'Concurrent deployment replaced this release; do not rollback over it.');
    await check('version-after-upload', liveCheck);
    await check('configuration', async () => {
      verifyConfiguration(await readConfiguration(deps.api, config), config, options.revision);
      const version = await deps.api(`/accounts/${ACCOUNT}/workers/scripts/${WORKER}/versions/${report.newVersion}`);
      requireCheck(version.id === report.newVersion && version.annotations?.['workers/tag'] === options.revision, 'Uploaded version/tag does not match the expected release.');
      verifyBindings(version.resources?.bindings, config, options.revision);
    });
    for (const origin of ORIGINS) {
      await check(`identity:${origin}`, () => deps.identity(origin, options.revision, report.newVersion));
      await check(`smoke:${origin}`, () => deps.run('node', ['scripts/smoke-deployment.mjs', origin], { timeout: 5 * 60_000 }));
      await check(`identity-after-smoke:${origin}`, () => deps.identity(origin, options.revision, report.newVersion));
      await check(`version-after-smoke:${origin}`, liveCheck);
    }
    report.status = 'passed';
  } catch (error) {
    // Do not serialize exception messages or API bodies: they can contain secrets.
    report.failedCheck = stage;
    report.checks.push({ name: stage, status: 'failed', at: deps.now() });
    report.recovery = report.uploadAttempted
      ? 'Publication was attempted and may have succeeded. Read the current deployment/configuration, contain competing triggers, and select a compatible known-good version before an explicit rollback. The previous version is a candidate, not an automatic rollback target.'
      : 'No upload was attempted. Resolve the failed check and rerun for the same reviewed revision.';
    deps.log(`Release failed during ${stage}. ${report.recovery}`);
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
    run: runCommand, api,
    identity: (origin, revision, version) => verifyIdentity(fetch, origin, revision, version),
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
