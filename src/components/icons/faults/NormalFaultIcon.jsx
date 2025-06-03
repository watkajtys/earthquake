import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const NormalFaultIcon = ({ className = "w-12 h-8" }) => {
  const [enableAnimations, setEnableAnimations] = useState(true);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => {
      setEnableAnimations(!mediaQuery.matches);
    };
    handleChange(); // Initial check
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const hangingWallDefaultAnimate = [
    { x: 0, y: 0, transition: { duration: 0.5 } }, // Start / Pause state
    { x: -0.5, y: 1, transition: { duration: 0.5, ease: "easeIn" } }, // Phase 1a: Slight extension
    { x: -1, y: 3, transition: { duration: 0.5, ease: "easeInOut" } }, // Phase 1b: Initial slip
    { x: -2, y: 6, transition: { duration: 0.4, ease: "easeOut" } }, // Phase 2a: Main slip (faster)
    { y: 5.5, x: -1.8, transition: { duration: 0.05, ease: "linear" } },
    { y: 6, x: -2, transition: { duration: 0.05, ease: "linear" } },
    { y: 5.8, x: -1.9, transition: { duration: 0.05, ease: "linear" } },
    { y: 6, x: -2, transition: { duration: 0.05, ease: "linear" } },
    { y: 6, x: -2, transition: { duration: 0.5 } }, // Phase 3: Pause in slipped state
    { x: 0, y: 0, transition: { duration: 1, ease: "easeInOut" } } // Phase 4: Return to initial
  ];
  const staticHangingWallPose = { y: 6, x: -2 }; // Slipped state

  const hangingWallKeyframes = {
    initial: { y: 0, x: 0 },
    animate: hangingWallDefaultAnimate,
    static: staticHangingWallPose,
  };

  const footwallDefaultAnimate = [
    { x: 0, transition: { duration: 0.5 } },
    { x: 0.5, transition: { duration: 0.5, ease: "easeIn" } }, // Phase 1a: Slight extension
    { x: 0.5, transition: { duration: 0.5, ease: "easeInOut" } },
    { x: 0.5, transition: { duration: 0.4, ease: "easeOut" } },
    { x: 0.5, transition: { duration: 0.05 * 4 } },
    { x: 0.5, transition: { duration: 0.5 } },
    { x: 0, transition: { duration: 1, ease: "easeInOut" } }
  ];
  const staticFootwallPose = { x: 0.5 }; // Extended state

  const footwallKeyframes = {
    initial: { x: 0 },
    animate: footwallDefaultAnimate,
    static: staticFootwallPose,
  };

  const overallTransitionSettings = {
    repeat: Infinity,
    repeatDelay: 0.5
  };

  return (
    <svg viewBox="0 0 50 30" className={className} aria-labelledby="normalFaultTitle" role="img">
      <title id="normalFaultTitle">Animated Normal Fault Diagram</title>

      <line x1="5" y1="25" x2="45" y2="5" stroke="currentColor" strokeWidth="1" />

      <motion.g
        variants={footwallKeyframes}
        initial="initial"
        animate={enableAnimations ? "animate" : "static"}
        transition={enableAnimations ? overallTransitionSettings : { duration: 0 }}
      >
        <polygon points="25,5 45,5 45,20 25,22" fill="currentColor" opacity="0.5" />
      </motion.g>

      <motion.g
        variants={hangingWallKeyframes}
        initial="initial"
        animate={enableAnimations ? "animate" : "static"}
        transition={enableAnimations ? overallTransitionSettings : { duration: 0 }}
      >
        <polygon points="5,17 25,7 25,22 5,22" fill="currentColor" opacity="0.7" />
        <polyline points="15,10 15,14 12,12 15,14 18,12" stroke="white" strokeWidth="1.5" fill="none" />
      </motion.g>
    </svg>
  );
};
export default NormalFaultIcon;
