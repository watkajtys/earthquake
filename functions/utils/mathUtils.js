/**
 * @file Provides utility functions for mathematical calculations for the backend.
 * @description This file contains common mathematical utility functions, including distance calculations.
 * This file is a synchronized copy from /common/mathUtils.js
 * Please ensure any changes made here are reflected in the source file and vice-versa.
 */

// Global profiler for instrumented distance calculations
let globalProfiler = null;

/**
 * Sets a global profiler for instrumented distance calculations.
 * @param {object} profiler - The profiler object to use for tracking performance.
 * @returns {void}
 */
export function setDistanceCalculationProfiler(profiler) {
  globalProfiler = profiler;
}

// Copied from /common/mathUtils.js
/**
 * Calculates the distance between two geographical coordinates using the Haversine formula.
 * This function is essential for mapping and location-based services.
 * @param {number} lat1 Latitude of the first point. Must be a valid number.
 * @param {number} lon1 Longitude of the first point. Must be a valid number.
 * @param {number} lat2 Latitude of the second point. Must be a valid number.
 * @param {number} lon2 Longitude of the second point. Must be a valid number.
 * @returns {number} Distance between the two points in kilometers.
 * @throws {Error} If any of the input coordinates are not valid numbers.
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
    if (typeof lat1 !== 'number' || typeof lon1 !== 'number' || typeof lat2 !== 'number' || typeof lon2 !== 'number') {
        throw new Error('Invalid input: All coordinates must be numbers.');
    }
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
