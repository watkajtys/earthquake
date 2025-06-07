
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import RegionalSeismicityChart from './RegionalSeismicityChart';
import SimplifiedDepthProfile from './SimplifiedDepthProfile';
import InfoSnippet                                          from "./InfoSnippet.jsx";
import EarthquakeMap from './EarthquakeMap'; // Import the EarthquakeMap component
import { calculateDistance } from '../utils/utils.js'; // isValidNumber import removed
import regionalFaultsData from '../../assets/gem_active_faults_harmonized.json'; // Import fault line data
// getBeachballPathsAndType is imported by EarthquakeBeachballPanel directly

// Define REGIONAL_RADIUS_KM
const REGIONAL_RADIUS_KM = 804.672; // 500 miles

// Helper Functions
// MOVED to src/utils/detailViewUtils.js
import SkeletonText from './skeletons/SkeletonText.jsx';
import SkeletonBlock from './skeletons/SkeletonBlock.jsx';

/**
 * A React component that displays detailed information about a specific earthquake event.
 * It fetches data from a provided URL, parses it, and presents it in a structured,
 * user-friendly modal view with various informational panels and diagrams.
 *
 * @param {object} props - The component's props.
 * @param {string} props.detailUrl - The URL to fetch detailed earthquake data from.
 * @param {function(): void} props.onClose - Callback function to close the detail view.
 * @param {function(object): void} [props.onDataLoadedForSeo] - Optional callback. Receives an object with key data points (title, place, time, mag, depth, etc.) once details are loaded, intended for SEO updates.
 * @param {Array<object>} props.broaderEarthquakeData - Array of earthquake objects (matching USGS GeoJSON feature structure) for nearby/regional events, used by the RegionalSeismicityChart.
 * @param {number} props.dataSourceTimespanDays - The timespan (e.g., 7 or 30 days) of the `broaderEarthquakeData` source, used by RegionalSeismicityChart for context.
 * @param {function(): void} [props.handleLoadMonthlyData] - Optional callback function to trigger loading of broader monthly data if not already loaded or in progress.
 * @param {boolean} [props.hasAttemptedMonthlyLoad] - Optional boolean indicating if an attempt to load monthly data has already been made.
 * @param {boolean} [props.isLoadingMonthly] - Optional boolean indicating if monthly data is currently being loaded.
 * @returns {JSX.Element} The rendered EarthquakeDetailView component.
 */
import ErrorBoundary from './ErrorBoundary'; // Assuming ErrorBoundary.jsx is in the same components folder
import EarthquakeDetailHeader from './earthquakeDetail/EarthquakeDetailHeader'; // Import the new header
import EarthquakeSnapshotPanel from './earthquakeDetail/EarthquakeSnapshotPanel'; // Import the new snapshot panel
import EarthquakeRegionalMapPanel from './earthquakeDetail/EarthquakeRegionalMapPanel'; // Import the new regional map panel
import EarthquakeEnergyPanel from './earthquakeDetail/EarthquakeEnergyPanel'; // Import the new energy panel
import EarthquakeRegionalSeismicityPanel from './earthquakeDetail/EarthquakeRegionalSeismicityPanel'; // Import the new regional seismicity panel
import EarthquakeDepthProfilePanel from './earthquakeDetail/EarthquakeDepthProfilePanel'; // Import the new depth profile panel
import EarthquakeSeismicWavesPanel from './earthquakeDetail/EarthquakeSeismicWavesPanel'; // Import the new seismic waves panel
import EarthquakeLocationPanel from './earthquakeDetail/EarthquakeLocationPanel'; // Import the new location panel
import EarthquakeImpactPanel from './earthquakeDetail/EarthquakeImpactPanel'; // Import the new impact panel
import EarthquakeCitizenSciencePanel from './earthquakeDetail/EarthquakeCitizenSciencePanel'; // Import the new citizen science panel
import EarthquakeFaultDiagramPanel from './earthquakeDetail/EarthquakeFaultDiagramPanel'; // Added back the missing import
import EarthquakeFaultParamsPanel from './earthquakeDetail/EarthquakeFaultParamsPanel'; // Import the new fault params panel
import EarthquakeMwwPanel from './earthquakeDetail/EarthquakeMwwPanel'; // Import the new Mww panel
import EarthquakeMagnitudeComparisonPanel from './earthquakeDetail/EarthquakeMagnitudeComparisonPanel'; // Import the new magnitude comparison panel
import EarthquakeStressAxesPanel from './earthquakeDetail/EarthquakeStressAxesPanel'; // Import the new stress axes panel
import EarthquakeBeachballPanel from './earthquakeDetail/EarthquakeBeachballPanel'; // Import the new beachball panel
import EarthquakeFurtherInfoPanel from './earthquakeDetail/EarthquakeFurtherInfoPanel'; // Import the new further info panel

/**
 * A React component that displays detailed information about a specific earthquake event.
 * It fetches data from a provided URL, parses it, and presents it in a structured,
 * user-friendly modal view with various informational panels and diagrams.
 *
 * @param {object} props - The component's props.
 * @param {string} props.detailUrl - The URL to fetch detailed earthquake data from.
 * @param {function(): void} props.onClose - Callback function to close the detail view.
 * @param {function(object): void} [props.onDataLoadedForSeo] - Optional callback. Receives an object with key data points (title, place, time, mag, depth, etc.) once details are loaded, intended for SEO updates.
 * @param {Array<object>} props.broaderEarthquakeData - Array of earthquake objects (matching USGS GeoJSON feature structure) for nearby/regional events, used by the RegionalSeismicityChart.
 * @param {number} props.dataSourceTimespanDays - The timespan (e.g., 7 or 30 days) of the `broaderEarthquakeData` source, used by RegionalSeismicityChart for context.
 * @param {function(): void} [props.handleLoadMonthlyData] - Optional callback function to trigger loading of broader monthly data if not already loaded or in progress.
 * @param {boolean} [props.hasAttemptedMonthlyLoad] - Optional boolean indicating if an attempt to load monthly data has already been made.
 * @param {boolean} [props.isLoadingMonthly] - Optional boolean indicating if monthly data is currently being loaded.
 * @returns {JSX.Element} The rendered EarthquakeDetailView component.
 */
function EarthquakeDetailView({ detailUrl, onClose, onDataLoadedForSeo, broaderEarthquakeData, dataSourceTimespanDays, handleLoadMonthlyData, hasAttemptedMonthlyLoad, isLoadingMonthly }) { // Add dataSourceTimespanDays
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
    }, [detailUrl, hasAttemptedMonthlyLoad, isLoadingMonthly, handleLoadMonthlyData]); // Dependencies for the effect

    useEffect(() => {
        if (!detailUrl) {
            // If detailUrl is cleared (e.g., modal closes or selection changes to none)
            setIsLoading(false);
            setDetailData(null);
            setError(null);
            return; // Stop further execution in this effect
        }

        // If detailUrl is present, prepare for fetching
        let isMounted = true;
        const fetchDetail = async () => {
            setIsLoading(true); // Ensure loading state is true at the start of any fetch
            setError(null);     // Clear any previous error
            setDetailData(null); // Clear previous data before new fetch to prevent stale display
            try {
                const response = await fetch(detailUrl);
                if (!response.ok) throw new Error(`HTTP error! Status: ${response.status} ${response.url}`);
                const data = await response.json();
                if (isMounted) {
                    setDetailData(data);
                    if (onDataLoadedForSeo && data) {
                        const props = data.properties;
                        const geom = data.geometry;
                        // Derive shakemapIntensityImageUrl directly here before calling callback
                        // Pass the entire 'data' object (which is the full GeoJSON feature)
                        // Also, pass shakemapIntensityImageUrl explicitly if it's derived and needed directly by consumer,
                        // though consumer can also derive it if given the full 'data'.
                        // For simplicity and to ensure consumer has what it needs, we can pass both.
                        // The `EarthquakeDetailModalComponent` will then have access to `data.id` and `data.properties.detail`.
                        const shakemapProduct = data.properties?.products?.shakemap?.[0];
                        const shakemapIntensityImageUrl = shakemapProduct?.contents?.['download/intensity.jpg']?.url;

                        // Construct an object that includes the full 'data' and any specifically derived values
                        // that the parent component might expect separately.
                        // Or, more simply, ensure the parent component knows to look inside 'data' for everything.
                        // Given the existing structure of onDataLoadedForSeo in EarthquakeDetailModalComponent,
                        // it expects specific top-level fields. Let's adapt to pass what it needs, plus the raw data.
                        // The best approach is to pass the full `data` (GeoJSON feature) and let the consumer (ModalComponent) destructure it.
                        // So, `onDataLoadedForSeo(data)` would be the cleanest.
                        // The `EarthquakeDetailModalComponent` already expects `loadedData.id`, `loadedData.properties`, `loadedData.geometry`.
                        // It also expects `shakemapIntensityImageUrl` directly.

                        const seoDataPayload = {
                            ...data, // This includes id, properties, geometry
                            // Explicitly pass fields that EarthquakeDetailModalComponent's onDataLoadedForSeo was originally structured to receive directly,
                            // if they are not easily derivable or for convenience.
                            // However, the new version of onDataLoadedForSeo in ModalComponent is already set up to use data.properties, data.id etc.
                            // So, just passing 'data' and 'shakemapIntensityImageUrl' separately should be fine.
                            // Let's ensure the modal component's `onDataLoadedForSeo` receives an object that has `id`, `properties`, `geometry`, and `shakemapIntensityImageUrl`.
                            // The simplest is to pass the full `data` object and let the callback in ModalComponent handle it.
                            // The callback in EarthquakeDetailModalComponent expects `loadedData.id`, `loadedData.properties.detail`, etc.
                            // So, onDataLoadedForSeo(data) is correct.
                            // The `shakemapIntensityImageUrl` is also needed by the modal component.
                            // It can be derived from `data.properties.products` there, or passed for convenience.
                            // The current `EarthquakeDetailModalComponent` expects `loadedData.shakemapIntensityImageUrl`.
                            // So we should add it to the `data` object before passing if it's not naturally there, or pass it alongside.
                            // Let's pass the full `data` and add `shakemapIntensityImageUrl` to its root for convenience if not already there.
                        };
                        // Actually, the simplest is to call it with an object that has the properties
                        // `EarthquakeDetailModalComponent` expects.
                        // `EarthquakeDetailModalComponent` expects `loadedData.id`, `loadedData.properties.detail` etc.
                        // The `data` object here *is* what `loadedData` will be.
                        // So `data.id` is `loadedData.id`. `data.properties.detail` is `loadedData.properties.detail`.
                        // The `shakemapIntensityImageUrl` is something `EarthquakeDetailModalComponent` also expects at top level of the passed object.

                        onDataLoadedForSeo({
                            id: data.id, // USGS Event ID
                            properties: data.properties, // All properties
                            geometry: data.geometry, // All geometry
                            shakemapIntensityImageUrl: shakemapIntensityImageUrl // Derived shakemap URL
                        });
                    }
                }
            } catch (e) {
                console.error("Failed to fetch detail data:", e);
                if (isMounted) setError(`Failed to load details: ${e.message}`);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchDetail();

        return () => {
            isMounted = false;
        };
    }, [detailUrl]); // Changed dependency: removed onDataLoadedForSeo

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
        <div
            className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-start z-[55] p-2 sm:p-4 pt-10 md:pt-16"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="earthquake-detail-title"
        >
            <ErrorBoundary> {/* ErrorBoundary goes here, around the main content box */}
                <div
                    ref={modalContentRef}
                    className="bg-gray-100 rounded-lg shadow-xl max-w-3xl w-full mb-8 text-slate-800 overflow-y-auto max-h-[calc(100svh-5rem)]"
                onClick={(e) => e.stopPropagation()}
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
                        faultLineDataUrl={regionalFaultsData} // Pass fault line data
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
