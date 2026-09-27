// src/InfoSnippet.jsx
import React, { useState, memo } from 'react';

/**
 * A module-level constant object containing predefined information snippets for various earthquake-related topics.
 * Each key in `infoData` corresponds to a topic (e.g., "magnitude", "depth").
 * The value for each key is an object with `title` (string), `content` (string), and `icon` (string emoji).
 *
 * @const {Object.<string, {title: string, content: string, icon: string}>} infoData
 */
const infoData = {
    magnitude: {
        title: "What is Magnitude?",
        content: "Earthquake magnitude (usually Mww) measures the 'size' or energy released. For each whole number increase, the released energy is about 32 times greater. M1-M3 are often not felt. M7+ can cause widespread, heavy damage.",
        icon: "🌊" // Wave
    },
    depth: {
        title: "What is Depth?",
        content: "Depth is where the earthquake rupture starts below the Earth's surface. Shallow quakes (0-70 km) often cause more damage as their energy is released closer to us. Intermediate (70-300 km) and deep quakes (>300 km) also occur, typically in subduction zones.",
        icon: "🎯" // Target
    },
    intensity: {
        title: "Intensity vs. Magnitude",
        content: "Magnitude is a single number representing the earthquake's energy at its source. Intensity (like the Modified Mercalli Intensity - MMI scale) describes the *severity of shaking and damage* at a specific location. Intensity varies with distance from the quake, local ground conditions, and building standards.",
        icon: "🏠" // House
    },
    alerts: {
        title: "USGS PAGER Alert Levels",
        content: "The USGS PAGER system provides rapid alerts (Green, Yellow, Orange, Red) estimating the potential scale of impact from significant earthquakes worldwide, considering fatalities and economic losses. GREEN indicates minimal or no expected impact, while RED suggests a catastrophic impact is likely.",
        icon: "🔔" // Bell
    },
    strike: { // NEW or Refined
        title: "What is Fault Strike?",
        content: "Strike is the direction of a horizontal line on the fault plane, measured clockwise from north: 0° north, 90° east, 180° south, 270° west. The right-hand rule chooses the strike direction so the plane dips to your right (strike + 90°). A buried fault need not intersect the ground surface. A nodal-plane strike describes a possible fault orientation, not a confirmed surface trace.",
        icon: "🧭" // Compass
    },
    dip: { // NEW or Refined
        title: "What is Fault Dip?",
        content: "Dip is the angle of the fault plane below horizontal, measured in a vertical section perpendicular to strike. A dip of 0° is horizontal and 90° is vertical. For a dipping plane, the right-hand rule places the downward dip direction 90° clockwise from strike. Dip describes the plane's tilt, not the direction of slip.",
        icon: "📐" // Triangle ruler
    },
    rake: { // NEW or Refined
        title: "What is Fault Rake?",
        content: "Rake is the slip angle on the fault plane, measured from the strike direction toward up-dip for positive angles. It describes motion of the hanging wall relative to the footwall on a dipping fault. 0° is left-lateral slip along strike; ±180° is right-lateral slip opposite strike; +90° is up-dip reverse slip; −90° is down-dip normal slip. Intermediate angles combine strike-slip and dip-slip. These are relative motions, not absolute movement of either block.",
        icon: "↯" // Downwards zigzag arrow or similar for slip
    },
    stressAxes: {
        title: "Understanding P and T Axes",
        content: "The P and T axes describe the compressional and extensional directions of the earthquake source mechanism. They help describe faulting style, but a single earthquake does not directly determine the regional stress field. An axis is an unoriented line, not a slip arrow. Its azimuth is clockwise from north and its plunge is measured below horizontal; the projection shows its downward end.",
        icon: "⇆" // Left right arrow
    },
    beachball: {
        title: "What's a 'Beach Ball' Diagram?",
        content: "A focal mechanism or beachball projects earthquake source directions onto a circle. In this lower-hemisphere view, shaded regions represent compressional P-wave first motions and white regions dilatational first motions. The curves are two alternative nodal planes; independent evidence is needed to identify the ruptured fault. Our diagram shows the double-couple model from strike, dip and rake.",
        icon: "⚽"
    },
    stationsUsed: {
        title: "What is 'Stations Used (nst)'?",
        content: "'Stations Used (nst)' is the number of seismic stations whose data (arrival times of seismic waves) contributed to calculating the earthquake's location and magnitude. Generally, a higher number of well-distributed stations leads to a more accurate and reliable solution.",
        icon: "📡" // Satellite dish or antenna
    },
    azimuthalGap: {
        title: "What is 'Azimuthal Gap (gap)'?",
        content: "The Azimuthal Gap is the largest angle between azimuths from the epicenter to adjacent seismic stations. A smaller gap (e.g., less than 180°) means stations surround the earthquake well, leading to better control on the epicenter's location. A large gap can introduce more uncertainty, especially in the direction of the gap.",
        icon: "🌐" // Globe with meridians or a compass rose section
    },
    nearestStation: {
        title: "What is 'Nearest Station (dmin)'?",
        content: "'Nearest Station (dmin)' is the distance (in degrees of arc, where 1 degree is about 111 km) from the epicenter to the closest seismic station. A smaller dmin, meaning a station is very close to the quake, generally improves the accuracy of the depth and origin time.",
        icon: "📍" // Pin
    },
    rmsError: {
        title: "What is 'RMS Error (rms)'?",
        content: "'RMS Error' (Root Mean Square error) is a statistical measure of the difference between the observed seismic wave arrival times and the arrival times predicted by the earthquake location model. A smaller RMS value (typically less than 1.0 second) indicates a better fit of the data to the calculated location and origin time.",
        icon: "⏱️" // Stopwatch
    }
};

/**
 * Displays an expandable/collapsible information snippet about a specific earthquake-related topic.
 * The content (title, detailed explanation, icon) is sourced from the `infoData` object
 * based on the `topic` prop. This component is memoized using `React.memo`.
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {string} props.topic - The key corresponding to a topic in the `infoData` object (e.g., "magnitude", "depth").
 * @returns {JSX.Element|null} The InfoSnippet component, or null if the provided `topic` is not found in `infoData`.
 */
const InfoSnippet = ({ topic }) => {
    const [isOpen, setIsOpen] = useState(false);
    const data = infoData[topic];
    if (!data) return null;

    return (
        <div className="my-1.5">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between w-full text-left px-2.5 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md focus:outline-none transition-colors shadow-sm"
            >
                <span className="font-semibold text-xs">{data.icon} {data.title}</span>
                <span className="text-md">{isOpen ? '➖' : '➕'}</span>
            </button>
            {isOpen && (
                <div className="p-2.5 mt-0.5 bg-slate-600 bg-opacity-70 text-gray-200 rounded-b-md text-xs leading-relaxed shadow-inner">
                    {data.content}
                </div>
            )}
        </div>
    );
};
export default memo(InfoSnippet);
