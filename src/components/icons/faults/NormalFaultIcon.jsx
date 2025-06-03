import React from 'react';

const NormalFaultIcon = ({ className = "w-12 h-8" }) => (
  <svg viewBox="0 0 50 30" className={className} aria-labelledby="normalFaultTitle" role="img">
    <title id="normalFaultTitle">Normal Fault Diagram</title>
    {/* Fault line */}
    <line x1="5" y1="25" x2="45" y2="5" stroke="currentColor" strokeWidth="1" />
    {/* Hanging wall (left block, moved down) */}
    <polygon points="5,25 25,15 25,30 5,30" fill="currentColor" opacity="0.7" />
    <rect x="0" y="15" width="25" height="15" fill="currentColor" opacity="0.7" />
    {/* Footwall (right block) */}
    <polygon points="25,5 45,5 45,20 25,30" fill="currentColor" opacity="0.5" />
    <rect x="25" y="0" width="25" height="20" fill="currentColor" opacity="0.5" />
    {/* Arrow indicating downward movement of hanging wall */}
    <polyline points="15,10 15,18 12,15 15,18 18,15" stroke="white" strokeWidth="1.5" fill="none" />
  </svg>
);
export default NormalFaultIcon;
