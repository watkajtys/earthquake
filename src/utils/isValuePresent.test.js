import { describe, it, expect } from 'vitest';
import { isValuePresent } from './utils.js';

describe('isValuePresent', () => {
  it('should return true for values that are not null or undefined', () => {
    expect(isValuePresent(0)).toBe(true);
    expect(isValuePresent("")).toBe(true); // Empty string is present
    expect(isValuePresent(false)).toBe(true);
    expect(isValuePresent({})).toBe(true);
    expect(isValuePresent([])).toBe(true);
    expect(isValuePresent("hello")).toBe(true);
    expect(isValuePresent(NaN)).toBe(true); // NaN is considered present
  });

  it('should return false for null', () => {
    expect(isValuePresent(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isValuePresent(undefined)).toBe(false);
  });
});
