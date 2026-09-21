#!/usr/bin/env node
// GET-only release checks. Existing details can use the application's lazy cache.
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/smoke-deployment.mjs [http://localhost:8787] [--preview]\nOnly GET requests are used. Run against the reconciled deployment, not the previous KV-based release.');
  process.exit(0);
}
const preview = args.includes('--preview');
const positional = args.filter((arg) => arg !== '--preview');
assert(positional.length <= 1 && !positional.some((arg) => arg.startsWith('--')), 'Expected one base URL and optional --preview.');
const base = new URL(positional[0] || 'http://localhost:8787');
assert(['http:', 'https:'].includes(base.protocol) && !base.username && !base.password, 'Use an HTTP(S) URL without credentials.');
assert(base.pathname === '/' && !base.search && !base.hash, 'Base URL must be the deployment origin.');
const assets = new Set();
let checks = 0;

async function request(path, contentType, status = 200) {
  const url = new URL(path, base);
  assert.equal(url.origin, base.origin, `Refusing external URL ${url}`);
  const response = await fetch(url, {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30_000),
    headers: { 'User-Agent': 'Earthquake-Deployment-Smoke/1.0' },
  });
  assert.equal(response.status, status, `${url.pathname}: unexpected HTTP status`);
  assert.match(response.headers.get('Content-Type') || '', contentType, `${url.pathname}: wrong content type`);
  checks += 1;
  console.log(`PASS ${response.status} ${url.pathname}${url.search}`);
  return response;
}

function queueAsset(reference, parent = base) {
  // Vite's preload map uses root-relative "assets/..." alongside relative imports.
  const url = new URL(reference.startsWith('assets/') ? `/${reference}` : reference, parent);
  if (url.origin === base.origin && /\.(?:js|css)$/.test(url.pathname)) assets.add(url.href);
}

async function checkPage(path) {
  const response = await request(path, /text\/html/i);
  assert.equal(response.headers.get('Cache-Control'), 'no-store', `${path}: HTML must not be shared across user-agent variants`);
  const html = await response.text();
  assert.match(html, /id=["']root["']/, `${path}: missing React root`);
  const references = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)];
  assert(references.some((match) => /\.js(?:\?|$)/.test(match[1])), `${path}: missing built JS entry`);
  assert(references.some((match) => /\.css(?:\?|$)/.test(match[1])), `${path}: missing built CSS entry`);
  for (const match of references) queueAsset(match[1]);
}

async function checkAssets() {
  // Set iteration includes subsequently discovered entries, so lazy chunks are checked too.
  for (const href of assets) {
    assert(assets.size <= 200, 'Unexpectedly large asset graph; stopping after 200 assets.');
    const url = new URL(href);
    const isJs = url.pathname.endsWith('.js');
    const response = await request(href, isJs ? /(?:javascript|ecmascript)/i : /text\/css/i);
    const body = await response.text();
    assert(body.trim().length > 0, `${url.pathname}: empty asset`);
    if (isJs) {
      // Matches static imports, dynamic imports, and Vite's lazy preload dependency map.
      for (const match of body.matchAll(/["']((?:\.\.?\/|\/assets\/|assets\/)[^"'\s]+\.(?:js|css))["']/g)) {
        queueAsset(match[1], url);
      }
    }
  }
}

async function readJson(path, status = 200) {
  const response = await request(path, /application\/json/i, status);
  return { response, data: await response.json() };
}

try {
  console.log(`Checking ${base.origin}${preview ? ' with synthetic preview fixtures' : ''}`);
  for (const path of ['/', '/overview', '/feeds', '/learn', '/learn/plate-tectonics']) await checkPage(path);
  const lists = {};
  for (const period of ['day', 'week', 'month']) {
    const { response, data } = await readJson(`/api/get-earthquakes?timeWindow=${period}`);
    assert.equal(response.headers.get('X-Data-Source'), 'R2', `${period}: expected the R2 feed`);
    assert(Array.isArray(data), `${period}: expected an earthquake array`);
    assert(data.length > 0, `${period}: published feed is unexpectedly empty`);
    if (preview) {
      assert(data.every((quake) => /^previewquake/.test(quake.id) && /SYNTHETIC PREVIEW/.test(quake.place)), `${period}: expected synthetic preview rows only`);
    }
    lists[period] = data;
  }
  const { data: clusters } = await readJson('/api/get-clusters');
  assert(Array.isArray(clusters), 'Expected a cluster array');
  const { response: unknownResponse, data: unknown } = await readJson('/api/unknown-deployment-smoke-check', 404);
  assert.equal(unknown.status, 'error', 'Unknown API route must return a structured JSON error');
  assert.equal(unknownResponse.headers.get('Cache-Control'), 'no-store');
  for (const path of ['/api/batch-usgs-fetch', '/api/backfill-earthquake-details', '/api/fix-enhanced-data-flag']) {
    const { response } = await readJson(path, 405);
    assert.equal(response.headers.get('Allow'), 'POST', `${path}: maintenance must require POST`);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  for (const path of ['/api/usgs-proxy?isCron=true', '/api/usgs-proxy?apiUrl=https%3A%2F%2Fexample.invalid%2Ffeed']) {
    const { response } = await readJson(path, 400);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }

  for (const path of ['/sitemap-index.xml', '/sitemap-static-pages.xml', '/sitemap-clusters.xml', '/sitemaps/earthquakes-1.xml']) {
    const response = await request(path, /(?:application|text)\/xml/i);
    const xml = await response.text();
    assert.match(xml, /<(?:sitemapindex|urlset)\b/, `${path}: missing sitemap document`);
    assert(!/<!--[^]*?(?:error|exception|database (?:not available|not configured))[^]*?-->/i.test(xml), `${path}: sitemap reports an internal error`);
  }

  assert(clusters.length > 0, 'Expected a stored cluster for the release detail checks');
  {
    if (preview) assert(clusters.every((cluster) => /SYNTHETIC PREVIEW/.test(cluster.title)), 'Expected synthetic preview clusters only');
    const cluster = clusters[0];
    const quake = preview ? lists.day[0] : { id: cluster.strongestQuakeId };
    assert(quake.id && /^[A-Za-z0-9_-]{1,100}$/.test(quake.id), 'Detail check requires a valid stored event ID');
    const { response, data: detail } = await readJson(`/api/earthquake/${encodeURIComponent(quake.id)}`);
    if (preview) assert.equal(response.headers.get('X-Data-Source'), 'R2-Storage', 'Preview detail must come from seeded R2 storage');
    assert(detail.id === quake.id || detail.properties?.ids?.split(',').includes(quake.id), 'Detail ID must match the requested event or its documented alias');
    assert.equal(detail.type, 'Feature');
    assert(Array.isArray(detail.geometry?.coordinates), 'Preview detail needs GeoJSON coordinates');
    assert(cluster.id && cluster.strongestQuakeId && cluster.slug, 'Stored cluster needs canonical ID, strongest quake, and slug');
    for (const id of new Set([cluster.strongestQuakeId, cluster.id])) {
      const { data } = await readJson(`/api/cluster-detail-with-quakes?id=${encodeURIComponent(id)}`);
      if (id === cluster.id) assert.equal(data.id, cluster.id, 'Canonical cluster lookup returned a different cluster');
      else assert.equal(data.strongestQuakeId, id, 'Strongest-event lookup returned an unrelated cluster');
      assert(Array.isArray(data.quakes) && data.quakes.length > 0, 'Cluster detail must include stored earthquake summaries');
      assert(data.quakes.every((entry) => data.earthquakeIds.includes(entry.id)), 'Cluster quake IDs must match its definition');
    }
    await checkPage(`/quake/m${detail.properties.mag}-release-check-${encodeURIComponent(quake.id)}`);
    await checkPage(`/cluster/${encodeURIComponent(cluster.slug)}`);
  }
  await checkAssets();
  console.log(`Deployment smoke passed: ${checks} GET checks, ${assets.size} built assets.`);
} catch (error) {
  console.error(`Deployment smoke failed: ${error.message}`);
  process.exitCode = 1;
}
