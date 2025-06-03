import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const StrikeSlipFaultIcon = ({ className = "w-12 h-8" }) => {
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

  const slipAmount = 6;

  const leftBlockDefaultAnimate = [
    { x: 0, transition: { duration: 0.5 } },
    { x: -slipAmount, transition: { duration: 1, ease: "easeOut" } },
    { x: -slipAmount, transition: { duration: 1 } },
    { x: 0, transition: { duration: 1, ease: "easeInOut" } }
  ];
  const staticLeftBlockPose = { x: -slipAmount };

  const leftBlockKeyframes = {
    initial: { x: 0 },
    animate: leftBlockDefaultAnimate,
    static: staticLeftBlockPose,
  };

  const rightBlockDefaultAnimate = [
    { x: 0, transition: { duration: 0.5 } },
    { x: slipAmount, transition: { duration: 1, ease: "easeOut" } },
    { x: slipAmount, transition: { duration: 1 } },
    { x: 0, transition: { duration: 1, ease: "easeInOut" } }
  ];
  const staticRightBlockPose = { x: slipAmount };

  const rightBlockKeyframes = {
    initial: { x: 0 },
    animate: rightBlockDefaultAnimate,
    static: staticRightBlockPose,
  };

  const stressLineDefaultAnimate = [
    { opacity: 0, scaleY: 0.1, transition: { duration: 0.25 } },
    { opacity: 0.7, scaleY: 1, transition: { duration: 0.25, ease: "easeOut" } },
    { opacity: 0, scaleY: 0.1, transition: { duration: 1, ease: "easeIn" } },
    { opacity: 0, scaleY: 0.1, transition: { duration: 1 } },
    { opacity: 0, scaleY: 0.1, transition: { duration: 1 } }
  ];
  const staticStressLinePose = { opacity: 0, scaleY: 0.1 }; // Invisible

  const stressLineKeyframes = {
    initial: { opacity: 0, scaleY: 0.1 }, // y:0 removed as rect has y attribute
    animate: stressLineDefaultAnimate,
    static: staticStressLinePose,
  };

  const overallTransitionSettings = {
    repeat: Infinity,
    repeatDelay: 0.5,
  };

  return (
    <svg viewBox="0 0 50 30" className={className} aria-labelledby="strikeSlipFaultTitle" role="img">
      <title id="strikeSlipFaultTitle">Animated Strike-Slip Fault Diagram</title>

      <line x1="25" y1="2" x2="25" y2="28" stroke="currentColor" strokeWidth="1" />

      <motion.rect
        x="24"
        y="5"
        width="2"
        height="20"
        fill="rgba(255,255,255,0.8)"
        style={{ transformOrigin: "center" }}
        variants={stressLineKeyframes}
        initial="initial"
        animate={enableAnimations ? "animate" : "static"}
        transition={enableAnimations ? overallTransitionSettings : { duration: 0 }}
      />

      <motion.g
        variants={leftBlockKeyframes}
        initial="initial"
        animate={enableAnimations ? "animate" : "static"}
        transition={enableAnimations ? overallTransitionSettings : { duration: 0 }}
      >
        <rect x="2" y="2" width="21" height="26" fill="currentColor" opacity="0.7" />
        <polyline points="12.5,8 8.5,12.5 12.5,17" stroke="white" strokeWidth="1.5" fill="none" />
      </motion.g>

      <motion.g
        variants={rightBlockKeyframes}
        initial="initial"
        animate={enableAnimations ? "animate" : "static"}
        transition={enableAnimations ? overallTransitionSettings : { duration: 0 }}
      >
        <rect x="27" y="2" width="21" height="26" fill="currentColor" opacity="0.5" />
        <polyline points="37.5,8 41.5,12.5 37.5,17" stroke="white" strokeWidth="1.5" fill="none" />
      </motion.g>
    </svg>
  );
};
export default StrikeSlipFaultIcon;
