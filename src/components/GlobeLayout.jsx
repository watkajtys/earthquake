
import React, { Suspense, useRef, useState, useEffect } from 'react'; // Added useState, useEffect
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

  const globeContainerRef = useRef(null);
  const [debugDimensions, setDebugDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    // Store IDs for cleanup
    let rafId1 = null;
    let rafId2 = null;

    const updateDebugDimensions = () => {
      if (globeContainerRef.current) {
        setDebugDimensions({
          width: globeContainerRef.current.clientWidth,
          height: globeContainerRef.current.clientHeight,
        });
      }
    };

    // Initial dimensions - use nested rAF for safety
    rafId1 = requestAnimationFrame(() => {
        rafId2 = requestAnimationFrame(updateDebugDimensions);
    });

    // Observe for changes
    const resizeObserver = new ResizeObserver(updateDebugDimensions);
    if (globeContainerRef.current) {
      resizeObserver.observe(globeContainerRef.current);
    }

    return () => {
      if (rafId1) cancelAnimationFrame(rafId1);
      if (rafId2) cancelAnimationFrame(rafId2);
      if (globeContainerRef.current) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        resizeObserver.unobserve(globeContainerRef.current);
      }
    };
  }, []); // Empty dependency array, runs once on mount and cleanup on unmount

  return (
    // This div is the .globe-wrapper, its ref is used for measuring
    <div ref={globeContainerRef} className="globe-wrapper">
      {/* Debug Dimensions Display */}
      <div style={{ position: 'absolute', top: '10px', left: '10px', backgroundColor: 'rgba(0,0,0,0.7)', color: 'white', padding: '5px', zIndex: 10000, fontSize: '12px', pointerEvents: 'none'}}>
        Container: {debugDimensions.width}w x {debugDimensions.height}h
      </div>

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
