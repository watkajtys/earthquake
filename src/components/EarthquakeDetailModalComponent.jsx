import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
// Remove useNavigate, it will be handled by UIStateContext
import { useParams } from 'react-router-dom';
import EarthquakeDetailView from './EarthquakeDetailView';
import SeoMetadata from './SeoMetadata';
import { useUIState } from '../contexts/UIStateContext.jsx'; // Import useUIState

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
    // navigate is removed
    const { closeDetails } = useUIState(); // Get closeDetails from context

    const detailUrl = decodeURIComponent(detailUrlParam);
    const [seoData, setSeoData] = useState(null);
    const [eventJsonLdData, setEventJsonLdData] = useState(null);

    const handleClose = () => {
        closeDetails(); // Use context function to close (navigate back)
    };

    const handleSeoDataLoaded = (data) => {
        setSeoData(data);
    };

    const canonicalUrl = `https://earthquakeslive.com/quake/${detailUrlParam}`;

    let pageTitle = "Loading Earthquake Details...";
    let pageDescription = "Fetching detailed information for the selected seismic event.";
    let keywords = "earthquake details, seismic event, seismology";

    useEffect(() => {
        if (seoData) {
            const eventData = {
                '@context': 'https://schema.org',
                '@type': 'Event',
                name: seoData.title || `Earthquake: ${seoData.place || 'Unknown Location'}`,
                description: `Magnitude ${seoData.mag || 'N/A'} earthquake reported ${seoData.place ? `near ${seoData.place}` : 'at an unknown location'}. Occurred on ${seoData.time ? new Date(seoData.time).toUTCString() : 'unknown date'}.`,
                startDate: seoData.time ? new Date(seoData.time).toISOString() : null,
                endDate: seoData.time ? new Date(seoData.time).toISOString() : null,
                location: {
                    '@type': 'Place',
                    name: seoData.place || 'Near the epicenter',
                },
                organizer: {
                    '@type': 'Organization',
                    name: 'Global Seismic Activity Monitor (via USGS)',
                },
            };
            if (seoData.latitude != null && seoData.longitude != null) {
                eventData.location.geo = {
                    '@type': 'GeoCoordinates',
                    latitude: seoData.latitude,
                    longitude: seoData.longitude,
                };
                if (seoData.depth != null) {
                    eventData.location.geo.elevation = seoData.depth;
                }
            }
            if (canonicalUrl) {
                eventData.url = canonicalUrl;
            }
            setEventJsonLdData(eventData);
        } else {
            setEventJsonLdData(null);
        }
    }, [seoData, detailUrlParam, canonicalUrl]);

    if (seoData) {
        pageTitle = seoData.title ? `${seoData.title} | Earthquake Details` : "Earthquake Details | Seismic Monitor";
        pageDescription = `Detailed information for earthquake: ${seoData.place || 'Unknown Location'}. Magnitude ${seoData.mag || 'N/A'}, Depth ${seoData.depth?.toFixed(1) || 'N/A'} km. Occurred on ${new Date(seoData.time).toUTCString()}.`;
        keywords = `earthquake, ${seoData.place || 'location'}, M ${seoData.mag || 'magnitude'}, seismology, earthquake details, ${seoData.time ? new Date(seoData.time).getFullYear() : 'year'}`;
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
                publishedTime={seoData?.time ? new Date(seoData.time).toISOString() : null}
                modifiedTime={seoData?.updated ? new Date(seoData.updated).toISOString() : null}
                imageUrl={seoData?.shakemapIntensityImageUrl || null}
                eventJsonLd={eventJsonLdData}
            />
            <EarthquakeDetailView
                detailUrl={detailUrl}
                onClose={handleClose} // handleClose now uses closeDetails from context
                onDataLoadedForSeo={handleSeoDataLoaded}
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
