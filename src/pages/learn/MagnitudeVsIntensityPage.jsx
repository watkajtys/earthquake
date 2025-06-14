// src/pages/learn/MagnitudeVsIntensityPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import SeoMetadata from '../../components/SeoMetadata';

/**
 * Renders the "Magnitude vs. Intensity" learning page.
 * Currently, this page serves as a placeholder indicating that content is "coming soon".
 * It includes SEO metadata relevant to the topic and a link to navigate back
 * to the main "Learn About Earthquakes" page.
 * This component takes no direct props.
 *
 * @component
 * @returns {JSX.Element} The MagnitudeVsIntensityPage component.
 */
const MagnitudeVsIntensityPage = () => {
  return (
    <>
      <SeoMetadata
        title="Magnitude vs. Intensity | Learn | Seismic Monitor"
        description="Learn about the crucial differences between earthquake magnitude (energy released) and intensity (shaking experienced) and how each is measured."
        keywords="earthquake magnitude, earthquake intensity, richter scale, mercalli scale, seismic energy, earthquake shaking, learn seismology"
        pageUrl="https://earthquakeslive.com/learn/magnitude-vs-intensity"
        canonicalUrl="https://earthquakeslive.com/learn/magnitude-vs-intensity"
        type="article"
      />
      <div className="p-3 md:p-4 space-y-4 text-slate-200 max-w-3xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-indigo-400">
          Understanding Earthquake Magnitude vs. Intensity
        </h1>
        <p className="text-slate-300">
          Content for 'Understanding Earthquake Magnitude vs. Intensity' coming soon!
          This article will explain the critical differences between how earthquake magnitude
          (the energy released at the source) and intensity (the strength of shaking at a specific location)
          are defined and measured.
        </p>
        <div className="mt-6">
          <Link to="/learn" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            &larr; Back to Learn Topics
          </Link>
        </div>
      </div>
    </>
  );
};

export default MagnitudeVsIntensityPage;
