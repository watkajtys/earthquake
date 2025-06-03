import React from 'react';
import PropTypes from 'prop-types';
import { getBeachballPathsAndType } from '../../utils/detailViewUtils';
import { isValidNumber } from '../../utils/utils.js';
import tectonicBoundariesData from '../../assets/TectonicPlateBoundaries.json'; // Load the boundary data
import { findClosestTectonicBoundary } from '../../utils/geometryUtils'; // Import the new utility

// Import Fault Icons
import NormalFaultIcon from '../icons/faults/NormalFaultIcon';
import ReverseFaultIcon from '../icons/faults/ReverseFaultIcon';
import StrikeSlipFaultIcon from '../icons/faults/StrikeSlipFaultIcon'; // Ensure this is here for fault types
import ConvergentBoundaryIcon from '../icons/boundaries/ConvergentBoundaryIcon';
import DivergentBoundaryIcon from '../icons/boundaries/DivergentBoundaryIcon';
// Re-using StrikeSlipFaultIcon for Transform boundaries, so no separate import needed if already there for faults.

// Helper function to calculate distance - placeholder for now
// const calculateDistanceToBoundary = (epicenter, boundary) => {
//   // Placeholder logic
//   return Infinity;
// };

/**
 * Displays regional fault and tectonic information related to an earthquake.
 */
const EarthquakeRegionalFaultsPanel = ({
  momentTensorProductProps,
  geometry,
  properties,
  exhibitPanelClass, // Prop for consistent styling
  exhibitTitleClass  // Prop for consistent styling
}) => {
  if (!geometry || !properties) {
    return null;
  }

  let faultTypeInfo = null;
  let rakeValue = NaN;
  let preferredNodalPlane = null;

  if (momentTensorProductProps) {
    const np1Rake = parseFloat(momentTensorProductProps['nodal-plane-1-rake']);
    const np2Rake = parseFloat(momentTensorProductProps['nodal-plane-2-rake']);

    if (isValidNumber(np1Rake)) {
      rakeValue = np1Rake;
      preferredNodalPlane = 'NP1';
      faultTypeInfo = getBeachballPathsAndType(rakeValue);
    } else if (isValidNumber(np2Rake)) {
      rakeValue = np2Rake;
      preferredNodalPlane = 'NP2';
      faultTypeInfo = getBeachballPathsAndType(rakeValue);
    }
  }

  const epicenter = geometry?.coordinates ? {
    lat: geometry.coordinates[1],
    lon: geometry.coordinates[0],
  } : null;

  let closestBoundaryDisplayInfo = null;
  const MAX_DISTANCE_KM_FOR_BOUNDARY = 1000; // Define threshold for reporting

  if (epicenter && tectonicBoundariesData && tectonicBoundariesData.features) {
    const closestBoundary = findClosestTectonicBoundary(epicenter, tectonicBoundariesData.features);
    if (closestBoundary && closestBoundary.distance < MAX_DISTANCE_KM_FOR_BOUNDARY) {
      closestBoundaryDisplayInfo = {
        distance: Math.round(closestBoundary.distance),
        type: closestBoundary.type,
        // Use a more generic name if specific 'name' prop isn't in TectonicPlateBoundaries.json
        name: closestBoundary.name || closestBoundary.featureProperties?.Boundary_Type || `ID ${closestBoundary.featureProperties?.OBJECTID}`
      };
    }
  }

  const formatBoundaryType = (type) => {
    if (!type) return 'Unknown';
    return type.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  };

  const getBoundaryIcon = (type) => {
    if (!type) return null;
    switch (type.toUpperCase()) {
      case 'CONVERGENT':
        return <ConvergentBoundaryIcon className="w-12 h-8 mr-2 text-slate-700" />;
      case 'DIVERGENT':
        return <DivergentBoundaryIcon className="w-12 h-8 mr-2 text-slate-700" />;
      case 'TRANSFORM':
        // Reusing StrikeSlipFaultIcon for Transform boundaries
        return <StrikeSlipFaultIcon className="w-12 h-8 mr-2 text-slate-700" />;
      // case 'UNKNOWN': // Example if we add an unknown icon
      //   return <UnknownBoundaryIcon className="w-12 h-8 mr-2 text-slate-700" />;
      default:
        // For types like "Unknown" or any other not explicitly handled,
        // we can return null or a generic placeholder icon.
        // For now, returning null if no specific icon matches.
        return null;
    }
  };

  const getFaultIcon = (type) => {
    if (!type) return null;
    switch (type.toUpperCase()) {
      case 'NORMAL':
      case 'OBLIQUE_NORMAL': // Using NormalFaultIcon as base for Oblique-Normal
        return <NormalFaultIcon className="w-12 h-8 mr-2 text-slate-700" />;
      case 'REVERSE':
      case 'OBLIQUE_REVERSE': // Using ReverseFaultIcon as base for Oblique-Reverse
        return <ReverseFaultIcon className="w-12 h-8 mr-2 text-slate-700" />;
      case 'STRIKE_SLIP':
      case 'STRIKE_SLIP_LIKE': // Handling STRIKE_SLIP_LIKE as well
        return <StrikeSlipFaultIcon className="w-12 h-8 mr-2 text-slate-700" />;
      default:
        return null;
    }
  };

  const getFaultTypeExplanation = (type) => {
    switch (type) {
      case 'NORMAL':
        return 'Normal faulting occurs in response to extension, where the crust is stretched. The hanging wall block moves down relative to the footwall block.';
      case 'REVERSE':
        return 'Reverse (or thrust) faulting occurs in response to compression, where the crust is shortened. The hanging wall block moves up relative to the footwall block.';
      case 'STRIKE_SLIP':
      case 'STRIKE_SLIP_LIKE': // Combined for simplicity in display
        return 'Strike-slip faulting occurs when blocks of crust slide past each other horizontally. Movement is primarily lateral, with little to no vertical displacement.';
      case 'OBLIQUE_NORMAL':
        return 'Oblique-normal faulting combines normal (extensional) and strike-slip (horizontal) motion.';
      case 'OBLIQUE_REVERSE':
        return 'Oblique-reverse faulting combines reverse (compressional) and strike-slip (horizontal) motion.';
      default:
        return 'The fault type is determined from the orientation and direction of slip on the fault plane, derived from seismic wave analysis (moment tensor solution).';
    }
  };

  const formatFaultType = (type) => {
    if (!type) return 'Data not available';
    // Replace underscores with spaces and capitalize words for better readability
    return type.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  };

  return (
    <div className={exhibitPanelClass}>
      <h3 className={exhibitTitleClass}>Regional Tectonic Setting</h3>
      <div className="space-y-3 text-sm"> {/* Note: "Increased space-y-3 for better separation" comment is preserved if it was on this line, or removed if it was on the line below that gets modified. Adjusted to keep it simple. */}
        <div>
          <div className="flex items-center mb-1"> {/* Flex container for icon and title */}
            {faultTypeInfo && faultTypeInfo.faultType && getFaultIcon(faultTypeInfo.faultType)}
            <p className="font-semibold"> {/* Made "Likely Fault Type" part of the same paragraph for better alignment with icon */}
              Likely Fault Type:{' '}
              <span className="font-normal"> {/* Display type with normal weight */}
                {faultTypeInfo && faultTypeInfo.faultType
                  ? formatFaultType(faultTypeInfo.faultType)
                  : 'Moment Tensor data not available'}
              </span>
              {isValidNumber(rakeValue) && preferredNodalPlane && (
                <span className="text-xs text-slate-500 ml-1"> (Rake: {rakeValue.toFixed(1)}° on {preferredNodalPlane})</span>
              )}
            </p>
          </div>
          {faultTypeInfo && faultTypeInfo.faultType && (
            <p className="text-xs text-slate-600 mt-1">
              {getFaultTypeExplanation(faultTypeInfo.faultType)}
            </p>
          )}
          {!faultTypeInfo && momentTensorProductProps && (
             <p className="text-xs text-slate-600 mt-1">
              Could not determine specific fault type from available moment tensor data.
            </p>
          )}
           {!momentTensorProductProps && (
             <p className="text-xs text-slate-600 mt-1">
              Moment tensor data, which helps determine fault type, is not available for this event. This is common for smaller earthquakes.
            </p>
           )}
        </div>

        {/* Nearby Tectonic Boundary Section */}
        <div>
          <div className="flex items-center mb-1"> {/* Flex container for icon and title */}
            {closestBoundaryDisplayInfo && closestBoundaryDisplayInfo.type && getBoundaryIcon(closestBoundaryDisplayInfo.type)}
            <p className="font-semibold"> {/* Made label part of the same paragraph for better alignment */}
              Nearest Major Tectonic Feature:{' '}
              <span className="font-normal">
                {closestBoundaryDisplayInfo
                  ? `~${closestBoundaryDisplayInfo.distance} km to a ${formatBoundaryType(closestBoundaryDisplayInfo.type)} boundary.`
                  : `No major plate boundary identified within ${MAX_DISTANCE_KM_FOR_BOUNDARY} km.`}
              </span>
            </p>
          </div>
          {closestBoundaryDisplayInfo && (
            <p className="text-xs text-slate-600 mt-1">
              This earthquake occurred in the vicinity of the boundary between tectonic plates. The interaction at these boundaries is a primary cause of seismic activity. The type of boundary ({formatBoundaryType(closestBoundaryDisplayInfo.type)}) influences the kinds of earthquakes experienced.
            </p>
          )}
           {!closestBoundaryDisplayInfo && epicenter && (
            <p className="text-xs text-slate-600 mt-1">
              While not immediately adjacent to a major plate boundary from our dataset, this event could be related to intraplate stresses or smaller, unmapped fault systems.
            </p>
          )}
          {!epicenter && (
            <p className="text-xs text-slate-600 mt-1">
              Location data not available to determine proximity to tectonic boundaries.
            </p>
          )}
          <p className="text-xs text-slate-600 mt-1">
            Information based on a global dataset of tectonic plate boundaries.
          </p>
        </div>

        {properties.sources && (
          <p className="text-xs text-slate-500 mt-4">
            Source of tectonic interpretations: USGS Moment Tensor solutions, Global Tectonic Plate Boundaries.
          </p>
        )}
      </div>
    </div>
  );
};

EarthquakeRegionalFaultsPanel.propTypes = {
  momentTensorProductProps: PropTypes.object,
  geometry: PropTypes.shape({
    coordinates: PropTypes.array.isRequired,
  }),
  properties: PropTypes.object,
  exhibitPanelClass: PropTypes.string,
  exhibitTitleClass: PropTypes.string,
};

export default EarthquakeRegionalFaultsPanel;
