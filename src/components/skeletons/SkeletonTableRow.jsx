import React from 'react';
import PropTypes from 'prop-types';
import SkeletonText from './SkeletonText'; // Assuming SkeletonText is in the same directory

/**
 * A skeleton loader component for a table row.
 * @param {object} props - The component's props.
 * @param {number} [props.cols=4] - Number of columns in the row.
 * @returns {JSX.Element} The rendered SkeletonTableRow component.
 */
const SkeletonTableRow = ({cols = 4}) => (<tr className="animate-pulse bg-slate-700">{[...Array(cols)].map((_, i) => (<td key={i} className="px-3 py-2 sm:px-4 whitespace-nowrap"><SkeletonText width="w-full"/></td>))}</tr>);

SkeletonTableRow.propTypes = {
    cols: PropTypes.number,
};

export default SkeletonTableRow;
