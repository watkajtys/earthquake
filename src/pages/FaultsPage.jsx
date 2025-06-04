import React, { useState, useCallback } from 'react';
import SeoMetadata from '../components/SeoMetadata';
import InteractiveGlobeView from '../components/InteractiveGlobeView';
import FaultAnimationNormal from '../components/fault_animations/FaultAnimationNormal';
import FaultAnimationReverse from '../components/fault_animations/FaultAnimationReverse';
import FaultAnimationStrikeSlip from '../components/fault_animations/FaultAnimationStrikeSlip';

import tectonicPlatesData from '../assets/TectonicPlateBoundaries.json';
import coastlineData from '../assets/ne_110m_coastline.json';

const FaultsPage = () => {
  const [selectedFault, setSelectedFault] = useState(null);
  const [animationType, setAnimationType] = useState(null); // 'normal', 'reverse', 'strikeSlip', or 'unknown'

  // Callback for when a path (plate boundary) is clicked on the globe
  const handleFaultClick = useCallback((pathProperties) => {
    if (pathProperties && pathProperties.properties) {
        const faultData = pathProperties.properties;
        setSelectedFault(faultData);

        switch (faultData.Boundary_Type) {
          case 'Convergent':
            setAnimationType('reverse');
            break;
          case 'Divergent':
            setAnimationType('normal');
            break;
          case 'Transform':
            setAnimationType('strikeSlip');
            break;
          default:
            // Handle unknown or other boundary types
            setAnimationType('unknown');
            console.warn("Unknown or unhandled boundary type:", faultData.Boundary_Type);
            break;
        }
    } else {
        // Reset if click doesn't yield valid properties
        setSelectedFault(null);
        setAnimationType(null);
        console.warn("Clicked path has no properties or is undefined:", pathProperties);
    }
  }, []);

  // Explanations for different fault types
  const faultTypeExplanations = {
    normal: "In normal faulting, the block above the fault (hanging wall) moves down relative to the block below the fault (footwall). This is common at divergent boundaries where the Earth's crust is being stretched or extended.",
    reverse: "In reverse (or thrust) faulting, the block above the fault (hanging wall) moves up relative to the block below the fault (footwall). This is common at convergent boundaries where tectonic plates collide.",
    strikeSlip: "In strike-slip faulting, blocks slide past each other horizontally along the fault plane. This is common at transform boundaries where plates grind past each other.",
  };

  // Configuration for the globe view
  const defaultGlobeConfig = {
    defaultFocusLat: 20, // Centered more for better initial view
    defaultFocusLng: 0,
    defaultFocusAltitude: 1.8, // Slightly more zoomed out
    allowUserDragRotation: true,
    enableAutoRotation: true,
    globeAutoRotateSpeed: 0.15, // Slightly slower auto-rotation
    cameraFov: 45, // Adjust FOV for a less distorted view
    cameraMoveDuration: 1000,
    pathColor: (path) => {
        switch (path.properties.Boundary_Type) {
            case 'Convergent': return 'rgba(220, 20, 60, 0.85)'; // Crimson red, slightly more opaque
            case 'Divergent': return 'rgba(60, 179, 113, 0.85)'; // Medium sea green
            case 'Transform': return 'rgba(70, 130, 180, 0.85)'; // Steel blue
            default: return 'rgba(150, 150, 150, 0.7)'; // Darker grey for unknown
        }
    },
    pathStroke: 0.35, // Slightly thicker stroke
    pathDashLength: 0.9,
    pathDashGap: 0.1,
    pathDashAnimateTime: 25000, // Slightly faster animation
  };

  // Determine content for the animation and info sections based on state
  let animationContent;
  let infoContent;

  if (selectedFault) {
    // Animate based on type
    if (animationType === 'normal') {
      animationContent = <FaultAnimationNormal isPlaying={true} />;
    } else if (animationType === 'reverse') {
      animationContent = <FaultAnimationReverse isPlaying={true} />;
    } else if (animationType === 'strikeSlip') {
      animationContent = <FaultAnimationStrikeSlip isPlaying={true} />;
    } else if (animationType === 'unknown') {
      animationContent = (
        <p className="text-gray-600 text-center p-4">
          Movement information for this boundary type ({selectedFault.Boundary_Type || 'N/A'}) is not available.
        </p>
      );
    } else {
         animationContent = ( // Fallback if animationType is somehow null with a selected fault
            <p className="text-gray-500 text-center p-4">
              Select a plate boundary on the globe to see its typical fault movement.
            </p>
          );
    }

    // Display information for the selected fault
    infoContent = (
      <>
        <p className="text-md text-gray-700 mb-2">
          <span className="font-semibold text-gray-800">Boundary Type:</span> {selectedFault.Boundary_Type || 'N/A'}
        </p>
        <p className="text-md text-gray-700 mb-2">
          <span className="font-semibold text-gray-800">Interacting Plates:</span> {selectedFault.Plate_A || 'N/A'} & {selectedFault.Plate_B || 'N/A'}
        </p>
        {selectedFault.Source && ( // Display source if available
            <p className="text-sm text-gray-500 mb-3">
                <span className="font-semibold">Data Source:</span> {selectedFault.Source}
            </p>
        )}
        {animationType && animationType !== 'unknown' && faultTypeExplanations[animationType] && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-sm text-gray-600 bg-indigo-50 p-3 rounded-md shadow-sm">
              {faultTypeExplanations[animationType]}
            </p>
          </div>
        )}
         {animationType === 'unknown' && (
            <p className="mt-3 text-sm text-yellow-700 bg-yellow-50 p-3 rounded-md">
                No specific fault movement animation is available for the '{selectedFault.Boundary_Type}' boundary type.
            </p>
        )}
      </>
    );
  } else {
    // Default state when no fault is selected
    animationContent = (
      <div className="text-center p-4">
        <svg className="mx-auto h-12 w-12 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2zM12 5v7m0 4h.01" />
        </svg>
        <h3 className="mt-2 text-lg font-medium text-gray-700">Explore Plate Boundaries</h3>
        <p className="mt-1 text-sm text-gray-500">
          Click on any boundary line on the interactive globe to learn about its typical fault mechanics and see an animation.
        </p>
      </div>
    );
    infoContent = (
      <p className="text-md text-gray-500 italic">
        Details about the selected plate boundary will appear here.
      </p>
    );
  }

  return (
    <>
      <SeoMetadata
        title="Fault Mechanics Visualizer"
        description="Interactive visualizations of geological fault mechanics and plate tectonics. Explore fault types by clicking on tectonic plate boundaries on the globe."
        keywords="faults, plate tectonics, normal fault, reverse fault, strike-slip fault, earthquake, geology, interactive globe, convergent, divergent, transform"
      />
      <div className="container mx-auto p-3 md:p-6 min-h-screen flex flex-col bg-gray-50">
        {/* Header Section */}
        <header className="text-center py-6 md:py-8 border-b border-gray-200">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-indigo-700">Fault Mechanics & Plate Tectonics</h1>
          <p className="mt-3 md:mt-4 text-base sm:text-lg text-gray-600 max-w-3xl mx-auto">
            Discover the dynamic forces shaping our planet. Click on a tectonic plate boundary on the globe to visualize typical fault movements and learn about their geological significance.
          </p>
        </header>

        {/* Main Content Area: Globe and Info Panel */}
        <div className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-6 my-6 md:my-8">
          {/* Interactive Globe View Section */}
          <div className="lg:col-span-2 h-[55vh] md:h-[65vh] lg:h-auto bg-gray-800 rounded-xl shadow-2xl overflow-hidden border-4 border-gray-700">
            <h2 className="sr-only">Interactive Globe: Plate Boundaries</h2> {/* Screen-reader only title for globe section */}
            <InteractiveGlobeView
              coastlineGeoJson={coastlineData}
              tectonicPlatesGeoJson={tectonicPlatesData}
              onPathClick={handleFaultClick}
              pathsData={tectonicPlatesData.features}
              pathLabel={path => `${path.properties.Plate_A} – ${path.properties.Plate_B} (${path.properties.Boundary_Type})`}
              defaultFocusLat={defaultGlobeConfig.defaultFocusLat}
              defaultFocusLng={defaultGlobeConfig.defaultFocusLng}
              defaultFocusAltitude={defaultGlobeConfig.defaultFocusAltitude}
              allowUserDragRotation={defaultGlobeConfig.allowUserDragRotation}
              enableAutoRotation={defaultGlobeConfig.enableAutoRotation}
              globeAutoRotateSpeed={defaultGlobeConfig.globeAutoRotateSpeed}
              cameraFov={defaultGlobeConfig.cameraFov}
              pathColor={defaultGlobeConfig.pathColor}
              pathStroke={defaultGlobeConfig.pathStroke}
              pathDashLength={defaultGlobeConfig.pathDashLength}
              pathDashGap={defaultGlobeConfig.pathDashGap}
              pathDashAnimateTime={defaultGlobeConfig.pathDashAnimateTime}
            />
          </div>

          {/* Fault Animation and Information Panel Section */}
          <div className="lg:col-span-1 bg-white p-4 md:p-6 rounded-xl shadow-xl flex flex-col space-y-5 border border-gray-200">
            {/* Animation Area */}
            <div className="border border-gray-300 rounded-lg shadow-inner bg-gray-100">
              <h3 className="text-lg font-semibold text-indigo-600 mb-2 px-3 pt-3">Fault Movement Animation</h3>
              <div className="flex-shrink-0 h-52 md:h-60 rounded-b-lg bg-gray-200 flex items-center justify-center overflow-hidden">
                {animationContent}
              </div>
            </div>

            {/* Information Area */}
            <div className="flex-grow p-4 md:p-5 bg-gray-50 rounded-lg border border-gray-200 shadow-inner">
              <h3 className="text-lg font-semibold text-indigo-600 mb-3">Selected Boundary Details</h3>
              {infoContent}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default FaultsPage;
