import { readFile } from './fileUtils';
import { describe, it, expect } from 'vitest';

describe('readFile', () => {
  it('should read the content of the README.md file', () => {
    const content = readFile('README.md');
    expect(content).toBeTruthy();
    expect(content.length).toBeGreaterThan(0);
  });
});
