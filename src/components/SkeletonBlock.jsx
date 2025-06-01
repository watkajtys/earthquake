import React from 'react';
import PropTypes from 'prop-types';

/**
 * A skeleton loader component for a block of content.
 * @param {object} props - The component's props.
 * @param {string} [props.height='h-24'] - Tailwind CSS class for height.
 * @param {string} [props.className=''] - Additional Tailwind CSS classes.
 * @returns {JSX.Element} The rendered SkeletonBlock component.
 */
const SkeletonBlock = ({height = 'h-24', className = ''}) => <div className={`bg-slate-700 rounded ${height} animate-pulse ${className}`}></div>;

SkeletonBlock.propTypes = {
    height: PropTypes.string,
    className: PropTypes.string,
};

export default SkeletonBlock;
