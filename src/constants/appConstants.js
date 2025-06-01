// API URLs
export const USGS_API_URL_DAY = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
export const USGS_API_URL_WEEK = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson';
export const USGS_API_URL_MONTH = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson';

// Clustering Parameters
export const CLUSTER_MAX_DISTANCE_KM = 100; // Max distance for quakes to be in the same cluster
export const CLUSTER_MIN_QUAKES = 3; // Min number of quakes to form a cluster
export const CLUSTER_TIME_WINDOW_HOURS = 48; // Time window in hours to consider for clustering

// Earthquake Thresholds
export const MAJOR_QUAKE_THRESHOLD = 4.5;
export const FEELABLE_QUAKE_THRESHOLD = 2.5;
export const FELT_REPORTS_THRESHOLD = 0; // Minimum felt reports to be considered significant in some contexts
export const SIGNIFICANCE_THRESHOLD = 0; // Minimum significance score to be considered in some contexts

// Timing and Intervals
export const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export const LOADING_MESSAGE_INTERVAL_MS = 750; // Interval for changing loading messages
export const HEADER_TIME_UPDATE_INTERVAL_MS = 60 * 1000; // 1 minute, for updating "time ago" in header

// UI and Display
export const TOP_N_CLUSTERS_OVERVIEW = 3; // Number of top clusters to show in overview

// Loading Messages
export const INITIAL_LOADING_MESSAGES = [
    "Connecting to Global Seismic Network...", "Fetching Most Recent Events...", "Processing Live Data...",
    "Analyzing Tectonic Movements...", "Compiling Regional Summaries...",
    "Finalizing Real-time Display..."
];
export const MONTHLY_LOADING_MESSAGES = [
    "Accessing Historical Archives...", "Fetching Extended Seismic Records...", "Processing 14 & 30-Day Data...",
    "Identifying Long-term Patterns...", "Calculating Deep Earth Insights...", "Preparing Historical Analysis...",
];

// Alert Levels Configuration
export const ALERT_LEVELS = {
    RED: { text: "RED", colorClass: "bg-red-100 border-red-500 text-red-700", detailsColorClass: "bg-red-50 border-red-400 text-red-800", description: "Potential for 1,000+ fatalities / $1B+ losses." },
    ORANGE: { text: "ORANGE", colorClass: "bg-orange-100 border-orange-500 text-orange-700", detailsColorClass: "bg-orange-50 border-orange-400 text-orange-800", description: "Potential for 100-999 fatalities / $100M-$1B losses." },
    YELLOW: { text: "YELLOW", colorClass: "bg-yellow-100 border-yellow-500 text-yellow-700", detailsColorClass: "bg-yellow-50 border-yellow-400 text-yellow-800", description: "Potential for 1-99 fatalities / $1M-$100M losses." },
    GREEN: { text: "GREEN", colorClass: "bg-green-100 border-green-500 text-green-700", detailsColorClass: "bg-green-50 border-green-400 text-green-800", description: "No significant impact expected (<1 fatality / <$1M losses)." }
};

// Geographic Regions
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
