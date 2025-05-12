
import React, { useState, useEffect, useCallback, useMemo } from 'react';

// Helper Functions
const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A'; // Remains for direct use if needed, but conditional rendering should prevent this.
    return new Date(timestamp).toLocaleString([], { dateStyle: 'full', timeStyle: 'long' });
};

const isValidNumber = (num) => {
    const parsedNum = parseFloat(num);
    return typeof parsedNum === 'number' && !isNaN(parsedNum);
};

const isValidString = (str) => {
    return typeof str === 'string' && str.trim() !== '';
};

const isValuePresent = (value) => {
    return value !== null && value !== undefined;
};

// formatNumber and formatLargeNumber will now primarily be used AFTER a check with isValidNumber
const formatNumber = (num, precision = 1) => {
    // The initial check in the original function is good, but we rely on isValidNumber before calling.
    // However, keeping it robust is fine.
    const number = parseFloat(num);
    if (Number.isNaN(number)) return 'N/A'; // Simplified, assuming num is already confirmed to be somewhat number-like by isValidNumber
    return number.toFixed(precision);
};

const formatLargeNumber = (num) => {
    if (!isValidNumber(num)) return 'N/A'; // Use isValidNumber
    if (num === 0) return '0';
    const numAbs = Math.abs(num);
    let value; let suffix = '';
    if (numAbs < 1e3) { value = num.toLocaleString(undefined, { maximumFractionDigits: 2 }); }
    else if (numAbs < 1e6) { value = (num / 1e3).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' thousand'; }
    else if (numAbs < 1e9) { value = (num / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' million'; }
    else if (numAbs < 1e12) { value = (num / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' billion'; }
    else if (numAbs < 1e15) { value = (num / 1e12).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' trillion'; }
    else if (numAbs < 1e18) { value = (num / 1e15).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' quadrillion';}
    else if (numAbs < 1e21) { value = (num / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' quintillion';}
    else { const expFormat = num.toExponential(2); const parts = expFormat.split('e+'); return parts.length === 2 ? `${parts[0]} x 10^${parts[1]}` : expFormat; }
    return value + suffix;
};


const SkeletonText = ({ width = 'w-3/4', height = 'h-4', className = '' }) => <div className={`bg-gray-300 rounded ${width} ${height} animate-pulse mb-2 ${className}`}></div>;
const SkeletonBlock = ({ height = 'h-24', className = '' }) => <div className={`bg-gray-300 rounded ${height} animate-pulse ${className}`}></div>;

function EarthquakeDetailView({ detailUrl, onClose }) {
    const [detailData, setDetailData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedFaultPlaneKey, setSelectedFaultPlaneKey] = useState('np1');

    useEffect(() => {
        if (!detailUrl) return;
        let isMounted = true;
        const fetchDetail = async () => {
            setIsLoading(true); setError(null); setDetailData(null);
            try {
                const response = await fetch(detailUrl);
                if (!response.ok) throw new Error(`HTTP error! Status: ${response.status} ${response.url}`);
                const data = await response.json();
                if (isMounted) setDetailData(data);
            } catch (e) {
                console.error("Failed to fetch detail data:", e);
                if (isMounted) setError(`Failed to load details: ${e.message}`);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };
        fetchDetail();
        return () => { isMounted = false; };
    }, [detailUrl]);

    const properties = useMemo(() => detailData?.properties, [detailData]);
    const geometry = useMemo(() => detailData?.geometry, [detailData]);
    const products = useMemo(() => properties?.products, [properties]);

    const getProduct = useCallback((type) => products?.[type]?.[0], [products]);

    const originProductProps = useMemo(() => getProduct('origin')?.properties, [getProduct]);
    const momentTensorProductProps = useMemo(() => getProduct('moment-tensor')?.properties, [getProduct]);
    const shakemapProduct = useMemo(() => getProduct('shakemap'), [getProduct]);
    const shakemapProductProps = useMemo(() => shakemapProduct?.properties, [shakemapProduct]);
    const losspagerProductProps = useMemo(() => getProduct('losspager')?.properties, [getProduct]);

    // These values can be NaN if source data is missing/invalid. This is expected.
    // Conditional rendering will handle whether to display them or not.
    const np1Data = useMemo(() => ({
        strike: parseFloat(momentTensorProductProps?.['nodal-plane-1-strike']),
        dip: parseFloat(momentTensorProductProps?.['nodal-plane-1-dip']),
        rake: parseFloat(momentTensorProductProps?.['nodal-plane-1-rake']),
        description: momentTensorProductProps?.['nodal-plane-1-description'] || `Nodal Plane 1 (NP1) suggests a fault orientation and slip. Details below.` // Assuming description can be a string
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


    const InteractiveFaultDiagram = ({ planeData, planeKey }) => {
        // Guard against rendering if essential data is NaN (strike is key for rotation)
        if (!planeData || !isValidNumber(planeData.strike)) {
            // Return null to render nothing if data isn't sufficient for the diagram
            // Or a placeholder if absolutely necessary, but the goal is to hide.
            return null;
        }
        const faultStrikeRotation = planeData.strike; // Already validated as a number
        const blockFill = planeKey === 'np1' ? "#ffe0b2" : "#ede7f6";
        const blockStroke = planeKey === 'np1' ? "#5d4037" : "#4527a0";

        let arrowPath1 = "M 100 100 L 120 100"; // Default: left-lateral
        let arrowPath2 = "M 250 180 L 230 180";

        if (isValidNumber(planeData.rake)) { // Only adjust arrows if rake is a valid number
            if (planeData.rake > 45 && planeData.rake < 135) { // Reverse fault (hanging wall up)
                arrowPath1 = "M 100 100 L 100 120";
                arrowPath2 = "M 250 180 L 250 160";
            } else if (planeData.rake < -45 && planeData.rake > -135) { // Normal fault (hanging wall down)
                arrowPath1 = "M 100 120 L 100 100";
                arrowPath2 = "M 250 160 L 250 180";
            }
            // Add cases for oblique, right-lateral if needed
        }

        return (
            <svg className="w-full max-w-xs md:max-w-sm mx-auto" height="250" viewBox="0 0 350 280" xmlns="http://www.w3.org/2000/svg">
                <rect x="10" y="50" width="330" height="180" fill="#e0e7ff" stroke="#adb5bd" strokeWidth="1"/>
                {isValidNumber(faultStrikeRotation) && // Check before using in transform
                    <line x1="175" y1="50" x2="175" y2="230" stroke={blockStroke} strokeWidth="3" strokeDasharray="6,3" transform={`rotate(${faultStrikeRotation} 175 140)`}/>
                }
                <g transform={`rotate(${isValidNumber(faultStrikeRotation) ? faultStrikeRotation : 0} 175 140)`}>
                    <rect x="25" y="70" width="140" height="140" fill={blockFill} stroke={blockStroke} strokeWidth="1.5" />
                    <path d={arrowPath1} stroke="black" strokeWidth="2" markerEnd="url(#arrowhead-detail-fault)" />
                    <rect x="185" y="70" width="140" height="140" fill={blockFill} stroke={blockStroke} strokeWidth="1.5" />
                    <path d={arrowPath2} stroke="black" strokeWidth="2" markerEnd="url(#arrowhead-detail-fault)" />
                </g>
                <defs>
                    <marker id="arrowhead-detail-fault" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto"> <polygon points="0 0, 10 3.5, 0 7" fill="black"/> </marker>
                </defs>
                <text x="175" y="30" textAnchor="middle" className="text-sm font-semibold text-indigo-700">Fault View ({planeKey.toUpperCase()})</text>
                <text x="175" y="265" textAnchor="middle" className="text-xs text-slate-600">Illustrative Diagram</text>
            </svg>
        );
    };

    if (isLoading) return ( <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4"><div className="bg-white p-8 rounded-lg max-w-3xl w-full animate-pulse"><SkeletonText width="w-3/4" height="h-8 mb-6 mx-auto" /><SkeletonBlock height="h-40 mb-4" /><SkeletonBlock height="h-64" /></div></div> );
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

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-start z-40 p-2 sm:p-4 pt-10 md:pt-16 overflow-y-auto" onClick={onClose}>
            <div className="bg-gray-100 rounded-lg shadow-xl max-w-3xl w-full mb-8 text-slate-800" onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-1 right-1 md:top-3 md:right-3 text-gray-300 bg-gray-700 bg-opacity-50 rounded-full w-8 h-8 flex items-center justify-center hover:bg-opacity-75 hover:text-white text-2xl font-light z-50" aria-label="Close detail view">&times;</button>

                {isValidString(properties.title) && (
                    <header className="text-center p-4 md:p-5 bg-white rounded-t-lg border-b border-gray-300">
                        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-blue-700">Unpacking the Shakes!</h1>
                        <p className="text-md text-slate-600 mt-1">{properties.title}</p>
                    </header>
                )}

                <div className="p-3 md:p-5 space-y-5 text-sm">
                    {/* --- Snapshot Panel --- */}
                    <div className={`${exhibitPanelClass} border-blue-500`}>
                        <h2 className={`${exhibitTitleClass} text-blue-800 border-blue-200`}>Earthquake Snapshot</h2>
                        <table className="w-full text-xs md:text-sm"><tbody>
                        {isValidString(properties.title) && (
                            <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600 w-2/5 md:w-1/3">Event Name</td><td className="py-1.5">{properties.title}</td></tr>
                        )}
                        {isValuePresent(properties.time) && ( // Assuming timestamp 0 is not valid, otherwise check more carefully
                            <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Date & Time (UTC)</td><td className="py-1.5">{formatDate(properties.time)}</td></tr>
                        )}
                        {geometry?.coordinates && isValidNumber(geometry.coordinates[1]) && isValidNumber(geometry.coordinates[0]) && (
                            <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Location</td><td className="py-1.5">{formatNumber(geometry.coordinates[1], 3)}°, {formatNumber(geometry.coordinates[0], 3)}°</td></tr>
                        )}
                        {isValidNumber(properties.mag) && (
                            <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Magnitude ({isValidString(properties.magType) ? properties.magType : 'Mww'})</td><td className="py-1.5">{formatNumber(properties.mag, 1)}</td></tr>
                        )}
                        {geometry?.coordinates && isValidNumber(geometry.coordinates[2]) && ( // Depth can be 0
                            <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Depth</td><td className="py-1.5">{formatNumber(geometry.coordinates[2], 1)} km</td></tr>
                        )}
                        {isValidNumber(energyJoules) && ( // energyJoules (scalarMoment) can be 0
                            <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Energy (Seismic Moment)</td><td className="py-1.5">{formatLargeNumber(energyJoules)} N-m</td></tr>
                        )}
                        {momentTensorProductProps && isValidNumber(momentTensorProductProps['percent-double-couple']) && (
                            <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Percent Double Couple</td><td className="py-1.5">{formatNumber(parseFloat(momentTensorProductProps['percent-double-couple']) * 100, 0)}%</td></tr>
                        )}
                        {isValuePresent(properties.tsunami) && ( // tsunami can be 0 or 1
                            <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Tsunami?</td><td className="py-1.5">{properties.tsunami === 1 ? 'Yes' : 'No'}</td></tr>
                        )}
                        {isValidString(properties.status) && (
                            <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Status</td><td className="py-1.5 capitalize">{properties.status}</td></tr>
                        )}
                        {isValuePresent(properties.felt) && isValidNumber(properties.felt) && ( // felt can be 0
                            <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Felt Reports (DYFI)</td><td className="py-1.5">{properties.felt}</td></tr>
                        )}
                        {isValidNumber(mmiValue) && (
                            <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">MMI (ShakeMap)</td><td className="py-1.5">{formatNumber(mmiValue,1)}</td></tr>
                        )}
                        {isValidString(pagerAlertValue) && (
                            <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">PAGER Alert</td><td className={`py-1.5 capitalize font-semibold ${pagerAlertValue === 'green' ? 'text-green-600' : pagerAlertValue === 'yellow' ? 'text-yellow-600' : pagerAlertValue === 'orange' ? 'text-orange-600' : pagerAlertValue === 'red' ? 'text-red-600' : 'text-slate-600'}`}>{pagerAlertValue}</td></tr>
                        )}
                        {(isValidNumber(originProductProps?.['num-stations-used']) || isValidNumber(properties?.nst)) && (
                            <tr className="border-t border-gray-300 mt-2 pt-2"><td className="pt-2 pr-2 font-semibold text-slate-600">Stations Used:</td><td className="pt-2">{isValidNumber(originProductProps?.['num-stations-used']) ? originProductProps['num-stations-used'] : properties.nst}</td></tr>
                        )}
                        {(isValidNumber(originProductProps?.['azimuthal-gap']) || isValidNumber(properties?.gap)) && (
                            <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Azimuthal Gap:</td><td className="py-1.5">{formatNumber(originProductProps?.['azimuthal-gap'] ?? properties.gap, 0)}°</td></tr>
                        )}
                        {(isValidNumber(originProductProps?.['minimum-distance']) || isValidNumber(properties?.dmin)) && (
                            <tr className="border-b border-gray-200"><td className="py-1.5 pr-2 font-semibold text-slate-600">Min. Distance:</td><td className="py-1.5">{formatNumber(originProductProps?.['minimum-distance'] ?? properties.dmin, 1)}°</td></tr>
                        )}
                        {(isValidNumber(originProductProps?.['standard-error']) || isValidNumber(properties?.rms)) && (
                            <tr><td className="py-1.5 pr-2 font-semibold text-slate-600">RMS Error:</td><td className="py-1.5">{formatNumber(originProductProps?.['standard-error'] ?? properties.rms, 2)} s</td></tr>
                        )}
                        </tbody></table>
                    </div>

                    {/* --- Energy Unleashed Panel --- */}
                    {isValidNumber(energyJoules) && ( // energyJoules can be 0
                        <div className={`${exhibitPanelClass} border-orange-500`}>
                            <h2 className={`${exhibitTitleClass} text-orange-800 border-orange-200`}>Energy Unleashed</h2>
                            <p className="mb-3">Approx. Energy: <strong className={`${highlightClass} text-orange-600`}>{formatLargeNumber(energyJoules)} Joules</strong>.</p>
                            <div className="space-y-2">
                                {energyJoules > 0 && ( // Only show comparisons if energy is greater than 0
                                    <>
                                        <div className="flex items-start p-2 bg-orange-50 rounded-md"><svg width="24" height="24" viewBox="0 0 24 24" className="mr-2 shrink-0 mt-0.5 fill-yellow-500 stroke-yellow-700"><path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" strokeWidth="1.5" /></svg><div><strong className="text-orange-700">Lightning Bolt:</strong> ~1 billion Joules. This quake was like <strong className={`${highlightClass} text-orange-600`}>{formatLargeNumber(energyJoules / 1e9)}</strong> lightning bolts.</div></div>
                                        <div className="flex items-start p-2 bg-red-50 rounded-md"><svg width="24" height="24" viewBox="0 0 24 24" className="mr-2 shrink-0 mt-0.5 fill-red-500 stroke-red-700" strokeWidth="1.5"><path d="M12 2C12 2 10.263 4.73897 9.00001 7.49997C9.00001 7.49997 6.00001 7.49997 6.00001 9.99997C6.00001 12.5 9.00001 12.5 9.00001 15C9.00001 17.5 6.00001 17.5 6.00001 20C6.00001 22.5 12 22.5 12 22.5C12 22.5 18 22.5 18 20C18 17.5 15 17.5 15 15C15 12.5 18 12.5 18 9.99997C18 7.49997 15 7.49997 15 7.49997C13.737 4.73897 12 2 12 2Z" /></svg><div><strong className="text-red-700">Hiroshima Bomb:</strong> ~63 trillion Joules. This quake was like <strong className={`${highlightClass} text-red-600`}>{formatLargeNumber(energyJoules / 6.3e13)}</strong> Hiroshima bombs.</div></div>
                                    </>
                                )}
                            </div>
                            {energyJoules > 0 && <p className={captionClass}>Comparisons are for scale.</p>}
                        </div>
                    )}

                    {/* --- Understanding Seismic Waves Panel (Static content) --- */}
                    <div className={`${exhibitPanelClass} border-fuchsia-500`}>
                        <h2 className={`${exhibitTitleClass} text-fuchsia-800 border-fuchsia-200`}>Understanding Seismic Waves</h2>
                        <div className="grid md:grid-cols-2 gap-4 mt-2">
                            <div className="text-center p-2 bg-blue-50 rounded-md"><strong>P-Waves (Primary)</strong><svg width="150" height="80" viewBox="0 0 150 80" className="mx-auto mt-1"><line x1="10" y1="40" x2="140" y2="40" stroke="#4b5563" strokeWidth="1"/><line x1="20" y1="30" x2="20" y2="50" stroke="#3b82f6" strokeWidth="2"/><line x1="25" y1="30" x2="25" y2="50" stroke="#3b82f6" strokeWidth="2"/><line x1="70" y1="30" x2="70" y2="50" stroke="#3b82f6" strokeWidth="2"/><line x1="75" y1="30" x2="75" y2="50" stroke="#3b82f6" strokeWidth="2"/><text x="75" y="70" fontSize="10" textAnchor="middle">Push-Pull Motion →</text></svg><p className="text-xs text-slate-600">Fastest, compressional.</p></div>
                            <div className="text-center p-2 bg-red-50 rounded-md"><strong>S-Waves (Secondary)</strong><svg width="150" height="80" viewBox="0 0 150 80" className="mx-auto mt-1"><path d="M10 40 Q 25 20 40 40 T 70 40 T 100 40 T 130 40" stroke="#ef4444" strokeWidth="2" fill="none"/><line x1="10" y1="40" x2="140" y2="40" stroke="#4b5563" strokeWidth="0.5" strokeDasharray="2,2"/><text x="75" y="70" fontSize="10" textAnchor="middle">Side-to-Side Motion ↕</text></svg><p className="text-xs text-slate-600">Slower, shear, solids only.</p></div>
                        </div>
                        <p className={`${captionClass} mt-3`}>Surface waves (Love & Rayleigh) arrive later and often cause most shaking.</p>
                    </div>
                    {/* --- Pinpointing the Quake (Location Quality) --- */}
                    {(originProductProps || (properties && (isValidNumber(properties.nst) || isValidNumber(properties.gap) || isValidNumber(properties.dmin) || isValidNumber(properties.rms)))) && (
                        <div className={`${exhibitPanelClass} border-yellow-500`}>
                            <h2 className={`${exhibitTitleClass} text-yellow-800 border-yellow-300`}>Pinpointing the Quake</h2>
                            <p className="mb-2 text-xs md:text-sm">Location quality based on available data:</p>
                            <ul className="text-xs md:text-sm space-y-1 list-disc list-inside ml-4">
                                {(isValidNumber(originProductProps?.['num-stations-used']) || isValidNumber(properties?.nst)) && (
                                    <li><strong className="text-slate-700">Stations Used (nst):</strong> {isValidNumber(originProductProps?.['num-stations-used']) ? originProductProps['num-stations-used'] : properties.nst}</li>
                                )}
                                {(isValidNumber(originProductProps?.['azimuthal-gap']) || isValidNumber(properties?.gap)) && (
                                    <li><strong className="text-slate-700">Azimuthal Gap (gap):</strong> {formatNumber(originProductProps?.['azimuthal-gap'] ?? properties.gap, 0)}° (smaller is better)</li>
                                )}
                                {(isValidNumber(originProductProps?.['minimum-distance']) || isValidNumber(properties?.dmin)) && (
                                    <li><strong className="text-slate-700">Nearest Station (dmin):</strong> {formatNumber(originProductProps?.['minimum-distance'] ?? properties.dmin, 1)}° (~{formatNumber((originProductProps?.['minimum-distance'] ?? properties.dmin) * 111, 0)} km)</li>
                                )}
                                {(isValidNumber(originProductProps?.['standard-error']) || isValidNumber(properties?.rms)) && (
                                    <li><strong className="text-slate-700">RMS Error (rms):</strong> {formatNumber(originProductProps?.['standard-error'] ?? properties.rms, 2)} s (smaller indicates better fit)</li>
                                )}
                            </ul>
                            <div className={`${diagramContainerClass} bg-purple-50 mt-3`} style={{minHeight: '160px'}}>
                                <svg width="200" height="150" viewBox="0 0 200 150"><circle cx="40" cy="40" r="5" fill="#1d4ed8"/><text x="40" y="30" fontSize="8">Sta 1</text><circle cx="160" cy="50" r="5" fill="#1d4ed8"/><text x="160" y="40" fontSize="8">Sta 2</text><circle cx="100" cy="130" r="5" fill="#1d4ed8"/><text x="100" y="145" fontSize="8">Sta 3</text><circle cx="40" cy="40" r="50" fill="none" stroke="#60a5fa" strokeWidth="1" strokeDasharray="2,2"/><circle cx="160" cy="50" r="65" fill="none" stroke="#60a5fa" strokeWidth="1" strokeDasharray="2,2"/><circle cx="100" cy="130" r="45" fill="none" stroke="#60a5fa" strokeWidth="1" strokeDasharray="2,2"/><circle cx="105" cy="85" r="4" fill="#ef4444"/><text x="105" y="78" fontSize="8" fill="#b91c1c">Epicenter</text></svg>
                            </div>
                            <p className={captionClass}>Epicenter is found by triangulating arrival times from multiple seismometers.</p>
                        </div>
                    )}

                    {/* --- ShakeMap / PAGER Impact Panel --- */}
                    {(shakemapProductProps || losspagerProductProps || isValidNumber(properties?.mmi) || isValidString(properties?.alert)) && (
                        <div className={`${exhibitPanelClass} border-gray-500`}>
                            <h2 className={`${exhibitTitleClass} text-gray-800 border-gray-300`}>Shaking & Impact Assessment</h2>
                            {isValidNumber(mmiValue) && (
                                <p>Est. Max Shaking Intensity (MMI): <strong className={highlightClass}>{formatNumber(mmiValue, 1)}</strong></p>
                            )}
                            {isValidString(pagerAlertValue) && (
                                <p>USGS PAGER Alert Level: <span className={`font-bold capitalize px-1.5 py-0.5 rounded-sm text-xs ${pagerAlertValue === 'green' ? 'bg-green-100 text-green-700' : pagerAlertValue === 'yellow' ? 'bg-yellow-100 text-yellow-700' : pagerAlertValue === 'orange' ? 'bg-orange-100 text-orange-700' : pagerAlertValue === 'red' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-slate-700'}`}>{pagerAlertValue}</span></p>
                            )}
                            {isValidString(shakemapIntensityImageUrl) ? (
                                <div className="my-3"><img src={shakemapIntensityImageUrl} alt="ShakeMap Intensity" className="w-full max-w-sm mx-auto border border-gray-300 rounded"/><p className={captionClass}>USGS ShakeMap Estimated Intensity.</p></div>
                            ) : (
                                (shakemapProductProps || losspagerProductProps) && <p className="text-xs text-slate-500 my-3">ShakeMap image not found in products for this event.</p>
                            )}
                            <p className="text-xs text-slate-500 mt-2">Waveform images are not typically available here. Detailed waveform data is available from seismological data centers.</p>
                        </div>
                    )}

                    {/* --- Real World Impact & Citizen Science --- */}
                    {(isValuePresent(properties?.felt) || isValidString(properties?.alert) || losspagerProductProps) && (
                        <div className={`${exhibitPanelClass} border-sky-500`}>
                            <h2 className={`${exhibitTitleClass} text-sky-800 border-sky-300`}>Real-World Impact & Citizen Science</h2>
                            <div className="space-y-2 mt-2">
                                {isValuePresent(properties?.felt) && isValidNumber(properties.felt) && (
                                    <div className="flex items-start p-2 bg-sky-50 rounded-md"><svg width="24" height="24" viewBox="0 0 24 24" className="mr-2 shrink-0 mt-0.5 fill-blue-500 stroke-blue-700"><path d="M17.9998 14.242L19.4138 15.656L12.0008 23.069L4.58582 15.656L5.99982 14.242L11.0008 19.242V1H13.0008V19.242L17.9998 14.242Z" /></svg><div><strong className="text-blue-700">"Did You Feel It?" (DYFI):</strong> <span className="text-xs text-slate-600">USGS collects public reports to map felt shaking intensity. This event had <strong className={highlightClass}>{properties.felt}</strong> felt reports.</span></div></div>
                                )}
                                {(isValidString(pagerAlertValue)) && (
                                    <div className="flex items-start p-2 bg-green-50 rounded-md"><svg width="24" height="24" viewBox="0 0 24 24" className="mr-2 shrink-0 mt-0.5 fill-green-500 stroke-green-700"><path d="M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21Z" strokeWidth="2" /><path d="M9 12L11 14L15 10" strokeWidth="2" /></svg><div><strong className="text-green-700">PAGER System:</strong> <span className="text-xs text-slate-600">Rapid impact assessment. Alert for this event: <strong className={`capitalize font-semibold ${pagerAlertValue === 'green' ? 'text-green-700' : 'text-gray-700'}`}>{pagerAlertValue}</strong>.</span></div></div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Interactive Fault Diagram Panel & Decoding Fault Panel Wrapper */}
                    {(isValidNumber(np1Data.strike) || isValidNumber(np2Data.strike)) && (
                        <>
                            {/* --- Interactive Fault Diagram Panel --- */}
                            {/* Render if selectedFaultPlane (which depends on np1/np2) has a valid strike for the diagram */}
                            {isValidNumber(selectedFaultPlane.strike) && (
                                <div className={`${exhibitPanelClass} border-purple-500`}>
                                    <h2 className={`${exhibitTitleClass} text-purple-800 border-purple-200`}>How Did the Ground Break?</h2>
                                    <div className="text-center mb-3 space-x-2">
                                        {isValidNumber(np1Data.strike) && /* Only show button if np1 has valid strike */
                                            <button onClick={() => setSelectedFaultPlaneKey('np1')} className={`px-3 py-1.5 rounded text-xs sm:text-sm font-medium transition-colors ${selectedFaultPlaneKey === 'np1' ? 'bg-purple-600 text-white shadow-md' : 'bg-purple-100 text-purple-800 hover:bg-purple-200'}`}>Nodal Plane 1</button>
                                        }
                                        {isValidNumber(np2Data.strike) && /* Only show button if np2 has valid strike */
                                            <button onClick={() => setSelectedFaultPlaneKey('np2')} className={`px-3 py-1.5 rounded text-xs sm:text-sm font-medium transition-colors ${selectedFaultPlaneKey === 'np2' ? 'bg-purple-600 text-white shadow-md' : 'bg-purple-100 text-purple-800 hover:bg-purple-200'}`}>Nodal Plane 2</button>
                                        }
                                    </div>
                                    <div className={`${diagramContainerClass} bg-indigo-50`} style={{minHeight: '280px'}}>
                                        <InteractiveFaultDiagram planeData={selectedFaultPlane} planeKey={selectedFaultPlaneKey} />
                                    </div>
                                    {/* Display Strike, Dip, Rake only if they are valid numbers */}
                                    {(isValidNumber(selectedFaultPlane.strike) || isValidNumber(selectedFaultPlane.dip) || isValidNumber(selectedFaultPlane.rake)) && (
                                        <div className="mt-3 text-xs md:text-sm text-slate-700 bg-purple-50 p-3 rounded-md">
                                            <p>
                                                {isValidNumber(selectedFaultPlane.strike) && <><strong className={highlightClass}>Strike:</strong> {formatNumber(selectedFaultPlane.strike,0)}° </>}
                                                {isValidNumber(selectedFaultPlane.dip) && <>{isValidNumber(selectedFaultPlane.strike) && "| "}<strong className={highlightClass}>Dip:</strong> {formatNumber(selectedFaultPlane.dip,0)}° </>}
                                                {isValidNumber(selectedFaultPlane.rake) && <>{(isValidNumber(selectedFaultPlane.strike) || isValidNumber(selectedFaultPlane.dip)) && "| "}<strong className={highlightClass}>Rake:</strong> {formatNumber(selectedFaultPlane.rake,0)}°</>}
                                            </p>
                                            {isValidString(selectedFaultPlane.description) && <p className="mt-1">{selectedFaultPlane.description}</p>}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* --- Decoding the Fault Panel (with explanations) --- */}
                            {/* Render if selectedFaultPlane has valid strike, dip, or rake for explanations */}
                            {(isValidNumber(selectedFaultPlane.strike) || isValidNumber(selectedFaultPlane.dip) || isValidNumber(selectedFaultPlane.rake)) && (
                                <div className={`${exhibitPanelClass} border-green-500`}>
                                    <h2 className={`${exhibitTitleClass} text-green-800 border-green-200`}>Decoding the Fault Parameters</h2>
                                    <p className="text-xs text-slate-600 mb-3">Parameters for <strong className="font-semibold text-indigo-600">{selectedFaultPlaneKey === 'np1' ? 'Nodal Plane 1' : 'Nodal Plane 2'}</strong>:</p>
                                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                                        {isValidNumber(selectedFaultPlane.strike) && (
                                            <div className="p-2 bg-blue-50 rounded-lg shadow">
                                                <strong className="block text-blue-700 text-sm">Strike ({formatNumber(selectedFaultPlane.strike,0)}°)</strong>
                                                <svg width="100" height="75" viewBox="0 0 160 120" className="mx-auto my-1"><rect x="5" y="40" width="150" height="75" fill="#e9ecef" stroke="#adb5bd" strokeWidth="1"/><text x="80" y="30" fontSize="10" textAnchor="middle" fill="#495057">Surface</text><path d="M20 105 L75 50 L140 65 L85 120 Z" fill="#ced4da" stroke="#495057" strokeWidth="1.5" /><line x1="75" y1="50" x2="140" y2="65" stroke="#dc3545" strokeWidth="2.5" /><text x="15" y="15" fontSize="10" textAnchor="middle" fill="#333">N</text><path d="M15 20 L15 30" stroke="black" strokeWidth="1" markerEnd="url(#arrow-north-strike-detail)"/><defs><marker id="arrow-north-strike-detail" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 5 5 L 0 10 z" fill="black" /></marker></defs></svg>
                                                <p className="text-xs text-slate-600">Compass direction of the fault's intersection with the surface (e.g., {formatNumber(selectedFaultPlane.strike,0)}° means roughly {selectedFaultPlane.strike > 337.5 || selectedFaultPlane.strike <= 22.5 ? "North" : selectedFaultPlane.strike <= 67.5 ? "NE" : selectedFaultPlane.strike <= 112.5 ? "East" : selectedFaultPlane.strike <= 157.5 ? "SE" : selectedFaultPlane.strike <= 202.5 ? "South" : selectedFaultPlane.strike <= 247.5 ? "SW" : selectedFaultPlane.strike <= 292.5 ? "West" : "NW"}).</p>
                                            </div>
                                        )}
                                        {isValidNumber(selectedFaultPlane.dip) && (
                                            <div className="p-2 bg-red-50 rounded-lg shadow">
                                                <strong className="block text-red-700 text-sm">Dip ({formatNumber(selectedFaultPlane.dip,0)}°)</strong>
                                                <svg width="100" height="75" viewBox="0 0 160 120" className="mx-auto my-1"><line x1="10" y1="40" x2="150" y2="40" stroke="#adb5bd" strokeWidth="1.5" /><text x="80" y="30" fontSize="10" textAnchor="middle" fill="#495057">Surface</text><line x1="40" y1="40" x2="120" y2="100" stroke="#495057" strokeWidth="2" /><path d="M 40 40 C 55 40, 60 48, 65 55" fill="none" stroke="#28a745" strokeWidth="1.5" /><text x="75" y="55" fontSize="10" fill="#28a745" fontWeight="bold">{formatNumber(selectedFaultPlane.dip,0)}°</text></svg>
                                                <p className="text-xs text-slate-600">Angle the fault plane tilts down from horizontal (0° is flat, 90° is vertical).</p>
                                            </div>
                                        )}
                                        {isValidNumber(selectedFaultPlane.rake) && (
                                            <div className="p-2 bg-emerald-50 rounded-lg shadow">
                                                <strong className="block text-emerald-700 text-sm">Rake ({formatNumber(selectedFaultPlane.rake,0)}°)</strong>
                                                <svg width="100" height="75" viewBox="0 0 160 120" className="mx-auto my-1">
                                                    <rect x="25" y="10" width="110" height="100" fill="#e0e7ff" stroke="#6d28d9" strokeWidth="1.5" />
                                                    <line x1="25" y1="60" x2="135" y2="60" stroke="#4f46e5" strokeWidth="1" strokeDasharray="2,2" />
                                                    <defs><marker id="arrow-rake-detail-diag" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="strokeWidth" markerWidth="4" markerHeight="3" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#16a34a"/></marker></defs>
                                                    <line x1="80" y1="60" x2="50" y2="80" stroke="#16a34a" strokeWidth="2.5" markerEnd="url(#arrow-rake-detail-diag)" transform={`rotate(${selectedFaultPlane.rake} 80 60)`} />
                                                    <text x="70" y="95" fontSize="10" fill="#16a34a" fontWeight="bold">{formatNumber(selectedFaultPlane.rake,0)}°</text>
                                                </svg>
                                                <p className="text-xs text-slate-600">Direction of slip along the fault plane (e.g., ~0° for left-lateral, ~180° for right-lateral, ~90° for reverse, ~-90° for normal).</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}


                    {/* --- Mww Explanation Panel --- */}
                    {isValidString(properties?.magType) && isValidNumber(scalarMomentValue) && isValidNumber(properties?.mag) && (
                        <div className={`${exhibitPanelClass} border-pink-500`}>
                            <h2 className={`${exhibitTitleClass} text-pink-800 border-pink-200`}>Mww: The Modern Measure</h2>
                            <p>This earthquake was <strong className={highlightClass}>{properties.magType.toUpperCase()} {formatNumber(properties.mag,1)}</strong>.</p>
                            <ul className="list-disc list-inside text-xs md:text-sm text-slate-600 mt-2 space-y-1">
                                <li>Moment Magnitude (Mww) is standard for moderate to large quakes.</li>
                                <li>Based on Seismic Moment: <strong className={highlightClass}>{formatLargeNumber(scalarMomentValue)} N-m</strong> for this event.</li>
                                <li>Seismic Moment considers: fault area, slip amount, and rock rigidity.</li>
                                <li>Mww accurately represents energy differences, unlike older scales.</li>
                            </ul>
                        </div>
                    )}

                    {/* --- Magnitude Comparison Bar Chart Panel --- */}
                    {/* This panel is mostly static except for "This Quake" bar, so it can always render its structure */}
                    <div className={`${exhibitPanelClass} border-rose-500`}>
                        <h2 className={`${exhibitTitleClass} text-rose-800 border-rose-200`}>Magnitude Comparison</h2>
                        <div className="flex items-end justify-around h-48 md:h-56 w-full p-4 bg-rose-50 rounded-md mt-2 relative">
                            {[
                                {h:20,l:"M2-3",b:"Minor"},
                                {h:40,l:"M4-5",b:"Light"},
                                {
                                    h: isValidNumber(properties?.mag) ? Math.max(10, Math.min(80, (parseFloat(properties.mag)) * 10 + 5)) : 10, // Default height if mag is invalid
                                    l: isValidNumber(properties?.mag) ? `M${formatNumber(properties.mag,1)}` : 'M?',
                                    b:"This Quake",
                                    current:true
                                },
                                {h:70,l:"M6-7",b:"Strong"},
                                {h:90,l:"M7+",b:"Major"}
                            ].map(bar => (
                                <div key={bar.l} title={`${bar.l} - ${bar.b}`} className="relative text-center w-[18%]" style={{height: `${bar.h}%`}}>
                                    <div className={`h-full rounded-t-sm transition-all duration-300 ${bar.current ? 'bg-rose-500 border-2 border-rose-700' : 'bg-sky-400 hover:bg-sky-500'}`} style={{backgroundColor: !bar.current ? bar.c : undefined}}></div>
                                    <div className={`absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-semibold ${bar.current ? 'text-rose-700' : 'text-sky-700'}`}>{bar.l}</div>
                                    <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-slate-600 whitespace-nowrap">{bar.b}</div>
                                </div>
                            ))}
                        </div>
                        <p className={captionClass}>Magnitudes are logarithmic: each whole number is ~32x more energy.</p>
                    </div>

                    {/* --- What Pushed and Pulled Panel (Stress Axes) --- */}
                    {pAxis && tAxis && (isValidNumber(pAxis.azimuth) || isValidNumber(pAxis.plunge) || isValidNumber(tAxis.azimuth) || isValidNumber(tAxis.plunge)) && (
                        <div className={`${exhibitPanelClass} border-lime-500`}>
                            <h2 className={`${exhibitTitleClass} text-lime-800 border-lime-200`}>What Pushed and Pulled? (Stress Axes)</h2>
                            <div className={`${diagramContainerClass} bg-green-50`} style={{minHeight: '180px'}}>
                                <svg width="300" height="150" viewBox="0 0 300 200">
                                    <rect x="100" y="50" width="100" height="100" fill="#d1fae5" stroke="#065f46" strokeWidth="2"/>
                                    <text x="150" y="105" fontFamily="Inter, sans-serif" fontSize="14" fill="#065f46" textAnchor="middle">Crust Block</text>
                                    <defs><marker id="arrRedDetailPush" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 3.5, 10 0, 10 7" fill="#dc2626"/></marker><marker id="arrBlueDetailPull" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#2563eb"/></marker></defs>
                                    {/* P-axis elements only if pAxis.azimuth is valid */}
                                    {isValidNumber(pAxis.azimuth) && (
                                        <>
                                            <line x1="30" y1="100" x2="95" y2="100" stroke="#dc2626" strokeWidth="4" markerEnd="url(#arrRedDetailPush)" />
                                            <line x1="270" y1="100" x2="205" y2="100" stroke="#dc2626" strokeWidth="4" markerEnd="url(#arrRedDetailPush)" />
                                            <text x="65" y="130" fontSize="10" fill="#dc2626" textAnchor="middle">SQUEEZE (P-axis: {formatNumber(pAxis.azimuth,0)}°)</text>
                                        </>
                                    )}
                                    {/* T-axis elements only if tAxis.azimuth is valid */}
                                    {isValidNumber(tAxis.azimuth) && (
                                        <>
                                            <line x1="150" y1="20" x2="150" y2="45" stroke="#2563eb" strokeWidth="4" markerStart="url(#arrBlueDetailPull)" />
                                            <line x1="150" y1="180" x2="150" y2="155" stroke="#2563eb" strokeWidth="4" markerStart="url(#arrBlueDetailPull)" />
                                            <text x="150" y="15" fontSize="10" fill="#2563eb" textAnchor="middle">STRETCH (T-axis: {formatNumber(tAxis.azimuth,0)}°)</text>
                                        </>
                                    )}
                                </svg>
                            </div>
                            <p className={captionClass}>P-axis (Pressure) shows main squeeze direction. T-axis (Tension) shows main stretch.</p>
                        </div>
                    )}

                    {/* --- Beach Ball Panel --- */}
                    {momentTensorProductProps && (isValidNumber(np1Data.strike) || isValidNumber(np2Data.strike) || isValidNumber(pAxis.azimuth) || isValidNumber(tAxis.azimuth)) && (
                        <div className={`${exhibitPanelClass} border-teal-500`}>
                            <h2 className={`${exhibitTitleClass} text-teal-800 border-teal-200`}>"Beach Ball" Diagram</h2>
                            <div className={`${diagramContainerClass} bg-sky-50`} style={{ minHeight: '220px' }}>
                                <svg width="150" height="150" viewBox="0 0 120 120">
                                    <circle cx="60" cy="60" r="50" fill="white" stroke="black" strokeWidth="0.5" />
                                    {isValidNumber(np1Data.strike) && <line x1="60" y1="10" x2="60" y2="110" stroke="#333" strokeWidth="1" transform={`rotate(${-np1Data.strike} 60 60)`} />}
                                    {isValidNumber(np2Data.strike) && <line x1="10" y1="60" x2="110" y2="60" stroke="#333" strokeWidth="1" transform={`rotate(${-np2Data.strike+90} 60 60)`} />}
                                    {isValidNumber(np1Data.strike) && isValidNumber(np2Data.strike) && <path d={`M ${60 + 50*Math.cos((-np1Data.strike-90)*Math.PI/180)} ${60 + 50*Math.sin((-np1Data.strike-90)*Math.PI/180)} A 50 50 0 0 1 ${60 + 50*Math.cos((-np2Data.strike)*Math.PI/180)} ${60 + 50*Math.sin((-np2Data.strike)*Math.PI/180)} L 60 60 Z`} fill="#cccccc" />}
                                    {pAxis && isValidNumber(pAxis.azimuth) && <text x="60" y="60" transform={`rotate(${pAxis.azimuth} 60 60) translate(0 -30)`} className="text-xs font-bold fill-red-600" textAnchor="middle">P</text>}
                                    {tAxis && isValidNumber(tAxis.azimuth) && <text x="60" y="60" transform={`rotate(${tAxis.azimuth} 60 60) translate(0 30)`} className="text-xs font-bold fill-blue-600" textAnchor="middle">T</text>}
                                    <text x="60" y="8" fontSize="8" textAnchor="middle" fill="#555">N</text>
                                </svg>
                            </div>
                            <p className={captionClass}>Conceptual focal mechanism (beach ball) showing fault planes and stress axes. Shaded areas often represent compressional first motions, white areas tensional, depending on projection.</p>
                        </div>
                    )}

                    {/* --- Further Information Panel --- */}
                    {isValidString(properties?.url) && (
                        <div className={`${exhibitPanelClass} border-gray-400`}>
                            <h2 className={`${exhibitTitleClass} text-gray-700 border-gray-200`}>Further Information</h2>
                            <p className="text-xs md:text-sm text-slate-600">
                                For the most comprehensive and up-to-date scientific details, including additional data products, maps, and information from contributing seismic networks, please refer to the official
                                <a href={properties.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline ml-1">
                                    USGS Event Page
                                </a>.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default EarthquakeDetailView;
