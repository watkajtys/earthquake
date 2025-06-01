import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import SkeletonText from './SkeletonText';
import { MAJOR_QUAKE_THRESHOLD } from '../constants/appConstants';

/**
 * A React component that displays a banner with the time since the last major earthquake.
 * @param {object} props - The component's props.
 * @param {object | null} props.lastMajorQuake - The last major earthquake object.
 * @param {object | null} props.previousMajorQuake - The previous major earthquake object.
 * @param {number | null} props.timeBetweenPreviousMajorQuakes - Time in milliseconds between the last two major quakes.
 * @param {boolean} props.isLoadingInitial - Whether initial data is loading.
 * @param {boolean} props.isLoadingMonthly - Whether monthly data is loading.
 * @param {function} props.formatTimeDuration - Function to format time duration.
 * @param {function} props.getRegionForEarthquake - Function to get region for an earthquake.
 * @param {function} props.handleQuakeClick - Function to handle click on a quake.
 * @param {function} props.getMagnitudeColor - Function to get magnitude color.
 * @returns {JSX.Element} The rendered TimeSinceLastMajorQuakeBanner component.
 */
const TimeSinceLastMajorQuakeBanner = React.memo(({
    lastMajorQuake,
    previousMajorQuake,
    timeBetweenPreviousMajorQuakes,
    isLoadingInitial,
    isLoadingMonthly,
    formatTimeDuration,
    // getRegionForEarthquake, // Not used directly in JSX, but passed to other functions potentially. Kept for now.
    handleQuakeClick,
    getMagnitudeColor
}) => {
    const [timeAgoFormatted, setTimeAgoFormatted] = useState('Calculating...');

    useEffect(() => {
        let intervalId = null;
        if (lastMajorQuake?.properties?.time) {
            const startTime = lastMajorQuake.properties.time;
            const updateDisplay = () => {
                const timeSince = Date.now() - startTime;
                setTimeAgoFormatted(formatTimeDuration(timeSince));
            };
            updateDisplay();
            intervalId = setInterval(updateDisplay, 1000);
        } else {
            setTimeAgoFormatted('N/A');
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [lastMajorQuake, formatTimeDuration]);

    const bannerLoading = isLoadingInitial || (isLoadingMonthly && !lastMajorQuake);
    if (bannerLoading && !lastMajorQuake) {
        return ( <div className="bg-slate-700 p-6 mb-6 rounded-lg border border-slate-600 text-center animate-pulse"><SkeletonText width="w-1/4 mx-auto"/> <div className="h-10 bg-slate-600 rounded w-1/2 mx-auto my-2"></div> <SkeletonText width="w-1/3 mx-auto"/><SkeletonText width="w-full mx-auto mt-2" height="h-5"/> <hr className="my-4 border-slate-600"/> <SkeletonText width="w-1/4 mx-auto"/> <div className="h-8 bg-slate-600 rounded w-1/3 mx-auto my-2"></div> <SkeletonText width="w-1/3 mx-auto"/></div>);
    }
    if (!lastMajorQuake && !isLoadingInitial && !isLoadingMonthly) {
        return ( <div className="bg-green-700 bg-opacity-30 border-l-4 border-green-500 text-green-200 p-4 mb-6 rounded-md text-center"><p className="font-bold text-lg">No significant earthquakes (M{MAJOR_QUAKE_THRESHOLD.toFixed(1)}+) recorded in the available data period.</p></div>);
    }

    // const region = lastMajorQuake ? getRegionForEarthquake(lastMajorQuake) : null;
    const location = lastMajorQuake?.properties.place || 'Unknown Location';
    const prevIntervalFmt = timeBetweenPreviousMajorQuakes !== null ? formatTimeDuration(timeBetweenPreviousMajorQuakes) : null;
    const mag = lastMajorQuake?.properties.mag?.toFixed(1);
    // const depth = lastMajorQuake?.geometry?.coordinates?.[2]?.toFixed(1); // Not used in this component directly
    const magColor = lastMajorQuake ? getMagnitudeColor(lastMajorQuake.properties.mag) : '#D1D5DB';

    // Details for the previous major quake
    // const prevRegion = previousMajorQuake ? getRegionForEarthquake(previousMajorQuake) : null; // getRegionForEarthquake is a prop
    const prevLocation = previousMajorQuake?.properties.place || 'Unknown Location';
    const prevMag = previousMajorQuake?.properties.mag?.toFixed(1);
    // const prevDepth = previousMajorQuake?.geometry?.coordinates?.[2]?.toFixed(1); // Not used
    const prevMagColor = previousMajorQuake ? getMagnitudeColor(previousMajorQuake.properties.mag) : '#D1D5DB';

    return (<div className="bg-slate-700 p-4 rounded-lg border border-slate-600 text-center text-slate-200">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">IT HAS BEEN:</p>
        <p className="text-2xl md:text-3xl font-bold text-indigo-400 tracking-tight mb-2 min-h-[36px] md:min-h-[44px] flex items-center justify-center">
            {lastMajorQuake ? timeAgoFormatted : <SkeletonText width="w-1/2 mx-auto" height="h-10"/>}
        </p>
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Since the last significant (M<span style={{fontWeight: 'bold'}}>{MAJOR_QUAKE_THRESHOLD.toFixed(1)}</span>+) earthquake.</p>
        {lastMajorQuake ? (<p className="text-sm text-slate-300 mt-1 mb-3">M<span style={{ color: magColor, fontWeight: 'bold' }}>{mag || '...'}</span> - {location || 'Details Pending...'}<a href={lastMajorQuake.properties.url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 ml-2 text-xs">(details)</a></p>) : (<SkeletonText width="w-full mx-auto mt-1 mb-3" height="h-5"/>)}
        <hr className="my-3 border-slate-600"/>
        {isLoadingMonthly && !prevIntervalFmt && lastMajorQuake ? (
                            <><SkeletonText width="w-1/4 mx-auto"/> <div className="h-8 bg-slate-600 rounded w-1/3 mx-auto my-2"></div> <SkeletonText width="w-1/3 mx-auto"/> <SkeletonText width="w-full mx-auto mt-1 mb-1" height="h-4"/> </>
                        ) : (
                            <>
                                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">PREVIOUSLY IT HAD BEEN:</p>
                                    <p className="text-xl md:text-2xl font-bold text-slate-400 tracking-tight mb-1 min-h-[30px] md:min-h-[36px] flex items-center justify-center">
                                        {prevIntervalFmt ?? (lastMajorQuake ? 'N/A (Only one M4.5+ found or data pending)' : 'N/A')}
                                    </p>
                                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Between significant earthquakes.</p>
                                    {previousMajorQuake && prevIntervalFmt ? (
                                        <p className="text-xs text-slate-400 mt-1">
                                                (M<span style={{ color: prevMagColor, fontWeight: 'bold' }}>{prevMag || '...'}</span>
                                                {' - '}{prevLocation || 'Details Pending...'}
                                            <a href="#" onClick={(e) => { e.preventDefault(); handleQuakeClick(previousMajorQuake); }} className="text-indigo-400 hover:text-indigo-300 ml-2 text-xs">(details)</a>
                                            </p>
                                    ) : prevIntervalFmt && <SkeletonText width="w-full mx-auto mt-1" height="h-4" className="bg-slate-600" /> }                </>
                        )}
    </div>);
});

TimeSinceLastMajorQuakeBanner.propTypes = {
    lastMajorQuake: PropTypes.object,
    previousMajorQuake: PropTypes.object,
    timeBetweenPreviousMajorQuakes: PropTypes.number,
    isLoadingInitial: PropTypes.bool,
    isLoadingMonthly: PropTypes.bool,
    // majorQuakeThreshold is now imported
    formatTimeDuration: PropTypes.func.isRequired,
    getRegionForEarthquake: PropTypes.func, // Not used in JSX directly, but could be used by other functions. Optional for now.
    handleQuakeClick: PropTypes.func.isRequired,
    getMagnitudeColor: PropTypes.func.isRequired,
};

export default TimeSinceLastMajorQuakeBanner;
