// src/pages/learn/MagnitudeVsIntensityPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import SeoMetadata from '../../components/SeoMetadata';
import MagnitudeVsIntensitySVG from '../../assets/magnitude-vs-intensity.svg';

/**
 * Renders the "Magnitude vs. Intensity" learning page.
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
        <div className="my-4">
          <img src={MagnitudeVsIntensitySVG} alt="Diagram explaining the difference between earthquake magnitude and intensity" className="w-full rounded-lg" />
        </div>
        <p className="text-slate-300">
          The diagram above illustrates the key difference between magnitude and intensity.
          Magnitude refers to the fixed amount of energy released at the earthquake's source (epicenter).
          Intensity, on the other hand, describes the level of shaking and damage experienced at different locations.
          As you can see, the intensity is higher in City A, which is closer to the epicenter, and lower in City B, which is farther away.
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
