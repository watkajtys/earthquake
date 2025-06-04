import React from 'react';
import PropTypes from 'prop-types';
import SkeletonText from './skeletons/SkeletonText';
import SkeletonBlock from './skeletons/SkeletonBlock';
import { FEELABLE_QUAKE_THRESHOLD } from '../constants/appConstants';

/**
 * A React component that displays a card with summary statistics.
 * Statistics are provided directly via the `stats` prop, pre-calculated by the worker.
 * @param {object} props - The component's props.
 * @param {string} props.title - The title of the card.
 * @param {object | null} props.stats - Object containing statistics (e.g., count, averageMagnitude, maxMagnitude).
 * @param {boolean} props.isLoading - Whether the data is currently loading.
 * @returns {JSX.Element} The rendered SummaryStatisticsCard component.
 */
const SummaryStatisticsCard = React.memo(({ title, stats, isLoading }) => {
    const cardBg = "bg-slate-700"; const textColor = "text-slate-300"; const titleColor = "text-indigo-400"; const statBoxBg = "bg-slate-800"; const statValueColor = "text-sky-400"; const statLabelColor = "text-slate-400"; const borderColor = "border-slate-600";

    if (isLoading || !stats) {
        return (
            <div className={`${cardBg} p-4 rounded-lg border ${borderColor} shadow-md`}>
                <h3 className={`text-lg font-semibold mb-3 ${titleColor}`}>{title}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {[...Array(4)].map((_, i) => ( // Reduced skeleton items as we display fewer detailed stats now
                        <div key={i} className={`${statBoxBg} p-2 rounded-lg text-center animate-pulse`}>
                            <SkeletonText width="w-1/2 mx-auto" height="h-6 mb-1" className="bg-slate-600" />
                            <SkeletonText width="w-3/4 mx-auto" height="h-3" className="bg-slate-600" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Ensure `title` is a string before calling `includes`
    const safeTitle = typeof title === 'string' ? title : '';
    // Worker provides stats.count. If it's 0, show message for certain titles.
    if (stats.count === 0 && ["Summary (Last Hour)", "Summary (Last 24 Hours)", "Overview (Last 24 Hours)"].some(t => safeTitle.includes(t))) {
        return (
            <div className={`${cardBg} p-4 rounded-lg border ${borderColor} shadow-md`}>
                <h3 className={`text-lg font-semibold mb-3 ${titleColor}`}>{title}</h3>
                <p className={`${textColor} text-center py-3 text-sm`}>No earthquakes recorded in this period.</p>
            </div>
        );
    }
    if (stats.count === 0 && !["Summary (Last Hour)", "Summary (Last 24 Hours)", "Overview (Last 24 Hours)"].some(t => safeTitle.includes(t))) {
         return (
            <div className={`${cardBg} p-4 rounded-lg border ${borderColor} shadow-md`}>
                <h3 className={`text-lg font-semibold mb-3 ${titleColor}`}>{title}</h3>
                <p className={`${textColor} text-center py-3 text-sm`}>No earthquake data for this period.</p>
            </div>
        );
    }

    // Trend display logic is removed as previousPeriodStats are not directly available.
    // Display stats directly from the 'stats' prop.
    // Customize this based on the actual structure of 'stats' from your worker.
    const statsToDisplay = [];
    if (stats.count !== undefined) statsToDisplay.push({ label: 'Total Events', value: stats.count });
    if (stats.averageMagnitude !== undefined) statsToDisplay.push({ label: 'Avg. Magnitude', value: stats.averageMagnitude?.toFixed(2) || 'N/A' });

    // For strongest quake, worker might send an object or just magnitude. Adapt as needed.
    // Example: if stats.strongestQuake is { mag: 5.5, title: "Somewhere" }
    if (stats.strongestQuake?.mag !== undefined) {
        statsToDisplay.push({ label: 'Strongest Mag.', value: `M ${stats.strongestQuake.mag.toFixed(1)}` });
    } else if (stats.maxMagnitude !== undefined) { // Fallback if worker sends maxMagnitude directly
        statsToDisplay.push({ label: 'Strongest Mag.', value: stats.maxMagnitude?.toFixed(1) || 'N/A' });
    }

    if (stats.feelableEarthquakes !== undefined) statsToDisplay.push({ label: `Feelable (M${FEELABLE_QUAKE_THRESHOLD.toFixed(1)}+)`, value: stats.feelableEarthquakes });
    // Add more specific stats if available in the `stats` object from the worker
    // e.g. significantEarthquakes, averageDepth, deepestEarthquake, averageSignificance

    // For keyStatsForGlobe from overview, the structure is different
    if (title.toLowerCase().includes("overview")) {
        statsToDisplay.length = 0; // Clear previous default stats
        if (stats.lastHourCount !== undefined) statsToDisplay.push({ label: 'Last Hour', value: stats.lastHourCount});
        if (stats.count24h !== undefined) statsToDisplay.push({ label: '24h Total', value: stats.count24h});
        if (stats.count72h !== undefined) statsToDisplay.push({ label: '72h Total', value: stats.count72h});
        if (stats.strongest24h?.mag !== undefined) {
            statsToDisplay.push({ label: '24h Strongest', value: `M ${stats.strongest24h.mag.toFixed(1)}` });
        }
    }


    return (
        <div className={`${cardBg} p-4 rounded-lg border ${borderColor} shadow-md`}>
            <h3 className={`text-lg font-semibold mb-3 ${titleColor}`}>{title}</h3>
            {stats.count === 0 && ["Summary (Last Hour)", "Summary (Last 24 Hours)", "Overview (Last 24 Hours)"].some(t => safeTitle.includes(t)) && (
                <p className={`${textColor} text-center py-3 text-sm`}>No earthquakes recorded in this period.</p>
            )}
            {statsToDisplay.length > 0 && (
                 <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 gap-3"> {/* Adjusted grid for potentially fewer stats */}
                    {statsToDisplay.map(stat => (
                        <div key={stat.label} className={`${statBoxBg} p-2 rounded-lg text-center border border-slate-700`}>
                            <p className={`text-lg md:text-xl font-bold ${statValueColor}`}>{stat.value}</p>
                            <p className={`text-xs ${statLabelColor}`}>{stat.label}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
});

SummaryStatisticsCard.propTypes = {
    title: PropTypes.string.isRequired,
    stats: PropTypes.shape({
        count: PropTypes.number,
        averageMagnitude: PropTypes.number,
        maxMagnitude: PropTypes.number, // Or strongestQuake: PropTypes.object
        strongestQuake: PropTypes.shape({
            mag: PropTypes.number,
            title: PropTypes.string,
            time: PropTypes.number,
        }),
        feelableEarthquakes: PropTypes.number,
        significantEarthquakes: PropTypes.number,
        averageDepth: PropTypes.number,
        deepestEarthquake: PropTypes.number,
        averageSignificance: PropTypes.number,
        // For keyStatsForGlobe structure
        lastHourCount: PropTypes.number,
        count24h: PropTypes.number,
        count72h: PropTypes.number,
        strongest24h: PropTypes.shape({
             mag: PropTypes.number,
             title: PropTypes.string,
        }),
    }),
    isLoading: PropTypes.bool,
    // calculateStats: PropTypes.func.isRequired, // Removed
};

export default SummaryStatisticsCard;
