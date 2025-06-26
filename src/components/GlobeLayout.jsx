
import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import NotableQuakeFeature from './NotableQuakeFeature';
import PreviousNotableQuakeFeature from './PreviousNotableQuakeFeature';
import GlobalLastMajorQuakeTimer from "./GlobalLastMajorQuakeTimer.jsx";
import InteractiveGlobeView from './InteractiveGlobeView';

const GlobeLayout = (props) => {
  const {
    globeFocusLng,
    handleQuakeClick,
    getMagnitudeColor,
    activeClusters,
    lastMajorQuake,
    formatTimeDuration,
    handleNotableQuakeSelect,
    keyStatsForGlobe,
    coastlineData,
    tectonicPlatesData,
    areGeoJsonAssetsLoading
  } = props;

import React, { Suspense, useRef } from 'react'; // Added useRef
import { Outlet } from 'react-router-dom';
import NotableQuakeFeature from './NotableQuakeFeature';
import PreviousNotableQuakeFeature from './PreviousNotableQuakeFeature';
import GlobalLastMajorQuakeTimer from "./GlobalLastMajorQuakeTimer.jsx";
import InteractiveGlobeView from './InteractiveGlobeView';

const GlobeLayout = (props) => {
  const {
    globeFocusLng,
    handleQuakeClick,
    getMagnitudeColor,
    activeClusters,
    lastMajorQuake,
    formatTimeDuration,
    handleNotableQuakeSelect,
    keyStatsForGlobe,
    coastlineData,
    tectonicPlatesData,
    areGeoJsonAssetsLoading
  } = props;

  const globeContainerRef = useRef(null); // Create a ref for the globe container

  return (
    // This div is the .globe-wrapper, its ref is passed to InteractiveGlobeView
    <div ref={globeContainerRef} className="globe-wrapper">
      <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-slate-500">Loading Globe Components...</div>}>
        {(areGeoJsonAssetsLoading || !coastlineData || !tectonicPlatesData) ? (
           <div className="w-full h-full flex items-center justify-center text-slate-500">Loading Map Data...</div>
        ) : (
          <InteractiveGlobeView
            containerRef={globeContainerRef} // Pass the ref
            defaultFocusLat={20}
            defaultFocusLng={globeFocusLng}
            onQuakeClick={handleQuakeClick}
            getMagnitudeColorFunc={getMagnitudeColor}
            allowUserDragRotation={true}
            enableAutoRotation={true}
            globeAutoRotateSpeed={0.1}
            coastlineGeoJson={coastlineData}
            tectonicPlatesGeoJson={tectonicPlatesData}
            activeClusters={activeClusters}
          />
        )}
      </Suspense>

      <div className="absolute top-2 left-2 z-10 space-y-2">
        <NotableQuakeFeature
            onNotableQuakeSelect={handleNotableQuakeSelect}
            getMagnitudeColorFunc={getMagnitudeColor}
        />
        <div className="hidden md:block">
            <PreviousNotableQuakeFeature
                onNotableQuakeSelect={handleNotableQuakeSelect}
                getMagnitudeColorFunc={getMagnitudeColor}
            />
        </div>
        <div className="p-2 sm:p-2.5 bg-slate-800 bg-opacity-80 text-white rounded-lg shadow-xl max-w-full sm:max-w-xs backdrop-blur-sm border border-slate-700">
            <h3 className="text-xs sm:text-sm font-semibold mb-0.5 sm:mb-1 text-indigo-300 uppercase">Live Statistics</h3>
            <div className="text-xs sm:text-sm">Last Hour: <span className="font-bold text-sm sm:text-base text-sky-300">{keyStatsForGlobe.lastHourCount}</span></div>
            <div className="text-xs sm:text-sm">24h Total: <span className="font-bold text-sm sm:text-base text-sky-300">{keyStatsForGlobe.count24h}</span></div>
            <div className="text-xs sm:text-sm">72h Total: <span className="font-bold text-sm sm:text-base text-sky-300">{keyStatsForGlobe.count72h}</span></div>
            <div className="text-xs sm:text-sm">
                24h Strongest: <span className="font-bold text-sm sm:text-base" style={{ color: getMagnitudeColor(keyStatsForGlobe.strongest24hRawMagnitude) }}>
                    {keyStatsForGlobe.strongest24hDisplayString}
                </span>
            </div>
            <div className="text-xs sm:text-sm">
                72h Strongest: <span className="font-bold text-sm sm:text-base" style={{ color: getMagnitudeColor(keyStatsForGlobe.strongest72hRawMagnitude) }}>
                    {keyStatsForGlobe.strongest72hDisplayString}
                </span>
            </div>
        </div>
      </div>

      <GlobalLastMajorQuakeTimer
        lastMajorQuake={lastMajorQuake}
        formatTimeDuration={formatTimeDuration}
        handleTimerClick={handleQuakeClick}
      />
      <Outlet />
    </div>
  );
};

export default GlobeLayout;
