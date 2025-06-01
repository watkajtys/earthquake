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

// Add other utility functions here as the app grows

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
