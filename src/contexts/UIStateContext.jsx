import React, { createContext, useState, useContext, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

// Create the context
const UIStateContext = createContext();

// Custom hook to use the UIState context
export const useUIState = () => {
    const context = useContext(UIStateContext);
    if (!context) {
        throw new Error('useUIState must be used within a UIStateProvider');
    }
    return context;
};

// Provider component
export const UIStateProvider = ({ children }) => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const [activeSidebarView, setActiveSidebarView_internal] = useState(searchParams.get('sidebarActiveView') || 'overview_panel');
    const [globeFocusLng, setGlobeFocusLng_internal] = useState(0);

    const setActiveSidebarView = useCallback((viewName) => {
        setActiveSidebarView_internal(viewName);
        setSearchParams(prevParams => {
            const newParams = new URLSearchParams(prevParams);
            newParams.set('sidebarActiveView', viewName);
            return newParams;
        });
    }, [setSearchParams]);

    const setGlobeFocusLng = useCallback((longitude) => {
        setGlobeFocusLng_internal(longitude);
    }, []);

    const showEarthquakeDetails = useCallback((quake) => {
        const detailUrl = quake?.properties?.detail || quake?.properties?.url;
        if (detailUrl) {
            navigate(`/quake/${encodeURIComponent(detailUrl)}`);
        } else {
            console.warn("No detail URL for earthquake:", quake?.id, quake);
            // Consider a user-facing notification strategy for production
            alert(`Earthquake: M ${quake?.properties?.mag?.toFixed(1)} - ${quake?.properties?.place || 'Unknown location'}. No further details link available.`);
        }
    }, [navigate]);

    const showClusterDetails = useCallback((clusterData) => {
        // Assuming clusterData has an 'id' property suitable for the URL
        if (clusterData?.id) {
            navigate(`/cluster/${clusterData.id}`);
        } else {
            console.warn("No ID for cluster:", clusterData);
            alert("Cannot display cluster details: Cluster ID missing.");
        }
    }, [navigate]);

    const closeDetails = useCallback(() => {
        navigate(-1); // Go back to the previous page
    }, [navigate]);

    const value = {
        activeSidebarView,
        setActiveSidebarView,
        globeFocusLng,
        setGlobeFocusLng,
        showEarthquakeDetails,
        showClusterDetails,
        closeDetails,
    };

    return (
        <UIStateContext.Provider value={value}>
            {children}
        </UIStateContext.Provider>
    );
};
