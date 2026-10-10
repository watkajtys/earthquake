import { afterEach, describe, it, expect, vi } from 'vitest';
import { formatDate } from './utils.js';

afterEach(() => vi.restoreAllMocks());

describe('formatDate', () => {
  it('formats the timestamp using the browser locale with full date and long time', () => {
    const timestamp = Date.UTC(2023, 2, 15, 12);
    const nativeFormat = Date.prototype.toLocaleString;
    const format = vi.spyOn(Date.prototype, 'toLocaleString').mockImplementation(function (locales, options) {
      // Keep native formatting; pin only the host-dependent locale and timezone.
      expect(locales).toEqual([]);
      expect(options).toEqual({ dateStyle: 'full', timeStyle: 'long' });
      expect(this.getTime()).toBe(timestamp);
      return nativeFormat.call(this, 'en-US', { ...options, timeZone: 'UTC' });
    });
    expect(formatDate(timestamp)).toBe('Wednesday, March 15, 2023 at 12:00:00 PM UTC');
    expect(format).toHaveBeenCalledOnce();
  });

  it('returns N/A for null', () => expect(formatDate(null)).toBe('N/A'));
  it('returns N/A for undefined', () => expect(formatDate(undefined)).toBe('N/A'));
  it('returns N/A for a nonnumeric string', () => expect(formatDate('not-a-date-string')).toBe('N/A'));
});
