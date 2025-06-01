import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useParams, useNavigate } from 'react-router-dom';
import EarthquakeDetailView from './EarthquakeDetailView'; // Path relative to src/components/
import SeoMetadata from './SeoMetadata'; // Import SeoMetadata

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
    const [seoData, setSeoData] = useState(null);

    const handleClose = () => {
        navigate(-1); // Go back to the previous page
    };

    const handleSeoDataLoaded = (data) => {
        setSeoData(data);
    };

    // Construct canonical URL for the quake detail page
    const canonicalUrl = `https://earthquakeslive.com/quake/${detailUrlParam}`;

    // Default/loading SEO values
    let pageTitle = "Loading Earthquake Details...";
    let pageDescription = "Fetching detailed information for the selected seismic event.";
    let keywords = "earthquake details, seismic event, seismology";
    let publishedTimeIso = null;
    let modifiedTimeIso = null;
    let imageUrl = null;

    if (seoData) {
        pageTitle = seoData.title ? `${seoData.title} | Earthquake Details` : "Earthquake Details | Seismic Monitor";
        pageDescription = `Detailed information for earthquake: ${seoData.place || 'Unknown Location'}. Magnitude ${seoData.mag || 'N/A'}, Depth ${seoData.depth?.toFixed(1) || 'N/A'} km. Occurred on ${new Date(seoData.time).toUTCString()}.`;
        keywords = `earthquake, ${seoData.place}, M ${seoData.mag}, seismology, earthquake details, ${new Date(seoData.time).getFullYear()}`;
        if (seoData.time) publishedTimeIso = new Date(seoData.time).toISOString();
        if (seoData.updated) modifiedTimeIso = new Date(seoData.updated).toISOString();
        imageUrl = seoData.shakemapIntensityImageUrl || null;
    }


    return (
        <>
            <SeoMetadata
                title={pageTitle}
                description={pageDescription}
                keywords={keywords}
                pageUrl={canonicalUrl}
                canonicalUrl={canonicalUrl}
                locale="en_US"
                type="article"
                publishedTime={publishedTimeIso}
                modifiedTime={modifiedTimeIso}
                imageUrl={imageUrl}
            />
            <EarthquakeDetailView
                detailUrl={detailUrl}
                onClose={handleClose}
                onDataLoadedForSeo={handleSeoDataLoaded} // Pass the callback
                broaderEarthquakeData={broaderEarthquakeData}
            dataSourceTimespanDays={dataSourceTimespanDays}
            handleLoadMonthlyData={handleLoadMonthlyData}
            hasAttemptedMonthlyLoad={hasAttemptedMonthlyLoad}
            isLoadingMonthly={isLoadingMonthly}
        />
        </>
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
