// src/pages/learn/MagnitudeVsIntensityPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';

const MagnitudeVsIntensityPage = () => {
  return (
    <>
      <title>Earthquake Magnitude vs. Intensity | Understanding Seismic Measurements - Earthquakes Live</title>
      <meta name="description" content="Learn the difference between earthquake magnitude (energy released) and intensity (shaking felt). Understand how seismic events are measured and reported with Earthquakes Live." />
      <link rel="canonical" href="https://earthquakeslive.com/learn/magnitude-vs-intensity" />
      <meta name="keywords" content="earthquake magnitude, earthquake intensity, seismic measurement, richter scale, mercalli scale, understanding earthquakes, seismology basics, earthquakes live" />
      <meta property="og:title" content="Earthquake Magnitude vs. Intensity | Understanding Seismic Measurements - Earthquakes Live" />
      <meta property="og:description" content="Learn the difference between earthquake magnitude (energy released) and intensity (shaking felt). Understand how seismic events are measured and reported." />
      <meta property="og:url" content="https://earthquakeslive.com/learn/magnitude-vs-intensity" />
      <meta property="og:type" content="article" />
      <meta property="og:site_name" content="Earthquakes Live" />
      <meta property="og:image" content="https://earthquakeslive.com/social-learn-mag-vs-intensity.png" />
      <meta property="og:locale" content="en_US" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@builtbyvibes" />
      <meta name="twitter:title" content="Earthquake Magnitude vs. Intensity | Understanding Seismic Measurements - Earthquakes Live" />
      <meta name="twitter:description" content="Learn the difference between earthquake magnitude (energy released) and intensity (shaking felt). Understand how seismic events are measured and reported." />
      <meta name="twitter:image" content="https://earthquakeslive.com/social-learn-mag-vs-intensity.png" />
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
