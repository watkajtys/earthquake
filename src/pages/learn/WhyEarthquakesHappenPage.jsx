// src/pages/learn/WhyEarthquakesHappenPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import SeoMetadata from '../../components/SeoMetadata'; // Added import

const WhyEarthquakesHappenPage = () => {
  return (
    <>
      <SeoMetadata
        title="Why Do Earthquakes Happen? The Big Picture | Learn | Seismic Monitor"
        description="Learn about the fundamental reasons behind earthquakes, including plate tectonics, the movement of Earth's lithosphere, and the role of mantle convection."
        keywords="earthquakes, plate tectonics, earth science, seismic activity, lithosphere, asthenosphere, mantle convection, fault lines, earth's structure"
        pageUrl="https://earthquakeslive.com/learn/why-earthquakes-happen"
        canonicalUrl="https://earthquakeslive.com/learn/why-earthquakes-happen"
        type="article"
      />
      <div className="p-3 md:p-4 space-y-4 text-slate-200 max-w-3xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-indigo-400">
          The Big Picture: Why Do Earthquakes Happen?
        </h1>

        <p className="text-slate-300">
          Have you ever looked at a map of the world and noticed how the continents seem to fit together like puzzle pieces? It turns out, that's not a coincidence. Our planet is not a static, solid ball. The ground beneath our feet is a dynamic mosaic of massive, rigid segments that are constantly, slowly, on the move. These movements shape our world, building mountains and carving out oceans. But when these massive pieces of Earth's puzzle push and grind against each other, they unleash the incredible energy we feel as an earthquake.
        </p>

        <h2 className="text-xl md:text-2xl font-semibold text-indigo-400 pt-2">
          Earth's Shifting Jigsaw Puzzle
        </h2>
        <p className="text-slate-300">
          The Earth’s rigid outer layer, called the lithosphere, isn't one solid shell. It's broken into about a dozen major pieces and many smaller ones called tectonic plates. These plates "float" on a hotter, gooier layer of the upper mantle known as the asthenosphere. You can think of it like large, solid rafts drifting on a sea of incredibly thick, slow-moving honey.
        </p>
        <p className="text-slate-300">
          These plates aren't racing around—their movement is incredibly slow, averaging just a few centimeters per year. That’s about the same speed your fingernails grow! But over the vastness of geologic time, this almost imperceptible drift is powerful enough to move entire continents.
        </p>

        <div className="bg-slate-800 p-3 my-3 rounded-md">
          <h3 className="text-lg font-semibold text-indigo-300 mb-2">Animation Prompt 1: The Drifting Continents</h3>
          <code className="block whitespace-pre-wrap text-sm text-slate-400">
            {`// TODO: Implement animation
Style: Smooth, 3D animated global map, visually clean and simple.

Prompt: "Create a seamless looping animation of planet Earth. The continents should be clearly defined. Show the major tectonic plates outlined with glowing lines (e.g., North American Plate, Pacific Plate, Eurasian Plate). Illustrate the direction of plate movement with subtle, animated arrows on each plate. The plates should drift very slowly to show their relative motion. Add labels for the major plates that fade in and out gracefully. The background should be deep space with a few stars."`}
          </code>
        </div>

        <h2 className="text-xl md:text-2xl font-semibold text-indigo-400 pt-2">
          The Slow Buildup to a Sudden Shake
        </h2>
        <p className="text-slate-300">
          If the plates move so slowly, why are earthquakes so sudden and violent?
        </p>
        <p className="text-slate-300">
          Imagine trying to push a heavy piece of furniture across a sticky floor. At first, it doesn't move. You push harder and harder, and the legs of the furniture start to bend and strain under the pressure. All that energy you're using is being stored in the legs. Then, all at once, the friction gives way and the furniture lurches forward with a sudden jolt.
        </p>
        <p className="text-slate-300">
          This is exactly what happens with tectonic plates. As they push against each other, the edges get stuck. For decades, or even centuries, they remain locked together while the rest of the plates continue to move. This slow, steady motion builds up an immense amount of stress and stores elastic energy in the rocks along the boundary, causing them to deform and bend.
        </p>
        <p className="text-slate-300">
          When the built-up stress finally becomes stronger than the friction holding the rocks together, the rocks suddenly break and snap past each other along a fault. That stored energy is released in an instant, sending out waves of energy in all directions. These seismic waves are what we feel as an earthquake.
        </p>

        <div className="bg-slate-800 p-3 my-3 rounded-md">
          <h3 className="text-lg font-semibold text-indigo-300 mb-2">Animation Prompt 2: The Stress-and-Release Cycle</h3>
          <code className="block whitespace-pre-wrap text-sm text-slate-400">
            {`// TODO: Implement animation
Style: Simple 2D diagrammatic animation.

Prompt: "Create a 2D animation showing two blocks of earth side-by-side, representing two tectonic plates at a fault line.

Show arrows indicating the slow, steady opposing motion of the plates. The fault line between them should remain 'stuck.'

As the arrows continue to push, show the blocks bending and deforming slightly, with 'stress energy' visualizing as a glowing, intensifying color within the blocks near the fault.

After a few seconds of building stress, show the blocks suddenly slipping past each other into a new position.

As they slip, the stored 'stress energy' is released as powerful radiating waves that travel outwards from the fault line.

Loop the animation, with a title that reads 'The Stick-Slip Cycle'."`}
          </code>
        </div>

        <h2 className="text-xl md:text-2xl font-semibold text-indigo-400 pt-2">
          The Engine Room: What Drives the Plates?
        </h2>
        <p className="text-slate-300">
          So what is the ultimate force driving this planetary-scale movement? The answer lies deep within the Earth. The planet's core is incredibly hot, and this heat needs to escape. It does so through a process called mantle convection.
        </p>
        <p className="text-slate-300">
          Think of a pot of soup simmering on a stove. The soup at the bottom gets hot, expands, becomes less dense, and rises. When it reaches the surface, it cools, becomes denser, and sinks back down, only to be heated and rise again. This creates a circular motion called a convection current.
        </p>
        <p className="text-slate-300">
          Deep inside the Earth, the mantle behaves like this simmering soup, just on a geological timescale of millions of years. These enormous, slow-moving convection currents in the asthenosphere exert a powerful drag on the tectonic plates above, pulling and pushing them across the globe. Our planet is, in essence, a giant heat engine, and earthquakes are one of the most dramatic expressions of this internal power.
        </p>

        <div className="bg-slate-800 p-3 my-3 rounded-md">
          <h3 className="text-lg font-semibold text-indigo-300 mb-2">Animation Prompt 3: Mantle Convection Engine</h3>
          <code className="block whitespace-pre-wrap text-sm text-slate-400">
            {`// TODO: Implement animation
Style: 3D cross-section of the Earth.

Prompt: "Create an animated 3D cross-section of the Earth.

Show the layers: inner core, outer core, mantle, and crust (lithosphere). Label each one.

In the mantle, visualize large, slow, circular convection currents. Use red/orange arrows to show hot material rising from near the core and blue arrows to show cooler material sinking from below the crust.

On the surface, show the crust broken into tectonic plates.

Illustrate how the motion of the convection currents below causes the plates on top to move, pulling them apart in some places and pushing them together in others.

The animation should be a continuous, slow loop to emphasize the constant nature of this process."`}
          </code>
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

export default WhyEarthquakesHappenPage;
