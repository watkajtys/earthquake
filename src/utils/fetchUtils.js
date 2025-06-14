// src/utils/fetchUtils.js

/**
 * @file fetchUtils.js
 * @description Utility function for fetching and processing GeoJSON earthquake data from a given URL.
 */

/**
 * Fetches GeoJSON data from the specified URL, expecting an earthquake feed.
 * It performs several processing steps:
 * 1. Checks if the response is OK and the content type is JSON.
 * 2. Filters the GeoJSON features to include only those with `properties.type === 'earthquake'`.
 * 3. Sanitizes key properties of each earthquake feature:
 *    - `properties.mag`: Ensures it's a number or null.
 *    - `properties.detail`: Normalizes to use `properties.detail` or fallback to `properties.url`.
 *    - `geometry`: Ensures a default Point geometry structure if missing.
 * 4. Returns an object containing the sanitized `features` and `metadata`.
 *
 * In case of fetch errors or unexpected data format, it logs the error and returns
 * an object with empty features and metadata containing an error flag and message.
 *
 * @async
 * @param {string} url - The URL to fetch the GeoJSON earthquake data from.
 * @returns {Promise<{features: Array<Object>, metadata: Object}>} A promise that resolves to an object
 *   containing an array of sanitized `features` and a `metadata` object.
 *   The `metadata` object will include an `error` flag and `errorMessage` if an issue occurred.
 */
export const fetchDataCb = async (url) => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            let errorBody = '';
            try {
                errorBody = await response.text();
            } catch { // Parameter removed as it's unused
                // Ignore if reading error body fails
            }
            throw new Error(`HTTP error! status: ${response.status} ${response.statusText}. ${errorBody}`);
        }
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error(`Expected JSON but received ${contentType}`);
        }
        const data = await response.json();

        // Robustness check for data and data.features
        const featuresArray = Array.isArray(data?.features) ? data.features : [];

        const sanitizedFeatures = featuresArray
            .filter(f => f?.properties?.type === 'earthquake')
            .map(f => ({
                ...f,
                properties: {
                    ...f.properties,
                    mag: (f.properties.mag === null || typeof f.properties.mag === 'number') ? f.properties.mag : null,
                    detail: f.properties.detail || f.properties.url
                },
                geometry: f.geometry || {type: "Point", coordinates: [null, null, null]}
            }));
        return {features: sanitizedFeatures, metadata: data?.metadata || {generated: Date.now()}};
    } catch (e) {
        console.error(`Error in fetchDataCb from ${url}:`, e);
        // To ensure the function still returns the expected structure in case of error,
        // allowing downstream processing to handle empty/default values.
        return {features: [], metadata: {generated: Date.now(), error: true, errorMessage: e.message}};
    }
};
