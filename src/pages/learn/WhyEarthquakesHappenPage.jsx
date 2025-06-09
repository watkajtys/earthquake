import React, { useState, useEffect } from 'react';
import './WhyEarthquakesHappenPage.css';
import TectonicPlatesGlobeView from '../../components/TectonicPlatesGlobeView.jsx';
import StickSlipAnimation from '../../components/animations/StickSlipAnimation.jsx';
import MantleConvectionAnimation from '../../components/animations/MantleConvectionAnimation.jsx';
import coastlineData from '../../assets/ne_110m_coastline.json'; // Corrected path

const WhyEarthquakesHappenPage = () => {
  const [tectonicPlatesData, setTectonicPlatesData] = useState(null);

  useEffect(() => {
    // Fetch Tectonic Plate Boundaries
    fetch('/src/assets/TectonicPlateBoundaries.json') // Assuming it's in public or served statically
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok for TectonicPlateBoundaries.json');
        }
        return response.json();
      })
      .then(data => {
        setTectonicPlatesData(data);
      })
      .catch(error => {
        console.error('Error fetching TectonicPlateBoundaries.json:', error);
        setTectonicPlatesData({ type: "FeatureCollection", features: [] }); // Set to empty valid GeoJSON
      });
  }, []);

  return (
    <div className="learn-page-container">
      <h1>Page 1: The Big Picture: Why Do Earthquakes Happen?</h1>

      <p>
        Imagine the Earth's surface not as a single, solid shell, but as a giant jigsaw puzzle made of massive, rigid pieces called tectonic plates. These plates are constantly in motion, albeit incredibly slowly – about the speed your fingernails grow! They float on the semi-molten layer beneath them, the mantle. Earthquakes typically occur at the boundaries of these plates, where they interact in various ways: colliding, pulling apart, or sliding past each other. This movement isn't smooth. The edges of plates are rough, and they can get stuck while the rest of the plate keeps moving.
      </p>

      <div id="animation-drifting-continents-placeholder" style={{ height: '500px', width: '100%'}}>
        {tectonicPlatesData && coastlineData ? (
          <TectonicPlatesGlobeView
            coastlineGeoJson={coastlineData}
            tectonicPlatesGeoJson={tectonicPlatesData}
            enableAutoRotation={true}
            globeAutoRotateSpeed={0.3}
            defaultFocusAltitude={2.0}
          />
        ) : (
          <p>Loading map data...</p>
        )}
      </div>
      <h2>Animation Prompt 1: The Drifting Continents</h2>
      <blockquote>
        Visualize the Earth's major tectonic plates (e.g., Pacific, North American, Eurasian, African, Indo-Australian, Antarctic, South American). Show them slowly drifting over millions of years. Highlight the plate boundaries. Depict arrows indicating the general direction of movement for each plate. Briefly show different types of plate interactions at these boundaries: convergent (colliding), divergent (pulling apart), and transform (sliding past). End with a focus on a subduction zone (where one plate dives beneath another) as a common site for powerful earthquakes.
      </blockquote>

      <h2>The Slow Buildup to a Sudden Shake</h2>
      <p>
        When plates get stuck, the relentless motion of the rest of the plate builds up stress in the rocks along the stuck boundary. Think of it like bending a stick. You can bend it for a while, and it stores energy. But if you bend it too far, it snaps. Similarly, rocks can only accumulate so much stress. When the stress exceeds the strength of the rocks, they suddenly break and slip along a fault line. This sudden release of stored energy sends out seismic waves, which are the vibrations we feel as an earthquake. The longer the plates remain stuck, the more stress accumulates, and the more powerful the eventual earthquake can be.
      </p>

      <div id="animation-stress-release-placeholder">
        <StickSlipAnimation />
      </div>
      <h3>Animation Prompt 2: The Stress-and-Release Cycle</h3>
      <blockquote>
        Illustrate two tectonic plates trying to slide past each other (transform boundary) or one pushing under another (convergent boundary). Show them getting stuck (locked). As time passes, depict energy (stress) visually building up in the rocks around the locked section – perhaps as a growing intensity of color or a visible deformation of the rock layers. Suddenly, show the rocks breaking and the plates lurching past each other. Radiating lines or waves should emanate from the rupture point (hypocenter) to represent seismic waves.
      </blockquote>

      <h2>The Engine Room: What Drives the Plates?</h2>
      <p>
        What keeps these colossal plates in motion? The primary driver is the Earth's internal heat. The core of the Earth is incredibly hot, and this heat creates convection currents in the mantle, the semi-molten layer beneath the plates. Think of it like a pot of water simmering on a stove. The hot water rises, spreads out, cools, and then sinks, creating a circular motion. In the mantle, hot, less dense rock material rises, moves sideways beneath the plates, and then cools and sinks back down. This slow but powerful churning motion drags the overlying tectonic plates along with it. Other contributing factors include "ridge push" (gravitational force pushing plates away from elevated mid-ocean ridges) and "slab pull" (gravitational force pulling denser, sinking plates down into the mantle at subduction zones).
      </p>

      <div id="animation-mantle-convection-placeholder">
        <MantleConvectionAnimation />
      </div>
      <h3>Animation Prompt 3: Mantle Convection Engine</h3>
      <blockquote>
        Show a cross-section of the Earth, revealing the core, mantle, and crust (with tectonic plates). Illustrate convection cells in the mantle: hot material rising from near the core, spreading under the plates, cooling, and sinking. Depict how these currents drag the tectonic plates on the surface. Optionally, add representations of ridge push (magma upwelling at mid-ocean ridges pushing plates apart) and slab pull (a dense oceanic plate sinking into the mantle and pulling the rest of the plate with it).
      </blockquote>
    </div>
  );
};

export default WhyEarthquakesHappenPage;
