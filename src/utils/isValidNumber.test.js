import { describe, it, expect } from 'vitest';
import { isValidNumber } from './utils.js';

describe('isValidNumber', () => {
  it('should return true for valid numbers and numeric strings', () => {
    expect(isValidNumber(123)).toBe(true);
    expect(isValidNumber(-123.45)).toBe(true);
    expect(isValidNumber("123")).toBe(true);
    expect(isValidNumber("0.5")).toBe(true);
    expect(isValidNumber("-12.3")).toBe(true);
    expect(isValidNumber(0)).toBe(true);
    expect(isValidNumber("0")).toBe(true);
  });

  it('should return false for non-numeric strings, null, undefined, NaN', () => {
    expect(isValidNumber("abc")).toBe(false);
    expect(isValidNumber("12a")).toBe(false);
    expect(isValidNumber(null)).toBe(false);
    expect(isValidNumber(undefined)).toBe(false);
    expect(isValidNumber(NaN)).toBe(false);
    expect(isValidNumber("")).toBe(false);
    expect(isValidNumber("  ")).toBe(false); // parseFloat("  ") is NaN
    expect(isValidNumber({})).toBe(false);
    expect(isValidNumber([])).toBe(false);
  });
});
