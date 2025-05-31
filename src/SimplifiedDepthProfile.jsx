// src/SimplifiedDepthProfile.jsx
import React from 'react';

/**
 * SimplifiedDepthProfile component
 * This component displays a simple diagram illustrating the
 * earthquake's hypocenter depth with approximate Earth layers.
 */
function SimplifiedDepthProfile({ earthquakeDepth, magnitude }) {

  if (earthquakeDepth === null || earthquakeDepth === undefined || isNaN(parseFloat(earthquakeDepth))) {
    return (
      <div className="p-3 rounded-md text-center text-sm text-slate-500">
        Depth information not available or invalid for this earthquake.
      </div>
    );
  }

  const depth = parseFloat(earthquakeDepth);

  // Define approximate layer boundaries (in km)
  const layers = [
    { name: "Surface", startDepth: 0, endDepth: 0, color: "bg-green-400", textColor: "text-green-900", zIndex: 5 },
    { name: "Sedimentary/Upper Crust", startDepth: 0, endDepth: 10, color: "bg-yellow-300", textColor: "text-yellow-800", zIndex: 4 },
    { name: "Continental Crust", startDepth: 10, endDepth: 35, color: "bg-orange-300", textColor: "text-orange-800", zIndex: 3 },
    { name: "Lithospheric Mantle", startDepth: 35, endDepth: 100, color: "bg-red-300", textColor: "text-red-800", zIndex: 2 },
    { name: "Asthenosphere (Upper Mantle)", startDepth: 100, endDepth: 700, color: "bg-purple-300", textColor: "text-purple-800", zIndex: 1 },
  ];

  const diagramHeightKm = 700; // Visual representation goes down to 700km

  // Calculate percentage height for each layer segment to display
  // And determine hypocenter's relative position
  // let hypocenterTopPercent = 0; // No longer directly used for line height in pixels
  let hypocenterLayerName = "Unknown";

  const getLayerDisplayHeightPercent = (layerStart, layerEnd) => {
    return ((Math.min(layerEnd, diagramHeightKm) - Math.min(layerStart, diagramHeightKm)) / diagramHeightKm) * 100;
  };

  if (depth >= 0) {
      // hypocenterTopPercent = (Math.min(depth, diagramHeightKm) / diagramHeightKm) * 100; // Keep for potential future use or remove if truly unused
      const containingLayer = layers.find(l => depth >= l.startDepth && depth <= l.endDepth && l.name !== "Surface");
      if (containingLayer) {
          hypocenterLayerName = containingLayer.name;
      } else if (depth > diagramHeightKm) {
          hypocenterLayerName = "Below 700km (Deep Mantle)";
      }
  }

  const diagramParentHeightPx = 320; // h-80
  const surfaceLayerHeightPx = 24; // h-6
  const remainingDiagramHeightPx = diagramParentHeightPx - surfaceLayerHeightPx;
  const lineHeightPx = depth >= 0 ? (Math.min(depth, diagramHeightKm) / diagramHeightKm) * remainingDiagramHeightPx : 0;

  return (
    <div className="p-3 rounded-md">
      <h3 className="text-md font-semibold text-gray-700 mb-1">Simplified Depth Profile</h3>
      <p className="text-xs text-slate-600 mb-3">
        Illustrative depth of M<strong>{magnitude?.toFixed(1)}</strong> event at <strong>{depth?.toFixed(1)} km</strong> (within {hypocenterLayerName}).
      </p>

      <div className="relative w-full h-80 bg-gray-100 rounded border border-gray-300 overflow-hidden flex flex-col">
        {/* Render Layers */}
        {layers.map((layer) => {
          if (layer.name === "Surface") {
            return (
              <div key={layer.name} className={`flex-shrink-0 h-6 ${layer.color} flex items-center justify-center relative`} style={{zIndex: layer.zIndex}}>
                <span className={`text-xs font-medium ${layer.textColor}`}>{layer.name} (0 km)</span>
              </div>
            );
          }
          const displayHeightPercent = getLayerDisplayHeightPercent(layer.startDepth, layer.endDepth);
          if (displayHeightPercent <= 0) return null;

          return (
            <div
              key={layer.name}
              className={`flex-shrink-0 ${layer.color} flex items-center justify-center relative border-t border-black border-opacity-10`}
              style={{ height: `${displayHeightPercent}%`, zIndex: layer.zIndex }}
            >
              <span className={`text-xs font-medium ${layer.textColor} p-1 rounded bg-white bg-opacity-30 overflow-hidden whitespace-nowrap text-ellipsis`}>
                {layer.name} ({layer.startDepth === 0 ? '' : `${layer.startDepth}-`}{layer.endDepth}km)
              </span>
            </div>
          );
        })}

        {/* Hypocenter Marker & Line - Positioned absolutely within the stack of layers */}
        {depth >= 0 && (
            <div
                className="absolute left-1/4 w-0.5 bg-red-600"
                style={{
                    top: `${surfaceLayerHeightPx}px`, // Start below new surface height
                    height: `${lineHeightPx}px`, // Calculated pixel height
                    zIndex: 10
                }}
            >
                {/* Hypocenter Marker (Star or Circle) */}
                <div
                    className="absolute left-1/2 w-4 h-4 transform -translate-x-1/2 -translate-y-1/2"
                    style={{
                        bottom: '0px', // Sits at the end of the line
                    }}
                    title={`Hypocenter at ${depth?.toFixed(1)} km`}
                >
                    {/* Star SVG */}
                    <svg viewBox="0 0 24 24" fill="gold" stroke="black" strokeWidth="0.5">
                        <path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z"/>
                    </svg>
                </div>
            </div>
        )}
         {/* Depth Label for Hypocenter */}
        {depth >= 0 && (
            <div
                className="absolute text-xs text-red-700 font-bold bg-white bg-opacity-80 px-1.5 py-0.5 rounded shadow-md"
                style={{
                    top: depth < 15 ? `calc(${surfaceLayerHeightPx}px + 5px)` : `calc(${surfaceLayerHeightPx}px + ${lineHeightPx}px - 8px)`, // If shallow, fix near top; else near star
                    left: depth < 15 ? 'calc(25% + 25px)' : 'calc(25% + 10px)', // More offset if shallow
                    zIndex: 11,
                    display: depth < 1 && depth > 0 ? 'none' : 'block' // Hide if depth is like 0.1km, too small to show meaningfully apart from star
                }}
            >
                {depth?.toFixed(1)} km
            </div>
        )}
      </div>
      <p className="text-xs text-slate-500 mt-2 text-center">
        Note: Diagram is illustrative. Layer depths are approximate averages and vary geographically.
      </p>
    </div>
  );
}

export default SimplifiedDepthProfile;
