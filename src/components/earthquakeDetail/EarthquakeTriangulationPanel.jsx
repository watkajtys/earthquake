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

  const triangulationData = generateTriangulationData(earthquakeFeature, hypotheticalStations);

  if (!triangulationData) {
    return (
      <div className={exhibitPanelClass || 'exhibit-panel'}>
        <h3 className={exhibitTitleClass || 'exhibit-title'}>Conceptual Triangulation</h3>
        <p>Could not generate triangulation data.</p>
      </div>
    );
  }

  return (
    <div className={exhibitPanelClass || 'exhibit-panel'}>
      <h3 className={exhibitTitleClass || 'exhibit-title'}>Conceptual Triangulation</h3>
      <TriangulationAnimation triangulationData={triangulationData} />
    </div>
  );
};

EarthquakeTriangulationPanel.propTypes = {
  /**
   * The full GeoJSON feature object for the selected earthquake.
   * Crucially, this object must contain `id`, `properties.time`, `properties.mag`, `properties.place`,
   * and `geometry.coordinates` (lon, lat, depth) for the `generateTriangulationData` function.
   */
  earthquakeFeature: PropTypes.shape({
    id: PropTypes.string.isRequired,
    properties: PropTypes.shape({
      time: PropTypes.number.isRequired,
      mag: PropTypes.number, // Magnitude can sometimes be null
      place: PropTypes.string.isRequired,
      // other properties may exist
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
