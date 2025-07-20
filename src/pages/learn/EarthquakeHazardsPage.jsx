// src/pages/learn/EarthquakeHazardsPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import SeoMetadata from '../../components/SeoMetadata';

/**
 * Renders the "Earthquake Hazards & Safety" learning page.
 * This page provides valuable, practical information for users.
 *
 * @component
 * @returns {JSX.Element} The EarthquakeHazardsPage component.
 */
const EarthquakeHazardsPage = () => {
  return (
    <>
      <SeoMetadata
        title="Earthquake Hazards & Safety | Learn | Seismic Monitor"
        description="Learn about the various hazards associated with earthquakes and how to stay safe."
        keywords="earthquake hazards, earthquake safety, ground shaking, liquefaction, landslides, tsunamis, drop cover hold on, earthquake preparedness"
        pageUrl="https://earthquakeslive.com/learn/earthquake-hazards"
        canonicalUrl="https://earthquakeslive.com/learn/earthquake-hazards"
        type="article"
      />
      <div className="p-3 md:p-4 space-y-4 text-slate-200 max-w-3xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-indigo-400">
          Earthquake Hazards & Safety
        </h1>

        <section>
          <h2 className="text-xl md:text-2xl font-semibold text-indigo-300 mt-6 mb-2">Primary Hazards</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-indigo-400">Ground Shaking</h3>
              <p>The most familiar hazard, ground shaking, is caused by seismic waves. The intensity of shaking depends on the earthquake's magnitude, distance from the epicenter, and local soil conditions. It can cause buildings and bridges to collapse, and is the primary cause of earthquake-related damage.</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-indigo-400">Liquefaction</h3>
              <p>In areas with water-saturated soil, intense shaking can cause the soil to behave like a liquid. This process, called liquefaction, can cause buildings, roads, and pipelines to sink or tilt.</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-indigo-400">Landslides</h3>
              <p>Earthquake shaking can trigger landslides and rockfalls in hilly or mountainous areas. This can bury homes, block roads, and dam rivers.</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-indigo-400">Tsunamis</h3>
              <p>A tsunami is a series of large ocean waves caused by a major undersea earthquake. These waves can travel thousands of miles and cause immense destruction along coastlines.</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl md:text-2xl font-semibold text-indigo-300 mt-6 mb-2">Safety Measures: Drop, Cover, and Hold On</h2>
          <p>In most situations, the greatest danger is from falling objects. The recommended safety action is:</p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li><strong>DROP</strong> to your hands and knees.</li>
            <li><strong>COVER</strong> your head and neck under a sturdy table or desk.</li>
            <li><strong>HOLD ON</strong> to your shelter until the shaking stops.</li>
          </ul>
        </section>

        <div className="mt-6">
          <Link to="/learn" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            &larr; Back to Learn Topics
          </Link>
        </div>
      </div>
    </>
  );
};

export default EarthquakeHazardsPage;
