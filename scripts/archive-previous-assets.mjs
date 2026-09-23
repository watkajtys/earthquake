#!/usr/bin/env node
// Archive only the exact reviewed public asset graph. No HTML, arbitrary keys,
// D1/KV data or source files can be uploaded by this helper.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { getPlatformProxy, unstable_readConfig } from 'wrangler';
import { PREVIOUS_RELEASE_ASSETS } from '../src/previousReleaseAssets.js';
import { MAX_ASSETS } from './stage-previous-assets.mjs';

const [environment, directory] = process.argv.slice(2);
assert(process.argv.length === 4 && ['preview', 'production'].includes(environment) && directory,
  'Usage: node scripts/archive-previous-assets.mjs <preview|production> <verified-dist-assets-directory>');
const config = unstable_readConfig({ config: 'wrangler.toml', env: environment }, { hideWarnings: true });
const target = environment === 'production'
  ? { name: 'earthquake', bucket: 'geojson-bucket' }
  : { name: 'earthquake-reconcile-preview', bucket: 'earthquake-reconcile-preview' };
assert.equal(config.account_id, 'f7e27d63f4766d7fb6a0f5b4789e2cdb');
assert.equal(config.name, target.name);
assert.equal(config.r2_buckets.length, 1);
assert.deepEqual(config.r2_buckets[0], { binding: 'GEOJSON_BUCKET', bucket_name: target.bucket });
const files = [];
for (const [url, descriptor] of Object.entries(PREVIOUS_RELEASE_ASSETS)) {
  assert(/^\/assets\/[A-Za-z0-9_-]+\.(js|css)$/.test(url));
  assert.equal(descriptor.key, `static-assets/v1/${descriptor.sha256}`);
  const bytes = await readFile(join(resolve(directory), basename(url)));
  assert.equal(bytes.byteLength, descriptor.byteLength, `${url}: source byte length differs`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), descriptor.sha256, `${url}: source checksum differs`);
  files.push({ url, descriptor, bytes });
}
assert(files.length > 0 && files.length <= MAX_ASSETS);
const temporary = await mkdtemp(join(tmpdir(), 'earthquake-asset-archive-'));
let platform;
try {
  const configPath = join(temporary, 'wrangler.json');
  await writeFile(configPath, JSON.stringify({
    account_id: config.account_id, name: target.name, compatibility_date: config.compatibility_date,
    r2_buckets: [{ binding: 'GEOJSON_BUCKET', bucket_name: target.bucket, remote: true }],
  }));
  platform = await getPlatformProxy({ configPath, persist: false, remoteBindings: true });
  const bucket = platform.env.GEOJSON_BUCKET;
  for (const { url, descriptor, bytes } of files) {
    // An idempotent retry need not retransmit multi-megabyte archived chunks.
    // Existing objects still undergo the full metadata/checksum readback below.
    if (await bucket.head(descriptor.key) === null) {
      console.log(JSON.stringify({ archiving: url, bytes: bytes.byteLength }));
      await bucket.put(descriptor.key, bytes, {
        onlyIf: { etagDoesNotMatch: '*' }, customMetadata: { sha256: descriptor.sha256 },
        httpMetadata: { contentType: descriptor.contentType, cacheControl: 'public, max-age=31536000, immutable' },
      });
    }
    // A conditional conflict is safe only if the entire stored object matches.
    const object = await bucket.get(descriptor.key);
    assert(object && object.size === descriptor.byteLength && object.customMetadata?.sha256 === descriptor.sha256 &&
      object.httpMetadata?.contentType === descriptor.contentType, `${url}: archive metadata mismatch`);
    assert.equal(createHash('sha256').update(Buffer.from(await object.arrayBuffer())).digest('hex'), descriptor.sha256,
      `${url}: archived bytes differ`);
  }
  console.log(JSON.stringify({ environment, bucket: target.bucket, verifiedAssets: files.length,
    bytes: files.reduce((total, file) => total + file.bytes.byteLength, 0) }));
} finally {
  if (platform) await platform.dispose();
  await rm(temporary, { recursive: true, force: true });
}
