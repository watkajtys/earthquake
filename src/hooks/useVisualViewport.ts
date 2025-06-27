import { useState, useEffect } from 'react';

const getVisualViewportHeight = (): number => {
  // Check if window and visualViewport are defined (for SSR or non-browser environments)
  if (typeof window !== 'undefined' && window.visualViewport) {
    return window.visualViewport.height;
  }
  // Fallback to innerHeight if visualViewport is not available or in non-browser env
  if (typeof window !== 'undefined') {
    return window.innerHeight;
  }
  // Default fallback for non-browser environments (e.g., during SSR build)
  return 0;
};

export const useVisualViewport = (): number => {
  const [viewportHeight, setViewportHeight] = useState<number>(() => getVisualViewportHeight());

  useEffect(() => {
    // Ensure window is defined before trying to access visualViewport or add event listeners
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      setViewportHeight(getVisualViewportHeight());
    };

    // Initial set in case the value changes between initial state set and effect runs
    // Or if running in an environment where the initial getVisualViewportHeight might be delayed/different
    setViewportHeight(getVisualViewportHeight());

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    } else {
      window.addEventListener('resize', handleResize);
    }

    return () => {
      if (typeof window === 'undefined') {
        return;
      }
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      } else {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  return viewportHeight;
};
