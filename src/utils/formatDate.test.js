import { describe, it, expect } from 'vitest';
import { formatDate } from './utils.js';

describe('formatDate', () => {
  it('should format a valid timestamp correctly', () => {
    // Example: Tue, Apr 9, 2024, 10:15:30 AM GMT+0000 (Coordinated Universal Time)
    // The exact string depends on the test runner's locale & timezone unless specified.
    // Let's use a fixed date for predictability if possible, or regex.
    // For now, check it's a non-empty string and contains year.
    const timestamp = 1678886400000; // March 15, 2023, 12:00:00 PM UTC
    const formatted = formatDate(timestamp);
    expect(formatted).toEqual(expect.any(String));
    expect(formatted).not.toBe('N/A');
    // A more specific check might be too brittle due to locale.
    // Example: "Wednesday, March 15, 2023 at 12:00:00 PM Coordinated Universal Time"
    // For consistency, we can mock toLocaleString or check parts.
    // For this test, we'll check for a known part of a UTC formatted date.
    // new Date(timestamp).toLocaleString([], { dateStyle: 'full', timeStyle: 'long' })
    // For a consistent test, let's assume a specific locale is used by the environment or mock it.
    // Since we can't easily mock toLocaleString's internal behavior here,
    // we'll rely on a snapshot or a very general check.
    // A simple check could be that it contains the year.
    expect(formatted).toContain("2023");
    expect(formatted).toContain("March");
  });

  it('should return "N/A" for null timestamp', () => {
    expect(formatDate(null)).toBe('N/A');
  });

  it('should return "N/A" for undefined timestamp', () => {
    expect(formatDate(undefined)).toBe('N/A');
  });

  it('should return "N/A" for invalid timestamp (e.g. string)', () => {
    // new Date("invalid-date").toLocaleString() might return "Invalid Date" or throw.
    // The function's current implementation doesn't explicitly check for invalid date objects after new Date().
    // It relies on new Date(timestamp) behavior. If timestamp is a string that can't be parsed,
    // new Date() will produce an "Invalid Date" object. toLocaleString() on that is "Invalid Date".
    // However, the guard `if (!timestamp)` handles empty strings correctly.
    // Let's test with a non-parseable string.
    const result = formatDate("not-a-date-string");
    // Depending on JS engine, new Date("not-a-date-string").toLocaleString() could be "Invalid Date"
    // The current implementation returns "N/A" due to the initial `if (!timestamp)` check for falsy values.
    // If "not-a-date-string" is passed, it's truthy, so it proceeds.
    // `new Date("not-a-date-string").toLocaleString()` is "Invalid Date" in Node.
    // However, our function's `isNaN(date.getTime())` check should catch this and return "N/A".
    expect(result).toBe("N/A");
  });
});
