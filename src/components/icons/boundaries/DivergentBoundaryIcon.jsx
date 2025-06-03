import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const DivergentBoundaryIcon = ({ className = "w-12 h-8" }) => {
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

  const riftCenter = 25;

  const leftBlockDefaultAnimate = [
    { x: 0, transition: { duration: 0.5 } },
    { x: -3, transition: { duration: 1, ease: "easeIn" } },
    { x: -5, transition: { duration: 1, ease: "easeInOut" } },
    { x: -5, transition: { duration: 0.5 } },
    { x: 0, transition: { duration: 1.5, ease: "easeInOut" } }
  ];
  const staticLeftBlockPose = { x: -5 }; // Fully separated

  const leftBlockKeyframes = {
    initial: { x: 0 },
    animate: leftBlockDefaultAnimate,
    static: staticLeftBlockPose,
  };

  const rightBlockDefaultAnimate = [
    { x: 0, transition: { duration: 0.5 } },
    { x: 3, transition: { duration: 1, ease: "easeIn" } },
    { x: 5, transition: { duration: 1, ease: "easeInOut" } },
    { x: 5, transition: { duration: 0.5 } },
    { x: 0, transition: { duration: 1.5, ease: "easeInOut" } }
  ];
  const staticRightBlockPose = { x: 5 }; // Fully separated

  const rightBlockKeyframes = {
    initial: { x: 0 },
    animate: rightBlockDefaultAnimate,
    static: staticRightBlockPose,
  };

  const upwellingDefaultAnimate = [
    { scaleY: 0, opacity: 0, y: 25, transition: { duration: 0.5 + 0.5 } },
    { scaleY: 0.8, opacity: 0.7, y: 10, transition: { duration: 1, ease: "easeOut" } },
    { scaleY: 1, opacity: 1, y: 8, transition: { duration: 0.5, ease: "easeOut" } },
    { scaleY: 1, opacity: 1, y: 8, transition: { duration: 0.5 } },
    { scaleY: 0, opacity: 0, y: 25, transition: { duration: 1, ease: "easeIn" } }
  ];
  const staticUpwellingPose = { scaleY: 1, opacity: 1, y: 8 }; // Fully risen

  const upwellingKeyframes = {
    initial: { scaleY: 0, opacity: 0, y: 25 },
    animate: upwellingDefaultAnimate,
    static: staticUpwellingPose,
  };

  const overallTransitionSettings = {
    repeat: Infinity,
    repeatDelay: 0.5,
  };

  return (
    <svg viewBox="0 0 50 30" className={className} aria-labelledby="divergentBoundaryTitle" role="img">
      <title id="divergentBoundaryTitle">Animated Divergent Boundary Diagram</title>

      <motion.g
        variants={leftBlockKeyframes}
        initial="initial"
        animate={enableAnimations ? "animate" : "static"}
        transition={enableAnimations ? overallTransitionSettings : { duration: 0 }}
      >
        <rect x="2" y="5" width="20" height="20" fill="currentColor" opacity="0.7" />
        <polyline points="10,15 4,15 7,12 4,15 7,18" stroke="white" strokeWidth="1.5" fill="none" />
      </motion.g>

      <motion.g
        variants={rightBlockKeyframes}
        initial="initial"
        animate={enableAnimations ? "animate" : "static"}
        transition={enableAnimations ? overallTransitionSettings : { duration: 0 }}
      >
        <rect x="28" y="5" width="20" height="20" fill="currentColor" opacity="0.5" />
        <polyline points="40,15 46,15 43,12 46,15 43,18" stroke="white" strokeWidth="1.5" fill="none" />
      </motion.g>

      <motion.rect
        x={riftCenter - 2.5}
        width="5"
        height="17"
        fill="orangered"
        initial="initial"
        variants={upwellingKeyframes}
        animate={enableAnimations ? "animate" : "static"}
        transition={enableAnimations ? overallTransitionSettings : { duration: 0 }}
        style={{ transformOrigin: "50% 100%" }}
      />
    </svg>
  );
};
export default DivergentBoundaryIcon;
