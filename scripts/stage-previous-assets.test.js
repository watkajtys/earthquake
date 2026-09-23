// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stagePreviousAssets } from './stage-previous-assets.mjs';

const directories = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'previous-assets-test-')); directories.push(root);
  const retainedDirectory = join(root, 'retained'); const predecessorDirectory = join(root, 'predecessor');
  await mkdir(retainedDirectory); await mkdir(predecessorDirectory);
  const bytes = 'export default "old";';
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const descriptor = { key: `static-assets/v1/${sha256}`, sha256, byteLength: Buffer.byteLength(bytes), contentType: 'application/javascript; charset=utf-8' };
  await writeFile(join(retainedDirectory, 'old-12345678.js'), bytes);
  await writeFile(join(predecessorDirectory, 'new-abcdefgh.css'), 'body{color:red}');
  return { retainedDirectory, predecessorDirectory, outputDirectory: join(root, 'union'),
    retainedAssets: { '/assets/old-12345678.js': descriptor } };
}

async function addPredecessorFiles(directory, count) {
  await Promise.all(Array.from({ length: count }, (_, index) =>
    writeFile(join(directory, `extra-${String(index).padStart(8, '0')}.js`), `export default ${index};`)));
}

describe('bounded retained asset union staging', () => {
  it('preserves all old descriptors and copies verified new files into a standalone union', async () => {
    const options = await setup();
    const result = await stagePreviousAssets(options);
    expect(result).toMatchObject({ retainedCount: 1, predecessorCount: 1, unionCount: 2, newPaths: 1 });
    const manifest = JSON.parse(await readFile(join(options.outputDirectory, 'archive-manifest.json'), 'utf8'));
    expect(manifest.assets['/assets/old-12345678.js']).toEqual(options.retainedAssets['/assets/old-12345678.js']);
    expect(await readFile(join(options.outputDirectory, 'old-12345678.js'), 'utf8')).toBe('export default "old";');
    expect(await readFile(join(options.outputDirectory, 'previousReleaseAssets.js'), 'utf8')).toContain('/assets/new-abcdefgh.css');
  });

  it('deduplicates matching shared URLs without replacing the old entry', async () => {
    const options = await setup();
    await writeFile(join(options.predecessorDirectory, 'old-12345678.js'), 'export default "old";');
    expect(await stagePreviousAssets(options)).toMatchObject({ predecessorCount: 2, unionCount: 2 });
  });

  it('accepts the reviewed 190-path graph and still rejects a graph beyond 200 paths', async () => {
    const accepted = await setup();
    await addPredecessorFiles(accepted.predecessorDirectory, 188);
    expect(await stagePreviousAssets(accepted)).toMatchObject({ unionCount: 190, newPaths: 189 });

    const rejected = await setup();
    await addPredecessorFiles(rejected.predecessorDirectory, 199);
    await expect(stagePreviousAssets(rejected)).rejects.toThrow('Asset graph exceeds reviewed file budget');
    await expect(access(rejected.outputDirectory)).rejects.toThrow();
  });

  it.each(['different-content', 'retained-digest', 'symlink', 'invalid-name'])('rejects %s before staging any output', async kind => {
    const options = await setup();
    if (kind === 'different-content') await writeFile(join(options.predecessorDirectory, 'old-12345678.js'), 'export default "changed";');
    if (kind === 'retained-digest') options.retainedAssets['/assets/old-12345678.js'].sha256 = '0'.repeat(64);
    if (kind === 'symlink') await symlink(join(options.retainedDirectory, 'old-12345678.js'), join(options.predecessorDirectory, 'link-abcdefgh.js'));
    if (kind === 'invalid-name') await writeFile(join(options.predecessorDirectory, 'unhashed.js'), 'x');
    await expect(stagePreviousAssets(options)).rejects.toThrow();
    await expect(access(options.outputDirectory)).rejects.toThrow();
  });

  it('does not overwrite an existing staging directory', async () => {
    const options = await setup();
    await mkdir(options.outputDirectory); await writeFile(join(options.outputDirectory, 'sentinel'), 'preserve');
    await expect(stagePreviousAssets(options)).rejects.toThrow();
    expect(await readFile(join(options.outputDirectory, 'sentinel'), 'utf8')).toBe('preserve');
  });
});
