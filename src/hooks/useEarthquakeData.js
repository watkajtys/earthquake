// src/hooks/useEarthquakeData.js
import { useContext } from 'react';
import { EarthquakeDataContext } from '../contexts/EarthquakeDataContext';

/**
 * @deprecated This hook is deprecated. Please use `useEarthquakeDataState` from `src/contexts/EarthquakeDataContext.jsx` instead.
 * This hook now simply consumes and returns the `EarthquakeDataContext`.
 */
const useEarthquakeData = () => {
    const context = useContext(EarthquakeDataContext);
    if (context === null) {
        throw new Error('useEarthquakeData must be used within an EarthquakeDataProvider. Ensure your component is wrapped by <EarthquakeDataProvider>.');
    }
    // The context already provides all the necessary values.
    // Components previously using this hook will get the full context value.
    // Specific selectors can be implemented in components if needed, or a new selector hook can be created.
    // For this task, it returns the whole context as per the direction that useEarthquakeDataState() gets all data.
    return context; 
};

export default useEarthquakeData;
