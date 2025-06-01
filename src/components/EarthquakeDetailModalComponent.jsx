import React from 'react';
import PropTypes from 'prop-types';
import { useParams, useNavigate } from 'react-router-dom';
import EarthquakeDetailView from './EarthquakeDetailView'; // Path relative to src/components/

/**
 * A component that wraps EarthquakeDetailView and handles its presentation as a modal
 * controlled by routing parameters. It extracts the detail URL from the route and
 * manages the modal's open/close state based on navigation.
 * @param {object} props - The component's props.
 * @param {Array<object>} props.broaderEarthquakeData - Broader earthquake data for context.
 * @param {number} [props.dataSourceTimespanDays] - Optional: Timespan of the data source in days.
 * @param {function} props.handleLoadMonthlyData - Function to load monthly data.
 * @param {boolean} props.hasAttemptedMonthlyLoad - Whether monthly data load was attempted.
 * @param {boolean} props.isLoadingMonthly - Whether monthly data is currently loading.
 * @returns {JSX.Element} The rendered EarthquakeDetailView component configured as a modal.
 */
const EarthquakeDetailModalComponent = ({ broaderEarthquakeData, dataSourceTimespanDays, handleLoadMonthlyData, hasAttemptedMonthlyLoad, isLoadingMonthly }) => {
    const { detailUrlParam } = useParams();
    const navigate = useNavigate();
    const detailUrl = decodeURIComponent(detailUrlParam);

    const handleClose = () => {
        navigate(-1); // Go back to the previous page
    };

    return (
        <EarthquakeDetailView
            detailUrl={detailUrl}
            onClose={handleClose}
            broaderEarthquakeData={broaderEarthquakeData}
            dataSourceTimespanDays={dataSourceTimespanDays}
            handleLoadMonthlyData={handleLoadMonthlyData}
            hasAttemptedMonthlyLoad={hasAttemptedMonthlyLoad}
            isLoadingMonthly={isLoadingMonthly}
        />
    );
};

EarthquakeDetailModalComponent.propTypes = {
    broaderEarthquakeData: PropTypes.array.isRequired,
    dataSourceTimespanDays: PropTypes.number,
    handleLoadMonthlyData: PropTypes.func.isRequired,
    hasAttemptedMonthlyLoad: PropTypes.bool.isRequired,
    isLoadingMonthly: PropTypes.bool.isRequired,
};

export default EarthquakeDetailModalComponent;
