import React from 'react';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx';

// Helper function to format energy values
const formatEnergy = (joules) => {
    if (joules === null || joules === undefined || joules === 0) {
        return '0 J';
    }

    const units = [
        { threshold: 1e15, unit: 'PJ' }, // PetaJoules
        { threshold: 1e12, unit: 'TJ' }, // TeraJoules
        { threshold: 1e9, unit: 'GJ' },  // GigaJoules
        { threshold: 1e6, unit: 'MJ' },  // MegaJoules
        { threshold: 1e3, unit: 'kJ' },  // KiloJoules (added for smaller values)
    ];

    for (const { threshold, unit } of units) {
        if (joules >= threshold) {
            return `${(joules / threshold).toFixed(2)} ${unit}`;
        }
    }
    return `${joules.toFixed(0)} J`; // For values less than 1 kJ
};

export const SeismicEnergyDisplay = () => {
    const {
        energyToday,
        energyYesterday,
        energyThisWeek,
        energyLastWeek,
        energyComparisonError,
    } = useEarthquakeDataState();

    if (energyComparisonError) {
        return (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative shadow-md" role="alert">
                <strong className="font-bold">Error:</strong>
                <span className="block sm:inline"> {energyComparisonError}</span>
            </div>
        );
    }

    const todayYesterdayRatio = energyYesterday > 0 ? (energyToday / energyYesterday).toFixed(2) + 'x' :
                                energyToday > 0 ? 'Significantly more than yesterday' : 'N/A';

    const thisWeekLastWeekRatio = energyLastWeek > 0 ? (energyThisWeek / energyLastWeek).toFixed(2) + 'x' :
                                 energyThisWeek > 0 ? 'Significantly more than last week' : 'N/A';

    return (
        <div className="bg-slate-700 p-4 rounded-lg border border-slate-600 shadow-md text-sm text-slate-200">
            {/* Adjusted padding slightly (p-4), and title size for responsiveness */}
            <h3 className="text-base sm:text-md font-semibold mb-4 text-indigo-400">Seismic Energy Release Comparison</h3>

            <div className="flex flex-col md:flex-row md:space-x-4">
                {/* Daily Comparison Section */}
                {/* Added md:flex-1 for equal width on medium screens and up */}
                {/* Adjusted border: border-b md:border-b-0 md:border-r - border on bottom for mobile, on right for desktop */}
                <div className="md:flex-1 mb-4 md:mb-0 pb-4 md:pb-0 md:pr-4 border-b border-slate-600 md:border-b-0 md:border-r">
                    <p className="font-semibold text-slate-300 mb-2">Daily Energy (Today vs. Yesterday)</p>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1"> {/* Added gap-y-1 for consistency */}
                        <div>
                            <p className="text-xs text-slate-400">Today:</p>
                            {/* Adjusted text size for values to be slightly more responsive */}
                            <p className="font-medium text-base sm:text-lg text-sky-400">{formatEnergy(energyToday)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400">Yesterday:</p>
                            <p className="font-medium text-base sm:text-lg text-slate-400">{formatEnergy(energyYesterday)}</p>
                        </div>
                    </div>
                    {energyYesterday === 0 && energyToday === 0 ? (
                        <p className="text-xs mt-2 text-slate-500">No significant energy recorded.</p> // Simplified message
                    ) : (
                        <p className="text-xs mt-2 text-slate-400">Factor: <span className="font-semibold">{todayYesterdayRatio}</span></p>
                    )}
                </div>

                {/* Weekly Comparison Section */}
                {/* Added md:flex-1 for equal width */}
                <div className="md:flex-1">
                    <p className="font-semibold text-slate-300 mb-2">Weekly Energy (This Week vs. Last Week)</p>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                        <div>
                            <p className="text-xs text-slate-400">This Week:</p>
                            <p className="font-medium text-base sm:text-lg text-sky-400">{formatEnergy(energyThisWeek)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400">Last Week:</p>
                            <p className="font-medium text-base sm:text-lg text-slate-400">{formatEnergy(energyLastWeek)}</p>
                        </div>
                    </div>
                    {energyLastWeek === 0 && energyThisWeek === 0 ? (
                        <p className="text-xs mt-2 text-slate-500">No significant energy recorded.</p> // Simplified message
                    ) : (
                        <p className="text-xs mt-2 text-slate-400">Factor: <span className="font-semibold">{thisWeekLastWeekRatio}</span></p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SeismicEnergyDisplay;
