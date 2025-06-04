import React from 'react';
import PropTypes from 'prop-types';
import { generateTriangulationData } from '../../utils/seismicUtils';
import TriangulationAnimation from '../TriangulationAnimation'; // Adjusted path

/**
 * @file EarthquakeTriangulationPanel.jsx
 * React component to display a conceptual triangulation animation for a selected earthquake.
 * This panel uses a predefined set of hypothetical seismic stations for the animation,
 * as real-time seismic station data for every earthquake is not typically available
 * in the summary GeoJSON.
 */

// Placeholder stations for conceptual animation as actual, specific station data
// related to each earthquake is not available in the basic earthquake GeoJSON feed.
// These coordinates are roughly in the Japan region for demonstration with typical earthquake data from that area.
const hypotheticalStations = [
  { id: "STN1", name: "Station Alpha (Izu Oshima)", location: { latitude: 34.73, longitude: 139.39 } }, // Izu Oshima
  { id: "STN2", name: "Station Beta (Miyakejima)", location: { latitude: 34.08, longitude: 139.52 } }, // Miyakejima
  { id: "STN3", name: "Station Gamma (Hachijojima)", location: { latitude: 33.11, longitude: 139.79 } }, // Hachijojima
  { id: "STN4", name: "Station Delta (Chiba)", location: { latitude: 35.60, longitude: 140.10 } } // Mainland Honshu for wider spread.
];

/**
 * Renders a panel displaying a conceptual earthquake triangulation animation.
 *
 * @param {object} props - The component's props.
 * @param {object} props.earthquakeFeature - The full GeoJSON feature object for the selected earthquake.
 *                                          Expected to contain `properties` and `geometry`. See `generateTriangulationData`
 *                                          in `seismicUtils.js` for more details on the expected structure.
 * @param {string} [props.exhibitPanelClass] - Optional CSS class for the panel container.
 * @param {string} [props.exhibitTitleClass] - Optional CSS class for the panel title.
 * @returns {JSX.Element} The EarthquakeTriangulationPanel component.
 */
const EarthquakeTriangulationPanel = ({ earthquakeFeature, exhibitPanelClass, exhibitTitleClass }) => {
  if (!earthquakeFeature || !earthquakeFeature.geometry || !earthquakeFeature.properties) {
    return (
      <div className={exhibitPanelClass || 'exhibit-panel'}>
        <h3 className={exhibitTitleClass || 'exhibit-title'}>Conceptual Triangulation</h3>
        <p>Earthquake data not available.</p>
      </div>
    );
  }

  // Generate data for the animation using hypothetical stations.
  const triangulationData = generateTriangulationData(earthquakeFeature, hypotheticalStations);

  // Early exit if triangulation data (which relies on basic earthquakeFeature props) can't be generated.
  // This is a separate check from the solution quality details below.
  if (!triangulationData) {
    return (
      <div className={exhibitPanelClass || 'exhibit-panel'}>
        <h3 className={exhibitTitleClass || 'exhibit-title'}>Conceptual Triangulation & Solution Quality</h3>
        <p>Could not generate data for triangulation animation.</p>
      </div>
    );
  }

  // --- Solution Quality Data Extraction ---
  // Safely access deeply nested properties for solution quality details.
  // These properties are typically found in the 'origin' product of the GeoJSON.
  const originProduct = earthquakeFeature?.properties?.products?.origin?.[0];
  const originProperties = originProduct?.properties;

  // Number of stations used in the solution.
  const nst = originProperties?.nst;
  // Azimuthal gap: largest angle between azimuthally adjacent stations.
  const gap = originProperties?.gap;
  // Distance to the nearest station, typically in degrees.
  const dminDegrees = originProperties?.dmin;
  // Root Mean Square of travel-time residuals.
  const rms = originProperties?.rms;

  // Convert dmin from degrees to kilometers if available.
  // 1 degree of latitude is approximately 111.1 km. This is a common approximation.
  let dminKm = null;
  if (typeof dminDegrees === 'number') {
    dminKm = (dminDegrees * 111.1).toFixed(1);
  }

  return (
    <div className={exhibitPanelClass || 'exhibit-panel'}>
      <h3 className={exhibitTitleClass || 'exhibit-title'}>Conceptual Triangulation & Solution Quality</h3>
      {/* Render the animation component. */}
      <TriangulationAnimation triangulationData={triangulationData} />

      {/* Display Solution Quality Details */}
      <div className="mt-4 text-sm text-slate-700 space-y-1">
        <h4 className="text-md font-semibold text-slate-800 mb-1 border-t pt-2">Solution Details:</h4>

        {/* Number of Stations Used (NST) */}
        {typeof nst === 'number' ? (
          <p><strong>Stations Used (NST):</strong> {nst}</p>
        ) : <p><strong>Stations Used (NST):</strong> N/A</p>}

        {/* Azimuthal Gap */}
        {typeof gap === 'number' ? (
          <p><strong>Azimuthal Gap:</strong> {gap}°</p>
        ) : <p><strong>Azimuthal Gap:</strong> N/A</p>}

        {/* Distance to Nearest Station (dmin) */}
        {dminKm !== null ? (
          <p><strong>Nearest Station (dmin):</strong> {dminKm} km</p>
        ) : <p><strong>Nearest Station (dmin):</strong> N/A</p>}

        {/* RMS Travel-Time Residual */}
        {typeof rms === 'number' ? (
          <p><strong>RMS Error:</strong> {rms} s</p>
        ) : <p><strong>RMS Error:</strong> N/A</p>}
      </div>
    </div>
  );
};

EarthquakeTriangulationPanel.propTypes = {
  /**
   * The full GeoJSON feature object for the selected earthquake.
   * Expected to contain `id`, `properties` (with `time`, `mag`, `place`, and potentially `products`),
   * and `geometry` (with `coordinates`).
   */
  earthquakeFeature: PropTypes.shape({
    id: PropTypes.string.isRequired,
    properties: PropTypes.shape({
      time: PropTypes.number.isRequired,
      mag: PropTypes.number,
      place: PropTypes.string.isRequired,
      products: PropTypes.shape({
        origin: PropTypes.arrayOf(
          PropTypes.shape({
            properties: PropTypes.shape({
              nst: PropTypes.number,
              gap: PropTypes.number,
              dmin: PropTypes.number,
              rms: PropTypes.number,
            }),
          })
        ),
      }),
    }).isRequired,
    geometry: PropTypes.shape({
      type: PropTypes.string.isRequired,
      coordinates: PropTypes.arrayOf(PropTypes.number).isRequired,
    }).isRequired,
  }),
  /** Optional CSS class for the panel container. */
  exhibitPanelClass: PropTypes.string,
  /** Optional CSS class for the panel title. */
  exhibitTitleClass: PropTypes.string,
};

EarthquakeTriangulationPanel.defaultProps = {
  earthquakeFeature: null,
  exhibitPanelClass: 'exhibit-panel',
  exhibitTitleClass: 'exhibit-title',
};

export default EarthquakeTriangulationPanel;
