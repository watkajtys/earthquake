// src/utils/fetchUtils.js
// useCallback import removed as it's unused

export const fetchDataCb = async (url) => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            let errorBody = '';
            try {
                errorBody = await response.text();
            } catch (_) { // e variable removed as it's unused
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
