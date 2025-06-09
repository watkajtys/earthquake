import React, { useState, useEffect, useRef } from 'react';
import './StickSlipAnimation.css';

const StickSlipAnimation = () => {
  const [animationState, setAnimationState] = useState('idle'); // 'idle', 'stressing', 'slipped', 'releasing', 'resetting'
  const [stressLevel, setStressLevel] = useState(0); // 0-100
  const [showWaves, setShowWaves] = useState(false);
  const stressIntervalRef = useRef(null);
  const animationCycleTimeoutRef = useRef(null);


  const startStressing = () => {
    setAnimationState('stressing');
    setStressLevel(0);
    setShowWaves(false); // Ensure waves are hidden at start of stressing

    const plateA = document.getElementById('plate-a');
    const plateB = document.getElementById('plate-b');
    plateA?.classList.remove('slipped');
    plateB?.classList.remove('slipped');
    plateA?.classList.add('deforming');
    plateB?.classList.add('deforming');
    plateA?.classList.add('glowing');
    plateB?.classList.add('glowing');

    // Clean up wave classes from previous run
    const waves = document.querySelectorAll('.wave');
    waves.forEach(wave => wave.classList.remove('radiating'));
  };

  const handleButtonClick = () => {
    // Allow restart anytime unless already in the middle of stressing
    if (animationState !== 'stressing') {
      clearTimeout(animationCycleTimeoutRef.current); // Clear any pending auto-restart
      startStressing();
    }
  };

  useEffect(() => {
    if (animationState === 'stressing') {
      stressIntervalRef.current = setInterval(() => {
        setStressLevel(prevStress => {
          if (prevStress >= 100) {
            clearInterval(stressIntervalRef.current);
            setAnimationState('slipped');
            document.getElementById('plate-a')?.classList.remove('deforming');
            document.getElementById('plate-b')?.classList.remove('deforming');
            return 100;
          }
          return prevStress + 2;
        });
      }, 50);
    } else if (animationState === 'slipped') {
      document.getElementById('plate-a')?.classList.add('slipped');
      document.getElementById('plate-b')?.classList.add('slipped');
      document.getElementById('plate-a')?.classList.remove('glowing');
      document.getElementById('plate-b')?.classList.remove('glowing');
      setShowWaves(true); // Trigger waves

      animationCycleTimeoutRef.current = setTimeout(() => {
        setAnimationState('releasing');
      }, 1000); // Duration of slip visual + start of wave radiation
    } else if (animationState === 'releasing') {
      // Waves will radiate based on CSS.
      // Wait for waves to mostly finish, then reset plates and loop.
      // Total wave animation is 2s + 0.8s (last delay) = 2.8s
      animationCycleTimeoutRef.current = setTimeout(() => {
        setShowWaves(false); // Hide waves after they've radiated
        // Ensure plates are visually reset by removing 'slipped'
        // The transition on .plate handles the visual return
        document.getElementById('plate-a')?.classList.remove('slipped');
        document.getElementById('plate-b')?.classList.remove('slipped');

        setAnimationState('resetting'); // Intermediate state before restarting
      }, 2000); // (2s for wave animation + small buffer)
    } else if (animationState === 'resetting') {
      // Pause briefly, then restart the cycle
      setStressLevel(0); // Ensure stress meter is zeroed
      animationCycleTimeoutRef.current = setTimeout(() => {
        startStressing(); // Restart the cycle
      }, 1000); // Pause duration before restarting
    }

    return () => {
      clearInterval(stressIntervalRef.current);
      clearTimeout(animationCycleTimeoutRef.current);
    };
  }, [animationState]);

  useEffect(() => {
    // This effect handles adding/removing .radiating class for waves
    const waves = document.querySelectorAll('.wave');
    if (showWaves) {
      waves.forEach(wave => wave.classList.add('radiating'));
    } else {
      // Removing 'radiating' might not be strictly necessary if 'forwards' fill mode is used
      // and elements are re-hidden/reset some other way before next showWaves=true.
      // However, it's cleaner to remove it.
      waves.forEach(wave => wave.classList.remove('radiating'));
    }
  }, [showWaves]);


  // Determine glow class based on stress level - this is an alternative to single .glowing class
  // let glowClass = '';
  // if (stressLevel > 0 && stressLevel <= 33) glowClass = 'stress-glow-low';
  // else if (stressLevel > 33 && stressLevel <= 66) glowClass = 'stress-glow-medium';
  // else if (stressLevel > 66) glowClass = 'stress-glow-high';

  return (
    // Container styling moved to WhyEarthquakesHappenPage.jsx's animationContainerStyle
    // For direct application if this component is used elsewhere:
    // className={`bg-slate-800 rounded-lg p-4 border border-slate-700 text-slate-300 state-${animationState}`}
    <div className={`stick-slip-animation-wrapper state-${animationState}`}>
      <h3 className="text-lg font-semibold text-indigo-400 mb-4 text-center">The Stick-Slip Cycle</h3>
      <div className="animation-area bg-slate-700 border-slate-600 relative w-[450px] h-[200px] border overflow-hidden mx-auto">
        <div className="wave-container" id="wave-container">
          {/* Waves are always in DOM, visibility controlled by CSS animation + .radiating class */}
          <div className="wave wave-1"></div>
          <div className="wave wave-2"></div>
          <div className="wave wave-3"></div>
        </div>
        <div className="arrow arrow-a text-3xl text-slate-400">
          <span>&larr;</span> {/* Force pushing Plate A to the left */}
        </div>
        <div
          className={`plate plate-a bg-amber-700 border-amber-900 text-white`}
          id="plate-a"
        >
          Plate A
        </div>
        <div
          className={`plate plate-b bg-amber-700 border-amber-900 text-white`}
          id="plate-b"
        >
          Plate B
        </div>
        <div className="arrow arrow-b text-3xl text-slate-400">
          <span>&rarr;</span> {/* Force pushing Plate B to the right */}
        </div>
        <div className="fault-line-label bg-black bg-opacity-60 text-white text-xs px-2 py-0.5 rounded">Fault Line</div>
      </div>
      <div className="stress-meter mt-4 flex items-center w-full max-w-md mx-auto">
        <span className="stress-label text-sm text-slate-300 mr-2">Stress: </span>
        <div className="stress-bar-container flex-grow h-5 bg-slate-600 border border-slate-500 rounded overflow-hidden">
          <div className="stress-bar bg-red-500 h-full" id="stress-bar-level" style={{ width: `${stressLevel}%` }}></div>
        </div>
      </div>
      <div className="controls mt-4 text-center">
        <button
          id="stick-slip-button"
          onClick={handleButtonClick}
          disabled={animationState === 'stressing'}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 px-4 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {animationState === 'stressing' ? 'Building Stress...' :
           (animationState === 'idle' || animationState === 'resetting') ? 'Start Animation Cycle' :
           'Restart Cycle'}
        </button>
      </div>
    </div>
  );
};

export default StickSlipAnimation;
