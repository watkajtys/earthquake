/**
 * @file appConstants.js
 * @description Global application constants, grouped by category.
 * These constants are used throughout the application for configuration,
 * API endpoints, thresholds, UI settings, and predefined data structures.
 */

// API URLs
/** @description USGS GeoJSON API endpoint for earthquakes in the last day. */
export const USGS_API_URL_DAY = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
/** @description USGS GeoJSON API endpoint for earthquakes in the last week. */
export const USGS_API_URL_WEEK = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson';
/** @description USGS GeoJSON API endpoint for earthquakes in the last month. */
export const USGS_API_URL_MONTH = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson';

// Clustering Parameters
/** @description Maximum distance in kilometers for earthquakes to be considered in the same cluster. */
export const CLUSTER_MAX_DISTANCE_KM = 100;
/** @description Minimum number of earthquakes required to form a valid cluster. */
export const CLUSTER_MIN_QUAKES = 3;
/** @description Time window in hours to consider when grouping earthquakes into clusters. */
export const CLUSTER_TIME_WINDOW_HOURS = 48;

// Earthquake Thresholds
/** @description Minimum magnitude for an earthquake to be considered 'major' or 'significant' in many contexts. */
export const MAJOR_QUAKE_THRESHOLD = 4.5;
/** @description Minimum magnitude for an earthquake to be generally considered 'feelable' by people nearby. */
export const FEELABLE_QUAKE_THRESHOLD = 2.5;
/** @description Minimum number of felt reports (DYFI) for an earthquake to be highlighted or considered significant in some UI contexts. */
export const FELT_REPORTS_THRESHOLD = 0; // Currently, any number of reports is considered.
/** @description Minimum USGS 'significance' score for an earthquake to be highlighted or considered in some UI contexts. */
export const SIGNIFICANCE_THRESHOLD = 0; // Currently, any significance score is considered.

// Timing and Intervals
/** @description Data refresh interval in milliseconds (e.g., 5 minutes) for polling updated earthquake data. */
export const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
/** @description Interval in milliseconds for cycling through messages displayed during initial data loading. */
export const LOADING_MESSAGE_INTERVAL_MS = 750;
/** @description Interval in milliseconds for updating the 'time ago' display in the application header. */
export const HEADER_TIME_UPDATE_INTERVAL_MS = 60 * 1000;

// UI and Display
/** @description Number of top earthquake clusters to display in the overview section. */
export const TOP_N_CLUSTERS_OVERVIEW = 3;

// Loading Messages
/** @description Array of messages displayed sequentially during the initial data loading sequence of the application. */
export const INITIAL_LOADING_MESSAGES = [
    "Connecting to Global Seismic Network...", "Fetching Most Recent Events...", "Processing Live Data...",
    "Analyzing Tectonic Movements...", "Compiling Regional Summaries...",
    "Finalizing Real-time Display..."
];
/** @description Array of messages displayed sequentially during the loading of extended monthly earthquake data. */
export const MONTHLY_LOADING_MESSAGES = [
    "Accessing Historical Archives...", "Fetching Extended Seismic Records...", "Processing 14 & 30-Day Data...",
    "Identifying Long-term Patterns...", "Calculating Deep Earth Insights...", "Preparing Historical Analysis...",
];

// Alert Levels Configuration
/**
 * @description Configuration for USGS PAGER alert levels.
 * Each key is the alert level (uppercase) and its value is an object containing:
 * - `text`: The display text for the alert level (e.g., "RED").
 * - `colorClass`: Tailwind CSS classes for general display of the alert level.
 * - `detailsColorClass`: Tailwind CSS classes for more detailed or emphasized display of the alert.
 * - `description`: A brief explanation of the potential impact associated with the alert level.
 * @type {Object.<string, {text: string, colorClass: string, detailsColorClass: string, description: string}>}
 */
export const ALERT_LEVELS = {
    RED: { text: "RED", colorClass: "bg-red-100 border-red-500 text-red-700", detailsColorClass: "bg-red-50 border-red-400 text-red-800", description: "Potential for 1,000+ fatalities / $1B+ losses." },
    ORANGE: { text: "ORANGE", colorClass: "bg-orange-100 border-orange-500 text-orange-700", detailsColorClass: "bg-orange-50 border-orange-400 text-orange-800", description: "Potential for 100-999 fatalities / $100M-$1B losses." },
    YELLOW: { text: "YELLOW", colorClass: "bg-yellow-100 border-yellow-500 text-yellow-700", detailsColorClass: "bg-yellow-50 border-yellow-400 text-yellow-800", description: "Potential for 1-99 fatalities / $1M-$100M losses." },
    GREEN: { text: "GREEN", colorClass: "bg-green-100 border-green-500 text-green-700", detailsColorClass: "bg-green-50 border-green-400 text-green-800", description: "No significant impact expected (<1 fatality / <$1M losses)." }
};

// Geographic Regions
/**
 * @description Predefined geographic regions for classifying earthquake locations.
 * Each region object includes:
 * - `name`: The display name of the region.
 * - `latMin`, `latMax`: Minimum and maximum latitude boundaries for the region.
 * - `lonMin`, `lonMax`: Minimum and maximum longitude boundaries for the region.
 * - `color`: A hex color code associated with the region for UI display purposes.
 * The last region, "Other / Oceanic", serves as a fallback for earthquakes not fitting into other defined regions.
 * @type {Array<{name: string, latMin: number, latMax: number, lonMin: number, lonMax: number, color: string}>}
 */
export const REGIONS = [
    { name: "Alaska & W. Canada", latMin: 50, latMax: 72, lonMin: -170, lonMax: -125, color: "#A78BFA" },
    { name: "California & W. USA", latMin: 30, latMax: 50, lonMin: -125, lonMax: -110, color: "#F472B6" },
    { name: "Japan & Kuril Isl.", latMin: 25, latMax: 50, lonMin: 125, lonMax: 155, color: "#34D399" },
    { name: "Indonesia & Philippines", latMin: -10, latMax: 25, lonMin: 95, lonMax: 140, color: "#F59E0B" },
    { name: "S. America (Andes)", latMin: -55, latMax: 10, lonMin: -80, lonMax: -60, color: "#60A5FA" },
    { name: "Mediterranean", latMin: 30, latMax: 45, lonMin: -10, lonMax: 40, color: "#818CF8" },
    { name: "Central America", latMin: 5, latMax: 30, lonMin: -118, lonMax: -77, color: "#FBBF24" },
    { name: "New Zealand & S. Pacific", latMin: -55, latMax: -10, lonMin: 160, lonMax: -150, color: "#C4B5FD" },
    { name: "Other / Oceanic", latMin: -90, latMax: 90, lonMin: -180, lonMax: 180, color: "#9CA3AF" }
];
