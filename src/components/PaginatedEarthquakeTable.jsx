import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import SkeletonText from './SkeletonText';
import SkeletonTableRow from './SkeletonTableRow';

/**
 * A React component that displays a paginated and sortable table of earthquake data.
 * @param {object} props - The component's props.
 * @param {string} props.title - The title of the table.
 * @param {Array<object> | null} props.earthquakes - An array of earthquake feature objects.
 * @param {boolean} props.isLoading - Whether the data is currently loading.
 * @param {function} props.onQuakeClick - Callback function when an earthquake row is clicked.
 * @param {number} [props.itemsPerPage=10] - Number of items to display per page.
 * @param {string} [props.defaultSortKey='time'] - The default key to sort by.
 * @param {string} [props.initialSortDirection='descending'] - The initial sort direction ('ascending' or 'descending').
 * @param {string} [props.periodName] - Name of the period for display purposes (e.g., "last 24 hours").
 * @param {function} [props.filterPredicate] - An optional function to filter earthquakes before display.
 * @param {function} props.getMagnitudeColorStyle - Function to get magnitude color style.
 * @param {function} props.formatTimeAgo - Function to format time ago.
 * @param {function} props.formatDate - Function to format date.
 * @returns {JSX.Element} The rendered PaginatedEarthquakeTable component.
 */
const PaginatedEarthquakeTable = React.memo(({
    title, earthquakes, isLoading, onQuakeClick, itemsPerPage = 10,
    defaultSortKey = 'time', initialSortDirection = 'descending',
    periodName, filterPredicate,
    getMagnitudeColorStyle, formatTimeAgo, formatDate
}) => {
    const cardBg = "bg-slate-700"; const titleColor = "text-indigo-300"; const tableHeaderBg = "bg-slate-800"; const tableHeaderTextColor = "text-slate-400"; const tableRowHover = "hover:bg-slate-600"; const borderColor = "border-slate-600"; const paginationButton = "bg-slate-600 hover:bg-slate-500 text-slate-300 border-slate-500 disabled:opacity-40"; const paginationText = "text-slate-300";
    const [sortConfig, setSortConfig] = useState({key: defaultSortKey, direction: initialSortDirection}); const [currentPage, setCurrentPage] = useState(1);

    const processedEarthquakes = useMemo(() => {
        if (!earthquakes) return [];
        let items = filterPredicate ? earthquakes.filter(filterPredicate) : earthquakes;
        if (sortConfig.key !== null) {
            items = [...items].sort((a, b) => {
                let valA, valB;
                if (sortConfig.key === 'depth') {
                    valA = a.geometry?.coordinates?.[2];
                    valB = b.geometry?.coordinates?.[2];
                } else {
                    valA = a.properties?.[sortConfig.key];
                    valB = b.properties?.[sortConfig.key];
                }
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

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        } else if (sortConfig.key === key && sortConfig.direction === 'descending') {
            direction = 'ascending';
        }
        setSortConfig({key, direction});
        setCurrentPage(1);
    };

    const handleSortKeyDown = (event, key) => {
        if (event.key === 'Enter' || event.key === ' ') {
            requestSort(key);
            event.preventDefault(); // Prevent scrolling if space is pressed
        }
    };

    const handleRowKeyDown = (event, quake) => {
        if (event.key === 'Enter' || event.key === ' ') {
            onQuakeClick(quake);
            event.preventDefault(); // Prevent scrolling if space is pressed
        }
    };

    const getSortIndicator = (key) => (sortConfig.key === key ? (sortConfig.direction === 'ascending' ? ' ▲' : ' ▼') : <span className="text-slate-500"> ◇</span>);

    const columns = [
        {label: 'Mag.', key: 'mag', className: `px-2 py-1.5 sm:px-3 whitespace-nowrap text-xs sm:text-sm font-medium`},
        {label: 'Location', key: 'place', className: `px-2 py-1.5 sm:px-3 whitespace-nowrap text-xs sm:text-sm`},
        {label: 'Time / Ago', key: 'time', className: `px-2 py-1.5 sm:px-3 whitespace-nowrap text-xs sm:text-sm text-slate-400`},
        {label: 'Depth', key: 'depth', className: `px-2 py-1.5 sm:px-3 whitespace-nowrap text-xs sm:text-sm text-slate-400`}
    ];

    if (isLoading || earthquakes === null) {
        return (
            <div className={`${cardBg} p-3 rounded-lg mt-4 overflow-x-auto border ${borderColor} shadow-md`}>
                <h3 className={`text-md font-semibold mb-2 ${titleColor}`}>{title}</h3>
                <table className="min-w-full divide-y divide-slate-600">
                    <thead className={tableHeaderBg}>
                    <tr>{columns.map(col => (
                        <th key={col.key} scope="col" aria-label={col.label} className={`px-2 py-1.5 sm:px-3 text-left text-xs font-medium ${tableHeaderTextColor} uppercase tracking-wider`}>
                            <span className="sr-only">{col.label}</span>
                            <SkeletonText width="w-12" className="bg-slate-600"/>
                        </th>
                    ))}</tr>
                    </thead>
                    <tbody className="bg-slate-700 divide-y divide-slate-600">
                    {[...Array(Math.min(itemsPerPage, 3))].map((_, i) => <SkeletonTableRow key={i} cols={columns.length}/>)}
                    </tbody>
                </table>
            </div>
        );
    }

    if (processedEarthquakes.length === 0) {
        return (
            <div className={`${cardBg} p-3 rounded-lg mt-4 border ${borderColor} shadow-md`}>
                <h3 className={`text-md font-semibold mb-2 ${titleColor}`}>{title}</h3>
                <p className={`text-xs text-slate-400`}>No earthquakes recorded {periodName ? `in the ${periodName}` : 'for this period'}.</p>
            </div>
        );
    }

    return (
        <div className={`${cardBg} p-3 rounded-lg mt-4 border ${borderColor} shadow-md`}>
            <h3 className={`text-md font-semibold mb-2 ${titleColor}`}>{title}</h3>
            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800">
                <table className="min-w-full divide-y divide-slate-600">
                    <thead className={`${tableHeaderBg} sticky top-0 z-10`}>
                    <tr>
                        {columns.map(col => (
                            <th
                                key={col.key}
                                scope="col"
                                onClick={() => requestSort(col.key)}
                                onKeyDown={(e) => handleSortKeyDown(e, col.key)}
                                tabIndex="0"
                                className={`px-2 py-1.5 sm:px-3 text-left text-xs font-medium ${tableHeaderTextColor} uppercase tracking-wider cursor-pointer hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                                role="columnheader" // Already a th, but explicit for clarity with interaction
                                aria-sort={sortConfig.key === col.key ? sortConfig.direction : 'none'}
                            >
                                {col.label}<span aria-hidden="true">{getSortIndicator(col.key)}</span>
                            </th>
                        ))}
                    </tr>
                    </thead>
                    <tbody className="bg-slate-700 bg-opacity-50 divide-y divide-slate-600">
                    {paginatedEarthquakes.map((quake) => (
                        <tr
                            key={`pgtbl-${quake.id}`}
                            onClick={() => onQuakeClick(quake)}
                            // onKeyDown removed
                            // tabIndex removed
                            // role removed
                            className={`${getMagnitudeColorStyle(quake.properties.mag)} ${tableRowHover} cursor-pointer transition-colors`} // Removed focus styles here as row itself is not primary focus target
                        >
                            <td className={columns[0].className}>{quake.properties.mag?.toFixed(1) || "N/A"}</td>
                            <td className={`${columns[1].className} text-slate-200`}>
                                <a href={quake.properties.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-current hover:text-indigo-300 hover:underline">
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
                <div className="mt-3 flex justify-between items-center">
                    <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} className={`px-3 py-1 text-xs font-medium border rounded-md transition-colors ${paginationButton}`}>Prev</button>
                    <span className={`text-xs ${paginationText}`}>Page {currentPage} of {totalPages} ({processedEarthquakes.length})</span>
                    <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className={`px-3 py-1 text-xs font-medium border rounded-md transition-colors ${paginationButton}`}>Next</button>
                </div>
            )}
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
