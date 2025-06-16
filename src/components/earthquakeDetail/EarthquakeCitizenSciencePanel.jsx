import React from 'react';
import { isValuePresent, isValidNumber, isValidString, getMagnitudeColorStyle } from '../../utils/utils.js'; // Added getMagnitudeColorStyle

function EarthquakeCitizenSciencePanel({
    properties,
    losspagerProductProps,
    pagerAlertValue, // Derived in parent
    // isValuePresent, // Now imported
    // isValidNumber, // Now imported
    // isValidString, // Now imported
    exhibitPanelClass,
    exhibitTitleClass,
    highlightClass
}) {
    // Conditional rendering based on the original logic
    if (!(isValuePresent(properties?.felt) || isValidString(properties?.alert) || losspagerProductProps)) {
        return null;
    }

    const getPagerMagnitudeForStyling = (alertLevelText) => {
      switch (alertLevelText?.toLowerCase()) { // Use toLowerCase to match observed pagerAlertValue
        case 'green':
          return 3.0; // For bg-emerald-400
        case 'yellow':
          return 4.5; // For bg-yellow-400
        case 'orange':
          return 6.5; // For bg-orange-500
        case 'red':
          return 7.5; // For bg-red-500
        default:
          // Fallback style if needed, or rely on getMagnitudeColorStyle's own fallback
          return null;
      }
    };

    const pagerStyleClasses = pagerAlertValue ? getMagnitudeColorStyle(getPagerMagnitudeForStyling(pagerAlertValue)) : 'bg-gray-100 text-slate-700'; // Fallback for safety

    return (
        <div className={`${exhibitPanelClass} border-sky-500`}>
            <h2 className={`${exhibitTitleClass} text-sky-800 border-sky-300`}>Real-World Impact & Citizen Science</h2>
            <div className="space-y-2 mt-2">
                {isValuePresent(properties?.felt) && isValidNumber(properties.felt) && (
                    <div className="flex items-start p-2 bg-sky-50 rounded-md">
                        <svg width="24" height="24" viewBox="0 0 24 24" className="mr-2 shrink-0 mt-0.5 fill-blue-500 stroke-blue-700">
                            <path d="M17.9998 14.242L19.4138 15.656L12.0008 23.069L4.58582 15.656L5.99982 14.242L11.0008 19.242V1H13.0008V19.242L17.9998 14.242Z" />
                        </svg>
                        <div>
                            <strong className="text-blue-700">"Did You Feel It?" (DYFI):</strong>
                            <span className="text-xs text-slate-600"> USGS collects public reports to map felt shaking intensity. This event had <strong className={highlightClass}>{properties.felt}</strong> felt reports.</span>
                        </div>
                    </div>
                )}
                {isValidString(pagerAlertValue) && (
                    <div className="flex items-start p-2 bg-green-50 rounded-md">
                        <svg width="24" height="24" viewBox="0 0 24 24" className="mr-2 shrink-0 mt-0.5 fill-green-500 stroke-green-700">
                            <path d="M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21Z" strokeWidth="2" />
                            <path d="M9 12L11 14L15 10" strokeWidth="2" />
                        </svg>
                        <div>
                            <strong className="text-green-700">PAGER System:</strong>
                            <span className="text-xs text-slate-600"> Rapid impact assessment. Alert for this event: <strong className={`capitalize font-semibold px-1.5 py-0.5 rounded-sm text-xs ${pagerStyleClasses}`}>{pagerAlertValue}</strong>.</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default EarthquakeCitizenSciencePanel;
