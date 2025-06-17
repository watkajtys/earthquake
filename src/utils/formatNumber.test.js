import { describe, it, expect } from 'vitest';
import { formatNumber } from './utils.js';

describe('formatNumber', () => {
  it('should format numbers to specified precision', () => {
    expect(formatNumber(123.456, 2)).toBe("123.46");
    expect(formatNumber(123.456, 1)).toBe("123.5");
    expect(formatNumber(123, 2)).toBe("123.00");
    expect(formatNumber("123.456", 2)).toBe("123.46");
  });

  it('should default to 1 decimal place if precision is not specified', () => {
    expect(formatNumber(123.456)).toBe("123.5");
  });

  it('should return "N/A" for NaN or non-parseable inputs', () => {
    expect(formatNumber(NaN)).toBe("N/A");
    expect(formatNumber("abc")).toBe("N/A");
    expect(formatNumber(undefined)).toBe("N/A");
    expect(formatNumber(null)).toBe("N/A");
  });

  it('should handle null by returning "N/A" as it is not a parseable number', () => {
    expect(formatNumber(null)).toBe("N/A");
  });
});
