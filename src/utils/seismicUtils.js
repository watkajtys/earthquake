/**
 * @file seismicUtils.js
 * Utility functions related to seismic wave calculations.
 */

/**
 * Average P-wave velocity in km/s.
 * This is a simplified average for crustal P-waves.
 * @type {number}
 */
const AVERAGE_P_WAVE_VELOCITY_KM_S = 6.5;

/**
 * Average S-wave velocity in km/s.
 * This is a simplified average for crustal S-waves.
 * @type {number}
 */
const AVERAGE_S_WAVE_VELOCITY_KM_S = 3.75;

/**
 * Calculates the travel time for a P-wave over a given distance.
 * This is a simplified calculation assuming a constant average velocity
 * and does not account for earthquake depth or complex velocity models.
 *
 * @param {number} distanceKm - The distance from the earthquake epicenter in kilometers.
 * @returns {number} The estimated P-wave travel time in seconds. Returns 0 if distance is 0.
 */
export function calculatePWaveTravelTime(distanceKm) {
    if (typeof distanceKm !== 'number' || distanceKm < 0) {
        // Or throw an error, depending on desired error handling
        console.warn(`Invalid distanceKm: ${distanceKm}. Returning 0.`);
        return 0;
    }
    if (distanceKm === 0) {
        return 0;
    }
    return distanceKm / AVERAGE_P_WAVE_VELOCITY_KM_S;
}

/**
 * Calculates the travel time for an S-wave over a given distance.
 * This is a simplified calculation assuming a constant average velocity
 * and does not account for earthquake depth or complex velocity models.
 *
 * @param {number} distanceKm - The distance from the earthquake epicenter in kilometers.
 * @returns {number} The estimated S-wave travel time in seconds. Returns 0 if distance is 0.
 */
export function calculateSWaveTravelTime(distanceKm) {
    if (typeof distanceKm !== 'number' || distanceKm < 0) {
        // Or throw an error, depending on desired error handling
        console.warn(`Invalid distanceKm: ${distanceKm}. Returning 0.`);
        return 0;
    }
    if (distanceKm === 0) {
        return 0;
    }
    return distanceKm / AVERAGE_S_WAVE_VELOCITY_KM_S;
}

/**
 * Calculates the great-circle distance between two points on Earth (specified in decimal degrees)
 * using the Haversine formula.
 *
 * @param {number} lat1 - Latitude of the first point.
 * @param {number} lon1 - Longitude of the first point.
 * @param {number} lat2 - Latitude of the second point.
 * @param {number} lon2 - Longitude of the second point.
 * @returns {number} The distance between the two points in kilometers.
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

/**
 * Generates triangulation data for an earthquake and a list of seismic stations.
 * For each station, it calculates its distance from the earthquake epicenter
 * and estimates the P-wave and S-wave travel times from the epicenter to the station.
 * These travel times are relative to the earthquake's origin time.
 *
 * @param {object} earthquake - The earthquake object, expected to resemble a GeoJSON Feature.
 * @param {string} earthquake.id - Unique identifier for the earthquake (e.g., "us6000qhu1").
 * @param {object} earthquake.properties - Contains metadata about the earthquake.
 * @param {number} earthquake.properties.time - Earthquake origin time in UTC milliseconds since the epoch.
 * @param {number} earthquake.properties.mag - Magnitude of the earthquake.
 * @param {string} earthquake.properties.place - Textual description of the earthquake location.
 * @param {object} earthquake.geometry - Contains the geographic information.
 * @param {string} earthquake.geometry.type - Expected to be "Point".
 * @param {number[]} earthquake.geometry.coordinates - An array: [longitude, latitude, depthInKm].
 *
 * @param {object[]} stations - An array of seismic station objects.
 * @param {string} stations[].id - Unique identifier for the station (e.g., "STN1").
 * @param {string} stations[].name - Human-readable name of the station (e.g., "Station Alpha").
 * @param {object} stations[].location - Geographic location of the station.
 * @param {number} stations[].location.latitude - Latitude of the station in decimal degrees.
 * @param {number} stations[].location.longitude - Longitude of the station in decimal degrees.
 *
 * @returns {object|null} An object containing processed earthquake details and the list of stations,
 *                        each augmented with `distanceKm`, `pWaveTravelTime` (seconds), and
 *                        `sWaveTravelTime` (seconds). Returns `null` if essential input
 *                        `earthquake` or `stations` data is invalid or missing critical fields.
 *                        The structure of the returned object is:
 *                        {
 *                          earthquakeDetails: {
 *                            id: string,
 *                            time: number,
 *                            latitude: number,
 *                            longitude: number,
 *                            depth: number,
 *                            magnitude: number,
 *                            place: string
 *                          },
 *                          stations: [
 *                            {
 *                              id: string,
 *                              name: string,
 *                              location: { latitude: number, longitude: number },
 *                              distanceKm: number,
 *                              pWaveTravelTime: number,
 *                              sWaveTravelTime: number,
 *                              error?: string // Optional: if station data was invalid
 *                            },
 *                            // ... other stations
 *                          ]
 *                        }
 */
export function generateTriangulationData(earthquake, stations) {
    if (!earthquake || !earthquake.properties || !earthquake.geometry || !earthquake.geometry.coordinates || !Array.isArray(stations)) {
        console.warn("Invalid earthquake or stations data provided to generateTriangulationData.");
        return null;
    }

    const [epicenterLon, epicenterLat] = earthquake.geometry.coordinates;

    const earthquakeDetails = {
        id: earthquake.id,
        time: earthquake.properties.time,
        latitude: epicenterLat,
        longitude: epicenterLon,
        depth: earthquake.geometry.coordinates[2], // Assuming depth is the third coordinate
        magnitude: earthquake.properties.mag,
        place: earthquake.properties.place,
    };

    const stationsWithData = stations.map(station => {
        if (!station || !station.location) {
            console.warn(`Invalid station data for station ID: ${station?.id}. Skipping.`);
            return {
                ...station,
                distanceKm: null,
                pWaveTravelTime: null,
                sWaveTravelTime: null,
                error: "Invalid station data"
            };
        }
        const { latitude: stationLat, longitude: stationLon } = station.location;

        const distance = haversineDistance(epicenterLat, epicenterLon, stationLat, stationLon);
        const pTime = calculatePWaveTravelTime(distance);
        const sTime = calculateSWaveTravelTime(distance);

        return {
            ...station,
            distanceKm: distance,
            pWaveTravelTime: pTime,
            sWaveTravelTime: sTime,
        };
    });

    return {
        earthquakeDetails: earthquakeDetails,
        stations: stationsWithData,
    };
}
