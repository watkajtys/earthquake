import React from 'react';

/**
 * A skeleton loader component for text.
 * @param {object} props - The component's props.
 * @param {string} [props.width='w-3/4'] - Tailwind CSS class for width.
 * @param {string} [props.height='h-4'] - Tailwind CSS class for height.
 * @param {string} [props.className=''] - Additional Tailwind CSS classes.
 * @returns {JSX.Element} The rendered SkeletonText component.
 */
const SkeletonText = ({ width = 'w-3/4', height = 'h-4', className = '' }) => <div className={`bg-gray-300 rounded ${width} ${height} animate-pulse mb-2 ${className}`}></div>;

export default SkeletonText;
