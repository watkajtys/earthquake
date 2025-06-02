import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

// Create the context
const UIStateContext = createContext();

// Create a provider component
export const UIStateProvider = ({ children }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeSidebarView, setActiveSidebarView_internal] = useState(
        searchParams.get('sidebarActiveView') || 'overview_panel'
    );

    // Effect to update state if URL changes (e.g., browser back/forward)
    useEffect(() => {
        const currentQueryParam = searchParams.get('sidebarActiveView');
        if (currentQueryParam && currentQueryParam !== activeSidebarView) {
            setActiveSidebarView_internal(currentQueryParam);
        }
        // If the param is removed or empty, and state is not the default, reset.
        // This depends on desired behavior: should clearing param reset view or keep last state?
        // For now, if param is gone, we don't change the state from here,
        // changeSidebarView handles setting it to default if view is empty.
    }, [searchParams, activeSidebarView]);

    const changeSidebarView = useCallback((view) => {
        const newView = view || 'overview_panel'; // Default to overview_panel if view is null/empty
        setActiveSidebarView_internal(newView);
        if (searchParams.get('sidebarActiveView') !== newView) {
            setSearchParams(prevParams => {
                const newSearchQuery = new URLSearchParams(prevParams);
                newSearchQuery.set('sidebarActiveView', newView);
                return newSearchQuery;
            });
        }
    }, [setSearchParams, searchParams]);

    // Value to be passed to consuming components
    const value = {
        activeSidebarView,
        setActiveSidebarView: changeSidebarView, // Expose the combined state and URL updater
        // Direct setter is not exposed to enforce using changeSidebarView for URL sync
    };

    return (
        <UIStateContext.Provider value={value}>
            {children}
        </UIStateContext.Provider>
    );
};

// Custom hook to use the UIState context
export const useUIState = () => {
    const context = useContext(UIStateContext);
    if (context === undefined) {
        throw new Error('useUIState must be used within a UIStateProvider');
    }
    return context;
};
