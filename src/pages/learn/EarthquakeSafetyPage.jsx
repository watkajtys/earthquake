// src/pages/learn/EarthquakeSafetyPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import SeoMetadata from '../../components/SeoMetadata';

/**
 * Renders the "Earthquake Safety" learning page.
 * This page will offer practical advice and safety tips for preparing for,
 * surviving, and recovering from an earthquake.
 * It includes SEO metadata and a link back to the main learning page.
 *
 * @component
 * @returns {JSX.Element} The EarthquakeSafetyPage component.
 */
const EarthquakeSafetyPage = () => {
  return (
    <>
      <SeoMetadata
        title="Earthquake Safety Tips | Learn | Seismic Monitor"
        description="Learn essential earthquake safety tips, including how to prepare your home, what to do during an earthquake, and how to stay safe after a seismic event."
        keywords="earthquake safety, earthquake preparedness, what to do in an earthquake, earthquake survival tips, emergency kit, drop cover and hold on, learn seismology"
        pageUrl="https://earthquakeslive.com/learn/earthquake-safety"
        canonicalUrl="https://earthquakeslive.com/learn/earthquake-safety"
        type="article"
      />
      <div className="p-3 md:p-4 space-y-4 text-slate-200 max-w-3xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-indigo-400">
          Earthquake Safety
        </h1>
        <div className="space-y-4 text-slate-300">
          <p>
            Earthquakes can strike without warning, making preparation and knowledge essential for your safety.
            Knowing what to do before, during, and after an earthquake can significantly reduce the risk of injury
            and property damage. Here are some fundamental safety tips.
          </p>
          <h2 className="text-xl md:text-2xl font-bold text-indigo-400 pt-2">Before an Earthquake: Be Prepared</h2>
          <ul className="list-disc list-inside pl-4 space-y-2">
            <li>
              <strong>Secure Your Space:</strong> Fasten shelves securely to walls. Place large or heavy objects
              on lower shelves. Secure heavy furniture like bookcases and refrigerators to the walls.
            </li>
            <li>
              <strong>Create a Plan:</strong> Identify safe spots in each room (under a sturdy table or desk).
              Establish a meeting point for your family if you get separated.
            </li>
            <li>
              <strong>Emergency Kit:</strong> Assemble an emergency kit that includes water, non-perishable food,
              a flashlight, a first-aid kit, a whistle to signal for help, and any necessary medications.
            </li>
            <li>
              <strong>Know Your Home:</strong> Learn how to turn off the main gas, water, and electricity valves in your home.
            </li>
          </ul>
          <h2 className="text-xl md:text-2xl font-bold text-indigo-400 pt-2">During an Earthquake: Drop, Cover, and Hold On</h2>
          <p>
            This simple yet effective technique is your best defense during an earthquake.
          </p>
          <ul className="list-disc list-inside pl-4 space-y-2">
            <li>
              <strong>DROP</strong> to your hands and knees. This position prevents you from being knocked down
              and allows you to crawl to shelter.
            </li>
            <li>
              <strong>COVER</strong> your head and neck with one arm and hand. If a sturdy table or desk is nearby,
              crawl beneath it for shelter. If not, crawl next to an interior wall (away from windows).
            </li>
            <li>
              <strong>HOLD ON</strong> to your shelter (or your head and neck) until the shaking stops. Be prepared
              to move with your shelter if the shaking shifts it around.
            </li>
          </ul>
          <p>
            If you are outdoors, stay there and move away from buildings, streetlights, and utility wires.
            If you are in a vehicle, stop as quickly as safety permits and stay in the vehicle. Avoid stopping
            near or under buildings, trees, overpasses, and utility wires.
          </p>
          <h2 className="text-xl md:text-2xl font-bold text-indigo-400 pt-2">After an Earthquake: Stay Safe</h2>
          <ul className="list-disc list-inside pl-4 space-y-2">
            <li>
              <strong>Check for Injuries:</strong> Check yourself and others for injuries. Provide first aid for
              anyone who needs it.
            </li>
            <li>
              <strong>Check for Hazards:</strong> Look for and extinguish small fires. Check for gas leaks—if you
              smell gas or hear a blowing or hissing noise, open a window and leave the building. Turn off the
              gas at the outside main valve if you can and call the gas company from a safe location.
            </li>
            <li>
              <strong>Expect Aftershocks:</strong> These are smaller earthquakes that can occur in the hours, days,
              or even weeks after the main event. Be prepared to Drop, Cover, and Hold On again.
            </li>
            <li>
              <strong>Stay Informed:</strong> Use a battery-operated radio or your phone to listen for emergency
              updates and instructions from local authorities.
            </li>
          </ul>
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

export default EarthquakeSafetyPage;
