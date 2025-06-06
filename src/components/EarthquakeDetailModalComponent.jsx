import React, { useState, useEffect, useMemo, useCallback } from 'react'; // Added useMemo and useCallback
import PropTypes from 'prop-types';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext'; // Import context
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
 * @param {boolean} props.hasAttemptedMonthlyLoad - Whether monthly data load was attempted. (Removed, from context)
 * @param {boolean} props.isLoadingMonthly - Whether monthly data is currently loading. (Removed, from context)
 * @returns {JSX.Element} The rendered EarthquakeDetailView component configured as a modal.
 */
const EarthquakeDetailModalComponent = () => { // Removed dataSourceTimespanDays from props
    const {
        allEarthquakes,
        earthquakesLast7Days,
        loadMonthlyData, // Renamed from handleLoadMonthlyData for clarity
        hasAttemptedMonthlyLoad,
        isLoadingMonthly
    } = useEarthquakeDataState();

    // Corrected derivation for broaderEarthquakeData:
    const internalBroaderEarthquakeData = useMemo(() => {
        return (hasAttemptedMonthlyLoad && allEarthquakes && allEarthquakes.length > 0) ? allEarthquakes : earthquakesLast7Days;
    }, [hasAttemptedMonthlyLoad, allEarthquakes, earthquakesLast7Days]);

    // New logic for currentDataSourceTimespan
    const currentDataSourceTimespan = useMemo(() => {
        // If an attempt has been made to load monthly data, we are targeting 30 days.
        // Even if it's still loading or failed, the intent was 30 days.
        // If allEarthquakes is also populated, it further confirms 30-day data is active.
        // If no attempt for monthly load, then it's 7 days.
        return hasAttemptedMonthlyLoad ? 30 : 7;
    }, [hasAttemptedMonthlyLoad]);


    const { detailUrlParam } = useParams();
    const navigate = useNavigate();
    const detailUrl = decodeURIComponent(detailUrlParam);
    const [seoProps, setSeoProps] = useState(null); // Renamed from seoData to seoProps

    const handleClose = () => {
        navigate(-1); // Go back to the previous page
    };

    // Callback for when EarthquakeDetailView has loaded data
    const onDataLoadedForSeo = useCallback((data) => {
        // Construct SEO properties as per subtask requirements
        const pageTitle = `M ${data.mag} Earthquake - ${data.place} - ${new Date(data.time).toLocaleDateString()}`;
        const pageDescription = `Detailed information about the M ${data.mag} earthquake that occurred near ${data.place} on ${new Date(data.time).toUTCString()}. Depth: ${data.depth} km.`;
        const pageKeywords = `earthquake, seismic event, M ${data.mag}, ${data.place}, earthquake details, usgs event`;
        const canonicalPageUrl = `https://earthquakeslive.com/quake/${data.detailUrlParam}`;

        const eventLocation = {
            '@type': 'Place',
            name: data.place,
        };

        if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
            eventLocation.geo = {
                '@type': 'GeoCoordinates',
                latitude: data.latitude,
                longitude: data.longitude,
            };
        }

        const eventJsonLd = {
            '@context': 'https://schema.org',
            '@type': 'Event',
            name: pageTitle,
            description: pageDescription,
            startDate: data.time ? new Date(data.time).toISOString() : undefined,
            endDate: data.time ? new Date(data.time).toISOString() : undefined, // Assuming event duration is very short
            location: eventLocation,
            image: data.shakemapIntensityImageUrl || undefined, // Use undefined if not available
            keywords: pageKeywords,
            url: canonicalPageUrl,
            identifier: data.detailUrlParam, // Or full USGS detail URL if preferred
            subjectOf: {
                '@type': 'WebPage',
                url: canonicalPageUrl,
            },
        };

        setSeoProps({
            title: pageTitle,
            description: pageDescription,
            keywords: pageKeywords,
            canonicalUrl: canonicalPageUrl,
            pageUrl: canonicalPageUrl, // Assuming pageUrl is same as canonical for this component
            eventJsonLd: eventJsonLd,
            type: 'article', // As specified
            publishedTime: data.time ? new Date(data.time).toISOString() : undefined,
            modifiedTime: data.updated ? new Date(data.updated).toISOString() : (data.time ? new Date(data.time).toISOString() : undefined),
            imageUrl: data.shakemapIntensityImageUrl || null, // Pass imageUrl for SeoMetadata
        });
    }, [detailUrlParam]); // Added detailUrlParam to dependencies, as it's used in canonicalPageUrl

    // Default/loading SEO values (can be removed or adjusted if SeoMetadata handles null props gracefully)
    const initialPageTitle = "Loading Earthquake Details...";
    const initialPageDescription = "Fetching detailed information for the selected seismic event.";
    const initialKeywords = "earthquake details, seismic event, seismology";
    const initialCanonicalUrl = `https://earthquakeslive.com/quake/${detailUrlParam}`;


    return (
        <>
            {seoProps ? (
                <SeoMetadata
                    title={seoProps.title}
                    description={seoProps.description}
                    keywords={seoProps.keywords}
                    pageUrl={seoProps.pageUrl}
                    canonicalUrl={seoProps.canonicalUrl}
                    locale="en_US" // Assuming en_US, can be made dynamic if needed
                    type={seoProps.type}
                    publishedTime={seoProps.publishedTime}
                    modifiedTime={seoProps.modifiedTime}
                    imageUrl={seoProps.imageUrl}
                    eventJsonLd={seoProps.eventJsonLd}
                />
            ) : (
                // Render basic SEO tags while loading or if seoProps is null
                <SeoMetadata
                    title={initialPageTitle}
                    description={initialPageDescription}
                    keywords={initialKeywords}
                    pageUrl={initialCanonicalUrl}
                    canonicalUrl={initialCanonicalUrl}
                    eventJsonLd={null}
                />
            )}
            <EarthquakeDetailView
                detailUrl={detailUrl}
                onClose={handleClose}
                onDataLoadedForSeo={(data) => onDataLoadedForSeo({ ...data, detailUrlParam })} // Pass detailUrlParam
                broaderEarthquakeData={internalBroaderEarthquakeData}
                dataSourceTimespanDays={currentDataSourceTimespan}
            handleLoadMonthlyData={loadMonthlyData}
            hasAttemptedMonthlyLoad={hasAttemptedMonthlyLoad}
            isLoadingMonthly={isLoadingMonthly}
        />
        </>
    );
};

// PropTypes remain the same as they are mostly for context-derived or route-derived props
// which are not directly passed to EarthquakeDetailModalComponent anymore.

export default EarthquakeDetailModalComponent;
