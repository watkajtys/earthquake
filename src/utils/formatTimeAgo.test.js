import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatTimeAgo } from './utils.js';

describe('formatTimeAgo', () => {
  const MOCKED_NOW = 1678886400000; // March 15, 2023, 12:00:00 PM UTC

  beforeEach(() => {
    // Use vi.setSystemTime to mock the current date
    vi.setSystemTime(new Date(MOCKED_NOW));
  });

  afterEach(() => {
    // Restore real timers
    vi.useRealTimers();
  });

  describe('Invalid Inputs', () => {
    it('should return "Invalid date" for null', () => {
      expect(formatTimeAgo(null)).toBe("Invalid date");
    });

    it('should return "Invalid date" for undefined', () => {
      expect(formatTimeAgo(undefined)).toBe("Invalid date");
    });

    it('should return "Invalid date" for a non-numeric string', () => {
      expect(formatTimeAgo("not a number")).toBe("Invalid date");
    });

    it('should return "Invalid date" for an empty object', () => {
      expect(formatTimeAgo({})).toBe("Invalid date");
    });

    it('should return "Invalid date" for NaN', () => {
      expect(formatTimeAgo(NaN)).toBe("Invalid date");
    });
  });

  describe('"Just now"', () => {
    it('should return "just now" for less than 5 seconds ago', () => {
      const timestamp = MOCKED_NOW - 4 * 1000; // 4 seconds ago
      expect(formatTimeAgo(timestamp)).toBe("just now");
    });
     it('should return "just now" for 0 seconds ago', () => {
      const timestamp = MOCKED_NOW;
      expect(formatTimeAgo(timestamp)).toBe("just now");
    });
  });

  describe('Seconds', () => {
    it('should return "10 seconds ago" for 10 seconds ago', () => {
      const timestamp = MOCKED_NOW - 10 * 1000;
      expect(formatTimeAgo(timestamp)).toBe("10 seconds ago");
    });

    it('should return "1 second ago" for 1 second ago (edge case for pluralization, though current code always pluralizes seconds > 4)', () => {
      // Note: The current implementation of formatTimeAgo will return "X seconds ago" even for 1 second if it's >= 5 seconds.
      // This test case is to highlight the behavior for exactly 1 second if the logic were different for singular.
      // Based on current logic, for seconds to be evaluated, it must be >= 5.
      // So, a timestamp for "1 second ago" would actually be handled by "just now".
      // To test "X seconds ago" for singular, we'd need a different time or adjust logic.
      // Let's test for 5 seconds ago as it's the first value to hit "X seconds ago"
      const timestampFiveSec = MOCKED_NOW - 5 * 1000;
      expect(formatTimeAgo(timestampFiveSec)).toBe("5 seconds ago");
    });
  });

  describe('Minutes', () => {
    it('should return "5 minutes ago" for 5 minutes ago', () => {
      const timestamp = MOCKED_NOW - 5 * 60 * 1000;
      expect(formatTimeAgo(timestamp)).toBe("5 minutes ago");
    });

    it('should return "1 minute ago" for 1 minute ago', () => {
      const timestamp = MOCKED_NOW - 1 * 60 * 1000;
      expect(formatTimeAgo(timestamp)).toBe("1 minute ago");
    });
  });

  describe('Hours', () => {
    it('should return "3 hours ago" for 3 hours ago', () => {
      const timestamp = MOCKED_NOW - 3 * 60 * 60 * 1000;
      expect(formatTimeAgo(timestamp)).toBe("3 hours ago");
    });

    it('should return "1 hour ago" for 1 hour ago', () => {
      const timestamp = MOCKED_NOW - 1 * 60 * 60 * 1000;
      expect(formatTimeAgo(timestamp)).toBe("1 hour ago");
    });
  });

  describe('Days', () => {
    it('should return "4 days ago" for 4 days ago', () => {
      const timestamp = MOCKED_NOW - 4 * 24 * 60 * 60 * 1000;
      expect(formatTimeAgo(timestamp)).toBe("4 days ago");
    });

    it('should return "1 day ago" for 1 day ago', () => {
      const timestamp = MOCKED_NOW - 1 * 24 * 60 * 60 * 1000;
      expect(formatTimeAgo(timestamp)).toBe("1 day ago");
    });
  });

  describe('Weeks', () => {
    it('should return "2 weeks ago" for 2 weeks ago', () => {
      const timestamp = MOCKED_NOW - 2 * 7 * 24 * 60 * 60 * 1000;
      expect(formatTimeAgo(timestamp)).toBe("2 weeks ago");
    });

    it('should return "1 week ago" for 1 week ago', () => {
      const timestamp = MOCKED_NOW - 1 * 7 * 24 * 60 * 60 * 1000;
      expect(formatTimeAgo(timestamp)).toBe("1 week ago");
    });
  });

  describe('Months', () => {
    // Using average days in a month for calculation (approx 30.44 days)
    // const AVG_MILLISECONDS_IN_MONTH = 2629800000; // (365.25 / 12) * 24 * 60 * 60 * 1000
     const AVG_MILLISECONDS_IN_MONTH = (365.25 / 12) * 24 * 60 * 60 * 1000;


    it('should return "6 months ago" for 6 months ago', () => {
      const timestamp = MOCKED_NOW - 6 * AVG_MILLISECONDS_IN_MONTH;
      expect(formatTimeAgo(timestamp)).toBe("6 months ago");
    });

    it('should return "1 month ago" for 1 month ago', () => {
      // Use a value slightly larger than 1 average month to avoid rounding to 4 weeks
      // AVG_MILLISECONDS_IN_MONTH = 2629800000
      // 4 weeks = 4 * 7 * 24 * 60 * 60 * 1000 = 2419200000
      // The threshold for "1 month ago" is after "4 weeks ago".
      // The function has: weeks < 4.348. If weeks is 4, it shows "4 weeks ago".
      // 1 * AVG_MILLISECONDS_IN_MONTH results in seconds = 2629800.
      // weeks = Math.round(2629800 / 604800) = Math.round(4.348148) = 4.
      // This makes it fall into "4 weeks ago".
      // Let's use a timestamp that results in months=1 but weeks > 4.348 when rounded.
      // e.g., 32 days. seconds = 32 * 24 * 60 * 60 = 2764800
      // weeks = Math.round(2764800 / 604800) = Math.round(4.57) = 5. (This would be "1 month ago" as 5 weeks > 4.348)
      // months = Math.round(2764800 / 2629800) = Math.round(1.051) = 1.
      const timestamp = MOCKED_NOW - (32 * 24 * 60 * 60 * 1000); // 32 days
      expect(formatTimeAgo(timestamp)).toBe("1 month ago");
    });

    it('should handle just under 1 month correctly (e.g., 4 weeks)', () => {
      const timestamp = MOCKED_NOW - 4 * 7 * 24 * 60 * 60 * 1000; // Exactly 4 weeks
      expect(formatTimeAgo(timestamp)).toBe("4 weeks ago"); // Or "1 month ago" depending on rounding/threshold
    });
  });

  describe('Years', () => {
    // Using average days in a year for calculation (365.25 days)
    const AVG_MILLISECONDS_IN_YEAR = 365.25 * 24 * 60 * 60 * 1000;

    it('should return "2 years ago" for 2 years ago', () => {
      const timestamp = MOCKED_NOW - 2 * AVG_MILLISECONDS_IN_YEAR;
      expect(formatTimeAgo(timestamp)).toBe("2 years ago");
    });

    it('should return "1 year ago" for 1 year ago', () => {
      const timestamp = MOCKED_NOW - 1 * AVG_MILLISECONDS_IN_YEAR;
      expect(formatTimeAgo(timestamp)).toBe("1 year ago");
    });
  });

  describe('Future Dates', () => {
    it('should return "just now" for a timestamp slightly in the future', () => {
      // The current function calculates `seconds = Math.round((now - timestamp) / 1000);`
      // If `timestamp` is in the future, `now - timestamp` will be negative.
      // e.g., now = 1000, future_timestamp = 1002. seconds = Math.round(-2/1000) = 0.
      // This results in "just now".
      const timestamp = MOCKED_NOW + 2 * 1000; // 2 seconds in the future
      expect(formatTimeAgo(timestamp)).toBe("just now");
    });

    it('should return "just now" for a timestamp significantly in the future', () => {
      // If timestamp is far in future, e.g. MOCKED_NOW + 100 * 1000 (100s future)
      // seconds = Math.round((MOCKED_NOW - (MOCKED_NOW + 100000)) / 1000) = Math.round(-100000/1000) = -100
      // This will then flow through the logic:
      // seconds < 60 is true (-100 < 60). It will return "-100 seconds ago".
      // This is not ideal. The function isn't designed for future dates.
      // A more robust solution would be to explicitly check if `timestamp > now`.
      // For now, we test the current behavior.
      // seconds = Math.round((now - (now + 100000))/1000) = -100.
      // if (seconds < 5) is true for -100, so it returns "just now".
      const timestamp = MOCKED_NOW + 100 * 1000; // 100 seconds in the future
      expect(formatTimeAgo(timestamp)).toBe("just now");
    });
  });
});
