/**
 * @file mathUtils.js
 * @description Common math utility functions for backend.
 * This file is a synchronized copy from /common/mathUtils.js
 * Please ensure any changes made here are reflected in the source file and vice-versa.
 */

// Global profiler for instrumented distance calculations
let globalProfiler = null;

export function setDistanceCalculationProfiler(profiler) {
  globalProfiler = profiler;
}

// Copied from /common/mathUtils.js
/**
 * Calculates the distance between two geographical coordinates using the Haversine formula.
 * @param {number} lat1 Latitude of the first point.
 * @param {number} lon1 Longitude of the first point.
 * @param {number} lat2 Latitude of the second point.
 * @param {number} lon2 Longitude of the second point.
 * @returns {number} Distance in kilometers.
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const startTime = globalProfiler ? performance.now() : 0;
    
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    if (globalProfiler) {
        const endTime = performance.now();
        globalProfiler.trackDistanceCalculation(endTime - startTime);
    }
    
    return distance;
}
