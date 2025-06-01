// src/utils/utils.js
import { REGIONS as AppRegions, FEELABLE_QUAKE_THRESHOLD as AppFeelableThreshold } from '../constants/appConstants';

export const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export function findActiveClusters(earthquakes, maxDistanceKm, minQuakes, calculateDistFunc = calculateDistance) {
    const clusters = [];
    const processedQuakeIds = new Set();
    if (!earthquakes || earthquakes.length === 0) return clusters;

    const sortedEarthquakes = [...earthquakes].sort((a, b) => (b.properties.mag || 0) - (a.properties.mag || 0));

    for (const quake of sortedEarthquakes) {
        if (processedQuakeIds.has(quake.id)) continue;
        const newCluster = [quake];
        processedQuakeIds.add(quake.id);
        const baseLat = quake.geometry.coordinates[1];
        const baseLon = quake.geometry.coordinates[0];

        for (const otherQuake of sortedEarthquakes) {
            if (processedQuakeIds.has(otherQuake.id) || otherQuake.id === quake.id) continue;
            const dist = calculateDistFunc(baseLat, baseLon, otherQuake.geometry.coordinates[1], otherQuake.geometry.coordinates[0]);
            if (dist <= maxDistanceKm) {
                newCluster.push(otherQuake);
                processedQuakeIds.add(otherQuake.id);
            }
        }
        if (newCluster.length >= minQuakes) clusters.push(newCluster);
    }
    return clusters;
}

export const getMagnitudeColor = (magnitude) => {
    // This is the implementation from the original HomePage.jsx for color values for the globe markers
    if (magnitude === null || magnitude === undefined) return '#94a3b8'; // Default slate gray (slate-400)
    if (magnitude < 1.0) return '#5eead4'; // Cyan-300
    if (magnitude < 2.5) return '#34d399'; // Emerald-400
    if (magnitude < 4.0) return '#facc15'; // Yellow-400 (was amber)
    if (magnitude < 5.0) return '#fb923c'; // Orange-400
    if (magnitude < 6.0) return '#f87171'; // Red-400
    if (magnitude < 7.0) return '#ef4444'; // Red-500
    return '#dc2626'; // Red-600
};

export const getMagnitudeColorStyle = (magnitude) => {
    // This is the implementation from the original HomePage.jsx for Tailwind CSS classes
    if (magnitude === null || magnitude === undefined) return 'bg-slate-600 text-slate-100';
    if (magnitude < 1.0) return 'bg-cyan-800 bg-opacity-50 text-cyan-100';
    if (magnitude < 2.5) return 'bg-cyan-700 bg-opacity-50 text-cyan-100'; // Adjusted from emerald for consistency
    if (magnitude < 4.0) return 'bg-emerald-700 bg-opacity-50 text-emerald-100'; // Was yellow
    if (magnitude < 5.0) return 'bg-yellow-700 bg-opacity-50 text-yellow-100'; // Was orange
    if (magnitude < 6.0) return 'bg-orange-700 bg-opacity-50 text-orange-100'; // Was red
    if (magnitude < 7.0) return 'bg-orange-800 bg-opacity-60 text-orange-50'; // Darker orange
    if (magnitude < 8.0) return 'bg-red-800 bg-opacity-60 text-red-50';
    return 'bg-red-900 bg-opacity-70 text-red-50';
};

export const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
};

export const formatTimeDuration = (milliseconds) => {
    if (milliseconds === null || milliseconds < 0) return 'N/A';
    const totalSeconds = Math.floor(milliseconds / 1000);
    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    let parts = [];
    if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hr${hours > 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} min${minutes > 1 ? 's' : ''}`);
    if (seconds >= 0 && parts.length < 3) parts.push(`${seconds} sec${seconds !== 1 ? 's' : ''}`);
    if (parts.length === 0 && milliseconds >= 0) return "0 sec";
    return parts.join(', ');
};

export const calculateStats = (earthquakes, FEELABLE_QUAKE_THRESHOLD_PARAM = AppFeelableThreshold) => {
    const baseStats = { totalEarthquakes: 0, averageMagnitude: 'N/A', strongestMagnitude: 'N/A', significantEarthquakes: 0, feelableEarthquakes: 0, averageDepth: 'N/A', deepestEarthquake: 'N/A', averageSignificance: 'N/A', highestAlertLevel: null };
    if (!earthquakes || earthquakes.length === 0) return baseStats;
    const totalEarthquakes = earthquakes.length;
    const mags = earthquakes.map(q => q.properties.mag).filter(m => m !== null && typeof m === 'number');
    const avgMag = mags.length > 0 ? (mags.reduce((a, b) => a + b, 0) / mags.length) : null;
    const strongMag = mags.length > 0 ? Math.max(...mags) : null;
    const depths = earthquakes.map(q => q.geometry?.coordinates?.[2]).filter(d => d !== null && typeof d === 'number');
    const avgDepth = depths.length > 0 ? (depths.reduce((a, b) => a + b, 0) / depths.length) : null;
    const deepQuake = depths.length > 0 ? Math.max(...depths) : null;
    const sigQuakes = earthquakes.filter(q => q.properties.mag !== null && q.properties.mag >= 4.5).length;
    const feelQuakes = earthquakes.filter(q => q.properties.mag !== null && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD_PARAM).length;
    const sigs = earthquakes.map(q => q.properties.sig).filter(s => s !== null && typeof s === 'number');
    const avgSig = sigs.length > 0 ? Math.round(sigs.reduce((a, b) => a + b, 0) / sigs.length) : null;
    const alerts = earthquakes.map(q => q.properties.alert).filter(a => a && a !== 'green');
    const highAlert = alerts.length > 0 ? alerts.sort((a,b) => { const order = { 'red':0, 'orange':1, 'yellow':2 }; return order[a] - order[b]; })[0] : null;
    return { totalEarthquakes, averageMagnitude: avgMag?.toFixed(2) || "N/A", strongestMagnitude: strongMag?.toFixed(1) || "N/A", significantEarthquakes: sigQuakes, feelableEarthquakes: feelQuakes, averageDepth: avgDepth?.toFixed(1) || "N/A", deepestEarthquake: deepQuake?.toFixed(1) || "N/A", averageSignificance: avgSig || "N/A", highestAlertLevel: highAlert };
};

export const getRegionForEarthquake = (quake, REGIONS_PARAM = AppRegions) => {
    const lon = quake.geometry?.coordinates?.[0];
    const lat = quake.geometry?.coordinates?.[1];
    if (lon === null || lat === null || lon === undefined || lat === undefined) return REGIONS_PARAM[REGIONS_PARAM.length - 1];
    for (let i = 0; i < REGIONS_PARAM.length - 1; i++) {
        const region = REGIONS_PARAM[i];
        if (lat >= region.latMin && lat <= region.latMax && lon >= region.lonMin && lon <= region.lonMax) return region;
    }
    return REGIONS_PARAM[REGIONS_PARAM.length - 1];
};
