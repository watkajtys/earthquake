// src/SimplifiedDepthProfile.jsx
import React from 'react';
import { getMagnitudeColor } from './utils';

function SimplifiedDepthProfile({ earthquakeDepth, magnitude }) {
  // ... (existing initial checks for earthquakeDepth) ...
  if (earthquakeDepth === null || earthquakeDepth === undefined || isNaN(parseFloat(earthquakeDepth))) {
    return (
      <div className="p-3 rounded-md text-center text-sm text-slate-500">
        Depth information not available or invalid for this earthquake.
      </div>
    );
  }
  const depth = parseFloat(earthquakeDepth);

  const layers = [
    // Surface is handled separately in terms of drawing height calculation
    { name: "Surface", startDepth: 0, endDepth: 0, color: "bg-lime-200", textColor: "text-lime-800", zIndex: 10 },
    { name: "Sedimentary/Upper Crust", startDepth: 0, endDepth: 10, color: "bg-stone-300", textColor: "text-stone-800", zIndex: 4 },
    { name: "Continental Crust", startDepth: 10, endDepth: 35, color: "bg-neutral-400", textColor: "text-neutral-800", zIndex: 3 },
    { name: "Lithospheric Mantle", startDepth: 35, endDepth: 100, color: "bg-slate-500", textColor: "text-slate-100", zIndex: 2 },
    { name: "Asthenosphere (Upper Mantle)", startDepth: 100, endDepth: 700, color: "bg-indigo-800", textColor: "text-indigo-100", zIndex: 1 },
  ];

  const diagramTotalRealDepthKm = 700; // Max real depth the diagram represents for scaling layers

  // Visual scaling parameters
  const surfaceBandHeightPx = 24; // Fixed height for the "Surface" band
  const diagramTotalRenderHeightPx = 320; // Overall height of the visual diagram container (e.g. h-80)
  const availableDrawingPx = diagramTotalRenderHeightPx - surfaceBandHeightPx; // Space below surface band

  const segment1MaxDepthKm = 100; // Depths up to 100km form the first segment
  const segment1VisualPercent = 0.60; // This segment gets 60% of availableDrawingPx

  const segment1VisualPx = availableDrawingPx * segment1VisualPercent;
  const segment2VisualPx = availableDrawingPx * (1.0 - segment1VisualPercent);
  const segment2RealDepthKm = diagramTotalRealDepthKm - segment1MaxDepthKm; // Should be 600km

  const getLayerVisualHeightPx = (layerStartKm, layerEndKm) => {
    let visualHeight = 0;

    // Portion in Segment 1
    const s1Start = Math.max(0, layerStartKm);
    const s1End = Math.min(segment1MaxDepthKm, layerEndKm);
    if (s1End > s1Start) {
      const proportionOfS1 = (s1End - s1Start) / segment1MaxDepthKm;
      visualHeight += proportionOfS1 * segment1VisualPx;
    }

    // Portion in Segment 2
    const s2Start = Math.max(segment1MaxDepthKm, layerStartKm);
    const s2End = Math.min(diagramTotalRealDepthKm, layerEndKm);
    if (s2End > s2Start && segment2RealDepthKm > 0) {
      const proportionOfS2 = (s2End - s2Start) / segment2RealDepthKm;
      visualHeight += proportionOfS2 * segment2VisualPx;
    }
    return visualHeight;
  };

  let hypocenterLineHeightPx = 0;
  if (depth >= 0) {
    if (depth <= segment1MaxDepthKm) {
      hypocenterLineHeightPx = (depth / segment1MaxDepthKm) * segment1VisualPx;
    } else if (depth <= diagramTotalRealDepthKm) {
      hypocenterLineHeightPx = segment1VisualPx +
        ((depth - segment1MaxDepthKm) / segment2RealDepthKm) * segment2VisualPx;
    } else { // Deeper than our diagram's max real depth
      hypocenterLineHeightPx = availableDrawingPx; // Line goes to bottom
    }
    hypocenterLineHeightPx = Math.min(hypocenterLineHeightPx, availableDrawingPx); // Cap at max drawing height
  }


  let hypocenterLayerName = "Unknown";
  // Find containing layer (excluding Surface)
  const containingLayer = layers.slice(1).find(l => depth >= l.startDepth && depth < l.endDepth);
   if (containingLayer) {
       hypocenterLayerName = containingLayer.name;
   } else if (depth === 0) {
        hypocenterLayerName = "Surface";
   } else if (depth >= diagramTotalRealDepthKm) {
       hypocenterLayerName = `Below ${diagramTotalRealDepthKm}km`;
   } else {
      // Check if it's exactly on a boundary if not caught by < layer.endDepth
      const onBoundaryLayer = layers.slice(1).find(l => depth === l.startDepth);
      if (onBoundaryLayer) hypocenterLayerName = `Boundary at ${onBoundaryLayer.name}`;
      else if (depth > segment1MaxDepthKm && depth < layers.find(l=>l.name.startsWith("Asthenosphere"))?.startDepth ) {
        // This condition might be redundant if layers are contiguous
        hypocenterLayerName = layers.find(l=>l.name.startsWith("Lithospheric Mantle"))?.name || "Deep";
      } else {
        hypocenterLayerName = "Deep"; // Fallback
      }
   }


  return (
    <div className="p-3 rounded-md"> {/* Removed bg-gray-50 etc. from previous step */}
      <h3 className="text-md font-semibold text-gray-700 mb-1">Simplified Depth Profile</h3>
      <p className="text-xs text-slate-600 mb-3">
        Illustrative depth of M<strong>{magnitude?.toFixed(1)}</strong> event at <strong>{depth?.toFixed(1)} km</strong>
        (approx. within {hypocenterLayerName}).
      </p>

      <div className="relative w-full bg-gray-100 rounded border border-gray-300 flex flex-col" style={{ height: `${diagramTotalRenderHeightPx}px` }}>
        {/* Render Surface Band */}
        <div
            key={layers[0].name}
            className={`flex-shrink-0 ${layers[0].color} flex items-center justify-center relative`}
            style={{height: `${surfaceBandHeightPx}px`, zIndex: layers[0].zIndex}}
        >
            <span className={`text-xs font-medium ${layers[0].textColor} overflow-hidden whitespace-nowrap text-ellipsis p-1`}>
                {layers[0].name} (0 km)
            </span>
        </div>

        {/* Render Geological Layers below Surface */}
        {layers.slice(1).map((layer) => {
          const visualHeightPx = getLayerVisualHeightPx(layer.startDepth, layer.endDepth);
          if (visualHeightPx <= 0) return null;

          return (
            <div
              key={layer.name}
              className={`flex-shrink-0 ${layer.color} flex items-center justify-center relative border-t border-black border-opacity-10`}
              style={{ height: `${visualHeightPx}px`, zIndex: layer.zIndex }}
            >
              <span className={`text-xs font-medium ${layer.textColor} p-1 rounded bg-white bg-opacity-30 overflow-hidden whitespace-nowrap text-ellipsis`}>
                {layer.name} ({layer.startDepth === 0 ? '' : `${layer.startDepth}-`}{layer.endDepth}km)
              </span>
            </div>
          );
        })}

        {/* Hypocenter Marker & Line */}
        {depth >= 0 && (
            <div
                className="absolute left-1/4 w-0.5 bg-red-600"
                style={{
                    top: `${surfaceBandHeightPx}px`,
                    height: `${hypocenterLineHeightPx}px`,
                    zIndex: 20 // Ensure line is above layers but below label potentially
                }}
            >
                <div
                    className="absolute left-1/2 w-16 h-16 transform -translate-x-1/2" // Increased size to accommodate rings
                    style={{
                        bottom: '0px',
                        transform: 'translate(-50%, 50%)', // Center the larger SVG area
                        // overflow: 'visible' // If rings go outside the H-16 W-16 box; SVG usually clips by default
                    }}
                    title={`Hypocenter at ${depth?.toFixed(1)} km. Magnitude: ${magnitude?.toFixed(1)}`}
                >
                    <svg viewBox="0 0 60 60" width="64" height="64"> {/* Adjusted viewBox and size for rings */}
                        <g transform="translate(30,30)"> {/* Center coordinate system for rings */}
                            {/* Animated Rings - 3 rings with staggered delays */}
                            {[0, 1, 2].map((i) => (
                                <circle
                                    key={i}
                                    cx="0"
                                    cy="0"
                                    r="3" // Initial radius
                                    stroke={getMagnitudeColor(magnitude)}
                                    strokeWidth="2" // Changed
                                    fill="none"
                                    strokeOpacity="0.9" // Changed (this is the initial value for the SVG element itself)
                                >
                                    <animate
                                        attributeName="r"
                                        from="3"
                                        to="25" // Expand to radius
                                        dur="3s" // Duration of one pulse
                                        begin={`${i * 1}s`} // Stagger start times
                                        repeatCount="indefinite"
                                    />
                                    <animate
                                        attributeName="stroke-opacity"
                                        from="0.9" // Changed to match initial
                                        to="0"
                                        dur="3s"
                                        begin={`${i * 1}s`}
                                        repeatCount="indefinite"
                                    />
                                </circle>
                            ))}
                            {/* Central Hypocenter Marker - drawn on top */}
                            <circle cx="0" cy="0" r="3.5" fill="#EF4444" stroke="#1F2937" strokeWidth="1" /> {/* Smaller radius to fit new viewBox scale */}
                        </g>
                    </svg>
                </div>
            </div>
        )}
         {/* Depth Label for Hypocenter */}
        {depth >= 0 && (
            <div
                className="absolute text-xs text-red-700 font-bold bg-white bg-opacity-80 px-1.5 py-0.5 rounded shadow-md"
                style={{
                    top: depth < 15 ? `${surfaceBandHeightPx + 5}px` : `calc(${surfaceBandHeightPx}px + ${hypocenterLineHeightPx}px - 8px)`,
                    left: depth < 15 ? 'calc(25% + 25px)' : 'calc(25% + 10px)',
                    zIndex: 21, // Ensure label is above the line/marker
                    display: depth < 1 && depth > 0 ? 'none' : 'block'
                }}
            >
                {depth?.toFixed(1)} km
            </div>
        )}
      </div>
      <p className="text-xs text-slate-500 mt-2 text-center">
        Note: Diagram is illustrative. Layer depths are approximate. Top 100km expanded for detail.
      </p>
    </div>
  );
}

export default SimplifiedDepthProfile;
