// src/hooks/useMonthlyEarthquakeData.js
import { useContext } from 'react';
import { EarthquakeDataContext } from '../contexts/EarthquakeDataContext';

/**
 * @deprecated This hook is deprecated. Please use `useEarthquakeDataState` from `src/contexts/EarthquakeDataContext.jsx` instead.
 * All monthly data and the `loadMonthlyData` function are now available through `EarthquakeDataContext`.
 * This hook now simply consumes and returns the `EarthquakeDataContext`.
 */
const useMonthlyEarthquakeData = () => {
    const context = useContext(EarthquakeDataContext);
    if (context === null) {
        throw new Error('useMonthlyEarthquakeData must be used within an EarthquakeDataProvider. Ensure your component is wrapped by <EarthquakeDataProvider>.');
    }
    // The context provides all necessary monthly data and the loadMonthlyData function.
    // Components previously using this hook will get the full context value.
    return context;
};

export default useMonthlyEarthquakeData;
