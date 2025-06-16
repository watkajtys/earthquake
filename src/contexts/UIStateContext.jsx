import React, { useState, useContext, useCallback, useEffect } from 'react'; // Removed createContext
import { useSearchParams } from 'react-router-dom';
import { UIStateContext } from './uiStateContextUtils.js'; // Import the context object

/**
 * Provides UI state to its children components via the UIStateContext.
 * It manages several pieces of UI state:
 * - `activeSidebarView`: The currently active view/panel in the sidebar. Synced with URL search parameter `sidebarActiveView`.
 * - `activeFeedPeriod`: The currently selected earthquake feed period (e.g., 'last_24_hours'). Synced with URL search parameter `activeFeedPeriod`.
 * - `globeFocusLng`: The target longitude for focusing the interactive globe. Not URL synced.
 * - `focusedNotableQuake`: Data object for a notable earthquake that should be highlighted or focused. Not URL synced.
 *
 * The provider uses `useState` for managing these states and `useSearchParams` from `react-router-dom`
 * to read initial values from and sync changes back to the URL for relevant states.
 * Setter functions for these states are memoized using `useCallback`.
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {React.ReactNode} props.children - The child components that will have access to this context.
 * @returns {JSX.Element} The UIStateProvider component.
 */
export const UIStateProvider = ({ children }) => {
    const [searchParams, setSearchParams] = useSearchParams();

    // Sidebar View State
    const [activeSidebarView, setActiveSidebarView_internal] = useState(
        searchParams.get('sidebarActiveView') || 'overview_panel'
    );
    const [activeFeedPeriod, setActiveFeedPeriod_internal] = useState(
        searchParams.get('activeFeedPeriod') || 'last_24_hours'
    );
    const [globeFocusLng, setGlobeFocusLng_internal] = useState(0);
    const [focusedNotableQuake, setFocusedNotableQuake_internal] = useState(null);

    // PERFORMANCE & SYNC NOTE:
    // This effect synchronizes the 'activeSidebarView' state FROM the URL search parameters.
    // It intentionally only depends on 'searchParams'. This ensures that changes triggered
    // by browser navigation (back/forward buttons) or direct URL manipulation update the state.
    // Programmatic changes to sidebar view initiated by the app (e.g., button clicks)
    // are handled by 'changeSidebarView', which updates both the internal state
    // and the URL search parameters. Keeping 'activeSidebarView' out of the dependency array
    // here prevents potential redundant state updates if 'searchParams' and 'activeSidebarView'
    // were to update in a way that re-triggers this effect unnecessarily.
    // Effect to update activeSidebarView from URL search parameter.
    useEffect(() => {
        const currentQueryParam = searchParams.get('sidebarActiveView');
        if (currentQueryParam && currentQueryParam !== activeSidebarView) {
            setActiveSidebarView_internal(currentQueryParam);
        }
    }, [searchParams]);

    /**
     * Changes the active sidebar view and updates the URL search parameter.
     * @param {string} view - The identifier for the new sidebar view. Defaults to 'overview_panel'.
     */
    const changeSidebarView = useCallback((view) => {
        const newView = view || 'overview_panel';
        setActiveSidebarView_internal(newView);
        if (searchParams.get('sidebarActiveView') !== newView) {
            setSearchParams(prevParams => {
                const newSearchQuery = new URLSearchParams(prevParams);
                newSearchQuery.set('sidebarActiveView', newView);
                return newSearchQuery;
            }, { replace: true });
        }
    }, [setSearchParams, searchParams]);

    // PERFORMANCE & SYNC NOTE:
    // This effect synchronizes the 'activeFeedPeriod' state FROM the URL search parameters.
    // It intentionally only depends on 'searchParams'. This ensures that changes triggered
    // by browser navigation or direct URL manipulation update the state.
    // Programmatic changes to the feed period initiated by the app
    // are handled by 'changeActiveFeedPeriod', which updates both the internal state
    // and the URL search parameters. Keeping 'activeFeedPeriod' out of the dependency array
    // here prevents potential redundant state updates.
    // Effect to update activeFeedPeriod from URL search parameter.
    useEffect(() => {
        const currentQueryParam = searchParams.get('activeFeedPeriod');
        if (currentQueryParam && currentQueryParam !== activeFeedPeriod) {
            setActiveFeedPeriod_internal(currentQueryParam);
        }
    }, [searchParams]);

    /**
     * Changes the active earthquake feed period and updates the URL search parameter.
     * @param {string} period - The identifier for the new feed period. Defaults to 'last_24_hours'.
     */
    const changeActiveFeedPeriod = useCallback((period) => {
        const newPeriod = period || 'last_24_hours';
        setActiveFeedPeriod_internal(newPeriod);
        if (searchParams.get('activeFeedPeriod') !== newPeriod) {
            setSearchParams(prevParams => {
                const newSearchQuery = new URLSearchParams(prevParams);
                newSearchQuery.set('activeFeedPeriod', newPeriod);
                return newSearchQuery;
            }, { replace: true });
        }
    }, [setSearchParams, searchParams]);

    /**
     * Sets the target longitude for focusing the interactive globe. This state is not synced with URL.
     * @param {number} lng - The longitude value.
     */
    const setGlobeFocusLng = useCallback((lng) => {
        setGlobeFocusLng_internal(lng);
    }, []);

    /**
     * Sets the data for a notable earthquake to be focused/highlighted. This state is not synced with URL.
     * @param {Object|null} quake - The earthquake data object, or null to clear focus.
     */
    const setFocusedNotableQuake = useCallback((quake) => {
        setFocusedNotableQuake_internal(quake);
    }, []);

    // Context value includes current states and their respective updater functions.
    const value = {
        activeSidebarView,
        setActiveSidebarView: changeSidebarView,
        activeFeedPeriod,
        setActiveFeedPeriod: changeActiveFeedPeriod,
        globeFocusLng,
        setGlobeFocusLng,
        focusedNotableQuake,
        setFocusedNotableQuake,
    };

    return (
        <UIStateContext.Provider value={value}>
            {children}
        </UIStateContext.Provider>
    );
};

/**
 * Custom hook to consume the UIStateContext.
 * Provides easy access to UI states (like active sidebar view, feed period) and their setters.
 * Throws an error if used outside of a `UIStateProvider`.
 *
 * @returns {Object} The context value, containing UI states and setter functions.
 * @property {string} activeSidebarView - Current active view in the sidebar.
 * @property {function(string): void} setActiveSidebarView - Function to change the active sidebar view.
 * @property {string} activeFeedPeriod - Current selected earthquake feed period.
 * @property {function(string): void} setActiveFeedPeriod - Function to change the active feed period.
 * @property {number} globeFocusLng - Current target longitude for globe focus.
 * @property {function(number): void} setGlobeFocusLng - Function to set the globe focus longitude.
 * @property {Object|null} focusedNotableQuake - Data of the currently focused notable earthquake.
 * @property {function((Object|null)): void} setFocusedNotableQuake - Function to set or clear the focused notable quake.
 * @throws {Error} If the hook is used outside a UIStateProvider.
 */
export const useUIState = () => {
    const context = useContext(UIStateContext);
    if (context === undefined) {
        throw new Error('useUIState must be used within a UIStateProvider');
    }
    return context;
};
