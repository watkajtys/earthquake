import React, { useState, useEffect, useMemo } from 'react';
// PropTypes removed as props are now primarily from context
import { useParams, useNavigate } from 'react-router-dom';
import { useEarthquakeDataState } from '../context/EarthquakeDataContext.jsx'; // Corrected path
import EarthquakeDetailView from './EarthquakeDetailView';
import SeoMetadata from './SeoMetadata';

// Assuming utils like formatDate, formatTimeAgo are used by EarthquakeDetailView
// and will be passed to it if not directly consumed by it from context/utils.

const EarthquakeDetailModalComponent = () => {
    const { detailUrlParam } = useParams();
    const navigate = useNavigate();
    const detailUrl = decodeURIComponent(detailUrlParam);
    const [seoData, setSeoData] = useState(null); // For SEO metadata based on loaded detail
    const [eventJsonLdData, setEventJsonLdData] = useState(null);

    const {
        allEarthquakes, // For broader context, like nearby events
        earthquakesLast7Days, // Fallback if allEarthquakes isn't loaded
        loadMonthlyData,
        hasAttemptedMonthlyLoad,
        isLoadingMonthly,
        // fetchDataCb could be used if this component was responsible for fetching
        // but assuming EarthquakeDetailView fetches its own data using detailUrl
    } = useEarthquakeDataState();

    const currentBroaderData = useMemo(() => {
        return (allEarthquakes && allEarthquakes.length > 0) ? allEarthquakes : earthquakesLast7Days;
    }, [allEarthquakes, earthquakesLast7Days]);

    // dataSourceTimespanDays can be derived or set to a default if needed by EarthquakeDetailView
    const dataSourceTimespanDays = useMemo(() => {
        return (allEarthquakes && allEarthquakes.length > 0) ? 30 : 7;
    }, [allEarthquakes]);

    const handleClose = () => {
        navigate(-1); // Go back to the previous page
    };

    const handleSeoDataLoaded = (data) => {
        setSeoData(data); // This callback is passed to EarthquakeDetailView
    };

    const canonicalUrl = `https://earthquakeslive.com/quake/${detailUrlParam}`; // Ensure this matches your domain

    // Default/loading SEO values
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
            if (canonicalUrl) eventData.url = canonicalUrl;
            setEventJsonLdData(eventData);
        } else {
            setEventJsonLdData(null);
        }
    }, [seoData, canonicalUrl]);


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
                detailUrl={detailUrl} // This is the primary prop for fetching specific detail
                onClose={handleClose}
                onDataLoadedForSeo={handleSeoDataLoaded}
                // Pass context-derived data that EarthquakeDetailView might need
                broaderEarthquakeData={currentBroaderData}
                dataSourceTimespanDays={dataSourceTimespanDays}
                handleLoadMonthlyData={loadMonthlyData} // From context
                hasAttemptedMonthlyLoad={hasAttemptedMonthlyLoad} // From context
                isLoadingMonthly={isLoadingMonthly} // From context
            />
        </>
    );
};

// PropTypes removed as most props are now from context

export default EarthquakeDetailModalComponent;
