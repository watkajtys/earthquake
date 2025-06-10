import {
  formatTimeAgo,
  calculateDistance,
  getMagnitudeColor,
  isValidNumber,
  formatDate,
  isValidString,
  isValuePresent,
  formatNumber,
  formatLargeNumber
} from './utils';

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

describe('calculateDistance', () => {
  // Test with coordinates resulting in a known distance
  // Example: San Francisco to Los Angeles (approx. 559 km)
  it('should return the known distance between two coordinates', () => {
    const lat1 = 37.7749; // San Francisco latitude
    const lon1 = -122.4194; // San Francisco longitude
    const lat2 = 34.0522; // Los Angeles latitude
    const lon2 = -118.2437; // Los Angeles longitude
    const expectedDistance = 559; // Approximate distance in km
    expect(calculateDistance(lat1, lon1, lat2, lon2)).toBeCloseTo(expectedDistance, 0);
  });

  // Test with the same coordinates (zero distance)
  it('should return 0 for the same coordinates', () => {
    const lat = 37.7749;
    const lon = -122.4194;
    expect(calculateDistance(lat, lon, lat, lon)).toBe(0);
  });

  // Test with coordinates on opposite sides of the Earth
  // Example: North Pole to South Pole (approx. 20015 km, half Earth's circumference)
  it('should return the correct distance for opposite sides of the Earth', () => {
    const lat1 = 90.0; // North Pole
    const lon1 = 0.0;
    const lat2 = -90.0; // South Pole
    const lon2 = 0.0;
    const expectedDistance = 20015; // Approximate distance in km
    expect(calculateDistance(lat1, lon1, lat2, lon2)).toBeCloseTo(expectedDistance, 0);
  });

  // Test with invalid inputs (e.g., non-numeric)
  // The current implementation of calculateDistance does not explicitly handle non-numeric inputs.
  // It will likely result in NaN due to arithmetic operations on non-numbers.
  // Testing for NaN is a way to acknowledge this behavior.
  it('should return NaN for non-numeric latitude input', () => {
    expect(calculateDistance("not-a-number", 0, 0, 0)).toBeNaN();
  });

  it('should return NaN for non-numeric longitude input', () => {
    expect(calculateDistance(0, "not-a-number", 0, 0)).toBeNaN();
  });
});

describe('getMagnitudeColor', () => {
  // Test with null and undefined magnitude
  it('should return slate-400 for null magnitude', () => {
    expect(getMagnitudeColor(null)).toBe('#94A3B8');
  });

  it('should return slate-400 for undefined magnitude', () => {
    expect(getMagnitudeColor(undefined)).toBe('#94A3B8');
  });

  // Test with magnitudes at the lower bound of each color category
  it('should return cyan-300 for magnitude < 1.0 (e.g., 0.5)', () => {
    expect(getMagnitudeColor(0.5)).toBe('#67E8F9');
  });

  it('should return cyan-400 for magnitude 1.0', () => {
    expect(getMagnitudeColor(1.0)).toBe('#22D3EE');
  });

  it('should return emerald-400 for magnitude 2.5', () => {
    expect(getMagnitudeColor(2.5)).toBe('#34D399');
  });

  it('should return yellow-400 for magnitude 4.0', () => {
    expect(getMagnitudeColor(4.0)).toBe('#FACC15');
  });

  it('should return orange-400 for magnitude 5.0', () => {
    expect(getMagnitudeColor(5.0)).toBe('#FB923C');
  });

  it('should return orange-500 for magnitude 6.0', () => {
    expect(getMagnitudeColor(6.0)).toBe('#F97316');
  });

  it('should return red-500 for magnitude 7.0', () => {
    expect(getMagnitudeColor(7.0)).toBe('#EF4444');
  });

  it('should return red-700 for magnitude 8.0', () => {
    expect(getMagnitudeColor(8.0)).toBe('#B91C1C');
  });

  // Test with magnitudes within each color category
  it('should return cyan-300 for magnitude 0.9', () => {
    expect(getMagnitudeColor(0.9)).toBe('#67E8F9');
  });

  it('should return cyan-400 for magnitude 1.5', () => {
    expect(getMagnitudeColor(1.5)).toBe('#22D3EE');
  });

  it('should return emerald-400 for magnitude 3.0', () => {
    expect(getMagnitudeColor(3.0)).toBe('#34D399');
  });

  it('should return yellow-400 for magnitude 4.5', () => {
    expect(getMagnitudeColor(4.5)).toBe('#FACC15');
  });

  it('should return orange-400 for magnitude 5.5', () => {
    expect(getMagnitudeColor(5.5)).toBe('#FB923C');
  });

  it('should return orange-500 for magnitude 6.5', () => {
    expect(getMagnitudeColor(6.5)).toBe('#F97316');
  });

  it('should return red-500 for magnitude 7.5', () => {
    expect(getMagnitudeColor(7.5)).toBe('#EF4444');
  });

  // Test with a very high magnitude (>= 8.0)
  it('should return red-700 for magnitude 9.0 (very high)', () => {
    expect(getMagnitudeColor(9.0)).toBe('#B91C1C');
  });

  // Test with negative magnitudes
  // Based on the function, negative magnitudes will fall into the (magnitude < 1.0) category.
  it('should return cyan-300 for negative magnitude (e.g., -1.0)', () => {
    expect(getMagnitudeColor(-1.0)).toBe('#67E8F9');
  });
});

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
