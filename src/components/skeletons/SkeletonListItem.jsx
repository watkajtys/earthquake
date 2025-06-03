import React from 'react';
import SkeletonText from './SkeletonText'; // Assuming SkeletonText is in the same directory

/**
 * A skeleton loader component for a list item.
 * @returns {JSX.Element} The rendered SkeletonListItem component.
 */
const SkeletonListItem = () => <div className="flex items-center justify-between p-2 bg-slate-700 rounded animate-pulse mb-2"><SkeletonText width="w-1/2"/><SkeletonText width="w-1/4"/></div>;

export default SkeletonListItem;
