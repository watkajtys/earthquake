// src/utils.js

/**
 * Calculates the distance between two geographical coordinates using the Haversine formula.
 * @param {number} lat1 Latitude of the first point.
 * @param {number} lon1 Longitude of the first point.
 * @param {number} lat2 Latitude of the second point.
 * @param {number} lon2 Longitude of the second point.
 * @returns {number} Distance in kilometers.
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
}

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
    if (magnitude < 7.0) return '#F97316'; // orange-500
    if (magnitude < 8.0) return '#EF4444'; // red-500
    return '#B91C1C'; // red-700
};

/**
 * Returns Tailwind CSS class strings for background and text color based on earthquake magnitude.
 * @param {number | null | undefined} magnitude - The earthquake magnitude.
 * @returns {string} Tailwind CSS class strings.
 */
export const getMagnitudeColorStyle = (magnitude) => {
    if (magnitude === null || magnitude === undefined) return 'bg-slate-600 text-slate-100';
    if (magnitude < 1.0) return 'bg-cyan-800 bg-opacity-50 text-cyan-100';
    if (magnitude < 2.5) return 'bg-cyan-700 bg-opacity-50 text-cyan-100';
    if (magnitude < 4.0) return 'bg-emerald-700 bg-opacity-50 text-emerald-100';
    if (magnitude < 5.0) return 'bg-yellow-700 bg-opacity-50 text-yellow-100';
    if (magnitude < 6.0) return 'bg-orange-700 bg-opacity-50 text-orange-100';
    if (magnitude < 7.0) return 'bg-orange-800 bg-opacity-60 text-orange-50';
    if (magnitude < 8.0) return 'bg-red-800 bg-opacity-60 text-red-50';
    return 'bg-red-900 bg-opacity-70 text-red-50';
};

// Add other utility functions here as the app grows

export const isValidNumber = (num) => {
    // Handles actual numbers, numeric strings. Rejects mixed strings, null, undefined, empty/whitespace, arrays.
    if (num === null || typeof num === 'boolean' || num === undefined || Array.isArray(num)) return false;
    if (typeof num === 'string' && num.trim() === '') return false;
    // Number() converts empty array [] to 0, so Array.isArray check is important.
    // Number() converts "12a" to NaN.
    return !isNaN(Number(num));
};

export const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString([], { dateStyle: 'full', timeStyle: 'long' });
};

export const isValidString = (str) => {
    return typeof str === 'string' && str.trim() !== '';
};

export const isValuePresent = (value) => {
    return value !== null && value !== undefined;
};

export const formatNumber = (num, precision = 1) => {
    // parseFloat(null) is NaN, so it will correctly return 'N/A' without special handling for null.
    const number = parseFloat(num);
    if (Number.isNaN(number)) return 'N/A';
    return number.toFixed(precision);
};

export const formatLargeNumber = (num) => {
    // Note: This function relies on isValidNumber, defined above.
    if (!isValidNumber(num)) return 'N/A';
    if (num === 0) return '0';
    const numAbs = Math.abs(num);
    let value; let suffix = '';
    if (numAbs < 1e3) { value = num.toLocaleString(undefined, { maximumFractionDigits: 2 }); }
    else if (numAbs < 1e6) { value = (num / 1e3).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' thousand'; }
    else if (numAbs < 1e9) { value = (num / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' million'; }
    else if (numAbs < 1e12) { value = (num / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' billion'; }
    else if (numAbs < 1e15) { value = (num / 1e12).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' trillion'; }
    else if (numAbs < 1e18) { value = (num / 1e15).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' quadrillion';}
    else if (numAbs < 1e21) { value = (num / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' quintillion';}
    else { const expFormat = num.toExponential(2); const parts = expFormat.split('e+'); return parts.length === 2 ? `${parts[0]} x 10^${parts[1]}` : expFormat; }
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
