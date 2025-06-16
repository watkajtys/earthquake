import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import SkeletonText from './skeletons/SkeletonText';
import SkeletonTableRow from './skeletons/SkeletonTableRow';

/**
 * Displays earthquake data in a paginated and sortable table.
 * This component is memoized using `React.memo` for performance.
 * It handles internal state for sorting configuration (`sortConfig`) and current page (`currentPage`).
 * Earthquake data is processed (filtered and sorted) using `useMemo` for efficiency.
 * Shows skeleton rows during loading or if `earthquakes` is null.
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {string} props.title - The title to be displayed above the table.
 * @param {Array<Object>|null} props.earthquakes - An array of earthquake feature objects (USGS GeoJSON structure).
 *   If null or while `isLoading` is true, skeleton loaders are shown.
 * @param {boolean} props.isLoading - Flag indicating whether the earthquake data is currently loading.
 * @param {function(Object):void} props.onQuakeClick - Callback function invoked when an earthquake row is clicked.
 *   Receives the earthquake data object for that row.
 * @param {number} [props.itemsPerPage=10] - The number of earthquake entries to display per page.
 * @param {string} [props.defaultSortKey='time'] - The key (from earthquake properties or geometry) to sort by initially (e.g., 'mag', 'time', 'depth').
 * @param {string} [props.initialSortDirection='descending'] - The initial sort direction ('ascending' or 'descending').
 * @param {string} [props.periodName] - Optional name of the period being displayed (e.g., "last 24 hours"),
 *   used in the message when no earthquakes are found.
 * @param {function(Object):boolean} [props.filterPredicate] - An optional predicate function to filter the `earthquakes` array
 *   before sorting and pagination. Receives an earthquake object and should return true to include it.
 * @param {function(number):string} props.getMagnitudeColorStyle - Function that returns Tailwind CSS class strings for magnitude-based row styling.
 * @param {function(number):string} props.formatTimeAgo - Function to format a timestamp difference into a "time ago" string.
 * @param {function(number):string} props.formatDate - Function to format a timestamp into a full date string.
 * @returns {JSX.Element} The PaginatedEarthquakeTable component.
 */
const PaginatedEarthquakeTable = React.memo(({
    title, earthquakes, isLoading, onQuakeClick, itemsPerPage = 10,
    defaultSortKey = 'time', initialSortDirection = 'descending',
    periodName, filterPredicate,
    getMagnitudeColorStyle, formatTimeAgo, formatDate
}) => {
    const cardBg = "bg-slate-700"; const titleColor = "text-indigo-300"; const tableHeaderBg = "bg-slate-800"; const tableHeaderTextColor = "text-slate-400"; const tableRowHover = "hover:bg-slate-600"; const borderColor = "border-slate-600"; const paginationButton = "bg-slate-600 hover:bg-slate-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"; const paginationText = "text-slate-300";
    const [sortConfig, setSortConfig] = useState({key: defaultSortKey, direction: initialSortDirection}); const [currentPage, setCurrentPage] = useState(1);

    const sortableFields = [
        { value: 'time', label: 'Time' },
        { value: 'mag', label: 'Magnitude' },
        { value: 'place', label: 'Location' },
    ];

    const processedEarthquakes = useMemo(() => {
        if (!earthquakes) return [];
        let items = filterPredicate ? earthquakes.filter(filterPredicate) : earthquakes;
        if (sortConfig.key !== null) {
            items = [...items].sort((a, b) => {
                let valA, valB;
                // Removed depth specific logic as the column is being removed
                valA = a.properties?.[sortConfig.key];
                valB = b.properties?.[sortConfig.key];
                if (valA === null || valA === undefined) return 1;
                if (valB === null || valB === undefined) return -1;
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

    const handleSortKeyChange = (newKey) => {
        let newDirection = 'descending'; // Default for time and magnitude
        if (newKey === 'place') {
            newDirection = 'ascending'; // Default for place
        }
        setSortConfig({ key: newKey, direction: newDirection });
        setCurrentPage(1);
    };

    const toggleSortDirection = () => {
        setSortConfig(currentConfig => ({
            ...currentConfig,
            direction: currentConfig.direction === 'ascending' ? 'descending' : 'ascending'
        }));
        setCurrentPage(1);
    };

    // const handleRowKeyDown = (event, quake) => { // Unused function removed
    //     if (event.key === 'Enter' || event.key === ' ') {
    //         onQuakeClick(quake);
    //         event.preventDefault(); // Prevent scrolling if space is pressed
    //     }
    // };

    // const getSortIndicator = (key) => (sortConfig.key === key ? (sortConfig.direction === 'ascending' ? ' ▲' : ' ▼') : <span className="text-slate-500"> ◇</span>);
    // columns array definition removed as it's no longer needed for list layout

    const renderContent = () => {
        if (isLoading || earthquakes === null) {
            return (
                <div className="overflow-x-auto"> {/* Wrapper for skeletons */}
                    {[...Array(Math.min(itemsPerPage, 3))].map((_, i) => (
                        <div key={`skeleton-${i}`} className={`p-2 border-b border-slate-600 last:border-b-0`}>
                            <div className="flex justify-between items-center text-xs sm:text-sm">
                                <SkeletonText width="w-1/4" className="bg-slate-600" />
                                <SkeletonText width="w-1/3" className="bg-slate-600" />
                            </div>
                            <SkeletonText width="w-full" className="mt-1 bg-slate-600" />
                        </div>
                    ))}
                </div>
            );
        }

        if (processedEarthquakes.length === 0) {
            return (
                <p className={`text-xs text-slate-400 py-4 text-center`}> {/* Added py-4 and text-center for better spacing */}
                    No earthquakes recorded {periodName ? `in the ${periodName}` : 'for this period'}.
                </p>
            );
        }

        return (
            <>
                <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800">
                    {/* List container */}
                    <div>
                        {paginatedEarthquakes.map((quake) => (
                            <div
                                key={quake.id}
                                onClick={() => onQuakeClick(quake)}
                                className={`p-2 cursor-pointer ${getMagnitudeColorStyle(quake.properties.mag)} border-b border-slate-600 last:border-b-0 ${tableRowHover} transition-colors`}
                            >
                                <div className="flex justify-between items-center text-xs sm:text-sm">
                                    <span className="font-bold">M {quake.properties.mag?.toFixed(1) || "N/A"}</span>
                                    <span>
                                        {Date.now() - quake.properties.time < 2 * 24 * 60 * 60 * 1000 ? formatTimeAgo(Date.now() - quake.properties.time) : formatDate(quake.properties.time)}
                                    </span>
                                </div>
                                <p className="text-xs sm:text-sm truncate font-medium mt-0.5" title={quake.properties.place}>
                                    {quake.properties.place || "N/A"}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
                {totalPages > 1 && (
                    <div className="mt-3 flex justify-between items-center">
                        <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${paginationButton}`}>Prev</button>
                        <span className={`text-xs ${paginationText}`}>Page {currentPage} of {totalPages} ({processedEarthquakes.length})</span>
                        <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${paginationButton}`}>Next</button>
                    </div>
                )}
            </>
        );
    };

    return (
        <div className={`${cardBg} p-3 rounded-lg mt-4 border ${borderColor} shadow-md`}>
            <h3 className={`text-md font-semibold mb-2 ${titleColor}`}>{title}</h3>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-2 space-y-2 sm:space-y-0">
                <div className="flex items-center space-x-2">
                    <label htmlFor="sort-key-select" className="text-xs text-slate-300">Sort by:</label>
                    <select
                        id="sort-key-select"
                        value={sortConfig.key}
                        onChange={(e) => handleSortKeyChange(e.target.value)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md bg-slate-600 text-white border border-slate-500 focus:ring-indigo-500 focus:border-indigo-500`}
                    >
                        {sortableFields.map(field => (
                            <option key={field.value} value={field.value}>{field.label}</option>
                        ))}
                    </select>
                </div>
                <button
                    onClick={toggleSortDirection}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${paginationButton}`}
                >
                    {sortConfig.direction === 'ascending' ? 'Ascending ▲' : 'Descending ▼'}
                </button>
            </div>
            {renderContent()}
        </div>
    );
});

PaginatedEarthquakeTable.propTypes = {
    title: PropTypes.string.isRequired,
    earthquakes: PropTypes.array,
    isLoading: PropTypes.bool,
    onQuakeClick: PropTypes.func.isRequired,
    itemsPerPage: PropTypes.number,
    defaultSortKey: PropTypes.string,
    initialSortDirection: PropTypes.string,
    periodName: PropTypes.string,
    filterPredicate: PropTypes.func,
    getMagnitudeColorStyle: PropTypes.func.isRequired,
    formatTimeAgo: PropTypes.func.isRequired,
    formatDate: PropTypes.func.isRequired,
};

export default PaginatedEarthquakeTable;
