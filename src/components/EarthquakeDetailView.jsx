
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import RegionalSeismicityChart from './RegionalSeismicityChart';
import SimplifiedDepthProfile from './SimplifiedDepthProfile';
import InfoSnippet                                          from "./InfoSnippet.jsx";
import EarthquakeMap from './EarthquakeMap'; // Import the EarthquakeMap component
import { calculateDistance } from '../../common/mathUtils.js'; // isValidNumber import removed, calculateDistance moved
// getBeachballPathsAndType is imported by EarthquakeBeachballPanel directly

// Define REGIONAL_RADIUS_KM
const REGIONAL_RADIUS_KM = 804.672; // 500 miles

// Helper Functions
// MOVED to src/utils/detailViewUtils.js
import SkeletonText from './skeletons/SkeletonText.jsx';
import SkeletonBlock from './skeletons/SkeletonBlock.jsx';

import ErrorBoundary from './ErrorBoundary'; // Assuming ErrorBoundary.jsx is in the same components folder
// earthquakeDetail/* panel imports are correct and extensive, listed below.
import EarthquakeDetailHeader from './earthquakeDetail/EarthquakeDetailHeader';
import EarthquakeSnapshotPanel from './earthquakeDetail/EarthquakeSnapshotPanel';
import EarthquakeRegionalMapPanel from './earthquakeDetail/EarthquakeRegionalMapPanel';
import EarthquakeEnergyPanel from './earthquakeDetail/EarthquakeEnergyPanel';
import EarthquakeRegionalSeismicityPanel from './earthquakeDetail/EarthquakeRegionalSeismicityPanel';
import EarthquakeDepthProfilePanel from './earthquakeDetail/EarthquakeDepthProfilePanel';
import EarthquakeSeismicWavesPanel from './earthquakeDetail/EarthquakeSeismicWavesPanel';
import EarthquakeLocationPanel from './earthquakeDetail/EarthquakeLocationPanel';
import EarthquakeImpactPanel from './earthquakeDetail/EarthquakeImpactPanel';
import EarthquakeCitizenSciencePanel from './earthquakeDetail/EarthquakeCitizenSciencePanel';
import EarthquakeFaultDiagramPanel from './earthquakeDetail/EarthquakeFaultDiagramPanel';
import EarthquakeFaultParamsPanel from './earthquakeDetail/EarthquakeFaultParamsPanel';
import EarthquakeMwwPanel from './earthquakeDetail/EarthquakeMwwPanel';
import EarthquakeMagnitudeComparisonPanel from './earthquakeDetail/EarthquakeMagnitudeComparisonPanel';
import EarthquakeStressAxesPanel from './earthquakeDetail/EarthquakeStressAxesPanel';
import EarthquakeBeachballPanel from './earthquakeDetail/EarthquakeBeachballPanel';
import EarthquakeFurtherInfoPanel from './earthquakeDetail/EarthquakeFurtherInfoPanel';

/**
 * Orchestrates the display of comprehensive details for a single earthquake event.
 * This component fetches detailed data for a specific earthquake from a provided USGS GeoJSON URL.
 * It then processes this data and passes relevant pieces to a collection of specialized child panel components,
 * each responsible for visualizing a particular aspect of the earthquake (e.g., location, energy, regional seismicity, fault mechanics).
 *
 * Key responsibilities include:
 * - Fetching and managing the state of detailed earthquake data (`detailUrl`).
 * - Handling loading and error states during data fetching.
 * - Invoking `onDataLoadedForSeo` callback with key event details for SEO purposes.
 * - Triggering `handleLoadMonthlyData` if necessary for broader regional context.
 * - Implementing accessibility features like focus trapping within the modal and an Escape key listener for closing.
 * - Utilizing `useMemo` and `useCallback` extensively to optimize performance due to the complexity and number of derived calculations.
 * - Wrapping its content in an `ErrorBoundary` to gracefully handle potential rendering errors in child components.
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {string} props.detailUrl - The URL to fetch the detailed earthquake GeoJSON data from (typically a USGS endpoint).
 * @param {function} props.onClose - Callback function invoked when the detail view should be closed (e.g., by user action).
 * @param {function} [props.onDataLoadedForSeo] - Optional callback function. It's called with the fully loaded GeoJSON data
 *   (specifically an object containing `id`, `properties`, `geometry`, and `shakemapIntensityImageUrl`) of the earthquake
 *   once it's successfully fetched. This allows parent components to update SEO metadata.
 * @param {Array<Object>} props.broaderEarthquakeData - An array of earthquake objects (USGS GeoJSON feature structure)
 *   representing a broader dataset (e.g., last 7 or 30 days) for contextual information, primarily used by the regional seismicity panel.
 * @param {number} props.dataSourceTimespanDays - The timespan (e.g., 7 or 30) corresponding to `broaderEarthquakeData`,
 *   providing context for components like the regional seismicity chart.
 * @param {function} [props.handleLoadMonthlyData] - Optional callback to request loading of more extensive (e.g., monthly)
 *   earthquake data if it hasn't been loaded or attempted yet. This is often used to enrich regional context.
 * @param {boolean} [props.hasAttemptedMonthlyLoad] - Flag indicating if an attempt to load monthly data has already been made.
 * @param {boolean} [props.isLoadingMonthly] - Flag indicating if monthly data is currently being loaded.
 * @returns {JSX.Element} The EarthquakeDetailView component, typically rendered within a modal structure.
 */
function EarthquakeDetailView({ detailUrl, onClose, onDataLoadedForSeo, broaderEarthquakeData, dataSourceTimespanDays, handleLoadMonthlyData, hasAttemptedMonthlyLoad, isLoadingMonthly }) {
    const [detailData, setDetailData] = useState(null);
    const [isLoading, setIsLoading] = useState(!!detailUrl);
    const [error, setError] = useState(null);
    const [selectedFaultPlaneKey, setSelectedFaultPlaneKey] = useState('np1');
    const modalContentRef = React.useRef(null); // Ref for the modal content div
    const closeButtonRef = React.useRef(null); // Ref for the close button

    // Handle Escape key press for closing the modal & Focus Trapping
    useEffect(() => {
        const modalElement = modalContentRef.current;
        if (!modalElement) return;

        const focusableElements = modalElement.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        // Focus the first focusable element (likely the close button) when modal opens
        if (closeButtonRef.current) {
            closeButtonRef.current.focus();
        } else if (firstElement) {
            firstElement.focus();
        }

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose();
                return; // Return early after closing
            }

            if (event.key === 'Tab') {
                if (event.shiftKey) { // Shift + Tab
                    if (document.activeElement === firstElement || document.activeElement === modalElement) { // also check if modalElement itself is focused (e.g. if no focusable elements initially)
                        lastElement.focus();
                        event.preventDefault();
                    }
                } else { // Tab
                    if (document.activeElement === lastElement) {
                        firstElement.focus();
                        event.preventDefault();
                    }
                }
            }
        };

        // Add keydown listener to the modal itself for tab trapping.
        // Document listener for Escape is kept in case focus is somehow outside the modal initially.
        modalElement.addEventListener('keydown', handleKeyDown);

        // Cleanup function
        return () => {
            modalElement.removeEventListener('keydown', handleKeyDown);
            // The global escape listener is cleaned up by its own useEffect
        };
    }, [onClose]); // Dependencies for focus trapping and escape key

    // Separate useEffect for escape key to ensure it's always available even if modalContentRef isn't ready
    useEffect(() => {
        const handleGlobalEscape = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleGlobalEscape);
        return () => {
            document.removeEventListener('keydown', handleGlobalEscape);
        };
    }, [onClose]);


    useEffect(() => {
        // Check if monthly data has not been attempted to load yet and is not currently loading
        if (hasAttemptedMonthlyLoad === false && isLoadingMonthly === false && typeof handleLoadMonthlyData === 'function') {
            console.log('EarthquakeDetailView: Triggering monthly data load.');
            handleLoadMonthlyData();
        }
    }, [detailUrl, hasAttemptedMonthlyLoad, isLoadingMonthly]); // Dependencies for the effect - handleLoadMonthlyData REMOVED

    useEffect(() => {
        if (!detailUrl) {
            setIsLoading(false);
            setDetailData(null);
            setError(null);
            return;
        }

        let event_id = null;
        try {
            // Example detailUrl: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/nc73649170.geojson"
            const urlObject = new URL(detailUrl); // Use URL constructor for robust parsing
            const pathSegments = urlObject.pathname.split('/');
            const fileName = pathSegments.pop(); // Get the last segment, e.g., 'nc73649170.geojson'

            if (fileName && fileName.endsWith('.geojson')) {
                event_id = fileName.substring(0, fileName.length - '.geojson'.length);
            }
        } catch (e) {
            console.error('Error parsing detailUrl to get event_id:', detailUrl, e);
            setError('Invalid earthquake detail URL format.');
            setIsLoading(false);
            setDetailData(null); // Clear any potentially stale data
            return;
        }

        if (!event_id) {
            console.error('Could not determine earthquake ID from URL:', detailUrl);
            setError('Could not determine earthquake ID from URL.');
            setIsLoading(false);
            setDetailData(null); // Clear any potentially stale data
            return;
        }

        let isMounted = true;
        const fetchDetail = async () => {
            setIsLoading(true);
            setError(null);
            setDetailData(null);
            try {
                // Use the new API endpoint
                const response = await fetch(`/api/earthquake/${event_id}`);
                if (!response.ok) {
                    // Try to parse error response from API, otherwise use statusText
                    let errorData;
                    try {
                        errorData = await response.json();
                    // eslint-disable-next-line no-unused-vars
                    } catch (_parseError) { // Prefixed with underscore
                        // If parsing JSON fails, use statusText
                        errorData = { message: response.statusText };
                    }
                    throw new Error(`Application API error! Status: ${response.status}. Message: ${errorData.message || "Failed to fetch"}`);
                }
                const data = await response.json();
                if (isMounted) {
                    setDetailData(data);
                    if (onDataLoadedForSeo && data) {
                        const shakemapProduct = data.properties?.products?.shakemap?.[0];
                        const shakemapIntensityImageUrl = shakemapProduct?.contents?.['download/intensity.jpg']?.url;
                        onDataLoadedForSeo({
                            id: data.id,
                            properties: data.properties,
                            geometry: data.geometry,
                            shakemapIntensityImageUrl: shakemapIntensityImageUrl
                        });
                    }
                }
            } catch (e) {
                console.error("Failed to fetch detail data from application API:", e);
                if (isMounted) setError(`Failed to load details from application API: ${e.message}`);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchDetail();

        return () => {
            isMounted = false;
        };
    }, [detailUrl, onDataLoadedForSeo]);

    // New useEffect for investigating phase-data
    useEffect(() => {
        if (detailData && detailData.properties && detailData.properties.products) {
            const phaseDataProduct = detailData.properties.products['phase-data'];
            if (phaseDataProduct && Array.isArray(phaseDataProduct) && phaseDataProduct.length > 0) {
                console.log("Phase Data Product (first element):", phaseDataProduct[0]);
                if (phaseDataProduct[0].contents) {
                    console.log("Phase Data Contents:", phaseDataProduct[0].contents);
                } else {
                    console.log("No 'contents' found in phaseDataProduct[0].");
                }
                if (phaseDataProduct[0].properties) {
                    console.log("Phase Data Properties:", phaseDataProduct[0].properties);
                } else {
                    console.log("No 'properties' found in phaseDataProduct[0].");
                }
            } else {
                console.log("No 'phase-data' product found or it's empty in detailData.");
            }
        } else {
            // This else block might be noisy if detailData is often null initially.
            // console.log("'detailData', 'detailData.properties', or 'detailData.properties.products' is null/undefined.");
        }
    }, [detailData]); // Dependency: run when detailData changes

    const properties = useMemo(() => detailData?.properties, [detailData]);
    const geometry = useMemo(() => detailData?.geometry, [detailData]);
    const products = useMemo(() => properties?.products, [properties]);

    const getProduct = useCallback((type) => products?.[type]?.[0], [products]);

    const originProductProps = useMemo(() => getProduct('origin')?.properties, [getProduct]);
    const momentTensorProductProps = useMemo(() => getProduct('moment-tensor')?.properties, [getProduct]);
    const shakemapProduct = useMemo(() => getProduct('shakemap'), [getProduct]);
    const shakemapProductProps = useMemo(() => shakemapProduct?.properties, [shakemapProduct]);
    const losspagerProductProps = useMemo(() => getProduct('losspager')?.properties, [getProduct]);

    const mainQuakeLat = useMemo(() => geometry?.coordinates?.[1], [geometry]);
    const mainQuakeLon = useMemo(() => geometry?.coordinates?.[0], [geometry]);
    const mainQuakeId = useMemo(() => detailData?.id, [detailData]);

    const regionalQuakes = useMemo(() => {
        if (!broaderEarthquakeData || typeof mainQuakeLat !== 'number' || typeof mainQuakeLon !== 'number' || !mainQuakeId) {
            return [];
        }
        return broaderEarthquakeData.filter(quake => {
            const qLat = quake?.geometry?.coordinates?.[1];
            const qLon = quake?.geometry?.coordinates?.[0];

            if (quake.id === mainQuakeId || typeof qLat !== 'number' || typeof qLon !== 'number') {
                return false;
            }
            const distance = calculateDistance(mainQuakeLat, mainQuakeLon, qLat, qLon);
            return distance <= REGIONAL_RADIUS_KM;
        });
    }, [broaderEarthquakeData, mainQuakeLat, mainQuakeLon, mainQuakeId]);

    // These values can be NaN if source data is missing/invalid. This is expected.
    // Conditional rendering will handle whether to display them or not.
    const np1Data = useMemo(() => ({
        strike: parseFloat(momentTensorProductProps?.['nodal-plane-1-strike']),
        dip: parseFloat(momentTensorProductProps?.['nodal-plane-1-dip']),
        rake: parseFloat(momentTensorProductProps?.['nodal-plane-1-rake']),
        description: momentTensorProductProps?.['nodal-plane-1-description'] || `Nodal Plane 1 (NP1) suggests a fault orientation and slip.` // Assuming description can be a string
    }), [momentTensorProductProps]);

    const np2Data = useMemo(() => ({
        strike: parseFloat(momentTensorProductProps?.['nodal-plane-2-strike']),
        dip: parseFloat(momentTensorProductProps?.['nodal-plane-2-dip']),
        rake: parseFloat(momentTensorProductProps?.['nodal-plane-2-rake']),
        description: momentTensorProductProps?.['nodal-plane-2-description'] || `Nodal Plane 2 (NP2) is the alternative fault orientation and slip.`
    }), [momentTensorProductProps]);

    const selectedFaultPlane = useMemo(() => {
        const data = selectedFaultPlaneKey === 'np1' ? np1Data : np2Data;
        // Ensure selectedFaultPlane has valid numbers or they remain NaN for checks later
        return {
            strike: data.strike,
            dip: data.dip,
            rake: data.rake,
            description: data.description
        };
    }, [selectedFaultPlaneKey, np1Data, np2Data]);


    const pAxis = useMemo(() => ({
        azimuth: parseFloat(momentTensorProductProps?.['p-axis-azimuth']),
        plunge: parseFloat(momentTensorProductProps?.['p-axis-plunge'])
    }), [momentTensorProductProps]);
    const tAxis = useMemo(() => ({
        azimuth: parseFloat(momentTensorProductProps?.['t-axis-azimuth']),
        plunge: parseFloat(momentTensorProductProps?.['t-axis-plunge'])
    }), [momentTensorProductProps]);

    const shakemapIntensityImageUrl = useMemo(() => shakemapProduct?.contents?.['download/intensity.jpg']?.url, [shakemapProduct]);

    const scalarMomentValue = useMemo(() => parseFloat(momentTensorProductProps?.['scalar-moment']), [momentTensorProductProps]);
    // energyJoules will be NaN if scalarMomentValue is NaN.
    const energyJoules = scalarMomentValue;

    // MOVED: InteractiveFaultDiagram component definition was here

    if (isLoading) return ( <div data-testid="loading-skeleton-container" className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4"><div className="bg-white p-8 rounded-lg max-w-3xl w-full animate-pulse"><SkeletonText width="w-3/4" height="h-8 mb-6 mx-auto" /><SkeletonBlock height="h-40 mb-4" /><SkeletonBlock height="h-64" /></div></div> );
    if (error) return ( <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4"><div className="bg-white p-6 rounded-lg max-w-xl w-full text-center shadow-xl"><h3 className="text-xl font-semibold text-red-600 mb-4">Error Loading Details</h3><p className="text-slate-700 mb-6">{error}</p><button onClick={onClose} className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded transition-colors duration-150">Close</button></div></div> );
    if (!detailData || !properties) return ( <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4"><div className="bg-white p-6 rounded-lg max-w-xl w-full text-center shadow-xl"><h3 className="text-xl font-semibold text-slate-700 mb-4">Details Not Available</h3><p className="text-slate-600 mb-6">Could not retrieve or parse details.</p><button onClick={onClose} className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded transition-colors duration-150">Close</button></div></div> );

    const exhibitPanelClass = "bg-white rounded-xl p-3 md:p-4 shadow border-l-4";
    const exhibitTitleClass = "text-lg md:text-xl font-bold mb-3 pb-1 border-b";
    const highlightClass = "font-semibold text-blue-600";
    const captionClass = "text-xs text-center text-slate-500 mt-2";
    const diagramContainerClass = "bg-gray-50 p-2 rounded-md flex justify-center items-center my-3";

    // Pre-calculate resolved values for easier conditional checking in ShakeMap/PAGER panel
    const mmiValue = shakemapProductProps?.['maxmmi-grid'] ?? properties?.mmi;
    const pagerAlertValue = losspagerProductProps?.alertlevel ?? properties?.alert;

    // Extract eventTime and eventDepth for SeismicWavesPanel
    const eventTime = properties?.time; // Timestamp
    const eventDepth = geometry?.coordinates?.[2]; // Depth in km

    return (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
            className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-start z-[55] p-2 sm:p-4 pt-10 md:pt-16"
            onClick={(e) => { if (e.target === e.currentTarget) { onClose(); } }}
            onKeyDown={(e) => { if (e.key === 'Escape') { onClose(); e.stopPropagation(); } }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="earthquake-detail-title"
            tabIndex="-1"
        >
            <ErrorBoundary> {/* ErrorBoundary goes here, around the main content box */}
                <div
                    ref={modalContentRef}
                    className="bg-gray-100 rounded-lg shadow-xl max-w-3xl w-full mb-8 text-slate-800 overflow-y-auto max-h-[calc(100vh-5rem)] lg:max-h-[calc(100svh-5rem)]"
                // onClick={(e) => e.stopPropagation()} // Removed to fix jsx-a11y errors
                tabIndex="-1" // Make the modal container focusable for the trap if no inner elements are
            >
                <button
                    ref={closeButtonRef} // Assign ref to the close button
                    onClick={onClose}
                    className="absolute top-1 right-1 md:top-3 md:right-3 text-gray-300 bg-gray-700 bg-opacity-50 rounded-full w-8 h-8 flex items-center justify-center hover:bg-opacity-75 hover:text-white text-2xl font-light z-50 focus:outline-none focus:ring-2 focus:ring-white"
                    aria-label="Close detail view"
                >&times;</button>

                <EarthquakeDetailHeader properties={properties} /*isValidString - now imported by child*/ />

                <div className="p-3 md:p-5 space-y-5 text-sm">
                    <EarthquakeSnapshotPanel
                        properties={properties}
                        geometry={geometry}
                        originProductProps={originProductProps}
                        momentTensorProductProps={momentTensorProductProps}
                        energyJoules={energyJoules}
                        mmiValue={mmiValue}
                        pagerAlertValue={pagerAlertValue}
                        // isValidString, isValuePresent, isValidNumber, formatDate, formatNumber, formatLargeNumber are now imported by child
                        exhibitPanelClass={exhibitPanelClass}
                        exhibitTitleClass={exhibitTitleClass}
                    />

                    <EarthquakeRegionalMapPanel
                        geometry={geometry}
                        properties={properties}
                        shakemapIntensityImageUrl={shakemapIntensityImageUrl}
                        regionalQuakes={regionalQuakes}
                        detailUrl={detailUrl}
                        // isValidNumber is now imported by child
                        exhibitPanelClass={exhibitPanelClass}
                        exhibitTitleClass={exhibitTitleClass}
                    />

                    <EarthquakeEnergyPanel
                        energyJoules={energyJoules}
                        // isValidNumber, formatLargeNumber are now imported by child
                        exhibitPanelClass={exhibitPanelClass}
                        exhibitTitleClass={exhibitTitleClass}
                        highlightClass={highlightClass}
                        captionClass={captionClass}
                    />

                    <EarthquakeRegionalSeismicityPanel
                        detailData={detailData}
                        broaderEarthquakeData={broaderEarthquakeData}
                        dataSourceTimespanDays={dataSourceTimespanDays}
                        isLoadingMonthly={isLoadingMonthly}
                        hasAttemptedMonthlyLoad={hasAttemptedMonthlyLoad}
                        exhibitPanelClass={exhibitPanelClass}
                    />

                    <EarthquakeDepthProfilePanel
                        detailData={detailData}
                        exhibitPanelClass={exhibitPanelClass}
                    />

                    <EarthquakeSeismicWavesPanel
                        eventTime={eventTime}
                        eventDepth={eventDepth}
                        exhibitPanelClass={exhibitPanelClass}
                        exhibitTitleClass={exhibitTitleClass}
                        captionClass={captionClass}
                    />
                    <EarthquakeLocationPanel
                        properties={properties}
                        originProductProps={originProductProps}
                        // isValidNumber, formatNumber are now imported by child
                        exhibitPanelClass={exhibitPanelClass}
                        exhibitTitleClass={exhibitTitleClass}
                        diagramContainerClass={diagramContainerClass}
                        captionClass={captionClass}
                    />

                    <EarthquakeImpactPanel
                        properties={properties}
                        shakemapProductProps={shakemapProductProps}
                        losspagerProductProps={losspagerProductProps}
                        shakemapIntensityImageUrl={shakemapIntensityImageUrl}
                        mmiValue={mmiValue}
                        pagerAlertValue={pagerAlertValue}
                        // isValidNumber, isValidString, formatNumber are now imported by child
                        exhibitPanelClass={exhibitPanelClass}
                        exhibitTitleClass={exhibitTitleClass}
                        highlightClass={highlightClass}
                        captionClass={captionClass}
                    />

                    <EarthquakeCitizenSciencePanel
                        properties={properties}
                        losspagerProductProps={losspagerProductProps}
                        pagerAlertValue={pagerAlertValue}
                        // isValuePresent, isValidNumber, isValidString are now imported by child
                        exhibitPanelClass={exhibitPanelClass}
                        exhibitTitleClass={exhibitTitleClass}
                        highlightClass={highlightClass}
                    />

                    {/* Interactive Fault Diagram Panel & Decoding Fault Panel Wrapper */}
                    {/* Conditional rendering based on isValidNumber removed from here; children handle their own rendering logic */}
                    <>
                        <EarthquakeFaultDiagramPanel
                            selectedFaultPlaneKey={selectedFaultPlaneKey}
                                setSelectedFaultPlaneKey={setSelectedFaultPlaneKey}
                                np1Data={np1Data}
                                np2Data={np2Data}
                                selectedFaultPlane={selectedFaultPlane}
                                // isValidNumber, formatNumber, isValidString are now imported by child
                                exhibitPanelClass={exhibitPanelClass}
                                exhibitTitleClass={exhibitTitleClass}
                                diagramContainerClass={diagramContainerClass}
                                highlightClass={highlightClass}
                            />
                            <EarthquakeFaultParamsPanel
                                selectedFaultPlaneKey={selectedFaultPlaneKey}
                                selectedFaultPlane={selectedFaultPlane}
                                // isValidNumber, formatNumber are now imported by child
                                exhibitPanelClass={exhibitPanelClass}
                                exhibitTitleClass={exhibitTitleClass}
                            />
                    </>
                    {/* End of Interactive Fault Diagram Panel & Decoding Fault Panel Wrapper */}

                    <EarthquakeMwwPanel
                        properties={properties}
                        scalarMomentValue={scalarMomentValue}
                        // isValidString, isValidNumber, formatNumber, formatLargeNumber are now imported by child
                        exhibitPanelClass={exhibitPanelClass}
                        exhibitTitleClass={exhibitTitleClass}
                        highlightClass={highlightClass}
                    />

                    <EarthquakeMagnitudeComparisonPanel
                        properties={properties}
                        // isValidNumber, formatNumber are now imported by child
                        exhibitPanelClass={exhibitPanelClass}
                        exhibitTitleClass={exhibitTitleClass}
                        captionClass={captionClass}
                    />

                    <EarthquakeStressAxesPanel
                        pAxis={pAxis}
                        tAxis={tAxis}
                        // isValidNumber, formatNumber are now imported by child
                        exhibitPanelClass={exhibitPanelClass}
                        exhibitTitleClass={exhibitTitleClass}
                        diagramContainerClass={diagramContainerClass}
                        captionClass={captionClass}
                    />

                    <EarthquakeBeachballPanel
                        momentTensorProductProps={momentTensorProductProps}
                        np1Data={np1Data}
                        np2Data={np2Data}
                        selectedFaultPlaneKey={selectedFaultPlaneKey}
                        pAxis={pAxis}
                        tAxis={tAxis}
                        // isValidNumber, getBeachballPathsAndType are now imported by child
                        exhibitPanelClass={exhibitPanelClass}
                        exhibitTitleClass={exhibitTitleClass}
                        diagramContainerClass={diagramContainerClass}
                        captionClass={captionClass}
                    />

                    <EarthquakeFurtherInfoPanel
                        properties={properties}
                        // isValidString is now imported by child
                        exhibitPanelClass={exhibitPanelClass}
                        exhibitTitleClass={exhibitTitleClass}
                    />
                </div> {/* This closes the div with className="p-3 md:p-5 space-y-5 text-sm" */}
            </div> {/* This closes the div with ref={modalContentRef} */}
            </ErrorBoundary>
        </div>
    );
}

export default EarthquakeDetailView;
