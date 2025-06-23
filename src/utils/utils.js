// src/utils.js

/**
 * @file utils.js
 * @description A collection of general-purpose utility functions used throughout the application,
 * including calculations, formatting, validation, and color utilities.
 */

// Any algorithmic changes should be synchronized.
/**
 * Returns a hex color code based on earthquake magnitude.
 * @param {number | null | undefined} magnitude - The earthquake magnitude.
 * @returns {string} A hex color code string.
 */
export const getMagnitudeColor = (magnitude) => {
    if (magnitude === null || magnitude === undefined) return '#94A3B8'; // slate-400
    if (magnitude < 1.0) return '#67E8F9'; // cyan-300
    if (magnitude < 2.5) return '#22D3EE'; // cyan-400
    if (magnitude < 4.0) return '#34D399'; // emerald-400
    if (magnitude < 5.0) return '#FACC15'; // yellow-400
    if (magnitude < 6.0) return '#FB923C'; // orange-400
    if (magnitude < 7.0) return '#F87171'; // red-400 (Magnitude 6.x)
    return '#1E293B'; // slate-800 (Magnitude 7.0+)
};

/**
 * Returns Tailwind CSS class strings for background and text color based on earthquake magnitude.
 * @param {number | null | undefined} magnitude - The earthquake magnitude.
 * @returns {string} Tailwind CSS class strings.
 */
export const getMagnitudeColorStyle = (magnitude) => {
    // Background colors align with getMagnitudeColor, text colors adjusted for contrast.
    if (magnitude === null || magnitude === undefined) return 'bg-slate-400 text-slate-900'; // text-slate-900 for contrast
    if (magnitude < 1.0) return 'bg-cyan-300 text-slate-900';         // text-slate-900 for contrast
    if (magnitude < 2.5) return 'bg-cyan-400 text-slate-900';         // text-slate-900 for contrast
    if (magnitude < 4.0) return 'bg-emerald-400 text-slate-900';   // text-slate-900 for contrast
    if (magnitude < 5.0) return 'bg-yellow-400 text-slate-900';     // text-slate-900 for contrast
    if (magnitude < 6.0) return 'bg-orange-400 text-slate-900';     // text-slate-900 for contrast
    if (magnitude < 7.0) return 'bg-red-400 text-slate-900';       // Magnitude 6.x, text-slate-900 for contrast
    return 'bg-slate-800 text-white';                             // Magnitude 7.0+, text-white for contrast
};

// Add other utility functions here as the app grows

/**
 * Checks if a value can be reasonably interpreted as a number.
 * Handles actual numbers, numeric strings. Rejects mixed alphanumeric strings (e.g., "12a"),
 * null, undefined, boolean, empty/whitespace strings, and arrays.
 *
 * @param {*} num - The value to check.
 * @returns {boolean} True if the value is considered a valid number, false otherwise.
 */
export const isValidNumber = (num) => {
    // Handles actual numbers, numeric strings. Rejects mixed strings, null, undefined, empty/whitespace, arrays.
    if (num === null || typeof num === 'boolean' || num === undefined || Array.isArray(num)) return false;
    if (typeof num === 'string' && num.trim() === '') return false;
    // Number() converts empty array [] to 0, so Array.isArray check is important.
    // Number() converts "12a" to NaN.
    return !isNaN(Number(num));
};

/**
 * Formats a Unix timestamp into a human-readable full date and long time string.
 * Example: "Monday, January 1, 2023, 12:00:00 AM PST" (locale dependent).
 * @param {number} timestamp - The Unix timestamp in milliseconds.
 * @returns {string} A formatted date-time string, or 'N/A' if the timestamp is invalid.
 */
export const formatDate = (timestamp) => {
    if (!timestamp || !isValidNumber(timestamp)) return 'N/A'; // Added isValidNumber check
    return new Date(timestamp).toLocaleString([], { dateStyle: 'full', timeStyle: 'long' });
};

/**
 * Checks if a value is a string and is not empty or just whitespace.
 * @param {*} str - The value to check.
 * @returns {boolean} True if the value is a non-empty string, false otherwise.
 */
export const isValidString = (str) => {
    return typeof str === 'string' && str.trim() !== '';
};

/**
 * Checks if a value is present (i.e., not null and not undefined).
 * @param {*} value - The value to check.
 * @returns {boolean} True if the value is present, false otherwise.
 */
export const isValuePresent = (value) => {
    return value !== null && value !== undefined;
};

/**
 * Formats a number to a string with a specified number of decimal places.
 * Returns 'N/A' if the input cannot be parsed to a valid number.
 * @param {number|string|null|undefined} num - The number or numeric string to format.
 * @param {number} [precision=1] - The number of decimal places to use.
 * @returns {string} The formatted number as a string, or 'N/A'.
 */
export const formatNumber = (num, precision = 1) => {
    const number = parseFloat(num); // parseFloat(null) is NaN
    if (Number.isNaN(number)) return 'N/A';
    return number.toFixed(precision);
};

/**
 * Formats a large number into a human-readable string with suffixes (thousand, million, billion, etc.).
 * Uses `toLocaleString` for number formatting part, ensuring locale-specific digit grouping.
 * Returns 'N/A' if the input is not a valid number. Returns '0' if input is 0.
 * For very large numbers beyond quintillion, it falls back to exponential notation.
 *
 * @param {number|string|null|undefined} num - The number or numeric string to format.
 * @returns {string} The human-readable formatted large number string, or 'N/A'.
 */
export const formatLargeNumber = (num) => {
    if (!isValidNumber(num)) return 'N/A'; // Uses the utility isValidNumber
    const actualNum = Number(num); // Ensure we are working with a number type
    if (actualNum === 0) return '0';

    const numAbs = Math.abs(actualNum);
    let value; let suffix = '';
    if (numAbs < 1e3) { value = actualNum.toLocaleString(undefined, { maximumFractionDigits: 2 }); }
    else if (numAbs < 1e6) { value = (actualNum / 1e3).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' thousand'; }
    else if (numAbs < 1e9) { value = (actualNum / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' million'; }
    else if (numAbs < 1e12) { value = (actualNum / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' billion'; }
    else if (numAbs < 1e15) { value = (actualNum / 1e12).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' trillion'; }
    else if (numAbs < 1e18) { value = (actualNum / 1e15).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' quadrillion';}
    else if (numAbs < 1e21) { value = (actualNum / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' quintillion';}
    else { const expFormat = actualNum.toExponential(2); const parts = expFormat.split('e+'); return parts.length === 2 ? `${parts[0]} x 10^${parts[1]}` : expFormat; }
    return value + suffix;
};

/**
 * Formats a Unix timestamp into a human-readable "time ago" string.
 * @param {number} timestamp - The Unix timestamp in milliseconds.
 * @returns {string} A human-readable string representing the time difference.
 */
export function formatTimeAgo(timestamp) {
  if (timestamp === null || timestamp === undefined || typeof timestamp !== 'number' || isNaN(timestamp)) {
    return "Invalid date";
  }

  const now = new Date().getTime();
  const seconds = Math.round((now - timestamp) / 1000);

  if (seconds < 5) {
    return "just now";
  }

  const minutes = Math.round(seconds / 60);
  const hours = Math.round(seconds / 3600);
  const days = Math.round(seconds / 86400);
  const weeks = Math.round(seconds / 604800);
  const months = Math.round(seconds / 2629800); // Average month length
  const years = Math.round(seconds / 31557600); // Average year length (considering leap years)

  if (seconds < 60) {
    return `${seconds} seconds ago`;
  } else if (minutes === 1) {
    return "1 minute ago";
  } else if (minutes < 60) {
    return `${minutes} minutes ago`;
  } else if (hours === 1) {
    return "1 hour ago";
  } else if (hours < 24) {
    return `${hours} hours ago`;
  } else if (days === 1) {
    return "1 day ago";
  } else if (days < 7) {
    return `${days} days ago`;
  } else if (weeks === 1) {
    return "1 week ago";
  } else if (weeks < 4.348) { // Average weeks in a month
    return `${weeks} weeks ago`;
  } else if (months === 1) {
    return "1 month ago";
  } else if (months < 12) {
    return `${months} months ago`;
  } else if (years === 1) {
    return "1 year ago";
  } else {
    return `${years} years ago`;
  }
}
