/**
 * Validates if the given data is a GeoJSON FeatureCollection.
 * Basic validation, can be expanded.
 * @param {any} geoJsonData The data to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
export function isValidGeoJson(geoJsonData) {
  if (!geoJsonData || typeof geoJsonData !== 'object') {
    console.warn("isValidGeoJson: Data is not an object.", geoJsonData);
    return false;
  }
  if (geoJsonData.type !== 'FeatureCollection') {
    console.warn("isValidGeoJson: Data is not a FeatureCollection.", geoJsonData);
    return false;
  }
  if (!Array.isArray(geoJsonData.features)) {
    console.warn("isValidGeoJson: Features property is not an array.", geoJsonData);
    return false;
  }
  // Optionally, could iterate through features and validate each one
  // using parts of isValidFeatureArray's logic or a new isValidFeature function.
  return true;
}

/**
 * Validates if the given data is an array of valid GeoJSON Feature objects.
 * @param {any} data The data to validate.
 * @returns {boolean} True if it's a valid array of features, false otherwise.
 */
export function isValidFeatureArray(data) {
  if (!Array.isArray(data)) {
    console.warn("isValidFeatureArray: Data is not an array.", data);
    return false;
  }

  for (let i = 0; i < data.length; i++) {
    const feature = data[i];
    if (typeof feature !== 'object' || feature === null) {
      console.warn(`isValidFeatureArray: Item at index ${i} is not an object.`, feature);
      return false;
    }
    if (feature.type !== 'Feature') {
      console.warn(`isValidFeatureArray: Item at index ${i} does not have type 'Feature'.`, feature);
      return false;
    }
    if (typeof feature.geometry !== 'object' || feature.geometry === null) {
      console.warn(`isValidFeatureArray: Item at index ${i} does not have a valid 'geometry' object.`, feature);
      return false;
    }
    if (typeof feature.properties !== 'object' || feature.properties === null) {
      console.warn(`isValidFeatureArray: Item at index ${i} does not have a valid 'properties' object.`, feature);
      return false;
    }
  }

  return true;
}

// Example Usage (can be removed or kept for testing):
// Test cases for isValidFeatureArray
// const validFeatures = [
//   { type: "Feature", geometry: {}, properties: {} },
//   { type: "Feature", geometry: { type: "Point", coordinates: [0,0] }, properties: { name: "Test" } }
// ];
// const invalidFeatures1 = "not an array";
// const invalidFeatures2 = [{ type: "Feature", geometry: {}, properties: {} }, "not a feature"];
// const invalidFeatures3 = [{ type: "NotFeature", geometry: {}, properties: {} }];
// const invalidFeatures4 = [{ type: "Feature", geometry: "not an object", properties: {} }];
// const invalidFeatures5 = [{ type: "Feature", geometry: {}, properties: null }];

// console.log("Valid features:", isValidFeatureArray(validFeatures)); // true
// console.log("Invalid (not an array):", isValidFeatureArray(invalidFeatures1)); // false
// console.log("Invalid (mixed array):", isValidFeatureArray(invalidFeatures2)); // false
// console.log("Invalid (wrong type):", isValidFeatureArray(invalidFeatures3)); // false
// console.log("Invalid (bad geometry):", isValidFeatureArray(invalidFeatures4)); // false
// console.log("Invalid (bad properties):", isValidFeatureArray(invalidFeatures5)); // false

// Test cases for isValidGeoJson
// const validGeoJson = { type: "FeatureCollection", features: validFeatures };
// const invalidGeoJson1 = { type: "FeatureCollection", features: "not an array" };
// const invalidGeoJson2 = { type: "NotAFeatureCollection", features: [] };

// console.log("Valid GeoJSON:", isValidGeoJson(validGeoJson)); // true
// console.log("Invalid GeoJSON (features not array):", isValidGeoJson(invalidGeoJson1)); // false
// console.log("Invalid GeoJSON (wrong type):", isValidGeoJson(invalidGeoJson2)); // false
