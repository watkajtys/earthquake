// src/pages/learn/PlateTectonicsPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import SeoMetadata from '../../components/SeoMetadata';

/**
 * Renders the "Plate Tectonics and Earthquakes" learning page.
 * Currently, this page serves as a placeholder indicating that content is "coming soon".
 * It includes SEO metadata relevant to the topic and a link to navigate back
 * to the main "Learn About Earthquakes" page.
 * This component takes no direct props.
 *
 * @component
 * @returns {JSX.Element} The PlateTectonicsPage component.
 */
const PlateTectonicsPage = () => {
  return (
    <>
      <SeoMetadata
        title="Plate Tectonics and Earthquakes | Learn | Seismic Monitor"
        description="Explore the fundamental connection between plate tectonics, fault lines, and the generation of earthquakes around the globe. Learn how the Earth's plates move and cause seismic events."
        keywords="plate tectonics, fault lines, earthquakes, tectonic plates, seismic activity, earth science, learn seismology, convergent boundaries, divergent boundaries, transform boundaries, subduction zones"
        pageUrl="https://earthquakeslive.com/learn/plate-tectonics"
        canonicalUrl="https://earthquakeslive.com/learn/plate-tectonics"
        type="article"
      />
      <div className="p-3 md:p-4 space-y-4 text-slate-200 max-w-3xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-indigo-400">
          Plate Tectonics and Earthquakes
        </h1>
        <div className="space-y-4">
          <p className="text-lg">
            The Earth's surface is not a single, solid piece. It's a dynamic mosaic of massive, rigid plates called tectonic plates. These plates are in constant, slow-motion, moving at rates of a few centimeters per year. The scientific theory that describes this movement and its consequences is known as plate tectonics. This movement is the primary cause of most earthquakes worldwide.
          </p>

          <h2 className="text-xl md:text-2xl font-semibold text-indigo-300 pt-2">What Are Tectonic Plates?</h2>
          <p>
            The Earth's outermost layer, the lithosphere, is broken into about a dozen major plates and many minor ones. These plates float on the semi-fluid asthenosphere below, allowing them to move. Most plates are composed of both thinner, denser oceanic crust and thicker, more buoyant continental crust.
          </p>

          <h2 className="text-xl md:text-2xl font-semibold text-indigo-300 pt-2">How Plate Movement Causes Earthquakes</h2>
          <p>
            Earthquakes occur at the boundaries where these plates interact. The stress that builds up from the friction between moving plates is eventually released in the form of seismic waves, which we feel as an earthquake. There are three main types of plate boundaries:
          </p>

          <div className="pl-4 space-y-3">
            <div>
              <h3 className="text-lg font-semibold text-indigo-400">1. Convergent Boundaries</h3>
              <p className="mt-1">
                Where two plates collide. The outcome depends on the types of crust involved. When an oceanic plate collides with a continental plate, the denser oceanic plate is forced to sink into the mantle in a process called subduction. This process creates some of the most powerful earthquakes, known as megathrust earthquakes, in subduction zones like the Pacific Ring of Fire. When two continental plates collide, they crumple and fold, forming vast mountain ranges like the Himalayas.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-indigo-400">2. Divergent Boundaries</h3>
              <p className="mt-1">
                Where two plates pull away from each other. As the plates separate, magma from the mantle rises to the surface, creating new crust. This process is most common at mid-ocean ridges, such as the Mid-Atlantic Ridge. Earthquakes at divergent boundaries are frequent but are typically shallow and less powerful than those at convergent boundaries.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-indigo-400">3. Transform Boundaries</h3>
              <p className="mt-1">
                Where two plates slide horizontally past one another. The motion is not smooth; the plates are locked together by friction. As they try to move, strain builds up over long periods and is then released in abrupt, powerful earthquakes. The San Andreas Fault in California is a famous example of a transform boundary.
              </p>
            </div>
          </div>

          <p className="pt-4">
            By understanding plate tectonics, we can better comprehend why earthquakes are concentrated in specific regions of the world and prepare for their impacts.
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

export default PlateTectonicsPage;
