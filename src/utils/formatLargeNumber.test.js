import { describe, it, expect } from 'vitest';
import { formatLargeNumber } from './utils.js';

describe('formatLargeNumber', () => {
  it('should return "N/A" for invalid number inputs', () => {
    expect(formatLargeNumber("abc")).toBe("N/A");
    expect(formatLargeNumber(null)).toBe("N/A"); // isValidNumber(null) is false
    expect(formatLargeNumber(undefined)).toBe("N/A");
  });

  it('should return "0" for 0', () => {
    expect(formatLargeNumber(0)).toBe("0");
  });

  it('should format numbers less than 1000 without suffix', () => {
    expect(formatLargeNumber(123)).toBe("123");
    expect(formatLargeNumber(999.99)).toBe("999.99");
    expect(formatLargeNumber(-123.45)).toBe("-123.45");
  });

  it('should format thousands with "thousand" suffix', () => {
    expect(formatLargeNumber(1234)).toBe("1.23 thousand");
    expect(formatLargeNumber(123456)).toBe("123.46 thousand");
    expect(formatLargeNumber(999999)).toBe("1,000 thousand"); // toLocaleString behavior for 999.999
  });

  it('should format millions with "million" suffix', () => {
    expect(formatLargeNumber(1234567)).toBe("1.23 million");
    expect(formatLargeNumber(987654321)).toBe("987.65 million");
  });

  it('should format billions with "billion" suffix', () => {
    expect(formatLargeNumber(1.23e9)).toBe("1.23 billion");
  });

  it('should format trillions with "trillion" suffix', () => {
    expect(formatLargeNumber(1.23e12)).toBe("1.23 trillion");
  });

  it('should format quadrillions with "quadrillion" suffix', () => {
    expect(formatLargeNumber(1.23e15)).toBe("1.23 quadrillion");
  });

  it('should format quintillions with "quintillion" suffix', () => {
    expect(formatLargeNumber(1.23e18)).toBe("1.23 quintillion");
  });

  it('should use exponential notation for numbers >= 1e21', () => {
    expect(formatLargeNumber(1.23e21)).toBe("1.23 x 10^21");
    expect(formatLargeNumber(1e24)).toBe("1.00 x 10^24");
  });

  it('should handle negative large numbers correctly', () => {
    expect(formatLargeNumber(-1234567)).toBe("-1.23 million");
    expect(formatLargeNumber(-1.23e21)).toBe("-1.23 x 10^21");
  });
});
