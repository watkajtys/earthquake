import { describe, it, expect } from 'vitest';
import { isValidString } from './utils.js';

describe('isValidString', () => {
  it('should return true for non-empty strings', () => {
    expect(isValidString("hello")).toBe(true);
    expect(isValidString("  hello  ")).toBe(true); // Should still be true after trim
    expect(isValidString("0")).toBe(true);
    expect(isValidString("null")).toBe(true);
  });

  it('should return false for empty or whitespace-only strings', () => {
    expect(isValidString("")).toBe(false);
    expect(isValidString("   ")).toBe(false);
  });

  it('should return false for non-string types', () => {
    expect(isValidString(123)).toBe(false);
    expect(isValidString(null)).toBe(false);
    expect(isValidString(undefined)).toBe(false);
    expect(isValidString({})).toBe(false);
    expect(isValidString([])).toBe(false);
  });
});
