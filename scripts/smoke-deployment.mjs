#!/usr/bin/env node
// GET-only release checks. Existing details can use the application's lazy cache.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { validateSummaryEnvelope } from '../shared/clusterSummaryContract.js';
import { checkPeriodFeeds } from './check-period-feeds.mjs';
import { PREVIOUS_RELEASE_ASSETS } from '../src/previousReleaseAssets.js';
import { MAX_ASSETS } from './stage-previous-assets.mjs';

const CANONICAL_ORIGIN = 'https://earthquakeslive.com';
const CRAWLER_USER_AGENT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
// The retained graph and this release's assets are both requested. Keep a
// bounded margin for the current build's files and the non-asset route checks.
const MAX_SMOKE_ASSETS = MAX_ASSETS + 32;
const MAX_SMOKE_REQUESTS = MAX_SMOKE_ASSETS + 64;
const decodeXml = value => value.replace(/&(amp|quot|apos|lt|gt);/g, (_, entity) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' })[entity]);

export async function smokeDeployment(args = [], { fetchImpl = fetch, log = console.log } = {}) {

if (args.includes('--help')) {
  log('Usage: node scripts/smoke-deployment.mjs [http://localhost:8787] [--preview]\nAll three complete fresh period feeds are mandatory. --require-period-feeds is accepted as a redundant compatibility flag. Only GET requests are used. Run against the reconciled deployment, not the previous KV-based release.');
  return;
}
const preview = args.includes('--preview');
const positional = args.filter((arg) => !['--preview', '--require-period-feeds'].includes(arg));
assert(positional.length <= 1 && !positional.some((arg) => arg.startsWith('--')), 'Expected one base URL and optional --preview / --require-period-feeds.');
const base = new URL(positional[0] || 'http://localhost:8787');
assert(['http:', 'https:'].includes(base.protocol) && !base.username && !base.password, 'Use an HTTP(S) URL without credentials.');
assert(base.pathname === '/' && !base.search && !base.hash, 'Base URL must be the deployment origin.');
const assets = new Set();
let checks = 0;
let requests = 0;

async function request(path, contentType, status = 200, userAgent = 'Earthquake-Deployment-Smoke/1.0', signal = AbortSignal.timeout(30_000)) {
  const url = new URL(path, base);
  assert.equal(url.origin, base.origin, `Refusing external URL ${url}`);
  assert(++requests <= MAX_SMOKE_REQUESTS, `Smoke request budget exceeded (${MAX_SMOKE_REQUESTS} GET requests).`);
  const response = await fetchImpl(url, {
    method: 'GET', redirect: 'error', signal,
    headers: { 'User-Agent': userAgent },
  });
  assert.equal(response.status, status, `${url.pathname}: unexpected HTTP status`);
  assert.match(response.headers.get('Content-Type') || '', contentType, `${url.pathname}: wrong content type`);
  checks += 1;
  log(`PASS ${response.status} ${url.pathname}${url.search}`);
  return response;
}

function queueAsset(reference, parent = base) {
  // Vite's preload map uses root-relative "assets/..." alongside relative imports.
  const url = new URL(reference.startsWith('assets/') ? `/${reference}` : reference, parent);
  if (url.origin === base.origin && /\.(?:js|css)$/.test(url.pathname)) assets.add(url.href);
}

async function checkPage(path, { crawler = false, canonicalPath } = {}) {
  const response = await request(path, /text\/html/i, 200, crawler ? CRAWLER_USER_AGENT : undefined);
  assert.equal(response.headers.get('Cache-Control'), 'no-store', `${path}: HTML must not be shared across user-agent variants`);
  const html = await response.text();
  assert(!html.includes('/src/main.jsx'), `${path}: development entry leaked into deployed HTML`);
  if (crawler) {
    const canonicalTag = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => match[0]).find(tag => /\brel=["']canonical["']/i.test(tag));
    const canonical = canonicalTag?.match(/\bhref=["']([^"']+)["']/i)?.[1];
    assert(canonical, `${path}: crawler canonical is missing`);
    assert.equal(decodeXml(canonical), new URL(canonicalPath, CANONICAL_ORIGIN).href, `${path}: crawler canonical does not match the resolved entity`);
    assert.match(html, /<h1\b[^>]*>[^<]+<\/h1>/i, `${path}: crawler entity heading is missing`);
    if (path.startsWith('/cluster/')) assert(!/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html), `${path}: resolved crawler cluster must not be an error page`);
  }
  assert.match(html, /id=["']root["']/, `${path}: missing React root`);
  const references = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)]
    .filter(match => new URL(match[1], base).origin === base.origin);
  assert(references.some((match) => /\.js(?:\?|$)/.test(match[1])), `${path}: missing built JS entry`);
  assert(references.some((match) => /\.css(?:\?|$)/.test(match[1])), `${path}: missing built CSS entry`);
  for (const match of references) {
    queueAsset(match[1]);
  }
  return html;
}

async function checkAssets() {
  // Already-open clients retain the previous entry's complete lazy import graph.
  // Verify every explicitly retained public path, including MIME (SPA HTML is a failure).
  for (const path of Object.keys(PREVIOUS_RELEASE_ASSETS)) assets.add(new URL(path, base).href);
  // Set iteration includes subsequently discovered entries, so lazy chunks are checked too.
  for (const href of assets) {
    assert(assets.size <= MAX_SMOKE_ASSETS, `Unexpectedly large asset graph; stopping after ${MAX_SMOKE_ASSETS} assets.`);
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

  log(`Checking ${base.origin}${preview ? ' with synthetic preview fixtures' : ''}`);
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
  await checkPeriodFeeds(base.origin, {
    preview, log: () => {},
    fetchImpl: (url, options) => request(url, /application\/json/i, 200, options.headers['User-Agent'], options.signal),
  });
  const { data: clusters } = await readJson('/api/get-clusters');
  assert(Array.isArray(clusters), 'Expected a cluster array');
  // Consumer releases require a real published compact snapshot. Missing data
  // must fail the release gate rather than silently use the legacy download.
  const { response: summaryResponse, data: summaries } = await readJson('/api/cluster-summaries?view=overview&limit=100');
  validateSummaryEnvelope(summaries);
  assert.equal(summaryResponse.headers.get('Cache-Control'), 'no-store');
  assert.equal(summaries.items.length, Math.min(100, summaries.totalCount), 'Expected a complete bounded first summary page');
  assert.equal(summaries.nextCursor === null, summaries.totalCount <= 100, 'Summary continuation must agree with total');
  assert.equal(summaries.stale, false, 'Consumer release requires a recent stored summary publication');
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

  let clusterSitemap;
  for (const path of ['/sitemap-index.xml', '/sitemap-static-pages.xml', '/sitemap-clusters.xml', '/sitemaps/earthquakes-1.xml']) {
    const response = await request(path, /(?:application|text)\/xml/i);
    const xml = await response.text();
    if (path === '/sitemap-clusters.xml') clusterSitemap = xml;
    assert.match(xml, /<(?:sitemapindex|urlset)\b/, `${path}: missing sitemap document`);
    assert(!/<!--[^]*?(?:error|exception|database (?:not available|not configured))[^]*?-->/i.test(xml), `${path}: sitemap reports an internal error`);
  }

  // Discover the route from the emitted sitemap, rather than synthesizing a
  // friendly slug that could conceal a mismatch with persisted canonical slugs.
  const emittedLocation = clusterSitemap.match(/<loc>\s*([^<]+)\s*<\/loc>/i)?.[1];
  assert(emittedLocation, 'Cluster sitemap must emit an existing entity URL');
  const emitted = new URL(decodeXml(emittedLocation.trim()));
  assert([base.origin, CANONICAL_ORIGIN].includes(emitted.origin) && !emitted.username && !emitted.password,
    'Refusing an unexpected cluster sitemap origin');
  assert(/^\/cluster\/[^/]+$/.test(emitted.pathname) && !emitted.search && !emitted.hash, 'Unexpected cluster sitemap route');
  // Canonicals intentionally use the public host, including on preview. Only
  // rebase the origin, retaining the actual emitted route, and never fetch it remotely.
  const sitemapPath = emitted.pathname;
  const { data: sitemapCluster } = await readJson(`/api/cluster-detail-with-quakes?slug=${encodeURIComponent(decodeURIComponent(sitemapPath.slice('/cluster/'.length)))}`);
  assert(sitemapCluster.id && sitemapCluster.slug && sitemapCluster.canonicalPath, 'Sitemap lookup must return canonical cluster identity');
  assert.equal(sitemapCluster.canonicalPath, `/cluster/${encodeURIComponent(sitemapCluster.slug)}`, 'Cluster API canonical path must match its stored slug');
  await checkPage(sitemapPath);
  await checkPage(sitemapPath, { crawler: true, canonicalPath: sitemapCluster.canonicalPath });

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
    const quakePath = `/quake/id/${encodeURIComponent(quake.id)}`;
    await checkPage(quakePath, { crawler: true, canonicalPath: `/quake/id/${encodeURIComponent(detail.id)}` });
    // Legacy descriptive URLs remain compatible, including negative/null magnitudes.
    const legacyMagnitude = Number.isFinite(detail.properties.mag) ? detail.properties.mag : 'unknown';
    await checkPage(`/quake/m${legacyMagnitude}-release-check-${encodeURIComponent(quake.id)}`, { crawler: true, canonicalPath: `/quake/id/${encodeURIComponent(detail.id)}` });
    await checkPage(`/cluster/${encodeURIComponent(cluster.slug)}`);
  }
  await checkAssets();
  log(`Deployment smoke passed: ${checks} GET checks, ${assets.size} built assets.`);
  return { checks, assets: assets.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  smokeDeployment(process.argv.slice(2)).catch(error => {
    console.error(`Deployment smoke failed: ${error.message}`);
    process.exitCode = 1;
  });
}
