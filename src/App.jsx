import React, {useState, useEffect, useMemo, useCallback, useRef} from 'react';
import EarthquakeDetailView                                       from './EarthquakeDetailView'; // Assuming EarthquakeDetailView.jsx is in the same folder

// --- Configuration & Helpers ---
const USGS_API_URL_DAY = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
const USGS_API_URL_WEEK = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson';
const USGS_API_URL_MONTH = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson';
const MAJOR_QUAKE_THRESHOLD = 5.0;
const FEELABLE_QUAKE_THRESHOLD = 2.5;
const FELT_REPORTS_THRESHOLD = 0;
const SIGNIFICANCE_THRESHOLD = 0;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const LOADING_MESSAGE_INTERVAL_MS = 750;
const HEADER_TIME_UPDATE_INTERVAL_MS = 60 * 1000;
const BANNER_TIME_UPDATE_INTERVAL_MS = 1000;

const INITIAL_LOADING_MESSAGES = [
    "Fetching Most Recent Events...", "Processing Daily Data...",
    "Fetching 7-Day Data...", "Processing 7-Day Data...",
    "Almost there..."
];

const MONTHLY_LOADING_MESSAGES = [
    "Fetching 14 & 30-Day Data...", "Processing Extended Data...",
    "Analyzing Full History...", "Reticulating Splines", "Calculating Final Summaries...",
];

const ALERT_LEVELS = {
    RED: { text: "RED", colorClass: "bg-red-100 border-red-500 text-red-700", detailsColorClass: "bg-red-50 border-red-400 text-red-800", description: "Potential for 1,000+ fatalities / $1B+ losses." },
    ORANGE: { text: "ORANGE", colorClass: "bg-orange-100 border-orange-500 text-orange-700", detailsColorClass: "bg-orange-50 border-orange-400 text-orange-800", description: "Potential for 100-999 fatalities / $100M-$1B losses." },
    YELLOW: { text: "YELLOW", colorClass: "bg-yellow-100 border-yellow-500 text-yellow-700", detailsColorClass: "bg-yellow-50 border-yellow-400 text-yellow-800", description: "Potential for 1-99 fatalities / $1M-$100M losses." },
    GREEN: { text: "GREEN", colorClass: "bg-green-100 border-green-500 text-green-700", detailsColorClass: "", description: "No significant impact expected (<1 fatality / <$1M losses)." }
};


const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
};
const formatTimeAgo = (milliseconds) => {
    if (milliseconds === null || milliseconds < 0) return 'N/A';
    if (milliseconds < 30000) return 'just now';
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hr${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
    return `${seconds} sec${seconds !== 1 ? 's' : ''} ago`;
};
const formatTimeDuration = (milliseconds) => {
    if (milliseconds === null || milliseconds < 0) return 'N/A';
    const totalSeconds = Math.floor(milliseconds / 1000);
    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    let parts = [];
    if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hr${hours > 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} min${minutes > 1 ? 's' : ''}`);
    if (seconds >= 0 && parts.length < 3) parts.push(`${seconds} sec${seconds !== 1 ? 's' : ''}`);
    if (parts.length === 0 && milliseconds >= 0) return "0 sec";
    return parts.join(', ');
};
const getMagnitudeColor = (magnitude) => {
    if (magnitude === null || magnitude === undefined) return '#D1D5DB';
    if (magnitude < 1) return '#6EE7B7';
    if (magnitude < 2.5) return '#34D399';
    if (magnitude < 4.5) return '#FDE047';
    if (magnitude < 6.0) return '#FB923C';
    if (magnitude < 7.5) return '#F97316';
    return '#EF4444';
};
const getMagnitudeColorStyle = (magnitude) => {
    if (magnitude === null || magnitude === undefined) return 'bg-gray-100';
    if (magnitude < 1) return 'bg-green-100';
    if (magnitude < 2.5) return 'bg-green-200';
    if (magnitude < 4.5) return 'bg-yellow-200';
    if (magnitude < 6.0) return 'bg-orange-300';
    if (magnitude < 7.5) return 'bg-red-300';
    return 'bg-red-400';
};
const REGIONS = [{ name: "Alaska & W. Canada", latMin: 50, latMax: 72, lonMin: -170, lonMax: -125, color: "#8B5CF6" }, { name: "California & W. USA", latMin: 30, latMax: 50, lonMin: -125, lonMax: -110, color: "#EC4899" }, { name: "Japan & Kuril Isl.", latMin: 25, latMax: 50, lonMin: 125, lonMax: 155, color: "#10B981" }, { name: "Indonesia & Philippines", latMin: -10, latMax: 25, lonMin: 95, lonMax: 140, color: "#F59E0B" }, { name: "S. America (Andes)", latMin: -55, latMax: 10, lonMin: -80, lonMax: -60, color: "#3B82F6" }, { name: "Mediterranean", latMin: 30, latMax: 45, lonMin: -10, lonMax: 40, color: "#6EE7B7" }, { name: "Central America", latMin: 5, latMax: 30, lonMin: -118, lonMax: -77, color: "#FBBF24" }, { name: "New Zealand & S. Pacific", latMin: -55, latMax: -10, lonMin: 160, lonMax: -150, color: "#A78BFA" }, { name: "Other / Oceanic", latMin: -90, latMax: 90, lonMin: -180, lonMax: 180, color: "#9CA3AF" }];
const getRegionForEarthquake = (quake) => { const lon = quake.geometry?.coordinates?.[0]; const lat = quake.geometry?.coordinates?.[1]; if (lon === null || lat === null || lon === undefined || lat === undefined) return REGIONS[REGIONS.length - 1]; for (let i = 0; i < REGIONS.length - 1; i++) { const region = REGIONS[i]; if (lat >= region.latMin && lat <= region.latMax && lon >= region.lonMin && lon <= region.lonMax) return region; } return REGIONS[REGIONS.length - 1]; };
const calculateStats = (earthquakes) => { const baseStats = { totalEarthquakes: 0, averageMagnitude: 'N/A', strongestMagnitude: 'N/A', significantEarthquakes: 0, feelableEarthquakes: 0, averageDepth: 'N/A', deepestEarthquake: 'N/A', averageSignificance: 'N/A', highestAlertLevel: null }; if (!earthquakes || earthquakes.length === 0) return baseStats; const totalEarthquakes = earthquakes.length; const mags = earthquakes.map(q => q.properties.mag).filter(m => m !== null && typeof m === 'number'); const avgMag = mags.length > 0 ? (mags.reduce((a, b) => a + b, 0) / mags.length) : null; const strongMag = mags.length > 0 ? Math.max(...mags) : null; const depths = earthquakes.map(q => q.geometry?.coordinates?.[2]).filter(d => d !== null && typeof d === 'number'); const avgDepth = depths.length > 0 ? (depths.reduce((a, b) => a + b, 0) / depths.length) : null; const deepQuake = depths.length > 0 ? Math.max(...depths) : null; const sigQuakes = earthquakes.filter(q => q.properties.mag !== null && q.properties.mag >= 4.5).length; const feelQuakes = earthquakes.filter(q => q.properties.mag !== null && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD).length; const sigs = earthquakes.map(q => q.properties.sig).filter(s => s !== null && typeof s === 'number'); const avgSig = sigs.length > 0 ? Math.round(sigs.reduce((a, b) => a + b, 0) / sigs.length) : null; const alerts = earthquakes.map(q => q.properties.alert).filter(a => a && a !== 'green'); const highAlert = alerts.length > 0 ? alerts.sort((a,b) => { const order = { 'red':0, 'orange':1, 'yellow':2 }; return order[a] - order[b]; })[0] : null; return { totalEarthquakes, averageMagnitude: avgMag?.toFixed(2) || "N/A", strongestMagnitude: strongMag?.toFixed(1) || "N/A", significantEarthquakes: sigQuakes, feelableEarthquakes: feelQuakes, averageDepth: avgDepth?.toFixed(1) || "N/A", deepestEarthquake: deepQuake?.toFixed(1) || "N/A", averageSignificance: avgSig || "N/A", highestAlertLevel: highAlert }; };

const SkeletonText = ({width = 'w-3/4', height = 'h-4'}) => <div className={`bg-gray-300 rounded ${width} ${height} animate-pulse mb-2`}></div>;
const SkeletonBlock = ({height = 'h-24'}) => <div className={`bg-gray-300 rounded ${height} animate-pulse`}></div>;
const SkeletonListItem = () => <div className="flex items-center justify-between p-2 bg-gray-200 rounded animate-pulse mb-2"><SkeletonText width="w-1/2"/><SkeletonText width="w-1/4"/></div>;
const SkeletonTableRow = ({cols = 4}) => (<tr className="animate-pulse">{[...Array(cols)].map((_, i) => (<td key={i} className="px-3 py-2 sm:px-4 whitespace-nowrap"><SkeletonText width="w-full"/></td>))}</tr>);

const TimeSinceLastMajorQuakeBanner = React.memo(({ lastMajorQuake, timeBetweenPreviousMajorQuakes, isLoadingInitial, isLoadingMonthly, currentTime, majorQuakeThreshold }) => {
    const bannerLoading = isLoadingInitial || (isLoadingMonthly && !lastMajorQuake);
    if (bannerLoading && !lastMajorQuake) { return ( <div className="bg-white p-6 mb-8 rounded-lg border border-gray-200 text-center animate-pulse"><SkeletonText width="w-1/4 mx-auto"/> <div className="h-10 bg-gray-300 rounded w-1/2 mx-auto my-2"></div> <SkeletonText width="w-1/3 mx-auto"/><SkeletonText width="w-full mx-auto mt-2" height="h-5"/> <hr className="my-4 border-gray-200"/> <SkeletonText width="w-1/4 mx-auto"/> <div className="h-8 bg-gray-300 rounded w-1/3 mx-auto my-2"></div> <SkeletonText width="w-1/3 mx-auto"/></div>); }
    if (!lastMajorQuake && !isLoadingInitial && !isLoadingMonthly) { return ( <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6 rounded-md text-center"><p className="font-bold text-lg">No significant earthquakes (M{majorQuakeThreshold.toFixed(1)}+) recorded in the available data period.</p></div>); }

    const timeSinceLast = lastMajorQuake ? currentTime - lastMajorQuake.properties.time : null;
    const timeAgoFormatted = timeSinceLast !== null ? formatTimeDuration(timeSinceLast) : (lastMajorQuake ? 'Calculating...' : 'N/A');
    const region = lastMajorQuake ? getRegionForEarthquake(lastMajorQuake) : null;
    const location = lastMajorQuake?.properties.place || 'Unknown Location';
    const prevIntervalFmt = timeBetweenPreviousMajorQuakes !== null ? formatTimeDuration(timeBetweenPreviousMajorQuakes) : null;
    const mag = lastMajorQuake?.properties.mag?.toFixed(1);
    const depth = lastMajorQuake?.geometry?.coordinates?.[2]?.toFixed(1);
    const magColor = lastMajorQuake ? getMagnitudeColor(lastMajorQuake.properties.mag) : '#D1D5DB';
    return (<div className="bg-white p-6 mb-8 rounded-lg border border-gray-200 text-center">
        <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">IT HAS BEEN:</p>
        <p className="text-3xl md:text-4xl font-bold text-indigo-700 tracking-tight mb-3 min-h-[48px] md:min-h-[56px] flex items-center justify-center">{timeAgoFormatted || <SkeletonText width="w-1/2 mx-auto" height="h-10"/>}</p>
        <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Since the last significant (M<span style={{color: magColor, fontWeight: 'bold'}}>{majorQuakeThreshold.toFixed(1)}</span>+) earthquake.</p>
        {lastMajorQuake ? (<p className="text-base text-gray-800 mt-2 mb-4">(M<span style={{ color: magColor, fontWeight: 'bold' }}>{mag || '...'}</span>{depth !== undefined ? `, ${depth}km depth` : ''}){region ? <> in <span className="font-semibold" style={{color: region.color}}>{region.name}</span></> : ''} - {location || 'Details Pending...'}<a href={lastMajorQuake.properties.url} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-700 ml-2 text-xs">(details)</a></p>) : (<SkeletonText width="w-full mx-auto mt-2 mb-4" height="h-5"/>)}
        <hr className="my-4 border-gray-200"/>
        {isLoadingMonthly && !prevIntervalFmt && lastMajorQuake ? (<><SkeletonText width="w-1/4 mx-auto"/> <div className="h-8 bg-gray-300 rounded w-1/3 mx-auto my-2"></div> <SkeletonText width="w-1/3 mx-auto"/></>) : (<><p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">PREVIOUSLY IT HAD BEEN:</p><p className="text-2xl md:text-3xl font-bold text-gray-600 tracking-tight mb-3 min-h-[36px] md:min-h-[44px] flex items-center justify-center">{prevIntervalFmt ?? (lastMajorQuake ? 'N/A (Only one M5+ found or data pending)' : 'N/A')}</p><p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Between significant earthquakes.</p></>)}
    </div>);
});

const SummaryStatisticsCard = React.memo(({title, currentPeriodData, previousPeriodData = null, isLoading}) => { if (isLoading || currentPeriodData === null) { return (<div className="bg-white p-6 rounded-lg border border-gray-200"><h3 className="text-xl font-semibold mb-4 text-gray-700">{title}</h3> <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">{[...Array(8)].map((_, i) => ( <div key={i} className="bg-gray-100 p-3 rounded-lg text-center animate-pulse"><SkeletonText width="w-1/2 mx-auto" height="h-8 mb-2"/><SkeletonText width="w-3/4 mx-auto" height="h-4"/> </div>))}</div> </div>); } if (currentPeriodData.length === 0 && !["Summary (Last Hour)", "Summary (Last 24 Hours)"].includes(title)) { return (<div className="bg-white p-6 rounded-lg border border-gray-200"><h3 className="text-xl font-semibold mb-4 text-gray-700">{title}</h3><p className="text-gray-600 text-center py-4">No earthquake data for this period.</p></div>); } const currentStats = calculateStats(currentPeriodData); const previousStats = previousPeriodData ? calculateStats(previousPeriodData) : null; const getTrendDisplay = (currentValue, previousValue) => { if (!previousValue || previousValue === 'N/A' || currentValue === 'N/A' || ["Summary (Last Hour)", "Summary (Last 24 Hours)"].includes(title)) return null; const currentNum = parseFloat(currentValue); const previousNum = parseFloat(previousValue); if (isNaN(currentNum) || isNaN(previousNum)) return null; const diff = currentNum - previousNum; const isCount = !String(currentValue).includes('.'); if (!isCount && Math.abs(diff) < 0.05 && currentNum !== 0) return null; if (isCount && diff === 0) return null; const trendColor = diff > 0 ? 'text-red-500' : diff < 0 ? 'text-green-500' : 'text-gray-500'; const trendSign = diff > 0 ? '▲' : diff < 0 ? '▼' : ''; return <span className={`ml-1 text-xs ${trendColor}`}>{trendSign} {Math.abs(diff).toFixed(String(currentValue).includes('.') ? 1 : 0)}</span>; }; const statsToDisplay = [{ label: 'Total Events', value: currentStats.totalEarthquakes, trend: getTrendDisplay(currentStats.totalEarthquakes, previousStats?.totalEarthquakes) }, { label: 'Avg. Magnitude', value: currentStats.averageMagnitude, trend: getTrendDisplay(currentStats.averageMagnitude, previousStats?.averageMagnitude) }, { label: 'Strongest Mag.', value: currentStats.strongestMagnitude, trend: getTrendDisplay(currentStats.strongestMagnitude, previousStats?.strongestMagnitude) }, { label: `Feelable (M${FEELABLE_QUAKE_THRESHOLD.toFixed(1)}+)`, value: currentStats.feelableEarthquakes, trend: getTrendDisplay(currentStats.feelableEarthquakes, previousStats?.feelableEarthquakes) }, { label: 'Significant (M4.5+)', value: currentStats.significantEarthquakes, trend: getTrendDisplay(currentStats.significantEarthquakes, previousStats?.significantEarthquakes) }, { label: 'Avg. Depth (km)', value: currentStats.averageDepth, trend: getTrendDisplay(currentStats.averageDepth, previousStats?.averageDepth) }, { label: 'Deepest (km)', value: currentStats.deepestEarthquake, trend: getTrendDisplay(currentStats.deepestEarthquake, previousStats?.deepestEarthquake) }, { label: 'Avg. Significance', value: currentStats.averageSignificance, trend: getTrendDisplay(currentStats.averageSignificance, previousStats?.averageSignificance) },]; return (<div className="bg-white p-6 rounded-lg border border-gray-200"><h3 className="text-xl font-semibold mb-4 text-gray-700">{title}</h3>{currentPeriodData.length === 0 && ["Summary (Last Hour)", "Summary (Last 24 Hours)"].includes(title) && ( <p className="text-gray-500 text-center py-4 text-sm">No earthquakes recorded in this period.</p>)}{currentPeriodData.length > 0 && ( <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">{statsToDisplay.map(stat => ( <div key={stat.label} className="bg-indigo-50 p-3 rounded-lg text-center border border-indigo-100"><p className="text-xl md:text-2xl font-bold text-indigo-600">{stat.value}{stat.trend}</p><p className="text-xs md:text-sm text-gray-600">{stat.label}</p></div>))}</div>)}</div>);});

const RegionalDistributionList = React.memo(({earthquakes, titleSuffix = "(Last 30 Days)", isLoading}) => { const regionalData = useMemo(() => { if (!earthquakes) return []; const counts = REGIONS.map(r => ({...r, count: 0})); earthquakes.forEach(q => { const region = getRegionForEarthquake(q); const rc = counts.find(r => r.name === region.name); if (rc) rc.count++; }); return counts.filter(r => r.count > 0).sort((a, b) => b.count - a.count); }, [earthquakes]); if (isLoading) return (<div className="bg-white p-4 rounded-lg mt-4 border border-gray-200"><h3 className="text-lg font-semibold mb-2 text-gray-700">Regional Distribution {titleSuffix}</h3> <ul className="space-y-2">{[...Array(5)].map((_, i) => <SkeletonListItem key={i}/>)}</ul> </div>); if ((!earthquakes || earthquakes.length === 0 || regionalData.length === 0) && titleSuffix === '(Last Hour)') return null; if (!earthquakes || earthquakes.length === 0 || regionalData.length === 0) return ( <div className="bg-white p-4 rounded-lg mt-4 border border-gray-200"><h3 className="text-lg font-semibold mb-2 text-gray-700">Regional Distribution {titleSuffix}</h3><p className="text-sm text-gray-500 text-center">No regional earthquake data.</p></div>); return (<div className="bg-white p-4 rounded-lg mt-4 border border-gray-200"><h3 className="text-lg font-semibold mb-2 text-gray-700">Regional Distribution {titleSuffix}</h3> <ul className="space-y-2">{regionalData.map(region => (<li key={region.name} className="flex items-center justify-between p-2 bg-gray-50 rounded hover:bg-gray-100"> <div className="flex items-center min-w-0 mr-2"><span className="w-4 h-4 rounded-sm mr-3 flex-shrink-0" style={{backgroundColor: region.color}}></span><span className="text-sm text-gray-700 truncate" title={region.name}>{region.name}</span></div> <span className="text-sm font-medium text-indigo-600 flex-shrink-0">{region.count}</span></li>))}</ul> </div>); });

const MagnitudeDistributionSVGChart = React.memo(({earthquakes, titleSuffix = "(Last 30 Days)", isLoading}) => { const magnitudeRanges = useMemo(() => [{name: '<1', min: -Infinity, max: 0.99, color: '#6EE7B7'}, { name : '1-1.9', min : 1, max : 1.99, color: '#34D399' }, {name: '2-2.9', min: 2, max: 2.99, color: '#A7F3D0'}, { name : '3-3.9', min : 3, max : 3.99, color: '#FDE047' }, {name: '4-4.9', min: 4, max: 4.99, color: '#FACC15'}, { name : '5-5.9', min : 5, max : 5.99, color: '#FB923C' }, {name: '6-6.9', min: 6, max: 6.99, color: '#F97316'}, { name : '7+', min : 7, max : Infinity, color: '#EF4444' },], []); const data = useMemo(() => { if (!earthquakes) return []; return magnitudeRanges.map(range => ({ name : range.name, count: earthquakes.filter(q => q.properties.mag !== null && q.properties.mag >= range.min && q.properties.mag <= range.max).length, color: range.color })); }, [earthquakes, magnitudeRanges]); if (isLoading) return <div className="bg-white p-4 rounded-lg border border-gray-200 overflow-x-auto"><h3 className="text-xl font-semibold mb-4 text-gray-700">Magnitude Distribution {titleSuffix}</h3><SkeletonBlock height="h-[340px]"/></div>; if (!earthquakes || earthquakes.length === 0) return <div className="bg-white p-4 rounded-lg border border-gray-200 overflow-x-auto"><h3 className="text-xl font-semibold mb-4 text-gray-700">Magnitude Distribution {titleSuffix}</h3><p className="text-gray-600 p-4 text-center">No data for chart.</p></div>; const chartHeight = 300; const barPadding = 10; const barWidth = 40; const yAxisLabelOffset = 45; const xAxisLabelOffset = 40; const svgWidth = data.length * (barWidth + barPadding) + yAxisLabelOffset; const maxCount = Math.max(...data.map(d => d.count), 0); const yAxisLabels = []; if (maxCount > 0) { const numL = 5; const step = Math.ceil(maxCount / numL) || 1; for (let i = 0; i <= maxCount; i += step) { if (yAxisLabels.length <= numL) yAxisLabels.push(i); else break; } if (!yAxisLabels.includes(maxCount) && yAxisLabels.length <= numL && maxCount > 0) yAxisLabels.push(maxCount); } else { yAxisLabels.push(0); } return (<div className="bg-white p-4 rounded-lg border border-gray-200 overflow-x-auto"><h3 className="text-xl font-semibold mb-4 text-gray-700">Magnitude Distribution {titleSuffix}</h3> <svg width="100%" height={chartHeight + xAxisLabelOffset} viewBox={`0 0 ${svgWidth} ${chartHeight + xAxisLabelOffset}`} className="overflow-visible"> <text transform={`translate(${yAxisLabelOffset / 3}, ${chartHeight / 2}) rotate(-90)`} textAnchor="middle" className="text-sm fill-current text-gray-600">Count </text> <text x={yAxisLabelOffset + (svgWidth - yAxisLabelOffset) / 2} y={chartHeight + xAxisLabelOffset - 5} textAnchor="middle" className="text-sm fill-current text-gray-600">Magnitude Range </text> {yAxisLabels.map((l, i) => { const yP = chartHeight - (l / (maxCount > 0 ? maxCount : 1) * chartHeight); return (<g key={`y-mag-${i}`}> <text x={yAxisLabelOffset - 5} y={yP + 4} textAnchor="end" className="text-xs fill-current text-gray-500">{l}</text> <line x1={yAxisLabelOffset} y1={yP} x2={svgWidth} y2={yP} stroke="#e5e7eb" strokeDasharray="2,2"/> </g>); })}{data.map((item, i) => { const bH = maxCount > 0 ? (item.count / maxCount) * chartHeight : 0; const x = yAxisLabelOffset + i * (barWidth + barPadding); const y = chartHeight - bH; return (<g key={item.name}><title>{`${item.name}: ${item.count}`}</title> <rect x={x} y={y} width={barWidth} height={bH} fill={item.color} className="transition-all duration-300 ease-in-out hover:opacity-75"/> <text x={x + barWidth / 2} y={chartHeight + 15} textAnchor="middle" className="text-xs fill-current text-gray-600">{item.name}</text> <text x={x + barWidth / 2} y={y - 5 > 10 ? y - 5 : 10} textAnchor="middle" className="text-xs font-medium fill-current text-gray-700">{item.count > 0 ? item.count : ''}</text> </g>); })}</svg> </div>);});

const EarthquakeTimelineSVGChart = React.memo(({earthquakes, days = 7, titleSuffix = "(Last 7 Days)", isLoading}) => { const data = useMemo(() => { if (!earthquakes) return []; const countsByDay = {}; const today = new Date(); today.setHours(0, 0, 0, 0); const startDate = new Date(today); startDate.setDate(today.getDate() - (days - 1)); for (let i = 0; i < days; i++) { const d = new Date(startDate); d.setDate(startDate.getDate() + i); countsByDay[d.toLocaleDateString([], {month: 'short', day: 'numeric'})] = 0; } earthquakes.forEach(q => { const eD = new Date(q.properties.time); if (eD >= startDate && eD <= new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)) { const dS = eD.toLocaleDateString([], {month: 'short', day: 'numeric'}); if (countsByDay.hasOwnProperty(dS)) countsByDay[dS]++; } }); return Object.entries(countsByDay).map(([date, count]) => ({date, count})); }, [earthquakes, days]); if (isLoading) return <div className="bg-white p-4 rounded-lg border border-gray-200 overflow-x-auto"><h3 className="text-xl font-semibold mb-4 text-gray-700">Earthquake Frequency {titleSuffix}</h3><SkeletonBlock height="h-[340px]"/></div>; if (!earthquakes || earthquakes.length === 0 || data.length === 0) return <div className="bg-white p-4 rounded-lg border border-gray-200 overflow-x-auto"><h3 className="text-xl font-semibold mb-4 text-gray-700">Earthquake Frequency {titleSuffix}</h3><p className="text-gray-600 p-4 text-center">No data for chart.</p></div>; const chartHeight = 300; const lblInt = days > 15 ? Math.floor(days / 7) : (days > 7 ? 2 : 1); const barW = days > 15 ? (days > 25 ? 15 : 20) : 30; const barP = days > 15 ? 5 : 8; const yOffset = 45; const xOffset = 40; const svgW = data.length * (barW + barP) + yOffset; const maxC = Math.max(...data.map(d => d.count), 0); const yLbls = []; if (maxC > 0) { const numL = 5; const step = Math.ceil(maxC / numL) || 1; for (let i = 0; i <= maxC; i += step) { if (yLbls.length <= numL) yLbls.push(i); else break; } if (!yLbls.includes(maxC) && yLbls.length <= numL && maxC > 0) yLbls.push(maxC); if (yLbls.length === 0 && maxC === 0) yLbls.push(0); } else { yLbls.push(0); } return (<div className="bg-white p-4 rounded-lg border border-gray-200 overflow-x-auto"><h3 className="text-xl font-semibold mb-4 text-gray-700">Earthquake Frequency {titleSuffix}</h3> <svg width="100%" height={chartHeight + xOffset} viewBox={`0 0 ${svgW} ${chartHeight + xOffset}`} className="overflow-visible"> <text transform={`translate(${yOffset / 3},${chartHeight / 2}) rotate(-90)`} textAnchor="middle" className="text-sm fill-current text-gray-600">Count </text> <text x={yOffset + (svgW - yOffset) / 2} y={chartHeight + xOffset - 5} textAnchor="middle" className="text-sm fill-current text-gray-600">Date </text> {yLbls.map((l, i) => { const yP = chartHeight - (l / (maxC > 0 ? maxC : 1) * chartHeight); return (<g key={`y-tl-${i}`}> <text x={yOffset - 5} y={yP + 4} textAnchor="end" className="text-xs fill-current text-gray-500">{l}</text> <line x1={yOffset} y1={yP} x2={svgW} y2={yP} stroke="#e5e7eb" strokeDasharray="2,2"/> </g>); })}{data.map((item, i) => { const bH = maxC > 0 ? (item.count / maxC) * chartHeight : 0; const x = yOffset + i * (barW + barP); const y = chartHeight - bH; return (<g key={item.date}><title>{`${item.date}: ${item.count}`}</title> <rect x={x} y={y} width={barW} height={bH} fill="#6366F1" className="transition-all duration-300 ease-in-out hover:opacity-75"/> {i % lblInt === 0 && (<text x={x + barW / 2} y={chartHeight + 15} textAnchor="middle" className="text-xs fill-current text-gray-600">{item.date}</text>)} <text x={x + barW / 2} y={y - 5 > 10 ? y - 5 : 10} textAnchor="middle" className="text-xs font-medium fill-current text-gray-700">{item.count > 0 ? item.count : ''}</text> </g>); })}</svg> </div>);});

const MagnitudeDepthScatterSVGChart = React.memo(({earthquakes, titleSuffix = "(Last 30 Days)", isLoading}) => {
    const chartContainerRef = useRef(null);
    const [chartDimensions, setChartDimensions] = useState({ width: 500, height: 350 });

    useEffect(() => {
        const chartContainer = chartContainerRef.current;
        if (!chartContainer) return;
        const resizeObserver = new ResizeObserver(entries => {
            if (!entries || !entries.length) return;
            const { width } = entries[0].contentRect;
            setChartDimensions({ width: Math.max(width, 300), height: 350 });
        });
        resizeObserver.observe(chartContainer);
        setChartDimensions({ width: Math.max(chartContainer.clientWidth, 300), height: 350 });
        return () => { if (chartContainer) resizeObserver.unobserve(chartContainer);};
    }, []);

    const data = useMemo(() => { if (!earthquakes) return []; return earthquakes.map(q => ({ mag : q.properties.mag, depth: q.geometry?.coordinates?.[2], id : q.id, place: q.properties.place })).filter(q => q.mag !== null && typeof q.mag === 'number' && q.depth !== null && typeof q.depth === 'number'); }, [earthquakes]);

    if (isLoading) return <div ref={chartContainerRef} className="bg-white p-4 rounded-lg border border-gray-200 overflow-hidden"><h3 className="text-xl font-semibold mb-4 text-gray-700">Magnitude vs. Depth {titleSuffix}</h3><SkeletonBlock height="h-[400px]"/></div>;
    if (!data || data.length === 0) return <div ref={chartContainerRef} className="bg-white p-4 rounded-lg border border-gray-200 overflow-hidden"><h3 className="text-xl font-semibold mb-4 text-gray-700">Magnitude vs. Depth {titleSuffix}</h3><p className="text-gray-600 p-4 text-center">No sufficient data for chart.</p></div>;

    const { width: dynamicWidth, height: dynamicHeight } = chartDimensions;
    const p = {t: 20, r: 30, b: 50, l: 60};

    const chartContentWidth = dynamicWidth - p.l - p.r;
    const chartContentHeight = dynamicHeight - p.t - p.b;

    const mags = data.map(d => d.mag);
    const depths = data.map(d => d.depth);

    const minMag = mags.length > 0 ? Math.min(...mags) : 0;
    const maxMag = mags.length > 0 ? Math.max(...mags) : 0;
    const minDepth = depths.length > 0 ? Math.min(...depths) : 0;
    const maxDepth = depths.length > 0 ? Math.max(...depths) : 0;

    const xScale = (value) => (maxMag === minMag) ? p.l + chartContentWidth / 2 : p.l + ((value - minMag) / (maxMag - minMag)) * chartContentWidth;
    const yScale = (value) => (maxDepth === minDepth) ? p.t + chartContentHeight / 2 : p.t + ((value - minDepth) / (maxDepth - minDepth)) * chartContentHeight;

    const xTicks = [];
    const numXTicks = Math.max(2, Math.min(Math.floor(chartContentWidth / 80), 7));
    if (maxMag > minMag) {
        const xStep = (maxMag - minMag) / (numXTicks -1) || 1;
        for (let i = 0; i < numXTicks; i++) xTicks.push(parseFloat((minMag + i * xStep).toFixed(1)));
    } else { xTicks.push(minMag.toFixed(1)); }

    const yTicks = [];
    const numYTicks = Math.max(2, Math.min(Math.floor(chartContentHeight / 50), 7));
    if (maxDepth > minDepth) {
        const yStep = (maxDepth - minDepth) / (numYTicks-1) || 1;
        for (let i = 0; i < numYTicks; i++) yTicks.push(Math.round(minDepth + i * yStep));
    } else { yTicks.push(Math.round(minDepth)); }

    return (
        <div ref={chartContainerRef} className="bg-white p-4 rounded-lg border border-gray-200 overflow-hidden">
            <h3 className="text-xl font-semibold mb-4 text-gray-700">Magnitude vs. Depth {titleSuffix}</h3>
            <svg width="100%" height={dynamicHeight} viewBox={`0 0 ${dynamicWidth} ${dynamicHeight}`} className="overflow-visible">
                <line x1={p.l} y1={dynamicHeight - p.b} x2={dynamicWidth - p.r} y2={dynamicHeight - p.b} stroke="currentColor" className="text-gray-400"/>
                {xTicks.map(tick => (<g key={`xtick-${tick}`}><text x={xScale(tick)} y={dynamicHeight - p.b + 20} textAnchor="middle" className="text-xs fill-current text-gray-500">{tick}</text><line x1={xScale(tick)} y1={dynamicHeight - p.b} x2={xScale(tick)} y2={dynamicHeight - p.b + 5} stroke="currentColor" className="text-gray-400"/></g>))}
                <text x={p.l + chartContentWidth / 2} y={dynamicHeight - p.b + 40} textAnchor="middle" className="text-sm fill-current text-gray-600">Magnitude</text>
                <line x1={p.l} y1={p.t} x2={p.l} y2={dynamicHeight - p.b} stroke="currentColor" className="text-gray-400"/>
                {yTicks.map(tick => (<g key={`ytick-${tick}`}><text x={p.l - 10} y={yScale(tick) + 4} textAnchor="end" className="text-xs fill-current text-gray-500">{tick}</text><line x1={p.l - 5} y1={yScale(tick)} x2={p.l} y2={yScale(tick)} stroke="currentColor" className="text-gray-400"/></g>))}
                <text transform={`translate(${p.l / 2 - 10}, ${p.t + chartContentHeight / 2}) rotate(-90)`} textAnchor="middle" className="text-sm fill-current text-gray-600">Depth (km)</text>
                {data.map(point => (<circle key={point.id} cx={xScale(point.mag)} cy={yScale(point.depth)} r="3.5" fill={getMagnitudeColor(point.mag)} fillOpacity="0.6" className="hover:opacity-100 transition-opacity"><title>{`M:${point.mag?.toFixed(1)}, Depth:${point.depth?.toFixed(1)}km - ${point.place}`}</title></circle>))}
            </svg>
        </div>
    );
});

const PaginatedEarthquakeTable = React.memo(({ title, earthquakes, isLoading, onQuakeClick, itemsPerPage = 10, defaultSortKey = 'time', initialSortDirection = 'descending', periodName, filterPredicate }) => {
    const [sortConfig, setSortConfig] = useState({key: defaultSortKey, direction: initialSortDirection});
    const [currentPage, setCurrentPage] = useState(1);

    const processedEarthquakes = useMemo(() => {
        if (!earthquakes) return [];
        let items = filterPredicate ? earthquakes.filter(filterPredicate) : earthquakes;
        if (sortConfig.key !== null) {
            items = [...items].sort((a, b) => {
                let valA, valB;
                if (sortConfig.key === 'depth') { valA = a.geometry?.coordinates?.[2]; valB = b.geometry?.coordinates?.[2]; }
                else { valA = a.properties?.[sortConfig.key]; valB = b.properties?.[sortConfig.key]; }
                if (valA === null || valA === undefined) return 1; if (valB === null || valB === undefined) return -1;
                if (typeof valA === 'string' && typeof valB === 'string') {
                    const comparison = valA.toLowerCase().localeCompare(valB.toLowerCase());
                    return sortConfig.direction === 'ascending' ? comparison : -comparison;
                }
                if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [earthquakes, sortConfig, filterPredicate]);

    const paginatedEarthquakes = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return processedEarthquakes.slice(startIndex, startIndex + itemsPerPage);
    }, [processedEarthquakes, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(processedEarthquakes.length / itemsPerPage);

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') { direction = 'descending'; }
        else if (sortConfig.key === key && sortConfig.direction === 'descending') { direction = 'ascending';}
        setSortConfig({key, direction});
        setCurrentPage(1);
    };

    const getSortIndicator = (key) => (sortConfig.key === key ? (sortConfig.direction === 'ascending' ? ' ▲' : ' ▼') : ' ◇');

    const columns = [
        {label: 'Mag.', key: 'mag', className: 'px-3 py-2 sm:px-4 whitespace-nowrap text-sm font-medium'},
        {label: 'Location', key: 'place', className: 'px-3 py-2 sm:px-4 whitespace-nowrap text-sm'},
        {label: 'Time / Ago', key: 'time', className: 'px-3 py-2 sm:px-4 whitespace-nowrap text-sm text-gray-600'},
        {label: 'Depth', key: 'depth', className: 'px-3 py-2 sm:px-4 whitespace-nowrap text-sm text-gray-600'}
    ];

    if (isLoading || earthquakes === null) {
        return (
            <div className="bg-white p-4 rounded-lg mt-4 overflow-x-auto border border-gray-200">
                <h3 className="text-lg font-semibold mb-2 text-gray-700">{title}</h3>
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                    <tr>{columns.map(col => <th key={col.key} className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"><SkeletonText width="w-16"/></th>)}</tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">{[...Array(Math.min(itemsPerPage, 5))].map((_, i) => <SkeletonTableRow key={i} cols={columns.length}/>)}</tbody>
                </table>
            </div>
        );
    }

    if (processedEarthquakes.length === 0) {
        return (
            <div className="bg-white p-4 rounded-lg mt-4 border border-gray-200">
                <h3 className="text-lg font-semibold mb-2 text-gray-700">{title}</h3>
                <p className="text-sm text-gray-500">No earthquakes recorded {periodName ? `in the ${periodName}` : 'for this period'}.</p>
            </div>
        );
    }

    return (
        <div className="bg-white p-4 rounded-lg mt-4 border border-gray-200">
            <h3 className="text-lg font-semibold mb-2 text-gray-700">{title}</h3>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0 z-10"><tr>
                        {columns.map(col => (
                            <th key={col.key} scope="col" onClick={() => requestSort(col.key)} className={`${col.className} text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-200`}>
                                {col.label}{getSortIndicator(col.key)}
                            </th>
                        ))}
                    </tr></thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedEarthquakes.map((quake) => (
                        <tr key={`pgtbl-${quake.id}`} onClick={() => onQuakeClick(quake)} className={`${getMagnitudeColorStyle(quake.properties.mag)} hover:bg-gray-100 cursor-pointer`}>
                            <td className={columns[0].className}>{quake.properties.mag?.toFixed(1) || "N/A"}</td>
                            <td className={columns[1].className}>
                                <a href={quake.properties.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-current hover:text-indigo-700 hover:underline">
                                    {quake.properties.place || "N/A"}
                                </a>
                            </td>
                            <td className={columns[2].className}>
                                {Date.now() - quake.properties.time < 2 * 24 * 60 * 60 * 1000 ? formatTimeAgo(Date.now() - quake.properties.time) : formatDate(quake.properties.time)}
                            </td>
                            <td className={columns[3].className}>{quake.geometry?.coordinates?.[2] !== undefined ? `${quake.geometry.coordinates[2].toFixed(1)} km` : "N/A"}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
            {totalPages > 1 && (
                <div className="mt-4 flex justify-between items-center">
                    <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Previous</button>
                    <span className="text-sm text-gray-700">Page {currentPage} of {totalPages} ({processedEarthquakes.length} items)</span>
                    <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
                </div>
            )}
        </div>
    );
});

// --- App Component ---
function App() {
    const [isLoadingDaily, setIsLoadingDaily] = useState(true);
    const [isLoadingWeekly, setIsLoadingWeekly] = useState(true);
    const [isLoadingMonthly, setIsLoadingMonthly] = useState(false);
    const [hasAttemptedMonthlyLoad, setHasAttemptedMonthlyLoad] = useState(false);
    const [monthlyError, setMonthlyError] = useState(null);

    const [allEarthquakes, setAllEarthquakes] = useState([]);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [dataFetchTime, setDataFetchTime] = useState(null);
    const [appCurrentTime, setAppCurrentTime] = useState(Date.now());
    const [bannerCurrentTime, setBannerCurrentTime] = useState(Date.now());
    const [hasRecentTsunamiWarning, setHasRecentTsunamiWarning] = useState(false);
    const [lastMajorQuake, setLastMajorQuake] = useState(null);
    const [timeBetweenPreviousMajorQuakes, setTimeBetweenPreviousMajorQuakes] = useState(null);

    const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
    const [currentLoadingMessages, setCurrentLoadingMessages] = useState(INITIAL_LOADING_MESSAGES);

    const [highestRecentAlert, setHighestRecentAlert] = useState(null);
    const [activeAlertTriggeringQuakes, setActiveAlertTriggeringQuakes] = useState([]);
    const [earthquakesLastHour, setEarthquakesLastHour] = useState(null);
    const [earthquakesLast24Hours, setEarthquakesLast24Hours] = useState(null);
    const [earthquakesLast7Days, setEarthquakesLast7Days] = useState(null);

    const [earthquakesLast14Days, setEarthquakesLast14Days] = useState(null);
    const [earthquakesLast30Days, setEarthquakesLast30Days] = useState(null);
    const [prev7DayData, setPrev7DayData] = useState(null);
    const [prev14DayData, setPrev14DayData] = useState(null);

    const [selectedDetailUrl, setSelectedDetailUrl] = useState(null);
    const isInitialAppLoad = useRef(true);

    const showFullScreenLoader = useMemo(() => (isLoadingDaily || isLoadingWeekly) && isInitialAppLoad.current, [isLoadingDaily, isLoadingWeekly]);

    useEffect(() => {
        let id = null;
        if (showFullScreenLoader || (isLoadingMonthly && hasAttemptedMonthlyLoad)) {
            const messages = isLoadingMonthly ? MONTHLY_LOADING_MESSAGES : INITIAL_LOADING_MESSAGES;
            setCurrentLoadingMessages(messages);
            id = setInterval(() => setLoadingMessageIndex(p => (p + 1) % messages.length), LOADING_MESSAGE_INTERVAL_MS);
        } else { clearInterval(id); }
        return () => clearInterval(id);
    }, [showFullScreenLoader, isLoadingMonthly, hasAttemptedMonthlyLoad]);

    const fetchDataCb = useCallback(async (url) => {
        try {
            const response = await fetch(url);
            if (!response.ok) { let errorBody = ''; try { errorBody = await response.text(); } catch (e) {} throw new Error(`HTTP error! status: ${response.status} ${response.statusText}. ${errorBody}`);}
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) throw new Error(`Expected JSON but received ${contentType}`);
            const data = await response.json();
            const sanitizedFeatures = (data.features || []).filter(f => f.properties?.type === 'earthquake').map(f => ({ ...f, properties: { ...f.properties, mag: (f.properties.mag === null || typeof f.properties.mag === 'number') ? f.properties.mag : null, detail: f.properties.detail || f.properties.url }, geometry: f.geometry || {type: "Point", coordinates: [null, null, null]} }));
            return {features: sanitizedFeatures, metadata: data.metadata};
        } catch (e) { console.error(`Workspace error from ${url}:`, e); throw e; }
    }, []);

    useEffect(() => {
        let isMounted = true;
        const orchestrateInitialDataLoad = async () => {
            setLoadingMessageIndex(0);
            setCurrentLoadingMessages(INITIAL_LOADING_MESSAGES);
            setIsLoadingDaily(true); setIsLoadingWeekly(true); setError(null);
            setEarthquakesLastHour(null); setEarthquakesLast24Hours(null); setEarthquakesLast7Days(null);
            setActiveAlertTriggeringQuakes([]);

            const nowForFiltering = Date.now();
            const filterByTime = (data, hoursAgoStart, hoursAgoEnd = 0) => data ? data.filter(q => q.properties.time >= (nowForFiltering - hoursAgoStart * 36e5) && q.properties.time < (nowForFiltering - hoursAgoEnd * 36e5)) : [];

            try { // Daily Data
                if (isMounted) setLoadingMessageIndex(0);
                const dailyRes = await fetchDataCb(USGS_API_URL_DAY);
                if (!isMounted) return;
                if (dailyRes?.features) {
                    if (isMounted) setLoadingMessageIndex(1);
                    const dD = dailyRes.features;
                    setEarthquakesLastHour(filterByTime(dD, 1));
                    const l24 = filterByTime(dD, 24);
                    setEarthquakesLast24Hours(l24);
                    setHasRecentTsunamiWarning(l24.some(q => q.properties.tsunami === 1));

                    const alertsIn24hr = l24.map(q => q.properties.alert).filter(a => a && a !== 'green' && ALERT_LEVELS[a.toUpperCase()]);
                    const currentHighestAlertValue = alertsIn24hr.length > 0 ? alertsIn24hr.sort((a,b) => ({ 'red':0, 'orange':1, 'yellow':2 }[a] - { 'red':0, 'orange':1, 'yellow':2 }[b]))[0] : null;
                    setHighestRecentAlert(currentHighestAlertValue);

                    if (currentHighestAlertValue && ALERT_LEVELS[currentHighestAlertValue.toUpperCase()]) {
                        setActiveAlertTriggeringQuakes(l24.filter(q => q.properties.alert === currentHighestAlertValue));
                    } else { setActiveAlertTriggeringQuakes([]); }

                    const majD = dD.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD).sort((a, b) => b.properties.time - a.properties.time);
                    if (majD.length > 0) setLastMajorQuake(majD[0]);
                    setDataFetchTime(nowForFiltering);
                    setLastUpdated(new Date(dailyRes.metadata?.generated || nowForFiltering).toLocaleString());
                }
            } catch (e) {
                if (!isMounted) return; setError(pE => (pE ? pE + " | " : "") + `Daily: ${e.message}`);
                setEarthquakesLastHour([]); setEarthquakesLast24Hours([]); setActiveAlertTriggeringQuakes([]);
            } finally {
                if (isMounted) {
                    setIsLoadingDaily(false);
                    if (isInitialAppLoad.current) isInitialAppLoad.current = false; // Moved here
                }
            }

            try { // Weekly Data
                if (isMounted) setLoadingMessageIndex(2);
                const weeklyResult = await fetchDataCb(USGS_API_URL_WEEK);
                if (!isMounted) return;
                if (weeklyResult?.features) {
                    if (isMounted) setLoadingMessageIndex(3);
                    const weeklyData = weeklyResult.features;
                    setEarthquakesLast7Days(filterByTime(weeklyData, 7 * 24));
                    const majorQuakesWeekly = weeklyData.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD).sort((a, b) => b.properties.time - a.properties.time);
                    setLastMajorQuake(prev => (majorQuakesWeekly.length > 0 && (!prev || majorQuakesWeekly[0].properties.time > prev.properties.time)) ? majorQuakesWeekly[0] : prev);
                    if (majorQuakesWeekly.length > 1) { setTimeBetweenPreviousMajorQuakes(majorQuakesWeekly[0].properties.time - majorQuakesWeekly[1].properties.time); }
                    else if (majorQuakesWeekly.length === 1 && lastMajorQuake && majorQuakesWeekly[0].id !== lastMajorQuake.id) { setTimeBetweenPreviousMajorQuakes(null); }
                    else if (majorQuakesWeekly.length <=1 && !lastMajorQuake) { setTimeBetweenPreviousMajorQuakes(null); }
                }
            } catch (e) { if (!isMounted) return; setError(pE => (pE ? pE + " | " : "") + `Weekly: ${e.message}`); setEarthquakesLast7Days([]);
            } finally { if (isMounted) setIsLoadingWeekly(false); } // isInitialAppLoad.current was moved
        };
        orchestrateInitialDataLoad();
        const intervalId = setInterval(orchestrateInitialDataLoad, REFRESH_INTERVAL_MS);
        return () => { isMounted = false; clearInterval(intervalId); };
    }, [fetchDataCb]);

    const handleLoadMonthlyData = useCallback(async () => {
        let isMounted = true; setHasAttemptedMonthlyLoad(true); setIsLoadingMonthly(true); setMonthlyError(null);
        setLoadingMessageIndex(0); setCurrentLoadingMessages(MONTHLY_LOADING_MESSAGES);
        const nowForFiltering = Date.now();
        const filterByTime = (data, hoursAgoStart, hoursAgoEnd = 0) => data ? data.filter(q => q.properties.time >= (nowForFiltering - hoursAgoStart * 36e5) && q.properties.time < (nowForFiltering - hoursAgoEnd * 36e5)) : [];
        try {
            const monthlyResult = await fetchDataCb(USGS_API_URL_MONTH); if (!isMounted) return;
            if (monthlyResult?.features) {
                if(isMounted) setLoadingMessageIndex(1);
                const monthlyData = monthlyResult.features; setAllEarthquakes(monthlyData);
                setEarthquakesLast14Days(filterByTime(monthlyData, 14 * 24)); setEarthquakesLast30Days(filterByTime(monthlyData, 30 * 24));
                setPrev7DayData(filterByTime(monthlyData, 14 * 24, 7 * 24)); setPrev14DayData(filterByTime(monthlyData, 28 * 24, 14 * 24));
                const majorQuakesMonthly = monthlyData.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD).sort((a, b) => b.properties.time - a.properties.time);
                setLastMajorQuake(prev => (majorQuakesMonthly.length > 0 && (!prev || majorQuakesMonthly[0].properties.time > prev.properties.time)) ? majorQuakesMonthly[0] : prev);
                let allKnownMajorQuakes = [];
                if (lastMajorQuake && majorQuakesMonthly.every(mq => mq.id !== lastMajorQuake.id)) { allKnownMajorQuakes.push(lastMajorQuake); }
                allKnownMajorQuakes = [...allKnownMajorQuakes, ...majorQuakesMonthly].sort((a,b) => b.properties.time - a.properties.time).filter((quake, index, self) => index === self.findIndex(q => q.id === quake.id));
                if (allKnownMajorQuakes.length > 1) { setTimeBetweenPreviousMajorQuakes(allKnownMajorQuakes[0].properties.time - allKnownMajorQuakes[1].properties.time); }
                else { setTimeBetweenPreviousMajorQuakes(null); }
                if(isMounted) setLoadingMessageIndex(3);
            }
        } catch (e) {
            if (!isMounted) return; console.error("Failed to fetch monthly data:", e); setMonthlyError(`Monthly Data: ${e.message}`);
            setAllEarthquakes([]); setEarthquakesLast14Days([]); setEarthquakesLast30Days([]); setPrev7DayData(null); setPrev14DayData(null);
        } finally { if (isMounted) setIsLoadingMonthly(false); }
        return () => { isMounted = false; };
    }, [fetchDataCb, lastMajorQuake]);

    useEffect(() => { const timerId = setInterval(() => setAppCurrentTime(Date.now()), HEADER_TIME_UPDATE_INTERVAL_MS); return () => clearInterval(timerId); }, []);
    useEffect(() => { const timerId = setInterval(() => setBannerCurrentTime(Date.now()), BANNER_TIME_UPDATE_INTERVAL_MS); return () => clearInterval(timerId); }, []);

    const headerTimeDisplay = useMemo(() => { if (isInitialAppLoad.current && (isLoadingDaily || isLoadingWeekly) && !dataFetchTime) return "Fetching initial data..."; if (!dataFetchTime) return "Waiting for initial data..."; const timeSinceFetch = appCurrentTime - dataFetchTime; return `Data Fetched (7-day): ${timeSinceFetch < 30000 ? 'just now' : formatTimeAgo(timeSinceFetch)} | USGS Generated: ${lastUpdated || 'N/A'}`; }, [isLoadingDaily, isLoadingWeekly, dataFetchTime, appCurrentTime, lastUpdated, isInitialAppLoad]);

    const currentAlertConfig = useMemo(() => {
        if (highestRecentAlert && ALERT_LEVELS[highestRecentAlert.toUpperCase()]) {
            return ALERT_LEVELS[highestRecentAlert.toUpperCase()];
        }
        return null;
    }, [highestRecentAlert]);

    const handleQuakeClick = useCallback((quake) => { const detailUrl = quake?.properties?.detail; if (detailUrl) setSelectedDetailUrl(detailUrl); else { console.warn("No detail URL for earthquake:", quake?.id); alert("Detailed information URL not found for this event."); } }, []);
    const handleCloseDetail = useCallback(() => setSelectedDetailUrl(null), []);

    const initialDataLoaded = earthquakesLastHour || earthquakesLast24Hours || earthquakesLast7Days;

    return (
        <div className="font-sans bg-gray-100 min-h-screen flex flex-col">
            <header className="bg-gray-800 text-white p-3 sticky top-0 z-30">
                <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center px-4">
                    <h1 className="text-lg sm:text-xl font-bold mb-1 sm:mb-0 text-center sm:text-left">Earthquake Data Dashboard</h1>
                    <p className="text-xs sm:text-sm text-gray-300">{headerTimeDisplay}</p>
                </div>
            </header>
            <main className="flex-grow container mx-auto p-4 relative">
                {showFullScreenLoader && (
                    <div className="flex flex-col items-center justify-center h-64">
                        <p className="text-xl text-indigo-600 mb-4 animate-pulse">{currentLoadingMessages[loadingMessageIndex]}</p>
                        <div className="w-16 h-1 bg-indigo-200 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 animate-pulse-short"></div></div>
                        <style>{`@keyframes pulseShort{0%,100%{width:0%}50%{width:100%}}.animate-pulse-short{animation:pulseShort ${LOADING_MESSAGE_INTERVAL_MS / 1000}s ease-in-out infinite}`}</style>
                    </div>
                )}
                {error && !showFullScreenLoader && ( <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-6" role="alert"><strong className="font-bold">Error (Initial Load):</strong><span className="block sm:inline"> {error} Please try refreshing.</span></div>)}

                {(!showFullScreenLoader || !isInitialAppLoad.current) && !error && (
                    <div className="space-y-8">
                        <TimeSinceLastMajorQuakeBanner
                            lastMajorQuake={lastMajorQuake}
                            timeBetweenPreviousMajorQuakes={timeBetweenPreviousMajorQuakes}
                            isLoadingInitial={isLoadingDaily || isLoadingWeekly} // Still reflects combined initial load for this banner
                            isLoadingMonthly={isLoadingMonthly && hasAttemptedMonthlyLoad}
                            currentTime={bannerCurrentTime}
                            majorQuakeThreshold={MAJOR_QUAKE_THRESHOLD}
                        />
                        {currentAlertConfig && (
                            <>
                                <div className={`border-l-4 p-4 mb-0 rounded-t-md shadow ${currentAlertConfig.colorClass}`} role="alert">
                                    <p className="font-bold">USGS Alert Level (Recent): {currentAlertConfig.text}</p>
                                    <p>One or more recent earthquakes (last 24hrs) triggered a {highestRecentAlert} alert. {currentAlertConfig.description}</p>
                                </div>
                                {activeAlertTriggeringQuakes.length > 0 && (
                                    <div className={`border-l-4 border-r-4 border-b-4 p-4 pt-2 rounded-b-md shadow mb-6 ${currentAlertConfig.detailsColorClass.replace(/bg-\w+-\d+/, '').replace(/text-\w+-\d+/, '')} ${currentAlertConfig.detailsColorClass.split(' ')[0]} ${currentAlertConfig.detailsColorClass.split(' ')[2]}`}>
                                        <h4 className={`font-semibold mb-2 text-sm`}>Earthquakes contributing to {currentAlertConfig.text} Alert (Last 24hrs):</h4>
                                        <ul className="space-y-1">
                                            {activeAlertTriggeringQuakes.map(quake => (
                                                <li key={`alert-quake-${quake.id}`} className={`text-xs flex justify-between items-center`}>
                                                    <span>M{quake.properties.mag?.toFixed(1)} - {quake.properties.place}</span>
                                                    <button
                                                        onClick={() => handleQuakeClick(quake)}
                                                        className="ml-2 text-indigo-500 hover:text-indigo-700 font-medium text-xs"
                                                    >
                                                        (details)
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </>
                        )}
                        {hasRecentTsunamiWarning && !currentAlertConfig && (<div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 mb-6 rounded-md shadow" role="alert"><p className="font-bold">Tsunami Information</p><p>One or more recent earthquakes may have generated a tsunami warning. Check official sources.</p></div>)}

                        {/* 24-HOUR DATA SECTION: Renders when !isLoadingDaily */}
                        {!isLoadingDaily && earthquakesLast24Hours && (
                            <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-4">
                                <SummaryStatisticsCard title="Summary (Last 24 Hours)" currentPeriodData={earthquakesLast24Hours} isLoading={isLoadingDaily}/>
                                <PaginatedEarthquakeTable title="Earthquakes (Last 24 Hours)" earthquakes={earthquakesLast24Hours} isLoading={isLoadingDaily} onQuakeClick={handleQuakeClick} periodName="last 24 hours"/>
                                <RegionalDistributionList earthquakes={earthquakesLast24Hours} titleSuffix="(Last 24 Hours)" isLoading={isLoadingDaily}/>
                            </div>
                        )}
                        {/* 1-HOUR DATA SECTION: Renders when !isLoadingDaily */}
                        {!isLoadingDaily && earthquakesLastHour && (
                            <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-4">
                                <SummaryStatisticsCard title="Summary (Last Hour)" currentPeriodData={earthquakesLastHour} isLoading={isLoadingDaily}/>
                                <PaginatedEarthquakeTable title="Earthquakes (Last Hour)" earthquakes={earthquakesLastHour} isLoading={isLoadingDaily} onQuakeClick={handleQuakeClick} itemsPerPage={5} periodName="last hour"/>
                                <RegionalDistributionList earthquakes={earthquakesLastHour} titleSuffix="(Last Hour)" isLoading={isLoadingDaily}/>
                            </div>
                        )}

                        {/* 7-DAY DATA SECTION: Renders when !isLoadingWeekly */}
                        {!isLoadingWeekly && earthquakesLast7Days && (
                            <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-4">
                                <SummaryStatisticsCard title="Summary (Last 7 Days)" currentPeriodData={earthquakesLast7Days} previousPeriodData={prev7DayData} isLoading={isLoadingWeekly || (isLoadingMonthly && hasAttemptedMonthlyLoad && !prev7DayData) }/>
                                <PaginatedEarthquakeTable title="Earthquakes (Last 7 Days)" earthquakes={earthquakesLast7Days} isLoading={isLoadingWeekly} onQuakeClick={handleQuakeClick} periodName="last 7 days"/>
                                <RegionalDistributionList earthquakes={earthquakesLast7Days} titleSuffix="(Last 7 Days)" isLoading={isLoadingWeekly}/>
                                <EarthquakeTimelineSVGChart earthquakes={earthquakesLast7Days} days={7} titleSuffix="(Last 7 Days)" isLoading={isLoadingWeekly}/>
                                <MagnitudeDepthScatterSVGChart earthquakes={earthquakesLast7Days} titleSuffix="(Last 7 Days)" isLoading={isLoadingWeekly} />
                            </div>
                        )}
                        {/* Show loading for 7-day if daily is done but weekly is not (and it's initial load phase) */}
                        { !isLoadingDaily && isLoadingWeekly && isInitialAppLoad.current && (
                            <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-4">
                                <h3 className="text-xl font-semibold mb-4 text-gray-700">Summary (Last 7 Days)</h3>
                                <SkeletonBlock height="h-24"/>
                                <h3 className="text-lg font-semibold mb-2 text-gray-700">Earthquakes (Last 7 Days)</h3>
                                <SkeletonBlock height="h-48"/>
                            </div>
                        )}


                        {initialDataLoaded && (
                            <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-6">
                                {!hasAttemptedMonthlyLoad && (
                                    <div className="text-center py-6">
                                        <h3 className="text-xl font-semibold mb-4 text-gray-700">Deeper Analysis</h3>
                                        <p className="text-gray-600 mb-4">Load data for the last 14 and 30 days for more comprehensive statistics and charts.</p>
                                        <button
                                            onClick={handleLoadMonthlyData}
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-150 ease-in-out"
                                            disabled={isLoadingMonthly}
                                        >
                                            {isLoadingMonthly ? 'Loading...' : 'Load 14 & 30 Day Data'}
                                        </button>
                                    </div>
                                )}

                                {hasAttemptedMonthlyLoad && isLoadingMonthly && (
                                    <div className="flex flex-col items-center justify-center py-10">
                                        <p className="text-xl text-indigo-600 mb-4 animate-pulse">{currentLoadingMessages[loadingMessageIndex]}</p>
                                        <div className="w-16 h-1 bg-indigo-200 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 animate-pulse-short"></div></div>
                                        <p className="text-sm text-gray-500 mt-2">Loading extended earthquake data...</p>
                                    </div>
                                )}
                                {hasAttemptedMonthlyLoad && monthlyError && !isLoadingMonthly &&(
                                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative my-6" role="alert">
                                        <strong className="font-bold">Error (14/30 Day Data):</strong>
                                        <span className="block sm:inline"> {monthlyError}</span>
                                    </div>
                                )}

                                {hasAttemptedMonthlyLoad && !isLoadingMonthly && !monthlyError && allEarthquakes && (
                                    <>
                                        <SummaryStatisticsCard title="Summary (Last 14 Days)" currentPeriodData={earthquakesLast14Days} previousPeriodData={prev14DayData} isLoading={false}/>
                                        <EarthquakeTimelineSVGChart earthquakes={earthquakesLast14Days} days={14} titleSuffix="(Last 14 Days)" isLoading={false}/>

                                        <hr className="my-6 border-gray-300"/>

                                        <SummaryStatisticsCard title="Summary (Last 30 Days)" currentPeriodData={earthquakesLast30Days} isLoading={false}/>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <PaginatedEarthquakeTable title="Top 10 Strongest (Last 30 Days)" earthquakes={allEarthquakes} isLoading={false} onQuakeClick={handleQuakeClick} itemsPerPage={10} defaultSortKey="mag" initialSortDirection="descending"/>
                                            <PaginatedEarthquakeTable title="Most Widely Felt (Last 30 Days)" earthquakes={allEarthquakes} isLoading={false} onQuakeClick={handleQuakeClick} itemsPerPage={5} defaultSortKey="felt" initialSortDirection="descending" filterPredicate={q => q.properties.felt !== null && typeof q.properties.felt === 'number' && q.properties.felt > FELT_REPORTS_THRESHOLD}/>
                                            <PaginatedEarthquakeTable title="Most Significant (Last 30 Days)" earthquakes={allEarthquakes} isLoading={false} onQuakeClick={handleQuakeClick} itemsPerPage={5} defaultSortKey="sig" initialSortDirection="descending" filterPredicate={q => q.properties.sig !== null && typeof q.properties.sig === 'number' && q.properties.sig > SIGNIFICANCE_THRESHOLD}/>
                                        </div>
                                        <MagnitudeDistributionSVGChart earthquakes={allEarthquakes} titleSuffix="(Last 30 Days)" isLoading={false}/>
                                        <MagnitudeDepthScatterSVGChart earthquakes={allEarthquakes} titleSuffix="(Last 30 Days)" isLoading={false}/>
                                        <RegionalDistributionList earthquakes={allEarthquakes} titleSuffix="(Last 30 Days)" isLoading={false}/>
                                        <PaginatedEarthquakeTable title="All Earthquakes (Last 30 Days)" earthquakes={allEarthquakes} isLoading={false} onQuakeClick={handleQuakeClick} itemsPerPage={20} defaultSortKey="time" initialSortDirection="descending"/>
                                    </>
                                )}
                                {hasAttemptedMonthlyLoad && !isLoadingMonthly && !monthlyError && (!allEarthquakes || allEarthquakes.length === 0) && (
                                    <p className="text-gray-600 text-center py-4">No 14/30 day earthquake data found or loaded.</p>
                                )}
                            </div>
                        )}
                    </div>
                )}
                {!showFullScreenLoader && !error && !isLoadingDaily && !isLoadingWeekly && !initialDataLoaded && (
                    <div className="text-center py-10"><p className="text-lg text-gray-600">No earthquake data to display currently for the initial periods.</p></div>
                )}

                {selectedDetailUrl && ( <EarthquakeDetailView detailUrl={selectedDetailUrl} onClose={handleCloseDetail} /> )}
            </main>
            <footer className="bg-gray-800 text-white text-center p-4 text-sm mt-auto">
                <p><a href="https://x.com/BuiltByVibes" target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-indigo-300 transition-colors">@builtbyvibes</a>, Coded by Gemini</p>
                <p className="mt-1 text-xs text-gray-400">Data sourced from <a href="https://earthquake.usgs.gov/" target="_blank" rel="noopener noreferrer" className="underline hover:text-indigo-300">USGS</a>.</p>
            </footer>
        </div>
    );
}

export default App;