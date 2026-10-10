#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// One full execution shared by CI and the production release gate.
export function verifyTests({ nodeVersion = process.versions.node, env = process.env,
  run = spawnSync, root = resolve(fileURLToPath(new URL('..', import.meta.url))), log = console.log } = {}) {
  const [major, minor] = nodeVersion.split('.').map(Number);
  if (!Number.isInteger(major) || !Number.isInteger(minor) || major < 22 || (major === 22 && minor < 13)) {
    throw new Error('Test verification requires Node 22.13.0 or later.');
  }
  const seed = env.TEST_SHUFFLE_SEED ?? '20261011';
  if (!/^(0|[1-9]\d{0,9})$/.test(seed) || Number(seed) > 0xffffffff) throw new Error('TEST_SHUFFLE_SEED must be a uint32 integer.');
  const options = { cwd: root, env: { ...env, CI: 'true' }, stdio: 'inherit' };
  const invoke = (command, args, overrides = {}) => {
    const result = run(command, args, { ...options, ...overrides });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Verification command failed: ${command} (${result.status ?? result.signal})`);
    return result;
  };
  const inventory = invoke('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
  const files = [...new Set(inventory.stdout.split('\0').filter(path => /\.test\.[jt]sx?$/.test(path) && existsSync(resolve(root, path))))].sort();
  if (!files.length) throw new Error('No test files found to lint.');
  log(`Test verification: Node ${nodeVersion}, shuffle seed=${seed}, linting ${files.length} test files.`);
  invoke(process.execPath, ['node_modules/eslint/bin/eslint.js', ...files]);
  invoke(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--sequence.shuffle', `--sequence.seed=${seed}`]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { verifyTests(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
