import React from 'react';

const ReverseFaultIcon = ({ className = "w-12 h-8" }) => (
  <svg viewBox="0 0 50 30" className={className} aria-labelledby="reverseFaultTitle" role="img">
    <title id="reverseFaultTitle">Reverse Fault Diagram</title>
    {/* Fault line */}
    <line x1="5" y1="5" x2="45" y2="25" stroke="currentColor" strokeWidth="1" />
    {/* Hanging wall (left block, moved up) */}
    <polygon points="5,5 25,15 25,30 5,30" fill="currentColor" opacity="0.7" />
     <rect x="0" y="0" width="25" height="25" fill="currentColor" opacity="0.7" />
    {/* Footwall (right block) */}
    <polygon points="25,15 45,25 45,30 25,30" fill="currentColor" opacity="0.5" />
    <rect x="25" y="15" width="25" height="15" fill="currentColor" opacity="0.5" />
    {/* Arrow indicating upward movement of hanging wall */}
    <polyline points="15,20 15,12 12,15 15,12 18,15" stroke="white" strokeWidth="1.5" fill="none" />
  </svg>
);
export default ReverseFaultIcon;
