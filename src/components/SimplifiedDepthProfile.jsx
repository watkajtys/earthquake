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
  { name: "Shallow Focus Earthquakes (Upper Limit)", depth: 70 },
  { name: "Intermediate Focus Earthquakes (Upper Limit)", depth: 300 },
  { name: "Deep Focus Earthquakes (Upper Limit)", depth: 700 },
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

  const layers = [ // Define layers before it's used by getDynamicContextualComparisons
    // Surface is handled separately in terms of drawing height calculation
    { name: "Surface", startDepth: 0, endDepth: 0, color: "bg-lime-200", textColor: "text-lime-800", zIndex: 10 },
    { name: "Sedimentary/Upper Crust", startDepth: 0, endDepth: 10, color: "bg-stone-300", textColor: "text-stone-800", zIndex: 4 },
    { name: "Continental Crust", startDepth: 10, endDepth: 35, color: "bg-neutral-400", textColor: "text-neutral-800", zIndex: 3 },
    { name: "Lithospheric Mantle", startDepth: 35, endDepth: 100, color: "bg-slate-500", textColor: "text-slate-100", zIndex: 2 },
    { name: "Asthenosphere (Upper Mantle)", startDepth: 100, endDepth: 700, color: "bg-indigo-800", textColor: "text-indigo-100", zIndex: 1 },
  ];
  // Helper function for dynamic contextual comparisons
  // Pass layers to the helper function
  const contextualMessages = getDynamicContextualComparisons(depth, DEPTH_COMPARISONS, layers);

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

  // getComparisonDepthLineHeightPx is no longer needed as comparison markers are removed.

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

      {/* Static list of comparisons and its container have been removed. */}

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

        {/* Real-World Depth Comparison Markers have been removed. */}
      </div>
      <p className="text-xs text-slate-500 mt-2 text-center">
        Note: Diagram is illustrative. Layer depths are approximate. Top 100km expanded for detail.
      </p>
    </div>
  );
}

  // Helper function for dynamic contextual comparisons
  // Pass layers to the helper function
  // const contextualMessages = getDynamicContextualComparisons(depth, DEPTH_COMPARISONS, layers);
  // This call is already moved up before 'layers' was used by it, so this comment is slightly misplaced in search.
  // The actual call to getDynamicContextualComparisons is correctly placed higher now.


// Helper function implementation (outside the component for clarity)
function getDynamicContextualComparisons(currentDepth, comparisonsList) {
  // EarthLayers parameter removed as per new requirements

  const RELATABLE_OBJECTS = [
    { name: "Eiffel Towers", height: 0.3, singular: "Eiffel Tower" },
    // Burj Khalifa is in comparisonsList, so we can use its data directly.
    // Mount Everest is in comparisonsList (isHeight: true), use its data.
  ];

  const depth = parseFloat(currentDepth);
  if (isNaN(depth)) { // Should have been caught before, but good to be safe.
    return ["Depth information is currently unavailable."];
  }

  const userFriendlyBenchmarks = comparisonsList
    .filter(c => !c.isHeight && !c.name.includes("Focus Earthquakes"))
    .sort((a, b) => a.depth - b.depth);

  // 1. Check for "very close" match to any user-friendly benchmark
  for (const benchmark of userFriendlyBenchmarks) {
    const difference = Math.abs(depth - benchmark.depth);
    let isClose = false;
    if (benchmark.depth > 1) { // Use percentage for larger benchmarks
      isClose = difference <= benchmark.depth * 0.10; // 10% threshold for "nearly as deep"
    } else { // Use absolute for smaller benchmarks (e.g. canals, Burj)
      isClose = difference <= 0.1; // 100m absolute difference
    }

    if (isClose) {
      return [`${depth.toFixed(1)} km is nearly as deep as the ${benchmark.name} (${benchmark.depth.toFixed(1)} km)!`];
    }
  }

  // 2. Check if "even further down than" a significant, well-known benchmark
  // Prioritize deeper, more impressive benchmarks for this message.
  // Select a few well-known items that are good for this "further down than" comparison.
  const significantBenchmarks = userFriendlyBenchmarks.filter(b =>
    b.name === "Kola Superdeep Borehole (deepest artificial point)" ||
    b.name === "Challenger Deep (ocean deepest)" ||
    b.name === "Average Continental Crust" || // Good mid-range geological feature
    b.name === "Deepest Gold Mine (Mponeng, South Africa)"
  ).sort((a, b) => b.depth - a.depth); // Sort deepest first

  for (const benchmark of significantBenchmarks) {
    if (depth > benchmark.depth && depth < benchmark.depth * 3) { // If deeper, but not astronomically deeper
      return [`That's incredibly deep! It's even further down than the ${benchmark.name} (${benchmark.depth.toFixed(1)} km)!`];
    }
  }

  // 3. Use a relatable analogy for very significant depths
  let analogyMessage = "";

  const mountEverest = comparisonsList.find(c => c.name === "Height of Mount Everest"); // isHeight = true
  const burjKhalifa = comparisonsList.find(c => c.name === "Burj Khalifa");

  if (depth > 5 && mountEverest) { // Use Mount Everest for reasonably large depths
      const numObjects = Math.round(depth / mountEverest.depth);
      if (numObjects > 1) {
        analogyMessage = `Wow, ${depth.toFixed(1)} km is a long way down – that's like stacking about ${numObjects} Mount Everests on top of each other!`;
      } else if (numObjects === 1) {
        analogyMessage = `Wow, ${depth.toFixed(1)} km is a long way down – that's about as deep as Mount Everest is tall!`;
      }
  } else if (depth > 1 && burjKhalifa) { // Use Burj Khalifa for moderate depths
      const numObjects = Math.round(depth / burjKhalifa.depth);
       if (numObjects > 1) {
        analogyMessage = `That's quite deep! ${depth.toFixed(1)} km is like stacking about ${numObjects} Burj Khalifas!`;
      } else if (numObjects === 1 && depth > burjKhalifa.depth * 1.1) { // Only if significantly more than 1
         analogyMessage = `That's quite deep! ${depth.toFixed(1)} km is like stacking about ${numObjects} Burj Khalifas!`;
      } else if (numObjects === 1 ) { // if depth is between 0.828 and ~0.9km, it's roughly 1 Burj Khalifa
         analogyMessage = `That's quite deep! ${depth.toFixed(1)} km is about the height of the Burj Khalifa!`;
      }
  } else if (depth > 0.5) { // Use Eiffel Tower for smaller depths
      const eiffelTower = RELATABLE_OBJECTS.find(r => r.name === "Eiffel Towers");
      const numObjects = Math.round(depth / eiffelTower.height);
      if (numObjects >=1) {
          analogyMessage = `That's pretty deep! ${depth.toFixed(1)} km is like stacking ${numObjects} ${numObjects === 1 ? eiffelTower.singular : eiffelTower.name}!`;
      }
  }

  if (analogyMessage) {
    return [analogyMessage];
  }

  // 4. Fallback messages
  if (depth === 0) {
    return ["This earthquake was right at the surface!"];
  }
  if (depth < 0.1 && depth > 0) {
    return [`${depth.toFixed(2)} km is very close to the surface!`];
  }
  if (depth > 700) { // Still acknowledge exceptionally deep ones simply
      return [`Whoa, ${depth.toFixed(0)} km is incredibly deep, way down into the Earth's mantle!`];
  }
  if (depth > 300) {
      return [`That's a very deep earthquake, ${depth.toFixed(0)} km down!`];
  }
   if (depth > 70) {
      return [`That's a deep earthquake, ${depth.toFixed(0)} km down!`];
  }

  // Generic fallback if no other condition met (e.g., shallow but not super shallow, no close comparisons)
  return [`That's an earthquake at ${depth.toFixed(1)} km deep.`];
}

export default SimplifiedDepthProfile;
