import React, { useState, useMemo, useCallback } from 'react'; // Added useMemo and useCallback
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
    const onDataLoadedForSeo = useCallback((loadedData) => {
        // The 'loadedData' is expected to be the full JSON response from the USGS detail geojson endpoint
        // It should contain loadedData.id (USGS event ID) and loadedData.properties.detail (USGS event page URL)
        // and loadedData.geometry.coordinates for lat, lon, depth.

        const props = loadedData.properties;
        const geom = loadedData.geometry;
        const mag = props?.mag;
        const place = props?.place;
        const time = props?.time;
        const updated = props?.updated;
        const depth = geom?.coordinates?.[2];
        const latitude = geom?.coordinates?.[1];
        const longitude = geom?.coordinates?.[0];
        const usgsEventId = loadedData.id; // e.g. "ci12345"
        const usgsEventPageUrl = props?.detail; // URL to the USGS event page
        const shakemapIntensityImageUrl = loadedData.shakemapIntensityImageUrl; // This was passed through from EarthquakeDetailView's onDataLoadedForSeo

        const titleDate = time ? new Date(time).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'}) : 'Date Unknown';
        const pageTitle = `M ${mag} Earthquake - ${place} - ${titleDate} | Earthquakes Live`;

        const descriptionTime = time ? new Date(time).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', timeZone: 'UTC'}) : 'Time Unknown';
        const pageDescription = `Detailed report of the M ${mag} earthquake that struck near ${place} on ${titleDate} at ${descriptionTime} (UTC). Magnitude: ${mag}, Depth: ${depth} km. Location: ${latitude?.toFixed(2)}, ${longitude?.toFixed(2)}. Stay updated with Earthquakes Live.`;

        const pageKeywords = `earthquake, seismic event, M ${mag}, ${place ? place.split(', ').join(', ') : ''}, earthquake details, usgs event, ${usgsEventId}`;
        const canonicalPageUrl = `https://earthquakeslive.com/quake/${detailUrlParam}`; // detailUrlParam is from useParams()

        const eventLocation = {
            '@type': 'Place',
            name: place,
        };

        if (typeof latitude === 'number' && typeof longitude === 'number') {
            eventLocation.geo = {
                '@type': 'GeoCoordinates',
                latitude: latitude,
                longitude: longitude,
                ...(typeof depth === 'number' && { "elevation": -depth * 1000 }) // Negative depth in meters
            };
        }

        const eventJsonLd = {
            '@context': 'https://schema.org',
            '@type': 'Event', // Could be "EarthquakeEvent" if widely supported, "Event" is safer
            name: `M ${mag} - ${place}`, // Shorter name for JSON-LD
            description: pageDescription,
            startDate: time ? new Date(time).toISOString() : undefined,
            // endDate: time ? new Date(time).toISOString() : undefined, // For earthquakes, startDate is usually sufficient
            location: eventLocation,
            image: shakemapIntensityImageUrl || undefined,
            keywords: pageKeywords.toLowerCase(),
            url: canonicalPageUrl,
            identifier: usgsEventId, // Using the actual USGS Event ID
            ...(usgsEventPageUrl && { sameAs: usgsEventPageUrl }), // Link to authoritative USGS event page
            // subjectOf is not typically used on Event itself, but on the WebPage about the event.
            // However, canonicalUrl serves a similar purpose for the event's own page.
        };

        setSeoProps({
            title: pageTitle, // Use the more descriptive pageTitle for the HTML title tag
            description: pageDescription,
            keywords: pageKeywords,
            canonicalUrl: canonicalPageUrl,
            pageUrl: canonicalPageUrl,
            eventJsonLd: eventJsonLd,
            type: 'article',
            publishedTime: time ? new Date(time).toISOString() : undefined,
            modifiedTime: updated ? new Date(updated).toISOString() : (time ? new Date(time).toISOString() : undefined),
            imageUrl: shakemapIntensityImageUrl || null,
        });
    }, [detailUrlParam]);

    // Default/loading SEO values
    const initialPageTitle = "Loading Earthquake Details... | Earthquakes Live";
    const initialPageDescription = "Fetching detailed information for the selected seismic event.";
    const initialKeywords = "earthquake details, seismic event, seismology, earthquakes live";
    // detailUrlParam might be undefined on initial render if component loads before router is fully ready.
    const initialCanonicalUrl = detailUrlParam ? `https://earthquakeslive.com/quake/${detailUrlParam}` : "https://earthquakeslive.com";


    return (
        <>
            <SeoMetadata
                title={seoProps?.title || initialPageTitle}
                description={seoProps?.description || initialPageDescription}
                keywords={seoProps?.keywords || initialKeywords}
                pageUrl={seoProps?.pageUrl || initialCanonicalUrl}
                canonicalUrl={seoProps?.canonicalUrl || initialCanonicalUrl}
                locale="en_US"
                type={seoProps?.type || 'article'}
                publishedTime={seoProps?.publishedTime}
                modifiedTime={seoProps?.modifiedTime}
                imageUrl={seoProps?.imageUrl}
                eventJsonLd={seoProps?.eventJsonLd}
            />
            {detailUrl && ( // Only render EarthquakeDetailView if detailUrl is available
                <EarthquakeDetailView
                    detailUrl={detailUrl}
                    onClose={handleClose}
                    // Note: onDataLoadedForSeo now receives the full GeoJSON feature data
                    // from EarthquakeDetailView, as per the modification in the previous step.
                    onDataLoadedForSeo={onDataLoadedForSeo}
                    broaderEarthquakeData={internalBroaderEarthquakeData}
                    dataSourceTimespanDays={currentDataSourceTimespan}
                    handleLoadMonthlyData={loadMonthlyData}
                    hasAttemptedMonthlyLoad={hasAttemptedMonthlyLoad}
                    isLoadingMonthly={isLoadingMonthly}
                />
            )}
        </>
    );
};

// PropTypes remain the same as they are mostly for context-derived or route-derived props
// which are not directly passed to EarthquakeDetailModalComponent anymore.

export default EarthquakeDetailModalComponent;
