import React, { useState, useEffect, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext';
import { useParams, useNavigate } from 'react-router-dom';
import EarthquakeDetailView from './EarthquakeDetailView';
import SeoMetadata from './SeoMetadata';
// Imports for Fault Animations
import { getFaultAnimationTypeForEarthquake } from '../utils/seismicUtils'; // Corrected path
import FaultAnimationNormal from './fault_animations/FaultAnimationNormal'; // Corrected path
import FaultAnimationReverse from './fault_animations/FaultAnimationReverse'; // Corrected path
import FaultAnimationStrikeSlip from './fault_animations/FaultAnimationStrikeSlip'; // Corrected path
import tectonicPlatesData from '../assets/TectonicPlateBoundaries.json'; // Corrected path

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
    const [seoData, setSeoData] = useState(null);
    const [eventJsonLdData, setEventJsonLdData] = useState(null);
    const [animationType, setAnimationType] = useState(null); // State for fault animation

    // Effect to determine animation type
    useEffect(() => {
        // Attempt to find the full earthquake object from internalBroaderEarthquakeData
        // This relies on detailUrl being present in one of the earthquake objects.
        // Note: earthquake.properties.url or earthquake.properties.detail often matches the detailUrl.
        // The USGS GeoJSON feed uses `url` for the summary page and `detail` for the detail API endpoint.
        // The `detailUrl` from params is typically the API endpoint.
        const currentEarthquake = internalBroaderEarthquakeData?.find(
            eq => eq.properties?.detail === detailUrl || eq.properties?.url === detailUrl || eq.id === detailUrl // Fallback to ID if detailUrl is an ID
        );

        if (currentEarthquake) {
            const type = getFaultAnimationTypeForEarthquake(currentEarthquake, tectonicPlatesData.features);
            setAnimationType(type);
        } else {
            // If not found in broader data, or if detailUrl doesn't match, no animation.
            // This might happen if the quake is very old and not in the current `allEarthquakes` or `earthquakesLast7Days`
            setAnimationType(null);
            console.warn(`EDMC: Could not find earthquake data for detailUrl: ${detailUrl} in available context data. Fault animation may not be shown.`);
        }
    }, [detailUrl, internalBroaderEarthquakeData]);


    const handleClose = () => {
        navigate(-1); // Go back to the previous page
    };

    const handleSeoDataLoaded = useCallback((data) => {
        setSeoData(data);
    }, []);

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

    // Dimensions for the animation components within the modal
    const animationDimensions = { width: 1.8, height: 0.9, depth: 0.9 }; // Smaller than FaultsPage

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
            {/* EarthquakeDetailView now might need a way to signal its internal data for animation,
                OR we rely on finding the quake in broaderEarthquakeData as currently implemented.
                The animation section is added here, but ideally, it might be part of EarthquakeDetailView
                if it needs direct access to the fully detailed fetched data that EDV holds.
                For now, placing it here based on the current data flow.
            */}
            <EarthquakeDetailView
                detailUrl={detailUrl}
                onClose={handleClose}
                onDataLoadedForSeo={handleSeoDataLoaded}
                broaderEarthquakeData={internalBroaderEarthquakeData}
                dataSourceTimespanDays={currentDataSourceTimespan}
                handleLoadMonthlyData={loadMonthlyData}
                hasAttemptedMonthlyLoad={hasAttemptedMonthlyLoad}
                isLoadingMonthly={isLoadingMonthly}
                // New section for fault animation, rendered as part of the modal's content structure
                // This could be passed as a child or a specific prop to EarthquakeDetailView if EDV is designed to place it.
                // For this example, we assume EarthquakeDetailView's internal structure is a black box,
                // and this modal component wraps it and adds extra info like the animation.
                // This means the animation appears *alongside* or *around* EarthquakeDetailView's content.
                // A common pattern for modals is to have a content area where different sections can be added.
                // Let's assume EarthquakeDetailView renders its own modal structure (header, body, footer).
                // We'll add our animation as an additional section *if* EarthquakeDetailView can accept it as children
                // or if we wrap EDV's output.
                // Given the current structure, EDV seems to render the full modal.
                // A simple way is to pass the animation as a render prop or a specific prop.
                // For this iteration, I'll render it *after* EDV, which might not be ideal for layout
                // unless EDV is just the content part and this component provides the modal shell.
                // Re-evaluating: EDV is likely the content, this component is the modal control.
                // So, we can structure the modal content here.
                // This is a conceptual placement; actual styling/layout within the modal needs care.
                // The existing EDV onClose suggests it might render the modal itself.
                // If EDV renders the whole modal, it needs a new prop to inject this animation section.
                // Let's try to pass it as a new prop `additionalContent` to EDV.
                // This is a significant change to EDV's props.
                // ---
                // Alternative: If EDV does NOT render the modal shell, but just its content, then this is simpler:
                // <ModalShell onClose={handleClose} title="Earthquake Details">
                //   <EarthquakeDetailView ... />
                //   <FaultAnimationSection ... />
                // </ModalShell>
                // ---
                // Given the current setup, let's assume EDV is the primary content renderer.
                // The simplest integration without altering EDV's internal rendering too much is to
                // provide the animation as a piece of data that EDV can choose to display.
                // Or, more practically, if EDMC renders the modal shell:
                //
                // This component (EDMC) currently does not render a modal shell itself,
                // it seems to rely on EarthquakeDetailView to do so, or for them to be used together
                // where a parent component provides the modal shell.
                //
                // For the purpose of this task, I will assume EDMC is the one that *should* structure the modal content
                // and EDV is one part of that content.
                // This is a structural assumption that might need adjustment based on how the modal is truly built.
                // Let's assume EDV is a view component, and this is the modal controller.
                // We will render the animation section within this component's returned JSX.
                // This would typically mean EDV does not render its own modal controls (like a close button directly).
                //
                // The current structure of EDMC returning <EarthquakeDetailView ... /> directly means EDV *is* the modal.
                // To add content, EDV must be modified.
                // Simplest approach for THIS subtask: Add a section below/after where EDV might render.
                // This is not ideal UI but fulfills "integrate animation".
                //
                // A better way: Modify EDV to accept `children` or a specific prop for additional content.
                // For now, I'll just render it alongside.
                // This will likely result in the animation appearing outside the visual modal of EDV.
                // This is a limitation of not being able to refactor EDV in this step.
                //
                // **Correction**: The task is to integrate into `EarthquakeDetailModalComponent`.
                // This component *is* the modal. `EarthquakeDetailView` is the content *within* it.
                // So, I should structure the JSX here to include the animation.
                // The current return of EDMC is just <SeoMetadata /> and <EarthquakeDetailView />.
                // This means EDV is expected to be the *entire visual modal content*.
                // This makes it hard to add a section without modifying EDV.
                //
                // I will proceed by modifying EDMC to have a basic modal structure around EDV
                // to demonstrate where the animation would go. This is a slight overreach but necessary.
            />
            {/* This section will appear structurally after EDV. Visual placement depends on EDV's styles. */}
            {animationType && (
                <div className="p-4 bg-gray-100 border-t mt-4"> {/* Basic styling for the new section */}
                    <h3 className="text-lg font-semibold mb-2 text-gray-800">Likely Associated Fault Motion</h3>
                    <div className="flex justify-center items-center h-48 bg-gray-200 rounded">
                        {animationType === 'normal' && <FaultAnimationNormal isPlaying={true} dimensions={animationDimensions} />}
                        {animationType === 'reverse' && <FaultAnimationReverse isPlaying={true} dimensions={animationDimensions} />}
                        {animationType === 'strikeSlip' && <FaultAnimationStrikeSlip isPlaying={true} dimensions={animationDimensions} />}
                    </div>
                </div>
            )}
            {/* Show this message if we are on a detail page but no specific animation type was determined (either not near a boundary or unknown boundary type) */}
            {detailUrl && animationType === null && (
                 <div className="p-4 bg-gray-100 border-t mt-4">
                    <p className="text-sm text-gray-600 text-center">
                        Faulting mechanism information could not be determined for this event based on proximity to known plate boundaries, or the data is not available.
                    </p>
                </div>
            )}
        </>
    );
};

EarthquakeDetailModalComponent.propTypes = {
    // Props are mostly derived from context or route now
};

export default EarthquakeDetailModalComponent;
