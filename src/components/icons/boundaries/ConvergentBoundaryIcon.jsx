import React from 'react';

const ConvergentBoundaryIcon = ({ className = "w-12 h-8" }) => (
  <svg viewBox="0 0 50 30" className={className} aria-labelledby="convergentBoundaryTitle" role="img">
    <title id="convergentBoundaryTitle">Convergent Boundary Diagram</title>
    {/* Left Block */}
    <rect x="2" y="5" width="20" height="20" fill="currentColor" opacity="0.7" />
    {/* Right Block */}
    <rect x="28" y="5" width="20" height="20" fill="currentColor" opacity="0.5" />
    {/* Arrows pointing inwards */}
    <polyline points="20,15 26,15 23,12 26,15 23,18" stroke="white" strokeWidth="1.5" fill="none" /> {/* Arrow on left block pointing right */}
    <polyline points="30,15 24,15 27,12 24,15 27,18" stroke="white" strokeWidth="1.5" fill="none" /> {/* Arrow on right block pointing left */}
    {/* Optional: Hint of collision/uplift - subtle */}
    {/* <path d="M23,5 Q25,2 27,5" stroke="currentColor" strokeWidth="0.5" fill="none" /> */}
  </svg>
);
export default ConvergentBoundaryIcon;
