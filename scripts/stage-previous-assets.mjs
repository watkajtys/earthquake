#!/usr/bin/env node
// Prepare a reviewed union locally. This helper never uploads or deploys.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PREVIOUS_RELEASE_ASSETS } from '../src/previousReleaseAssets.js';

// Covers the verified 126-path union plus the current predecessor while keeping future additions reviewed.
export const MAX_ASSETS = 160;
const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const ASSET_NAME = /^[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.(?:js|css)$/;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const contentType = name => name.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8';

async function assetFile(directory, name) {
  assert(ASSET_NAME.test(name), 'Only flat public JS/CSS asset names are permitted');
  const entries = await readdir(directory, { withFileTypes: true });
  assert(entries.some(entry => entry.name === name && entry.isFile()), `${name}: source must be a regular file`);
  const info = await lstat(join(directory, name));
  assert(info.isFile() && info.size > 0 && info.size <= MAX_ASSET_BYTES, `${name}: source file exceeds limit`);
  const bytes = await readFile(join(directory, name));
  assert(bytes.byteLength > 0 && bytes.byteLength <= MAX_ASSET_BYTES, `${name}: asset size exceeds limit`);
  return bytes;
}

export async function stagePreviousAssets({ retainedDirectory, predecessorDirectory, outputDirectory,
  retainedAssets = PREVIOUS_RELEASE_ASSETS }) {
  const files = new Map();
  const assets = {};
  assert(Object.keys(retainedAssets).length <= MAX_ASSETS, 'Retained graph exceeds file budget');
  for (const [url, descriptor] of Object.entries(retainedAssets)) {
    assert(url === `/assets/${basename(url)}` && ASSET_NAME.test(basename(url)), 'Invalid retained asset path');
    const bytes = await assetFile(retainedDirectory, basename(url));
    const digest = sha256(bytes);
    assert.equal(descriptor.byteLength, bytes.byteLength, `${url}: retained size mismatch`);
    assert.equal(descriptor.sha256, digest, `${url}: retained digest mismatch`);
    assert.equal(descriptor.key, `static-assets/v1/${digest}`, `${url}: retained storage key mismatch`);
    assert.equal(descriptor.contentType, contentType(url), `${url}: retained MIME mismatch`);
    assets[url] = descriptor; files.set(url, bytes);
  }
  const predecessor = await readdir(predecessorDirectory, { withFileTypes: true });
  assert(predecessor.filter(entry => /\.(?:js|css)$/.test(entry.name)).length <= MAX_ASSETS, 'Predecessor graph exceeds file budget');
  let predecessorCount = 0;
  for (const entry of predecessor) {
    if (!/\.(?:js|css)$/.test(entry.name)) continue;
    assert(entry.isFile(), `${entry.name}: predecessor must be a regular file`);
    const bytes = await assetFile(predecessorDirectory, entry.name);
    const digest = sha256(bytes);
    const url = `/assets/${entry.name}`;
    const descriptor = { key: `static-assets/v1/${digest}`, sha256: digest, byteLength: bytes.byteLength, contentType: contentType(entry.name) };
    if (Object.hasOwn(assets, url)) assert.deepEqual(descriptor, assets[url], `${url}: same URL has different content`);
    else { assets[url] = descriptor; files.set(url, bytes); }
    predecessorCount++;
  }
  assert(predecessorCount > 0, 'Predecessor graph is empty');
  assert(files.size > 0 && files.size <= MAX_ASSETS, 'Asset graph exceeds reviewed file budget');
  const bytes = [...files.values()].reduce((total, body) => total + body.byteLength, 0);
  assert(bytes <= MAX_TOTAL_BYTES, 'Asset graph exceeds reviewed byte budget');
  // Fail if the destination already exists; never erase another frozen graph.
  await mkdir(outputDirectory);
  for (const [url, body] of files) await writeFile(join(outputDirectory, basename(url)), body, { flag: 'wx' });
  const sorted = Object.fromEntries(Object.entries(assets).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  const module = '// Exact retained public asset graphs; append verified predecessors without retiring older URLs.\n' +
    `export const PREVIOUS_RELEASE_ASSETS = ${JSON.stringify(sorted, null, 2)};\n`;
  await writeFile(join(outputDirectory, 'previousReleaseAssets.js'), module, { flag: 'wx' });
  const report = { retainedCount: Object.keys(retainedAssets).length, predecessorCount, unionCount: files.size,
    newPaths: files.size - Object.keys(retainedAssets).length, bytes, outputDirectory: resolve(outputDirectory) };
  await writeFile(join(outputDirectory, 'archive-manifest.json'), JSON.stringify({ ...report, assets: sorted }, null, 2), { flag: 'wx' });
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [retainedDirectory, predecessorDirectory, outputDirectory, ...extra] = process.argv.slice(2);
  assert(retainedDirectory && predecessorDirectory && outputDirectory && !extra.length,
    'Usage: node scripts/stage-previous-assets.mjs <retained-assets-directory> <predecessor-assets-directory> <new-staging-directory>');
  stagePreviousAssets({ retainedDirectory, predecessorDirectory, outputDirectory })
    .then(report => console.log(JSON.stringify(report, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
