import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext'; // Import context
import { useLocation, useNavigate } from 'react-router-dom';
import { buildEarthquakePath, modalReturnTarget, parseEarthquakePath } from '../utils/entityRoutes.js';
import RouteDetailStatus from './RouteDetailStatus.jsx';
import EarthquakeDetailView from './EarthquakeDetailView'; // Path relative to src/components/
import SeoMetadata from './SeoMetadata'; // Import SeoMetadata
import defaultEarthquakeLogo from '../assets/default-earthquake-logo.svg'; // Import the new SVG
import { isEarthquakeSitemapEligible } from '../../functions/routes/sitemaps/earthquake-sitemap-eligibility.js';

/**
 * A wrapper component that displays detailed information about a specific earthquake in a modal-like view.
 * It resolves the earthquake's identifier from the raw route pathname,
 * fetches context data using `useEarthquakeDataState` (like available earthquake lists and loading states),
 * and then renders the `EarthquakeDetailView` component.
 *
 * This component is also responsible for generating and setting SEO metadata for the earthquake detail page
 * via the `SeoMetadata` component. It uses data loaded by `EarthquakeDetailView` to create rich SEO content,
 * including JSON-LD for events.
 *
 * Navigation to and from this modal is handled using `useNavigate`.
 * The component takes no direct props, as it derives all necessary information from routing and context.
 *
 * @component
 * @returns {JSX.Element} The EarthquakeDetailModalComponent, which includes SEO metadata and the `EarthquakeDetailView`.
 */
const EarthquakeDetailModalComponent = () => {
    const {
        allEarthquakes,
        earthquakesLast7Days,
        loadMonthlyData, // Renamed from handleLoadMonthlyData for clarity
        hasAttemptedMonthlyLoad,
        isLoadingMonthly,
        monthlyHasLoaded = false,
        monthlyError,
        monthlyLastSuccessfulAtMs,
        monthlySourceGeneratedAtMs,
        weeklySourceGeneratedAtMs
    } = useEarthquakeDataState();

    const monthlyAvailable = monthlyHasLoaded && Array.isArray(allEarthquakes);
    const internalBroaderEarthquakeData = useMemo(() => monthlyAvailable ? allEarthquakes : earthquakesLast7Days,
        [monthlyAvailable, allEarthquakes, earthquakesLast7Days]);
    const currentDataSourceTimespan = monthlyAvailable ? 30 : 7;
    const location = useLocation();
    const navigate = useNavigate();
    const route = parseEarthquakePath(location.pathname);
    const detailUrl = route.ok ? route.detailUrl : null;
    const [seoState, setSeoState] = useState(null);
    const [notFoundRoute, setNotFoundRoute] = useState(null);
    const [serverPrerender, setServerPrerender] = useState(() => {
        const root = document.getElementById('root');
        const path = root?.getAttribute('data-prerendered-earthquake-route');
        const indexable = root?.getAttribute('data-prerendered-earthquake-indexable');
        return path && (indexable === 'true' || indexable === 'false')
            ? { path, indexable: indexable === 'true' } : null;
    });
    const seoProps = seoState?.routeKey === location.pathname ? seoState.props : null;
    const hasServerPrerender = route.ok && serverPrerender?.path === location.pathname;
    useEffect(() => {
        // The marker applies only to this initial, successfully prerendered URL.
        // Remove it so a later SPA navigation cannot reuse it after a remount.
        const root = document.getElementById('root');
        root?.removeAttribute('data-prerendered-earthquake-route');
        root?.removeAttribute('data-prerendered-earthquake-indexable');
    }, []);
    useEffect(() => {
        if (serverPrerender && serverPrerender.path !== location.pathname) setServerPrerender(null);
    }, [serverPrerender, location.pathname]);
    const handleClose = useCallback(() => {
        const target = modalReturnTarget(location.state);
        navigate(target.path, { replace: true, state: target.state });
    }, [navigate, location.state]);

    /**
     * Callback function passed to `EarthquakeDetailView`.
     * It is triggered when `EarthquakeDetailView` successfully loads the detailed earthquake data.
     * This function then uses that data to construct comprehensive SEO properties,
     * including title, description, keywords, canonical URL, and a JSON-LD object for the event.
     * The generated SEO properties are stored in the `seoProps` state variable.
     *
     * @param {Object} loadedData - The full GeoJSON feature object of the loaded earthquake,
     *                              as provided by the USGS detail endpoint. Expected to contain
     *                              `id`, `properties` (with `mag`, `place`, `time`, `updated`, `detail`),
     *                              `geometry.coordinates`, and potentially `shakemapIntensityImageUrl`.
     */
    const onDataLoadedForSeo = useCallback((loadedData) => {
        // The 'loadedData' is expected to be the full JSON response from the USGS detail geojson endpoint
        // It should contain loadedData.id (USGS event ID) and loadedData.properties.detail (USGS event page URL)
        // and loadedData.geometry.coordinates for lat, lon, depth.

        const products = loadedData.properties?.products;
        const hasProduct = (name) => Array.isArray(products?.[name]) && products[name].length > 0;
        const isSignificant = isEarthquakeSitemapEligible({
            id: loadedData.id,
            place: loadedData.properties?.place,
            magnitude: loadedData.properties?.mag,
            has_moment_tensor: hasProduct('moment-tensor'),
            has_focal_mechanism: hasProduct('focal-mechanism'),
        });

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
        const canonicalPageUrl = `https://earthquakeslive.com${buildEarthquakePath(loadedData.id)}`;

        const eventLocation = {
            '@type': 'Place',
            name: place,
            address: place, // Using place directly for address
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
            endDate: time ? new Date(time).toISOString() : undefined, // Added endDate
            eventStatus: 'https://schema.org/EventHappened', // Corrected status
            location: eventLocation,
            image: shakemapIntensityImageUrl || defaultEarthquakeLogo, // Use imported SVG
            keywords: pageKeywords.toLowerCase(),
            url: canonicalPageUrl,
            identifier: usgsEventId, // Using the actual USGS Event ID
            ...(usgsEventPageUrl && { sameAs: usgsEventPageUrl }), // Link to authoritative USGS event page
            organizer: { // Corrected organizer
                '@type': 'Organization',
                name: 'Earthquakes Live',
                url: 'https://earthquakeslive.com'
            }
            // subjectOf is not typically used on Event itself, but on the WebPage about the event.
            // However, canonicalUrl serves a similar purpose for the event's own page.
        };

        setNotFoundRoute(null);
        setSeoState({ routeKey: location.pathname, props: {
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
            noIndex: !isSignificant,
        } });
    }, [location.pathname]);
    const onDetailNotFoundForSeo = useCallback(() => {
        setNotFoundRoute(location.pathname);
    }, [location.pathname]);

    // Default/loading SEO values
    const initialPageTitle = "Loading Earthquake Details... | Earthquakes Live";
    const initialPageDescription = "Fetching detailed information for the selected seismic event.";
    const initialKeywords = "earthquake details, seismic event, seismology, earthquakes live";
    const isMissing = !route.ok || notFoundRoute === location.pathname;


    return (
        <>
            {(!hasServerPrerender || seoProps) && <SeoMetadata
                title={seoProps?.title || (isMissing ? 'Earthquake not found | Earthquakes Live' : initialPageTitle)}
                description={seoProps?.description || (isMissing ? 'This earthquake detail page is unavailable.' : initialPageDescription)}
                keywords={seoProps?.keywords || initialKeywords}
                pageUrl={seoProps?.pageUrl}
                canonicalUrl={seoProps?.canonicalUrl}
                locale="en_US"
                type={seoProps?.type || 'article'}
                publishedTime={seoProps?.publishedTime}
                modifiedTime={seoProps?.modifiedTime}
                imageUrl={seoProps?.imageUrl}
                eventJsonLd={seoProps?.eventJsonLd}
                noIndex={hasServerPrerender ? !serverPrerender.indexable : (seoProps?.noIndex ?? true)}
            />}
            {!route.ok && <RouteDetailStatus title="Earthquake not found" message={route.message} onClose={handleClose} />}
            {detailUrl && (
                <EarthquakeDetailView
                    key={route.eventId}
                    detailUrl={detailUrl}
                    onClose={handleClose}
                    // Note: onDataLoadedForSeo now receives the full GeoJSON feature data
                    // from EarthquakeDetailView, as per the modification in the previous step.
                    onDataLoadedForSeo={onDataLoadedForSeo}
                    onDetailNotFoundForSeo={onDetailNotFoundForSeo}
                    broaderEarthquakeData={internalBroaderEarthquakeData}
                    dataSourceTimespanDays={currentDataSourceTimespan}
                    handleLoadMonthlyData={loadMonthlyData}
                    hasAttemptedMonthlyLoad={hasAttemptedMonthlyLoad}
                    isLoadingMonthly={isLoadingMonthly}
                    monthlyHasLoaded={monthlyHasLoaded}
                    monthlyError={monthlyError}
                    monthlyLastSuccessfulAtMs={monthlyLastSuccessfulAtMs}
                    dataSourceGeneratedAtMs={monthlyAvailable ? monthlySourceGeneratedAtMs : weeklySourceGeneratedAtMs}
                />
            )}
        </>
    );
};

export default EarthquakeDetailModalComponent;
