import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import SkeletonListItem from './SkeletonListItem';
import { REGIONS } from '../constants/appConstants';

/**
 * A React component that displays a list of earthquake counts by region.
 * @param {object} props - The component's props.
 * @param {Array<object> | null} props.earthquakes - An array of earthquake feature objects.
 * @param {string} [props.titleSuffix='(Last 30 Days)'] - Suffix for the component's title.
 * @param {boolean} props.isLoading - Whether the data is currently loading.
 * @param {function} props.getRegionForEarthquake - Function to get region for an earthquake.
 * @returns {JSX.Element | null} The rendered RegionalDistributionList component, or null if no data for 'Last Hour'.
 */
const RegionalDistributionList = React.memo(({earthquakes, titleSuffix = "(Last 30 Days)", isLoading, getRegionForEarthquake}) => {
    const cardBg = "bg-slate-700"; const textColor = "text-slate-300"; const titleColor = "text-indigo-400"; const itemBg = "bg-slate-800"; const itemHoverBg = "hover:bg-slate-600"; const countColor = "text-sky-400"; const borderColor = "border-slate-600";
    const regionalData = useMemo(() => {
        if (!earthquakes) return [];
        const counts = REGIONS.map(r => ({...r, count: 0}));
        earthquakes.forEach(q => {
            const region = getRegionForEarthquake(q);
            const rc = counts.find(r => r.name === region.name);
            if (rc) rc.count++;
        });
        return counts.filter(r => r.count > 0).sort((a, b) => b.count - a.count);
    }, [earthquakes, REGIONS, getRegionForEarthquake]);

    if (isLoading) return (<div className={`${cardBg} p-3 rounded-lg mt-4 border ${borderColor} shadow-md`}><h3 className={`text-md font-semibold mb-2 ${titleColor}`}>Regional Distribution {titleSuffix}</h3> <ul className="space-y-1">{[...Array(5)].map((_, i) => <SkeletonListItem key={i}/>)}</ul> </div>);

    // Ensure `titleSuffix` is a string before calling `includes`
    const safeTitleSuffix = typeof titleSuffix === 'string' ? titleSuffix : '';
    if ((!earthquakes || earthquakes.length === 0 || regionalData.length === 0) && safeTitleSuffix.includes('(Last Hour)')) return null;

    if (!earthquakes || earthquakes.length === 0 || regionalData.length === 0) return ( <div className={`${cardBg} p-3 rounded-lg mt-4 border ${borderColor} shadow-md`}><h3 className={`text-md font-semibold mb-2 ${titleColor}`}>Regional Distribution {titleSuffix}</h3><p className={`text-xs ${textColor} text-center`}>No regional earthquake data.</p></div>);

    return (<div className={`${cardBg} p-3 rounded-lg mt-4 border ${borderColor} shadow-md`}> <h3 className={`text-md font-semibold mb-2 ${titleColor}`}>Regional Distribution {titleSuffix}</h3> <ul className="space-y-1 max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800">{regionalData.map(region => (<li key={region.name} className={`flex items-center justify-between p-1.5 ${itemBg} rounded ${itemHoverBg} transition-colors`}> <div className="flex items-center min-w-0 mr-2"><span className="w-3 h-3 rounded-sm mr-2 flex-shrink-0" style={{backgroundColor: region.color}}></span><span className={`text-xs ${textColor} truncate`} title={region.name}>{region.name}</span></div> <span className={`text-xs font-medium ${countColor} flex-shrink-0`}>{region.count}</span></li>))}</ul> </div>);
});

RegionalDistributionList.propTypes = {
    earthquakes: PropTypes.array,
    titleSuffix: PropTypes.string,
    isLoading: PropTypes.bool,
    // REGIONS is now imported
    getRegionForEarthquake: PropTypes.func.isRequired,
};

export default RegionalDistributionList;
