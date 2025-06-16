import React, { memo, useMemo } from 'react';
import PropTypes from 'prop-types';
import SkeletonListItem from './skeletons/SkeletonListItem';
import { REGIONS } from '../constants/appConstants';

/**
 * Displays a list of earthquake counts categorized by predefined seismic regions.
 * This component is memoized using `React.memo` for performance optimization.
 * It calculates regional counts from the provided `earthquakes` data using `useMemo`.
 * A skeleton loader (`SkeletonListItem`) is shown if `isLoading` is true.
 * The list of regions and their colors are sourced from the `REGIONS` constant.
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {Array<Object>|null} props.earthquakes - An array of earthquake feature objects (USGS GeoJSON structure).
 *   If null or empty, and not loading, it may display a "no data" message or hide (for 'Last Hour').
 * @param {string} [props.titleSuffix='(Last 30 Days)'] - Suffix for the component's title, often indicating the time period.
 * @param {boolean} props.isLoading - Flag indicating whether the earthquake data is currently loading.
 * @param {function(Object):Object} props.getRegionForEarthquake - A function that takes an earthquake object
 *   and returns the corresponding region object (which should have a `name` property matching one in `REGIONS`).
 * @returns {JSX.Element|null} The RegionalDistributionList component. Returns null if `titleSuffix` includes '(Last Hour)'
 *   and there's no data, or a "no data" message for other periods.
 */
const RegionalDistributionList = memo(({earthquakes, titleSuffix = "(Last 30 Days)", isLoading, getRegionForEarthquake}) => {
    const cardBg = "bg-slate-700"; const textColor = "text-slate-300"; const titleColor = "text-indigo-400"; const itemBg = "bg-slate-800"; const itemHoverBg = "hover:bg-slate-600"; const countColor = "text-sky-400"; const borderColor = "border-slate-600";

    // Calculate regional distribution counts using useMemo for efficiency.
    // REGIONS constant provides the list of regions to iterate over.
    const regionalData = useMemo(() => {
        if (!earthquakes) return [];
        const counts = REGIONS.map(r => ({...r, count: 0})); // Initialize counts for all defined regions
        earthquakes.forEach(q => {
            const region = getRegionForEarthquake(q); // Determine the region for the current earthquake
            const regionCounter = counts.find(r => r.name === region.name); // Find the counter for that region
            if (regionCounter) regionCounter.count++; // Increment count
        });
        // Filter out regions with no earthquakes and sort by count descending
        return counts.filter(r => r.count > 0).sort((a, b) => b.count - a.count);
    }, [earthquakes, getRegionForEarthquake]); // REGIONS is a constant, so not strictly needed in deps if imported directly

    if (isLoading) return (<div className={`${cardBg} p-3 rounded-lg mt-4 border ${borderColor} shadow-md`}><h3 className={`text-md font-semibold mb-2 ${titleColor}`}>Regional Distribution {titleSuffix}</h3> <ul className="space-y-1">{[...Array(5)].map((_, i) => <SkeletonListItem key={i}/>)}</ul> </div>);

    // Ensure `titleSuffix` is a string before calling `includes`
    const safeTitleSuffix = typeof titleSuffix === 'string' ? titleSuffix : '';
    if ((!earthquakes || earthquakes.length === 0 || regionalData.length === 0) && safeTitleSuffix.includes('(Last Hour)')) return null;

    if (!earthquakes || earthquakes.length === 0 || regionalData.length === 0) return ( <div className={`${cardBg} p-3 rounded-lg mt-4 border ${borderColor} shadow-md`}><h3 className={`text-md font-semibold mb-2 ${titleColor}`}>Regional Distribution {titleSuffix}</h3><p className={`text-xs ${textColor} text-center`}>No regional earthquake data.</p></div>);

    return (<div className={`${cardBg} p-3 rounded-lg mt-4 border ${borderColor} shadow-md`}> <h3 className={`text-md font-semibold mb-2 ${titleColor}`}>Regional Distribution {titleSuffix}</h3> <ul className="space-y-1 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800">{regionalData.map(region => (<li key={region.name} className={`flex items-center justify-between p-1.5 ${itemBg} rounded ${itemHoverBg} transition-colors`}> <div className="flex items-center min-w-0 mr-2"><span className="w-3 h-3 rounded-sm mr-2 flex-shrink-0" style={{backgroundColor: region.color}}></span><span className={`text-xs ${textColor} truncate`} title={region.name}>{region.name}</span></div> <span className={`text-xs font-medium ${countColor} flex-shrink-0`}>{region.count}</span></li>))}</ul> </div>);
});

RegionalDistributionList.propTypes = {
    earthquakes: PropTypes.array,
    titleSuffix: PropTypes.string,
    isLoading: PropTypes.bool,
    // REGIONS is now imported
    getRegionForEarthquake: PropTypes.func.isRequired,
};

export default RegionalDistributionList;
