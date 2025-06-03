import React from 'react';

const DivergentBoundaryIcon = ({ className = "w-12 h-8" }) => (
  <svg viewBox="0 0 50 30" className={className} aria-labelledby="divergentBoundaryTitle" role="img">
    <title id="divergentBoundaryTitle">Divergent Boundary Diagram</title>
    {/* Left Block */}
    <rect x="2" y="5" width="20" height="20" fill="currentColor" opacity="0.7" />
    {/* Right Block */}
    <rect x="28" y="5" width="20" height="20" fill="currentColor" opacity="0.5" />
    {/* Arrows pointing outwards */}
    <polyline points="15,15 5,15 8,12 5,15 8,18" stroke="white" strokeWidth="1.5" fill="none" /> {/* Arrow on left block pointing left */}
    <polyline points="35,15 45,15 42,12 45,15 42,18" stroke="white" strokeWidth="1.5" fill="none" /> {/* Arrow on right block pointing right */}
    {/* Optional: Hint of upwelling - subtle line in center */}
    {/* <line x1="25" y1="10" x2="25" y2="20" stroke="currentColor" strokeWidth="1" strokeDasharray="2,1" /> */}
  </svg>
);
export default DivergentBoundaryIcon;
