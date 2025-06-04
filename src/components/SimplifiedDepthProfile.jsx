// src/SimplifiedDepthProfile.jsx
import React from 'react';
import { getMagnitudeColor } from '../utils/utils.js';

export const DEPTH_COMPARISONS = [ // Added export
  { name: "Burj Khalifa", depth: 0.828 },
  { name: "Krubera Cave (deepest cave)", depth: 2.197 },
  { name: "Grand Canyon (average depth)", depth: 1.83 },
  { name: "Challenger Deep (ocean deepest)", depth: 10.935 },
  { name: "Average Continental Crust", depth: 35 },
  { name: "Height of Mount Everest", depth: 8.848, isHeight: true },
  { name: "Typical Commercial Flight Altitude", depth: 10.6, isHeight: true },
  { name: "Depth of Titanic Wreckage", depth: 3.8 },
  { name: "Deepest Gold Mine (Mponeng, South Africa)", depth: 4.0 },
  { name: "Average Ocean Depth", depth: 3.7 },
  { name: "Kola Superdeep Borehole (deepest artificial point)", depth: 12.262 },
  { name: "Deepest Point in the Arctic Ocean (Molloy Deep)", depth: 5.55 },
  { name: "Deepest Point in the Atlantic Ocean (Puerto Rico Trench)", depth: 8.376 },
  { name: "Deepest Point in the Indian Ocean (Java Trench)", depth: 7.725 },
  { name: "Typical Geothermal Well Depth", depth: 2.0 },
  { name: "Depth of Lake Baikal (deepest lake)", depth: 1.642 },
  { name: "Panama Canal Max Depth", depth: 0.018 },
  { name: "Suez Canal Max Depth", depth: 0.024 },
];

/**
 * Displays a simplified, illustrative vertical profile of Earth's layers
 * to visualize the depth of an earthquake's hypocenter.
 * Includes a pulsating marker at the event's depth and indicates the geological layer.
 *
 * @param {number} earthquakeDepth - The depth of the earthquake hypocenter in kilometers.
 * @param {number} magnitude - The magnitude of the earthquake, used for styling the hypocenter marker.
 * @returns {JSX.Element} The simplified depth profile visualization or a message if depth is unavailable.
 */
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

  // Helper function for dynamic contextual comparisons
  const contextualMessages = getDynamicContextualComparisons(depth, DEPTH_COMPARISONS);

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

  const getComparisonDepthLineHeightPx = (comparisonDepthKm) => {
    if (comparisonDepthKm < 0) return 0; // Should not happen with current data

    let lineHeightPx = 0;
    if (comparisonDepthKm <= segment1MaxDepthKm) {
      lineHeightPx = (comparisonDepthKm / segment1MaxDepthKm) * segment1VisualPx;
    } else if (comparisonDepthKm <= diagramTotalRealDepthKm) {
      lineHeightPx = segment1VisualPx +
        ((comparisonDepthKm - segment1MaxDepthKm) / segment2RealDepthKm) * segment2VisualPx;
    } else { // Deeper than our diagram's max real depth
      lineHeightPx = availableDrawingPx; // Line goes to bottom
    }
    return Math.min(lineHeightPx, availableDrawingPx); // Cap at max drawing height
  };

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
        Illustrative depth of M<strong>{typeof magnitude === 'number' ? magnitude.toFixed(1) : 'N/A'}</strong> event at <strong>{depth?.toFixed(1)} km</strong>
        (approx. within {hypocenterLayerName}).
      </p>

      {contextualMessages.length > 0 && (
        <div className="my-3 p-2 rounded bg-sky-50 border border-sky-200 text-sky-700" data-testid="contextual-insights-container">
          <h4 className="text-xs font-semibold text-sky-800 mb-1">Contextual Depth Insights:</h4>
          {contextualMessages.map((msg, index) => (
            <p key={index} className="text-xs mb-0.5">{msg}</p>
          ))}
        </div>
      )}

      <details className="my-3 group" data-testid="static-comparison-list-details">
        <summary className="p-2 rounded bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 group-open:rounded-b-none">
          <h4 className="text-xs font-semibold text-slate-600 inline">Real-World Depth & Height Comparisons</h4>
          <span className="text-xs text-slate-500 ml-1 group-open:hidden">(Click to expand)</span>
          <span className="text-xs text-slate-500 ml-1 hidden group-open:inline">(Click to collapse)</span>
        </summary>
        <div className="p-2 rounded-b bg-slate-50 border border-t-0 border-slate-200" data-testid="comparison-text-list-container">
          <ul className="list-disc list-inside text-xs text-slate-500 md:grid md:grid-cols-2 md:gap-x-4" data-testid="comparison-text-list">
            {DEPTH_COMPARISONS.map(comp => (
              <li key={comp.name} data-testid={`comparison-text-item-${comp.name.replace(/\s+/g, '-').toLowerCase()}`}>
                {comp.name}: {comp.depth.toFixed(1)} km{comp.isHeight ? ' (Height)' : ''}
              </li>
            ))}
          </ul>
        </div>
      </details>

      <div className="relative w-full bg-gray-100 rounded border border-gray-300 flex flex-col" style={{ height: `${diagramTotalRenderHeightPx}px` }} data-testid="depth-profile-chart">
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
                    title={`Hypocenter at ${depth?.toFixed(1)} km. Magnitude: ${typeof magnitude === 'number' ? magnitude.toFixed(1) : 'N/A'}`}
                >
                    <svg viewBox="0 0 60 60" width="64" height="64"> {/* Adjusted viewBox and size for rings */}
                        <g transform="translate(30,30)"> {/* Center coordinate system for rings */}
                            {[0, 1, 2].map((i) => (
                                <React.Fragment key={`ring-series-${i}`}>
                                    {/* Outer "Glow" Ring */}
                                    <circle
                                        cx="0"
                                        cy="0"
                                        r="3"
                                        stroke={getMagnitudeColor(magnitude)}
                                        strokeWidth="5" // Wider for glow effect
                                        fill="none"
                                        strokeOpacity="0.5" // Initial opacity for SVG element
                                    >
                                        <animate
                                            attributeName="r"
                                            from="3"
                                            to="28" // Slightly larger to encompass core ring's max
                                            dur="3s"
                                            begin={`${i * 1}s`}
                                            repeatCount="indefinite"
                                        />
                                        <animate
                                            attributeName="stroke-opacity"
                                            from="0.5" // Start fairly transparent for glow
                                            to="0"
                                            dur="3s"
                                            begin={`${i * 1}s`}
                                            repeatCount="indefinite"
                                        />
                                    </circle>
                                    {/* Inner "Core" Ring */}
                                    <circle
                                        cx="0"
                                        cy="0"
                                        r="3"
                                        stroke={getMagnitudeColor(magnitude)} // Same magnitude color
                                        strokeWidth="2.5" // Thicker than before, but less than glow
                                        fill="none"
                                        strokeOpacity="1" // Initial opacity for SVG element (fully opaque)
                                    >
                                        <animate
                                            attributeName="r"
                                            from="3"
                                            to="25" // Original expansion radius
                                            dur="3s"
                                            begin={`${i * 1}s`}
                                            repeatCount="indefinite"
                                        />
                                        <animate
                                            attributeName="stroke-opacity"
                                            from="1" // Start fully opaque
                                            to="0"
                                            dur="3s"
                                            begin={`${i * 1}s`}
                                            repeatCount="indefinite"
                                        />
                                    </circle>
                                </React.Fragment>
                            ))}
                            {/* Central Hypocenter Marker - ensure it's drawn last to be on top */}
                            <circle cx="0" cy="0" r="3.5" fill="#EF4444" stroke="#1F2937" strokeWidth="1" />
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
                data-testid="earthquake-depth-label" // Added data-testid
            >
                {depth?.toFixed(1)} km
            </div>
        )}

        {/* Real-World Depth Comparison Markers */}
        {DEPTH_COMPARISONS.map((comp) => {
          // For items marked as height, their 'depth' for calculation will be 0, placing them at the surface.
          // Otherwise, use the actual depth.
          const effectiveDepthForCalc = comp.isHeight ? 0 : comp.depth;

          const comparisonLineHeightPx = getComparisonDepthLineHeightPx(effectiveDepthForCalc);

          // Determine the top position for the line's visual start
          const lineVisualTopPx = surfaceBandHeightPx;

          // Determine the visual height of the line
          // If effective depth is 0 (either actual 0 depth or an item treated as height), line is 1px.
          const lineVisualHeightPx = (effectiveDepthForCalc === 0) ? 1 : comparisonLineHeightPx;

          // Determine the anchor point for the label vertically using the calculated line height
          const labelAnchorVerticalPx = surfaceBandHeightPx + comparisonLineHeightPx;

          let labelTopPositionPx;
          if (effectiveDepthForCalc === 0) { // Covers both actual 0-depth items and isHeight items
            labelTopPositionPx = surfaceBandHeightPx + 2; // Position label just below surface band text
          } else {
            labelTopPositionPx = labelAnchorVerticalPx - 7; // Try to center label (approx label height 14px / 2 = 7)
            // Clamp label position
            if (labelTopPositionPx < surfaceBandHeightPx + 2) {
                labelTopPositionPx = surfaceBandHeightPx + 2;
            }
            if (labelTopPositionPx > diagramTotalRenderHeightPx - 16) { // 16px approx height of label box
                labelTopPositionPx = diagramTotalRenderHeightPx - 16;
            }
          }

          return (
            <React.Fragment key={`comp-${comp.name}`}>
              {/* Comparison Line - render if it has some height or is a zero-depth/height marker */}
              {(lineVisualHeightPx > 0 || effectiveDepthForCalc === 0) && (
                <div
                  className="absolute right-1/4 w-0.5 bg-sky-500" // Blueish line
                  style={{
                    top: `${lineVisualTopPx}px`,
                    height: `${lineVisualHeightPx}px`,
                    zIndex: 18,
                  }}
                />
              )}
              {/* Comparison Label */}
              <div
                className="absolute text-xs text-sky-700 font-medium bg-white bg-opacity-80 px-1 py-0.5 rounded shadow-sm"
                style={{
                  top: `${labelTopPositionPx}px`,
                  left: `calc(75% + 8px)`,
                  zIndex: 19,
                }}
                title={`${comp.name}: ${comp.depth.toFixed(1)} km${comp.isHeight ? ' (Height)' : ''}`}
                data-testid={`comparison-visual-label-${comp.name.replace(/\s+/g, '-').toLowerCase()}`}
              >
                {comp.name.substring(0, 18)}{comp.name.length > 18 ? '...' : ''} ({comp.depth.toFixed(1)} km{comp.isHeight ? ' H' : ''})
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <p className="text-xs text-slate-500 mt-2 text-center">
        Note: Diagram is illustrative. Layer depths are approximate. Top 100km expanded for detail.
      </p>
    </div>
  );
}

// Helper function implementation (outside the component for clarity)
function getDynamicContextualComparisons(currentDepth, comparisonsList) {
  const messages = [];
  const depthComparisons = comparisonsList
    .filter(c => !c.isHeight)
    .sort((a, b) => a.depth - b.depth);

  if (depthComparisons.length === 0) {
    return []; // No depth benchmarks to compare against
  }

  // Check for "very close" comparisons
  for (const comp of depthComparisons) {
    const fivePercent = comp.depth * 0.05;
    if (Math.abs(currentDepth - comp.depth) <= fivePercent) {
      messages.push(`This depth of ${currentDepth.toFixed(1)} km is very similar to the ${comp.name} (${comp.depth.toFixed(1)} km).`);
      // If one very close match is found, we can return early or add more context.
      // For now, let's return just this one to keep it concise. If more needed, this logic can be expanded.
      return messages;
    }
  }

  // If not "very close", find closest shallower and deeper
  let closestShallower = null;
  let closestDeeper = null;

  for (const comp of depthComparisons) {
    if (comp.depth < currentDepth) {
      if (!closestShallower || comp.depth > closestShallower.depth) {
        closestShallower = comp;
      }
    } else if (comp.depth > currentDepth) {
      if (!closestDeeper || comp.depth < closestDeeper.depth) {
        closestDeeper = comp;
      }
    }
    // If comp.depth === currentDepth, it would have been caught by "very close" or could be handled here.
  }

  if (closestShallower) {
    messages.push(`At ${currentDepth.toFixed(1)} km, this event is deeper than the ${closestShallower.name} (${closestShallower.depth.toFixed(1)} km).`);
  } else {
    // Current depth is shallower than all benchmarks
    messages.push(`This depth of ${currentDepth.toFixed(1)} km is shallower than all listed depth benchmarks, starting with the ${depthComparisons[0].name} (${depthComparisons[0].depth.toFixed(1)} km).`);
    return messages; // Return only this message
  }

  if (closestDeeper) {
    messages.push(`It is shallower than the ${closestDeeper.name} (${closestDeeper.depth.toFixed(1)} km).`);
  } else if (closestShallower) { // Only add this if there was a shallower one, but no deeper ones
    // Current depth is deeper than all benchmarks
    messages.push(`This depth of ${currentDepth.toFixed(1)} km is deeper than all listed depth benchmarks, including the ${closestShallower.name} (${closestShallower.depth.toFixed(1)} km).`);
     // If we are deeper than all, the first message about being deeper than closestShallower is good,
     // and this specific one might be redundant or could replace it.
     // Let's refine: if deeper than all, the first message already states it's "deeper than X (deepest one)".
     // So, if closestDeeper is null AND closestShallower is the last item in depthComparisons.
     if (closestShallower === depthComparisons[depthComparisons.length -1]) {
        messages.pop(); // Remove the "deeper than X"
        messages.push(`This depth of ${currentDepth.toFixed(1)} km is beyond our deepest benchmark, the ${closestShallower.name} (${closestShallower.depth.toFixed(1)} km).`);
     }
  }

  // Ensure we return max 2 messages as per initial thought, though current logic might give more if not careful
  // The logic above already tries to be concise. If "very close" is found, it returns 1.
  // Otherwise, it aims for 1 or 2 (e.g. shallower than all, or between two points).
  // If it's shallower than all, it returns 1 message.
  // If it's deeper than all, it returns 1 refined message.
  // If it's between two, it can return 2 messages. Let's cap at 2.
  return messages.slice(0, 2);
}

export default SimplifiedDepthProfile;
