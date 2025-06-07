import React from 'react';
import { createFaultTooltipContent } from '../utils/detailViewUtils.js'; // Adjust path as needed

const FaultInformationPanel = ({ faultData, onClose }) => {
  if (!faultData) {
    return null;
  }

  // Call createFaultTooltipContent to get the HTML string
  // The explanations are already part of the content returned by this function
  const contentHtml = createFaultTooltipContent(faultData);

  return (
    <div style={{
      position: 'fixed',
      top: '80px', // Adjusted from 20px to 80px to avoid overlap with potential top bars
      right: '20px',
      zIndex: 1000, // Standard z-index for overlays, leaflet map is often 400-500
      backgroundColor: '#1E293B', // bg-slate-800
      padding: '1rem', // p-4
      border: '1px solid #334155', // border-slate-700
      borderRadius: '0.5rem', // rounded-lg
      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)', // shadow-xl
      maxWidth: '400px', // Roughly max-w-md
      maxHeight: 'calc(100vh - 100px)', // Adjusted to ensure it doesn't go off-screen, 80vh can be too much
      overflowY: 'auto',
      color: '#E2E8F0' // text-slate-200, for default text color inside panel
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'white' }}>Fault Details</h2>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94A3B8', // text-slate-400
            fontSize: '1.5rem',
            cursor: 'pointer',
            padding: '0.25rem 0.5rem', // Added padding for easier clicking
            lineHeight: '1' // Ensure 'X' is centered
          }}
          aria-label="Close fault details panel" // Accessibility
        >
          &times; {/* Simple 'X' close icon */}
        </button>
      </div>
      {/* The content from createFaultTooltipContent is already HTML */}
      <div dangerouslySetInnerHTML={{ __html: contentHtml }} />
    </div>
  );
};

export default FaultInformationPanel;
