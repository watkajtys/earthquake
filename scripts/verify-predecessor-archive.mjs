#!/usr/bin/env node
// Read-only pre-upload gate for the exact deployed predecessor asset graph.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PREVIOUS_RELEASE_ASSETS } from '../src/previousReleaseAssets.js';
import { MAX_ASSETS } from './stage-previous-assets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://earthquakeslive.com';
const ACCOUNT = 'f7e27d63f4766d7fb6a0f5b4789e2cdb';
const WORKER = 'earthquake';
const BUCKET = 'geojson-bucket';
const R2_API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ASSET_PATH = /^\/assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.(?:js|css)$/;
const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_HTML_BYTES = 1024 * 1024;
const MAX_IDENTITY_BYTES = 8192;
const MAX_R2_LIST_BYTES = 2 * 1024 * 1024;
const MAX_R2_LIST_PAGES = 20;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function validateManifest(manifest) {
  const entries = Object.entries(manifest);
  assert(entries.length > 0 && entries.length <= MAX_ASSETS, 'Retained asset manifest exceeds reviewed count');
  let total = 0;
  for (const [path, descriptor] of entries) {
    assert(ASSET_PATH.test(path), `${path}: invalid retained asset URL`);
    assert(/^[0-9a-f]{64}$/.test(descriptor?.sha256), `${path}: invalid retained digest`);
    assert.equal(descriptor.key, `static-assets/v1/${descriptor.sha256}`, `${path}: invalid archive key`);
    assert(Number.isSafeInteger(descriptor.byteLength) && descriptor.byteLength > 0 &&
      descriptor.byteLength <= MAX_ASSET_BYTES, `${path}: invalid retained byte length`);
    assert.equal(descriptor.contentType, path.endsWith('.js')
      ? 'application/javascript; charset=utf-8' : 'text/css; charset=utf-8', `${path}: invalid retained MIME`);
    total += descriptor.byteLength;
  }
  assert(total <= MAX_TOTAL_BYTES, 'Retained asset manifest exceeds reviewed bytes');
  return entries;
}

async function readBounded(response, maxBytes, label) {
  assert(response.body, `${label}: missing response body`);
  const reader = response.body.getReader();
  const parts = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new Error(`${label}: body exceeds reviewed limit`);
      }
      parts.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(parts, length);
}

function assetUrl(reference, parent) {
  const url = new URL(reference.startsWith('assets/') ? `/${reference}` : reference, parent);
  assert.equal(url.origin, ORIGIN, `Unexpected external asset reference: ${reference}`);
  assert(!url.search && !url.hash && ASSET_PATH.test(url.pathname),
    `Unrecognized frontend asset reference: ${reference}`);
  return url;
}

function sourceReferences(source, kind) {
  const references = [];
  // Covers Vite preload maps, static imports, and literal dynamic imports.
  for (const match of source.matchAll(/["'`]((?:\.\.?\/|\/assets\/|assets\/)[^"'`\s]+?\.(?:js|css)(?:[?#][^"'`\s]*)?)["'`]/g)) {
    references.push(match[1]);
  }
  if (kind === 'js') {
    for (const match of source.matchAll(/\b(?:from|import)\s*(["'])([^"']+)\1/g)) {
      references.push(match[2]);
    }
    for (const match of source.matchAll(/\bimport\s*\(\s*([^)]*)\)/g)) {
      const literal = match[1].trim().match(/^(["'`])([^"'`]+)\1(?:\s*,[\s\S]*)?$/);
      // React Router's declarative bundle retains an unreachable framework
      // route-module fallback. Review any other computed import explicitly.
      const frameworkFallback = /^[A-Za-z_$][\w$]*\.module$/.test(match[1].trim()) &&
        source.slice(match.index, match.index + 300).includes('Error loading route module') &&
        source.slice(match.index, match.index + 400).includes('__reactRouterContext');
      if (frameworkFallback) continue;
      assert(literal && !literal[2].includes('${'), 'Unrecognized nonliteral dynamic import');
      assert(/\.(?:js|css)(?:[?#]|$)/.test(literal[2]), 'Unrecognized dynamic import target');
      references.push(literal[2]);
    }
  } else {
    for (const match of source.matchAll(/@import\s+(?:url\(\s*)?(?:(["'])([^"']+)\1|([^\s;)]+))/g)) {
      references.push(match[2] || match[3]);
    }
    for (const match of source.matchAll(/\burl\(\s*(?:(["'])([^"']+)\1|([^\s)]+))\s*\)/g)) {
      const reference = match[2] || match[3];
      if (reference.startsWith('#') || reference.startsWith('data:')) continue;
      assert(/\.(?:js|css)(?:[?#]|$)/.test(reference), 'Unrecognized CSS resource reference');
      references.push(reference);
    }
  }
  return references;
}

async function fetchChecked(fetchImpl, url, contentType, maxBytes) {
  const response = await fetchImpl(url, { method: 'GET', redirect: 'error', cache: 'no-store',
    headers: { 'User-Agent': 'Earthquake-Deployment-Smoke/1.0' }, signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200, `${url.pathname}: predecessor GET failed`);
  assert.match(response.headers.get('Content-Type') || '', contentType, `${url.pathname}: predecessor MIME changed`);
  return { response, bytes: await readBounded(response, maxBytes, url.pathname) };
}

// The Cloudflare R2 REST endpoints used here are GET-only. List supplies the
// metadata checked by the public archive bridge; object GET supplies the bytes.
// Both use the same authenticated account/bucket as the production binding.
export function productionArchiveReader(apiFetch) {
  assert(typeof apiFetch === 'function', 'Authenticated Cloudflare API GET is required');
  let metadataPromise;
  async function metadata() {
    const objects = new Map();
    const seenCursors = new Set();
    let cursor;
    for (let page = 0; page < MAX_R2_LIST_PAGES; page++) {
      const url = new URL(R2_API);
      url.searchParams.set('prefix', 'static-assets/v1/');
      url.searchParams.set('per_page', '1000');
      if (cursor) url.searchParams.set('cursor', cursor);
      const response = await apiFetch(url);
      assert.equal(response.status, 200, 'Production archive metadata read failed');
      const payload = JSON.parse((await readBounded(response, MAX_R2_LIST_BYTES, 'R2 asset list')).toString('utf8'));
      assert(payload.success === true && Array.isArray(payload.result), 'Production archive metadata is invalid');
      for (const object of payload.result) {
        assert(typeof object?.key === 'string' && !objects.has(object.key), 'Production archive metadata has duplicate or invalid keys');
        objects.set(object.key, object);
      }
      if (payload.result_info?.is_truncated === false) return objects;
      cursor = payload.result_info?.cursor;
      assert(payload.result_info?.is_truncated === true && typeof cursor === 'string' && cursor.length > 0 &&
        !seenCursors.has(cursor), 'Production archive metadata pagination is invalid');
      seenCursors.add(cursor);
    }
    throw new Error('Production archive metadata exceeds reviewed page limit');
  }
  return { async get(key) {
    assert(/^static-assets\/v1\/[0-9a-f]{64}$/.test(key), 'Unrecognized production archive key');
    metadataPromise ||= metadata();
    const object = (await metadataPromise).get(key);
    if (!object) return null;
    const response = await apiFetch(new URL(`${R2_API}/${key}`));
    assert.equal(response.status, 200, `${key}: production archive body read failed`);
    const bytes = await readBounded(response, MAX_ASSET_BYTES, key);
    return { size: object.size,
      customMetadata: object.custom_metadata,
      httpMetadata: { contentType: object.http_metadata?.contentType },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  } };
}

export async function verifyPredecessorArchive({ revision, versionId, bucket, fetchImpl = fetch,
  manifest = PREVIOUS_RELEASE_ASSETS }) {
  assert(/^[0-9a-f]{40}$/.test(revision) && UUID.test(versionId), 'Exact predecessor revision/version required');
  assert(bucket && typeof bucket.get === 'function', 'Production archive read binding is required');
  const entries = validateManifest(manifest);
  const identityUrl = new URL('/api/release-identity', ORIGIN);
  const { response: identityResponse, bytes: identityBytes } = await fetchChecked(fetchImpl, identityUrl,
    /application\/json/i, MAX_IDENTITY_BYTES);
  assert.match(identityResponse.headers.get('Cache-Control') || '', /\bno-store\b/i, 'Predecessor identity must be uncached');
  const identity = JSON.parse(identityBytes.toString('utf8'));
  assert(identity.status === 'ok' && identity.environment === 'production' &&
    identity.revision === revision && identity.versionId === versionId, 'Deployed predecessor identity changed');

  const rootUrl = new URL('/', ORIGIN);
  const { response: rootResponse, bytes: rootBytes } = await fetchChecked(fetchImpl, rootUrl, /text\/html/i, MAX_HTML_BYTES);
  assert.match(rootResponse.headers.get('Cache-Control') || '', /\bno-store\b/i, 'Predecessor HTML must be uncached');
  const html = rootBytes.toString('utf8');
  assert(!html.includes('/src/main.jsx'), 'Predecessor HTML has a development entry');
  const initial = [];
  for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const attribute = name => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];
    if (/^<script\b/i.test(tag)) {
      if (/\bsrc\s*=/i.test(tag)) {
        assert(attribute('src'), 'Unrecognized predecessor script src');
        initial.push(attribute('src'));
      }
    } else {
      const rel = attribute('rel') || '';
      const href = attribute('href');
      const isAssetLink = /\b(?:stylesheet|modulepreload)\b/i.test(rel) ||
        (/\bpreload\b/i.test(rel) && /^(?:script|style)$/i.test(attribute('as') || '')) ||
        /\.(?:js|css)(?:[?#]|["'])/i.test(tag);
      if (isAssetLink) {
        assert(href, 'Predecessor asset link has no href');
        initial.push(href);
      }
    }
  }
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1])) {
      assert(!/\bimport\b/.test(match[2]), 'Unrecognized inline import in predecessor HTML');
    }
  }
  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    assert(!/@import\b|\burl\s*\(/.test(match[1]), 'Unrecognized inline CSS resource in predecessor HTML');
  }
  assert(initial.some(ref => /\.js(?:[?#]|$)/.test(ref)) && initial.some(ref => /\.css(?:[?#]|$)/.test(ref)),
    'Predecessor HTML lacks a built JS/CSS entry');
  const queued = new Map();
  function queue(reference, parent) {
    const url = assetUrl(reference, parent);
    assert(Object.hasOwn(manifest, url.pathname), `${url.pathname}: deployed predecessor asset is absent from retained manifest`);
    queued.set(url.pathname, url);
    assert(queued.size <= MAX_ASSETS, 'Predecessor graph exceeds reviewed count');
  }
  for (const ref of initial) queue(ref, rootUrl);
  const visited = new Set();
  for (const [path, url] of queued) {
    if (visited.has(path)) continue;
    visited.add(path);
    const descriptor = manifest[path];
    const kind = path.endsWith('.js') ? 'js' : 'css';
    const { bytes } = await fetchChecked(fetchImpl, url,
      kind === 'js' ? /(?:javascript|ecmascript)/i : /text\/css/i, descriptor.byteLength);
    assert.equal(bytes.byteLength, descriptor.byteLength, `${path}: live predecessor size differs from retained manifest`);
    assert.equal(sha256(bytes), descriptor.sha256, `${path}: live predecessor digest differs from retained manifest`);
    for (const reference of sourceReferences(bytes.toString('utf8'), kind)) queue(reference, url);
  }

  for (const [path, descriptor] of entries) {
    const object = await bucket.get(descriptor.key);
    assert(object && object.size === descriptor.byteLength &&
      object.customMetadata?.sha256 === descriptor.sha256 &&
      object.httpMetadata?.contentType === descriptor.contentType,
    `${path}: production archive is absent or has invalid metadata`);
    const bytes = Buffer.from(await object.arrayBuffer());
    assert.equal(bytes.byteLength, descriptor.byteLength, `${path}: production archive size differs`);
    assert.equal(sha256(bytes), descriptor.sha256, `${path}: production archive digest differs`);
  }
  return { predecessorRevision: revision, predecessorVersion: versionId,
    predecessorAssets: visited.size, retainedAssets: entries.length };
}

export async function main(args = process.argv.slice(2)) {
  assert(args.length === 4 && args[0] === '--revision' && args[2] === '--version',
    'Usage: node scripts/verify-predecessor-archive.mjs --revision <deployed SHA> --version <deployed UUID>');
  const revision = args[1];
  const versionId = args[3];
  assert(/^[0-9a-f]{40}$/.test(revision) && UUID.test(versionId), 'Exact predecessor revision/version required');
  const { unstable_readConfig } = await import('wrangler');
  const config = unstable_readConfig({ config: resolve(ROOT, 'wrangler.toml'), env: 'production' }, { hideWarnings: true });
  assert.equal(config.account_id, ACCOUNT);
  assert.equal(config.name, WORKER);
  assert.deepEqual(config.r2_buckets, [{ binding: 'GEOJSON_BUCKET', bucket_name: BUCKET }]);
  const { readWranglerCredentials } = await import('./release-production.mjs');
  let credentials = await readWranglerCredentials();
  const apiFetch = async url => {
    const request = () => fetch(url, { method: 'GET', redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${credentials.token}` } });
    let response = await request();
    if (response.status === 401) {
      credentials = await readWranglerCredentials();
      response = await request();
    }
    return response;
  };
  console.log(JSON.stringify(await verifyPredecessorArchive({ revision, versionId,
    bucket: productionArchiveReader(apiFetch) })));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
