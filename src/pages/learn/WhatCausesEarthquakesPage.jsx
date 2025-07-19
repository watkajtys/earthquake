// src/pages/learn/WhatCausesEarthquakesPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import SeoMetadata from '../../components/SeoMetadata';

/**
 * Renders the "What Causes Earthquakes?" learning page.
 * This page will provide a detailed explanation of the geological processes
 * that lead to earthquakes, focusing on fault lines and the release of tectonic stress.
 * It includes SEO metadata and a link back to the main learning page.
 *
 * @component
 * @returns {JSX.Element} The WhatCausesEarthquakesPage component.
 */
const WhatCausesEarthquakesPage = () => {
  return (
    <>
      <SeoMetadata
        title="What Causes Earthquakes? | Learn | Seismic Monitor"
        description="Learn about the primary causes of earthquakes, from the movement of tectonic plates to the sudden release of energy along fault lines."
        keywords="what causes earthquakes, earthquake origins, fault lines, tectonic stress, seismic waves, geology for beginners, learn seismology"
        pageUrl="https://earthquakeslive.com/learn/what-causes-earthquakes"
        canonicalUrl="https://earthquakeslive.com/learn/what-causes-earthquakes"
        type="article"
      />
      <div className="p-3 md:p-4 space-y-4 text-slate-200 max-w-3xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-indigo-400">
          What Causes Earthquakes?
        </h1>
        <div className="space-y-4 text-slate-300">
          <p>
            Earthquakes are one of the most powerful and destructive natural forces on our planet.
            At its core, an earthquake is the result of a sudden release of energy in the Earth's
            crust, which creates seismic waves. But what causes this process to happen?
          </p>
          <h2 className="text-xl md:text-2xl font-bold text-indigo-400 pt-2">The Role of Tectonic Plates</h2>
          <p>
            The Earth's outer shell, the lithosphere, is not a single, unbroken piece. Instead, it is
            divided into several large and small sections called tectonic plates. These plates are
            constantly in motion, floating on the semi-fluid asthenosphere beneath them. They move
            at incredibly slow speeds, typically only a few centimeters per year—about the same rate
            your fingernails grow.
          </p>
          <p>
            These plates can interact in several ways: they can collide (a convergent boundary),
            pull apart (a divergent boundary), or slide past each other (a transform boundary).
            It is at these plate boundaries where the vast majority of the world's earthquakes occur.
          </p>
          <h2 className="text-xl md:text-2xl font-bold text-indigo-400 pt-2">Fault Lines: The Epicenter of Action</h2>
          <p>
            As tectonic plates grind against each other, the rock at their edges is subjected to
            immense stress. Because the rock is not smooth, it can get stuck, or "locked," while
            the rest of the plate continues to move. This causes the rock to bend and store
            elastic potential energy, much like a stretched rubber band.
          </p>
          <p>
            A fault is a fracture or zone of fractures between two blocks of rock. When the stress
            on the locked section of a fault becomes too great, it overcomes the friction holding
            it in place, and the rock suddenly slips. This abrupt release of stored energy radiates
            outward in all directions as seismic waves. It is these waves that we feel as an earthquake.
          </p>
          <h2 className="text-xl md:text-2xl font-bold text-indigo-400 pt-2">From Hypocenter to Epicenter</h2>
          <p>
            The point within the Earth where the earthquake rupture starts is called the
            <strong> hypocenter</strong> (or focus). The point directly above it on the surface of the
            Earth is the <strong>epicenter</strong>. The strongest shaking is typically felt at the epicenter
            and diminishes with distance.
          </p>
          <p>
            While the movement of tectonic plates is the primary cause of most earthquakes (tectonic earthquakes),
            they can also be triggered by other events, such as volcanic activity, landslides, and even human
            activities like mining or reservoir-induced seismicity. However, these are generally far less
            powerful than tectonic earthquakes.
          </p>
        </div>
        <div className="mt-6">
          <Link to="/learn" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            &larr; Back to Learn Topics
          </Link>
        </div>
      </div>
    </>
  );
};

export default WhatCausesEarthquakesPage;
