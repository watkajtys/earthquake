import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const ConvergentBoundaryIcon = ({ className = "w-12 h-8" }) => {
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

  const collisionPointX = 25;

  const leftBlockDefaultAnimate = [
    { x: 0, transition: { duration: 0.5 } },
    { x: 4, transition: { duration: 1, ease: "easeIn" } },
    { x: 3, transition: { duration: 1.5, ease: "easeInOut" } },
    { x: 3, transition: { duration: 0.5 } },
    { x: 0, transition: { duration: 1.5, ease: "easeInOut" } }
  ];
  const staticLeftBlockPose = { x: 3 }; // At collision

  const leftBlockKeyframes = {
    initial: { x: 0 },
    animate: leftBlockDefaultAnimate,
    static: staticLeftBlockPose,
  };

  const rightBlockDefaultAnimate = [
    { x: 0, transition: { duration: 0.5 } },
    { x: -4, transition: { duration: 1, ease: "easeIn" } },
    { x: -3, transition: { duration: 1.5, ease: "easeInOut" } },
    { x: -3, transition: { duration: 0.5 } },
    { x: 0, transition: { duration: 1.5, ease: "easeInOut" } }
  ];
  const staticRightBlockPose = { x: -3 }; // At collision

  const rightBlockKeyframes = {
    initial: { x: 0 },
    animate: rightBlockDefaultAnimate,
    static: staticRightBlockPose,
  };

  const upliftDefaultAnimate = [
    { scaleY: 0, opacity: 0, y: 15, transition: { duration: 0.5 + 1 } },
    { scaleY: 1, opacity: 1, y: 10, transition: { duration: 1, ease: "easeOut" } },
    { scaleY: 1, opacity: 1, y: 10, transition: { duration: 0.5 + 0.5 } },
    { scaleY: 0, opacity: 0, y: 15, transition: { duration: 1, ease: "easeIn" } }
  ];
  const staticUpliftPose = { scaleY: 1, opacity: 1, y: 10 }; // Fully uplifted

  const upliftKeyframes = {
    initial: { scaleY: 0, opacity: 0, y: 15, x: collisionPointX - 5 },
    animate: upliftDefaultAnimate,
    static: staticUpliftPose,
  };

  const overallTransitionSettings = {
    repeat: Infinity,
    repeatDelay: 0.5,
  };

  return (
    <svg viewBox="0 0 50 30" className={className} aria-labelledby="convergentBoundaryTitle" role="img">
      <title id="convergentBoundaryTitle">Animated Convergent Boundary Diagram</title>

      <motion.g
        variants={leftBlockKeyframes}
        initial="initial"
        animate={enableAnimations ? "animate" : "static"}
        transition={enableAnimations ? overallTransitionSettings : { duration: 0 }}
      >
        <rect x="2" y="5" width="20" height="20" fill="currentColor" opacity="0.7" />
        <polyline points="18,15 22,15 20,12 22,15 20,18" stroke="white" strokeWidth="1.5" fill="none" />
      </motion.g>

      <motion.g
        variants={rightBlockKeyframes}
        initial="initial"
        animate={enableAnimations ? "animate" : "static"}
        transition={enableAnimations ? overallTransitionSettings : { duration: 0 }}
      >
        <rect x="28" y="5" width="20" height="20" fill="currentColor" opacity="0.5" />
        <polyline points="32,15 28,15 30,12 28,15 30,18" stroke="white" strokeWidth="1.5" fill="none" />
      </motion.g>

      <motion.polygon
        points="0,0 10,0 5,-8"
        fill="currentColor"
        variants={upliftKeyframes}
        initial="initial"
        animate={enableAnimations ? "animate" : "static"}
        transition={enableAnimations ? overallTransitionSettings : { duration: 0 }}
        style={{ transformOrigin: "50% 100%" }}
      />
    </svg>
  );
};
export default ConvergentBoundaryIcon;
