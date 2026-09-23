// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { productionArchiveReader, verifyPredecessorArchive } from './verify-predecessor-archive.mjs';

const ORIGIN = 'https://earthquakeslive.com';
const revision = 'b'.repeat(40);
const versionId = '11111111-1111-1111-1111-111111111111';
const entry = '/assets/index-12345678.js';
const css = '/assets/index-abcdefgh.css';
const lazy = '/assets/Lazy-87654321.js';
const contents = {
  [entry]: 'const deps=["assets/Lazy-87654321.js"];export const open=()=>import("./Lazy-87654321.js");',
  [css]: 'body{color:black}',
  [lazy]: 'export const detail=true;',
};

function descriptor(path, content) {
  const bytes = Buffer.from(content);
  const digest = createHash('sha256').update(bytes).digest('hex');
  return { key: `static-assets/v1/${digest}`, sha256: digest, byteLength: bytes.length,
    contentType: path.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/css; charset=utf-8' };
}
const manifestFor = source => Object.fromEntries(Object.entries(source).map(([path, body]) => [path, descriptor(path, body)]));

function fixture({ source = contents, manifest = manifestFor(contents),
  archived = contents, identity = { status: 'ok', environment: 'production', revision, versionId },
  rootHtml = `<div id="root"></div><script src="${entry}"></script><link rel="stylesheet" href="${css}">` } = {}) {
  const fetchImpl = vi.fn(async (input, options) => {
    const url = new URL(input);
    expect(url.origin).toBe(ORIGIN);
    expect(options).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store' });
    if (url.pathname === '/api/release-identity') return Response.json(identity,
      { headers: { 'Cache-Control': 'no-store' } });
    if (url.pathname === '/') return new Response(rootHtml,
      { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' } });
    const body = source[url.pathname];
    return body === undefined ? new Response('missing', { status: 404 }) : new Response(body,
      { headers: { 'Content-Type': url.pathname.endsWith('.js') ? 'application/javascript' : 'text/css' } });
  });
  const bucket = { get: vi.fn(async key => {
    const [path, body] = Object.entries(archived).find(([asset]) => manifest[asset]?.key === key) || [];
    if (body === undefined) return null;
    const bytes = Buffer.from(body);
    return { size: bytes.length, customMetadata: { sha256: manifest[path].sha256 },
      httpMetadata: { contentType: manifest[path].contentType },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  }) };
  return { fetchImpl, bucket, manifest };
}

async function verify(f) {
  return verifyPredecessorArchive({ revision, versionId, ...f });
}

describe('read-only predecessor archive gate', () => {
  it('checks the deployed lazy graph and every retained R2 object by exact bytes', async () => {
    const f = fixture();
    await expect(verify(f)).resolves.toMatchObject({ predecessorAssets: 3, retainedAssets: 3 });
    expect(f.fetchImpl.mock.calls.map(([url]) => new URL(url).pathname))
      .toEqual(['/api/release-identity', '/', entry, css, lazy]);
    expect(f.bucket.get).toHaveBeenCalledTimes(3);
    expect(f.bucket.put).toBeUndefined();
  });

  it('reads the complete reviewed 252-object retained graph before permitting a release', async () => {
    const paths = Array.from({ length: 251 }, (_, index) => `/assets/graph-${String(index).padStart(8, '0')}.js`);
    const stylesheet = '/assets/index-abcdefgh.css';
    const source = Object.fromEntries(paths.map((path, index) => [path,
      index < 25 ? `import './graph-${String(index + 1).padStart(8, '0')}.js';` : `export default ${index};`]));
    source[stylesheet] = 'body{color:black}';
    const rootHtml = `<script src="${paths[0]}"></script><link rel="stylesheet" href="${stylesheet}">`;
    const f = fixture({ source, manifest: manifestFor(source), archived: source, rootHtml });

    await expect(verify(f)).resolves.toMatchObject({ predecessorAssets: 27, retainedAssets: 252 });
    expect(f.bucket.get).toHaveBeenCalledTimes(252);
    expect(f.bucket.put).toBeUndefined();
    expect(f.fetchImpl.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);

    const missing = { ...source };
    delete missing[paths[250]];
    const incomplete = fixture({ source, manifest: manifestFor(source), archived: missing, rootHtml });
    await expect(verify(incomplete)).rejects.toThrow('production archive is absent');
    expect(incomplete.bucket.get).toHaveBeenCalledTimes(251);
    expect(incomplete.bucket.put).toBeUndefined();
  });

  it('refuses a deployed lazy chunk omitted from the reviewed manifest', async () => {
    const f = fixture();
    delete f.manifest[lazy];
    await expect(verify(f)).rejects.toThrow('absent from retained manifest');
    expect(f.bucket.get).not.toHaveBeenCalled();
  });

  it('refuses a nonliteral import instead of assuming the graph is complete', async () => {
    const source = { ...contents,
      [entry]: 'const path="./Lazy-87654321.js";export const open=()=>import(path);' };
    const f = fixture({ source, manifest: manifestFor(source), archived: source });
    await expect(verify(f)).rejects.toThrow('nonliteral dynamic import');
    expect(f.bucket.get).not.toHaveBeenCalled();
  });

  it('recognizes the inert React Router route-module fallback in the deployed bundle', async () => {
    const source = { ...contents, [entry]: `${contents[entry]}async function load(i){try{return await import(i.module)}catch(e){console.error('Error loading route module');window.__reactRouterContext}}` };
    const f = fixture({ source, manifest: manifestFor(source), archived: source });
    await expect(verify(f)).resolves.toMatchObject({ predecessorAssets: 3 });
  });

  it('refuses an external import without fetching that origin', async () => {
    const source = { ...contents, [entry]: 'import("https://other.invalid/External-12345678.js")' };
    const f = fixture({ source, manifest: manifestFor(source), archived: source });
    await expect(verify(f)).rejects.toThrow('external asset reference');
    expect(f.fetchImpl.mock.calls.every(([url]) => new URL(url).origin === ORIGIN)).toBe(true);
  });

  it('refuses an unrecognized HTML script path before reading the archive', async () => {
    const f = fixture({ rootHtml: `<script src="/assets/new-entry.mjs"></script><script src="${entry}"></script><link rel="stylesheet" href="${css}">` });
    await expect(verify(f)).rejects.toThrow('Unrecognized frontend asset reference');
    expect(f.bucket.get).not.toHaveBeenCalled();
  });

  it('refuses a CSS import outside the reviewed asset graph', async () => {
    const source = { ...contents, [css]: '@import url("https://other.invalid/new.css");body{color:black}' };
    const f = fixture({ source, manifest: manifestFor(source), archived: source });
    await expect(verify(f)).rejects.toThrow('external asset reference');
    expect(f.bucket.get).not.toHaveBeenCalled();
  });

  it('refuses an unarchived CSS resource outside the JS/CSS manifest', async () => {
    const source = { ...contents, [css]: 'body{background:url("/assets/map-12345678.png")}' };
    const f = fixture({ source, manifest: manifestFor(source), archived: source });
    await expect(verify(f)).rejects.toThrow('Unrecognized CSS resource reference');
    expect(f.bucket.get).not.toHaveBeenCalled();
  });

  it('refuses a live predecessor with a changed digest', async () => {
    const f = fixture({ source: { ...contents, [lazy]: 'export const detail=evil;' } });
    await expect(verify(f)).rejects.toThrow('live predecessor digest differs');
    expect(f.bucket.get).not.toHaveBeenCalled();
  });

  it('refuses missing or corrupted production R2 archive objects', async () => {
    const missing = fixture({ archived: { [entry]: contents[entry], [css]: contents[css] } });
    await expect(verify(missing)).rejects.toThrow('production archive is absent');

    const corrupt = fixture({ archived: { ...contents, [lazy]: 'export const detail=evil;' } });
    await expect(verify(corrupt)).rejects.toThrow(/production archive (?:size|digest) differs/);
  });

  it('requires the exact uncached predecessor identity', async () => {
    const f = fixture({ identity: { status: 'ok', environment: 'production', revision: 'c'.repeat(40), versionId } });
    await expect(verify(f)).rejects.toThrow('identity changed');
    expect(f.bucket.get).not.toHaveBeenCalled();
  });

  it('rejects an inline static module import missing from the reviewed graph', async () => {
    const f = fixture({ rootHtml: `<script src="${entry}"></script><link rel="stylesheet" href="${css}"><script type="module">import "/assets/Other-12345678.js";</script>` });
    await expect(verify(f)).rejects.toThrow('Unrecognized inline import');
    expect(f.bucket.get).not.toHaveBeenCalled();
  });
});

describe('authenticated production archive reader', () => {
  function apiFixture({ changedMetadata = false, loopCursor = false, splitPages = false } = {}) {
    const manifest = manifestFor(contents);
    const records = Object.entries(contents).map(([path]) => ({ key: manifest[path].key,
      size: manifest[path].byteLength,
      custom_metadata: { sha256: path === lazy && changedMetadata ? '0'.repeat(64) : manifest[path].sha256 },
      http_metadata: { contentType: manifest[path].contentType } }));
    const apiFetch = vi.fn(async input => {
      const url = new URL(input);
      expect(url.origin).toBe('https://api.cloudflare.com');
      expect(url.pathname).toMatch(/^\/client\/v4\/accounts\/f7e27d63f4766d7fb6a0f5b4789e2cdb\/r2\/buckets\/geojson-bucket\/objects(?:\/static-assets\/v1\/[a-f0-9]{64})?$/);
      if (!url.pathname.includes('/objects/')) {
        expect(url.searchParams.get('prefix')).toBe('static-assets/v1/');
        expect(url.searchParams.get('per_page')).toBe('1000');
        const next = url.searchParams.has('cursor');
        return Response.json({ success: true,
          result: loopCursor ? (next ? [] : records) : splitPages ? (next ? records.slice(1) : records.slice(0, 1)) : records,
          result_info: { is_truncated: loopCursor || (splitPages && !next),
            ...((loopCursor || (splitPages && !next)) ? { cursor: 'same' } : {}) } });
      }
      const record = Object.entries(contents).find(([path]) => manifest[path].key === url.pathname.split('/objects/')[1]);
      return record ? new Response(record[1]) : new Response('missing', { status: 404 });
    });
    return { apiFetch, manifest };
  }

  it('checks listed R2 metadata and exact object bytes through direct API GETs', async () => {
    const { apiFetch, manifest } = apiFixture();
    const f = fixture({ manifest });
    await expect(verify({ ...f, bucket: productionArchiveReader(apiFetch) })).resolves.toMatchObject({ retainedAssets: 3 });
    expect(apiFetch.mock.calls).toHaveLength(4);
    expect(apiFetch.mock.calls[0][0].searchParams.get('prefix')).toBe('static-assets/v1/');
  });

  it('rejects archive metadata drift and repeated pagination cursors', async () => {
    const changed = apiFixture({ changedMetadata: true });
    await expect(verify({ ...fixture({ manifest: changed.manifest }), bucket: productionArchiveReader(changed.apiFetch) }))
      .rejects.toThrow('invalid metadata');
    const looped = apiFixture({ loopCursor: true });
    await expect(verify({ ...fixture({ manifest: looped.manifest }), bucket: productionArchiveReader(looped.apiFetch) }))
      .rejects.toThrow('pagination is invalid');
  });

  it('follows a bounded R2 metadata cursor before checking later object keys', async () => {
    const { apiFetch, manifest } = apiFixture({ splitPages: true });
    await expect(verify({ ...fixture({ manifest }), bucket: productionArchiveReader(apiFetch) }))
      .resolves.toMatchObject({ retainedAssets: 3 });
    expect(apiFetch.mock.calls[1][0].searchParams.get('cursor')).toBe('same');
  });
});
