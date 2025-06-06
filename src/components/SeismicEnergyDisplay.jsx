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
        <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md text-sm text-slate-200">
            <h3 className="text-md font-semibold mb-3 text-indigo-400">Seismic Energy Release Comparison</h3>

            {/* Daily Comparison */}
            <div className="mb-3 pb-3 border-b border-slate-600">
                <p className="font-semibold text-slate-300 mb-1">Daily Energy (Today vs. Yesterday)</p>
                <div className="grid grid-cols-2 gap-x-2">
                    <div>
                        <p className="text-xs text-slate-400">Today:</p>
                        <p className="font-medium text-lg text-sky-400">{formatEnergy(energyToday)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-400">Yesterday:</p>
                        <p className="font-medium text-lg text-slate-400">{formatEnergy(energyYesterday)}</p>
                    </div>
                </div>
                {energyYesterday === 0 && energyToday === 0 ? (
                     <p className="text-xs mt-1 text-slate-500">No significant energy recorded for today or yesterday.</p>
                ) : (
                     <p className="text-xs mt-1 text-slate-400">Factor: <span className="font-semibold">{todayYesterdayRatio}</span></p>
                )}

            </div>

            {/* Weekly Comparison */}
            <div>
                <p className="font-semibold text-slate-300 mb-1">Weekly Energy (This Week vs. Last Week)</p>
                 <div className="grid grid-cols-2 gap-x-2">
                    <div>
                        <p className="text-xs text-slate-400">This Week:</p>
                        <p className="font-medium text-lg text-sky-400">{formatEnergy(energyThisWeek)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-400">Last Week:</p>
                        <p className="font-medium text-lg text-slate-400">{formatEnergy(energyLastWeek)}</p>
                    </div>
                </div>
                {energyLastWeek === 0 && energyThisWeek === 0 ? (
                    <p className="text-xs mt-1 text-slate-500">No significant energy recorded for this or last week.</p>
                ) : (
                    <p className="text-xs mt-1 text-slate-400">Factor: <span className="font-semibold">{thisWeekLastWeekRatio}</span></p>
                )}
            </div>
        </div>
    );
};

export default SeismicEnergyDisplay;
