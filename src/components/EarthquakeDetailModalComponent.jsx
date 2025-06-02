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
    const [eventJsonLdData, setEventJsonLdData] = useState(null);

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
    // imageUrl is already defined or null from seoData later
    // let publishedTimeIso = null; // these will be derived from seoData
    // let modifiedTimeIso = null;

    // Effect to construct Event JSON-LD
    useEffect(() => {
        if (seoData) {
            const eventData = {
                '@context': 'https://schema.org',
                '@type': 'Event',
                name: seoData.title || `Earthquake: ${seoData.place || 'Unknown Location'}`,
                description: `Magnitude ${seoData.mag || 'N/A'} earthquake reported ${seoData.place ? `near ${seoData.place}` : 'at an unknown location'}. Occurred on ${seoData.time ? new Date(seoData.time).toUTCString() : 'unknown date'}.`,
                startDate: seoData.time ? new Date(seoData.time).toISOString() : null,
                // endDate can be same as startDate for instantaneous events like earthquakes
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

            // Add GeoCoordinates if latitude, longitude, and depth are available
            if (seoData.latitude != null && seoData.longitude != null) {
                eventData.location.geo = {
                    '@type': 'GeoCoordinates',
                    latitude: seoData.latitude,
                    longitude: seoData.longitude,
                };
                // Add elevation (depth) if available. Using positive value as depth.
                // Schema.org's elevation is distance from sea level.
                // If depth is distance *below* sea level, it should ideally be negative.
                // For now, using the direct depth value.
                if (seoData.depth != null) {
                    eventData.location.geo.elevation = seoData.depth;
                }
            }

            // If there's a specific event page URL (canonicalUrl)
            if (canonicalUrl) {
                eventData.url = canonicalUrl;
            }

            setEventJsonLdData(eventData);
        } else {
            setEventJsonLdData(null);
        }
    }, [seoData, detailUrlParam, canonicalUrl]); // detailUrlParam and canonicalUrl ensure it updates if the route changes


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
