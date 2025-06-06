// src/pages/LearnPage.jsx
import React, { useState, useEffect, useMemo } from 'react'; // Added useState, useEffect, useMemo
import SeoMetadata from '../components/SeoMetadata';
import InfoSnippet from '../components/InfoSnippet';
import PSWaveAnimationMap from '../components/PSWaveAnimationMap';
import { useUIState } from '../contexts/UIStateContext';
import { MAJOR_CITIES } from '../utils/majorCities';
import { calculateDistance } from '../utils/seismicUtils';

// Define the fallback earthquake (2011 Tohoku)
const fallbackEarthquake = {
    id: 'usp000hvnu', // Official USGS ID for the M9.1 event
    geometry: {
        coordinates: [142.373, 38.297, 24.0], // Lon, Lat, Depth (km)
    },
    properties: {
        mag: 9.1,
        time: new Date('2011-03-11T05:46:23Z').getTime(), // UTC time
        title: 'Fallback: 2011 Tohoku Earthquake, Japan (M9.1)',
        place: 'near the east coast of Honshu, Japan'
    }
};

const getNearbyCities = (epicenterLat, epicenterLon, citiesList, count = 5) => {
    if (!epicenterLat || !epicenterLon || !citiesList) return [];
    const citiesWithDistances = citiesList.map(city => ({
        ...city,
        distance: calculateDistance(epicenterLat, epicenterLon, city.latitude, city.longitude)
    }));

    citiesWithDistances.sort((a, b) => a.distance - b.distance);

    return citiesWithDistances.slice(0, count).map(city => ({
        id: city.name.replace(/\s+/g, '-').toLowerCase(), // simple ID
        name: city.name,
        position: [city.latitude, city.longitude]
    }));
};

const LearnPage = () => {
    const { currentEarthquakeForAnimation } = useUIState();
    const [nearbyStations, setNearbyStations] = useState([]);

    const earthquakeToDisplay = useMemo(() => {
        return currentEarthquakeForAnimation || fallbackEarthquake;
    }, [currentEarthquakeForAnimation]);

    useEffect(() => {
        if (earthquakeToDisplay && earthquakeToDisplay.geometry && earthquakeToDisplay.geometry.coordinates) {
            const [lon, lat] = earthquakeToDisplay.geometry.coordinates; // lon, lat
            const stations = getNearbyCities(lat, lon, MAJOR_CITIES, 5);
            setNearbyStations(stations);
        }
    }, [earthquakeToDisplay]);

    return (
        <>
            <SeoMetadata
                title="Learn About Earthquakes | Seismic Science & P&S Wave Animation" // Updated title
                description="Understand earthquake science: P&S wave travel time animations, magnitude, depth, fault types, seismic waves, PAGER alerts, and how to interpret earthquake data." // Updated description
                keywords="P&S wave animation, earthquake science, seismology basics, earthquake magnitude, earthquake depth, fault types, seismic waves, PAGER alerts, earthquake education, seismology terms" // Updated keywords
                pageUrl="https://earthquakeslive.com/learn"
                canonicalUrl="https://earthquakeslive.com/learn"
                locale="en_US"
                type="website"
            />
            <div className="p-3 md:p-4 h-full space-y-4 text-slate-200 lg:overflow-y-auto"> {/* Ensure lg:hidden is removed for visibility */}
                <h2 className="text-lg font-semibold text-indigo-400 sticky top-0 bg-slate-900 py-2 z-10 -mx-3 px-3 sm:-mx-4 sm:px-4 border-b border-slate-700">
                    Learn About Earthquakes
                </h2>

                <section className="bg-slate-800 p-4 rounded-lg shadow">
                    <h3 className="text-md font-semibold text-indigo-300 mb-2">P & S Wave Travel Time Animation</h3>
                    <p className="text-xs text-slate-400 mb-1">
                        This animation demonstrates how P-waves (Primary) and S-waves (Secondary) travel from an earthquake's hypocenter.
                        P-waves are faster. S-waves are slower. The time difference helps locate the quake.
                    </p>
                    {earthquakeToDisplay.properties.title.startsWith("Fallback:") && (
                        <p className="text-xs text-slate-500 mb-3">
                            Displaying fallback example: {earthquakeToDisplay.properties.title.replace("Fallback: ", "")}.
                            View a specific earthquake's details and return here to see its P&S wave animation.
                        </p>
                    )}
                    {!earthquakeToDisplay.properties.title.startsWith("Fallback:") && (
                         <p className="text-xs text-slate-500 mb-3">
                            Displaying animation for: {earthquakeToDisplay.properties.title}.
                        </p>
                    )}
                    <PSWaveAnimationMap earthquake={earthquakeToDisplay} stations={nearbyStations} />
                </section>

                {/* Existing InfoSnippets */}
                <InfoSnippet topic="magnitude" />
                <InfoSnippet topic="depth" />
                <InfoSnippet topic="intensity" />
                <InfoSnippet topic="alerts" />
                <InfoSnippet topic="strike"/>
                <InfoSnippet topic="dip"/>
                <InfoSnippet topic="rake"/>
                <InfoSnippet topic="stressAxes"/>
                <InfoSnippet topic="beachball"/>
                <InfoSnippet topic="stationsUsed"/>
                <InfoSnippet topic="azimuthalGap"/>
                <InfoSnippet topic="rmsError"/>
                {/* ... other content from /learn route ... */}
            </div>
        </>
    );
};

export default LearnPage;
