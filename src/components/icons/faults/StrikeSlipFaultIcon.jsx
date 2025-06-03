import React from 'react';

const StrikeSlipFaultIcon = ({ className = "w-12 h-8" }) => (
  <svg viewBox="0 0 50 30" className={className} aria-labelledby="strikeSlipFaultTitle" role="img">
    <title id="strikeSlipFaultTitle">Strike-Slip Fault Diagram</title>
    {/* Fault line (vertical) */}
    <line x1="25" y1="2" x2="25" y2="28" stroke="currentColor" strokeWidth="1" />
    {/* Left block */}
    <rect x="2" y="2" width="23" height="26" fill="currentColor" opacity="0.7" />
    {/* Right block */}
    <rect x="25" y="2" width="23" height="26" fill="currentColor" opacity="0.5" />
    {/* Arrow on left block (e.g., moving away/up) */}
    <polyline points="10,10 15,5 20,10" stroke="white" strokeWidth="1.5" fill="none" />
    <line x1="15" y1="5" x2="15" y2="15" stroke="white" strokeWidth="1.5" />
    {/* Arrow on right block (e.g., moving towards/down) */}
    <polyline points="35,20 40,25 45,20" stroke="white" strokeWidth="1.5" fill="none" />
    <line x1="40" y1="15" x2="40" y2="25" stroke="white" strokeWidth="1.5" />
  </svg>
);
export default StrikeSlipFaultIcon;
