#!/usr/bin/env node
// Seed synthetic fixtures only into the isolated preview environment.
// Local: node scripts/seed-preview.mjs
// Cloudflare preview: node scripts/seed-preview.mjs --remote
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targetName = 'earthquake-reconcile-preview';
const args = process.argv.slice(2);

if (args.length === 1 && args[0] === '--help') {
  console.log('Usage: node scripts/seed-preview.mjs [--local | --remote]\nDefaults to local preview storage in .wrangler/state. Applies repository migrations and refreshes synthetic fixtures.');
  process.exit(0);
}
if (args.length > 1 || args.some((arg) => !['--local', '--remote'].includes(arg))) {
  console.error('Only --local (default) or --remote is accepted. The environment is always preview.');
  process.exit(1);
}

const remote = args[0] === '--remote';
let temporaryDirectory;

function requireCondition(condition, message) {
  if (!condition) throw new Error(`Refusing preview seed: ${message}`);
}

function runWrangler(command, configPath, capture = false) {
  const result = spawnSync(process.execPath, [
    join(root, 'node_modules/wrangler/bin/wrangler.js'),
    ...command, '--config', configPath, '--env', 'preview',
  ], {
    cwd: root,
    env: {
      ...process.env,
      CI: 'true',
      WRANGLER_SEND_METRICS: 'false',
      WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH || join(root, '.wrangler/logs'),
    },
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : ['ignore', 'inherit', 'inherit'],
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Wrangler ${command.slice(0, 3).join(' ')} failed (${result.status ?? result.signal}).`);
  return result.stdout;
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid numeric fixture value.');
    return String(value);
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function upsert(table, row) {
  const columns = Object.keys(row);
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((key) => sqlValue(row[key])).join(', ')})\nON CONFLICT(id) DO UPDATE SET ${columns.filter((key) => key !== 'id').map((key) => `${key} = excluded.${key}`).join(', ')};`;
}

try {
  // Use Wrangler's own parser so environment inheritance matches the CLI.
  const { unstable_readConfig: readConfig } = await import('wrangler');
  const sourceConfig = join(root, 'wrangler.toml');
  const preview = readConfig({ config: sourceConfig, env: 'preview' }, { hideWarnings: true });
  const production = readConfig({ config: sourceConfig, env: 'production' }, { hideWarnings: true });
  requireCondition(preview.name === targetName, `Worker name must be ${targetName}.`);
  requireCondition(!preview.routes?.length && !preview.route, 'preview must not have custom domain routes.');
  requireCondition(!preview.triggers?.crons?.length, 'preview scheduled tasks must be disabled.');

  const databases = preview.d1_databases || [];
  const buckets = preview.r2_buckets || [];
  const namespaces = preview.kv_namespaces || [];
  const database = databases.find((entry) => entry.binding === 'DB');
  const bucket = buckets.find((entry) => entry.binding === 'GEOJSON_BUCKET');
  requireCondition(databases.length === 1 && database?.database_name === targetName, `DB must be the dedicated ${targetName} database.`);
  requireCondition(buckets.length === 1 && bucket?.bucket_name === targetName, `R2 must be the dedicated ${targetName} bucket.`);
  requireCondition(!bucket.preview_bucket_name || bucket.preview_bucket_name === targetName, 'R2 preview bucket name differs from the dedicated bucket.');
  const productionIds = new Set([
    ...(production.d1_databases || []).flatMap((entry) => [entry.database_id, entry.preview_database_id]),
    ...(production.kv_namespaces || []).flatMap((entry) => [entry.id, entry.preview_id]),
  ].filter(Boolean));
  requireCondition(typeof database.database_id === 'string' && /^[a-f0-9-]{36}$/i.test(database.database_id), 'preview DB needs a configured database_id.');
  requireCondition(!productionIds.has(database.database_id) && !productionIds.has(database.preview_database_id), 'preview DB shares a production resource ID.');
  requireCondition(!database.preview_database_id || database.preview_database_id === database.database_id, 'preview_database_id must match the dedicated preview database.');
  requireCondition(namespaces.length === 2 && ['CLUSTER_KV', 'USGS_LAST_RESPONSE_KV'].every((binding) => namespaces.some((entry) => entry.binding === binding)), 'preview must contain only CLUSTER_KV and USGS_LAST_RESPONSE_KV.');
  for (const namespace of namespaces) {
    requireCondition(typeof namespace.id === 'string' && /^[a-f0-9]{32}$/i.test(namespace.id), `${namespace.binding} needs a configured preview namespace ID.`);
    requireCondition(!productionIds.has(namespace.id) && !productionIds.has(namespace.preview_id), `${namespace.binding} shares a production namespace ID.`);
    requireCondition(!namespace.preview_id || namespace.preview_id === namespace.id, `${namespace.binding} preview_id must match its dedicated namespace.`);
  }
  const producers = preview.queues?.producers || [];
  const consumers = preview.queues?.consumers || [];
  requireCondition(producers.length === 1 && producers[0].binding === 'GEOJSON_QUEUE' && producers[0].queue === targetName, 'preview producer must use the dedicated preview queue.');
  requireCondition(consumers.length === 1 && consumers[0].queue === targetName, 'preview consumer must use the dedicated preview queue.');

  temporaryDirectory = await mkdtemp(join(tmpdir(), 'earthquake-preview-seed-'));
  const configPath = join(temporaryDirectory, 'wrangler.json');
  // Freeze the validated storage bindings; a later source-config edit cannot retarget this run.
  await writeFile(configPath, JSON.stringify({
    ...(preview.account_id ? { account_id: preview.account_id } : {}),
    compatibility_date: preview.compatibility_date,
    env: {
      preview: {
        name: targetName,
        d1_databases: [{ binding: 'DB', database_name: targetName, database_id: database.database_id, migrations_dir: join(root, 'migrations') }],
        kv_namespaces: namespaces.map(({ binding, id }) => ({ binding, id })),
        r2_buckets: [{ binding: 'GEOJSON_BUCKET', bucket_name: targetName }],
      },
    },
  }, null, 2));

  if (remote) {
    // Resource IDs have no visible environment prefix: verify remote names before writes.
    const remoteDatabases = JSON.parse(runWrangler(['d1', 'list', '--json'], configPath, true));
    requireCondition(remoteDatabases.some((entry) => entry.uuid === database.database_id && entry.name === targetName), 'DB ID does not belong to the named preview database.');
    const remoteNamespaces = JSON.parse(runWrangler(['kv', 'namespace', 'list'], configPath, true));
    const namespaceTitles = {
      CLUSTER_KV: `${targetName}-clusters`,
      USGS_LAST_RESPONSE_KV: `${targetName}-usgs`,
    };
    for (const namespace of namespaces) {
      const registered = remoteNamespaces.find((entry) => entry.id === namespace.id);
      requireCondition(registered?.title === namespaceTitles[namespace.binding], `${namespace.binding} does not belong to the named preview namespace.`);
    }
  }

  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const definitions = [
    ['previewquake001', 6.3, 0.25, -118, 35, 8],
    ['previewquake002', 5.1, 2, -118.05, 35.04, 12],
    ['previewquake003', 4.8, 28, -117.98, 34.97, 6],
    ['previewquake004', 6.1, 9 * 24, 140, 36, 20],
  ];
  const features = definitions.map(([id, magnitude, ageHours, longitude, latitude, depth]) => ({
    type: 'Feature', id,
    geometry: { type: 'Point', coordinates: [longitude, latitude, depth] },
    properties: {
      mag: magnitude,
      place: `SYNTHETIC PREVIEW ${id === 'previewquake004' ? 'Pacific' : 'California'} event`,
      time: now - ageHours * hour, updated: now,
      title: `M ${magnitude.toFixed(1)} - SYNTHETIC PREVIEW event`,
      detail: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${id}.geojson`,
      url: `https://earthquake.usgs.gov/earthquakes/eventpage/${id}`,
      status: 'reviewed', type: 'earthquake', magType: 'mw', net: 'preview', code: id,
      sig: Math.round(magnitude * 100), tsunami: 0, alert: null, felt: 0,
      cdi: null, mmi: null, nst: 10, dmin: 0.1, rms: 0.2, gap: 30,
      products: {},
    },
  }));
  const rows = features.map((feature) => ({
    id: feature.id, magnitude: feature.properties.mag, place: feature.properties.place,
    event_time: feature.properties.time, latitude: feature.geometry.coordinates[1],
    longitude: feature.geometry.coordinates[0], depth: feature.geometry.coordinates[2],
  }));
  const clusterFeatures = features.slice(0, 3);
  const cluster = {
    id: 'overview_cluster_previewquake001_3',
    slug: '3-quakes-near-synthetic-preview-california-m6.3-previewquake001',
    title: 'SYNTHETIC PREVIEW cluster: California',
    description: 'Synthetic preview fixtures for testing. These are not real earthquakes.',
    locationName: 'SYNTHETIC PREVIEW California',
    centroidLat: 35, centroidLon: -118, radiusKm: 10, depthRange: '6.0-12.0km',
    startTime: clusterFeatures[2].properties.time, endTime: clusterFeatures[0].properties.time,
    durationHours: 27.75, quakeCount: 3, strongestQuakeId: 'previewquake001',
    earthquakeIds: JSON.stringify(clusterFeatures.map((feature) => feature.id)),
    maxMagnitude: 6.3, meanMagnitude: 5.4, minMagnitude: 4.8, significanceScore: 10,
    version: 'synthetic-preview-v1', stableKey: 'synthetic-preview-california',
    createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
  };
  const sql = [
    ...rows.map((row, index) => upsert('EarthquakeEvents', {
      ...row, usgs_detail_url: features[index].properties.detail, retrieved_at: now,
      products_json: '{}', detail_fetched: 1, detail_fetch_time: now,
      has_enhanced_data: 0, detail_fetch_attempts: 0,
    })),
    upsert('ClusterDefinitions', cluster),
  ].join('\n');
  const sqlPath = join(temporaryDirectory, 'fixtures.sql');
  await writeFile(sqlPath, sql);
  const targetFlags = remote ? ['--remote'] : ['--local', '--persist-to', join(root, '.wrangler/state')];

  console.log(`Seeding ${remote ? 'remote' : 'local'} ${targetName} with clearly labeled synthetic data.`);
  runWrangler(['d1', 'migrations', 'apply', targetName, ...targetFlags], configPath);
  runWrangler(['d1', 'execute', targetName, '--file', sqlPath, '--yes', ...targetFlags], configPath);

  const clustersPath = join(temporaryDirectory, 'active-clusters.json');
  await writeFile(clustersPath, JSON.stringify([cluster]));
  runWrangler(['kv', 'key', 'put', 'active_clusters', '--binding', 'CLUSTER_KV', '--path', clustersPath, ...targetFlags], configPath);

  const objects = features.map((feature) => [`${feature.id}.json`, feature]);
  // D1 keeps scalar columns; only the R2 list contract carries summary metadata.
  const listRows = rows.map((row, index) => ({
    ...row, properties: { ...features[index].properties }, summary_updated_at: now,
  }));
  for (const [period, days] of [['day', 1], ['week', 7], ['month', 30]]) {
    objects.push([`list-${period}.json`, listRows.filter((row) => row.event_time >= now - days * 24 * hour)]);
  }
  for (const [key, value] of objects) {
    const objectPath = join(temporaryDirectory, key);
    await writeFile(objectPath, JSON.stringify(value));
    runWrangler(['r2', 'object', 'put', `${targetName}/${key}`, '--file', objectPath, '--content-type', 'application/json', '--cache-control', 'no-store', ...targetFlags], configPath);
  }

  console.log(`Seeded 4 earthquakes, 1 cluster, and ${objects.length} R2 objects. Re-run to refresh fixture timestamps.`);
  console.log('Preview paths: /quake/m6.3-synthetic-preview-california-previewquake001');
  console.log(`               /cluster/${cluster.slug}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
}
