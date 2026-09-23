import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectFaults } from './generate-fault-display.mjs';

const originalPath = resolve(process.cwd(), 'src/assets/gem_active_faults_harmonized.json');
const displayPath = resolve(process.cwd(), 'src/assets/gem_active_faults_display.json');

describe('active fault display asset', () => {
  it('preserves every fault geometry and each property shown by the map popup', async () => {
    const original = JSON.parse(await readFile(originalPath, 'utf8'));
    const display = JSON.parse(await readFile(displayPath, 'utf8'));
    expect(display).toEqual(projectFaults(original));
    expect(display.features).toHaveLength(original.features.length);
    expect(display.features.length).toBeGreaterThan(10_000);
  });
});
