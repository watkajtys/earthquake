// src/contexts/uiStateContextUtils.js
import { createContext } from 'react';

/**
 * React Context for managing global UI state across the application.
 * This includes states like the active sidebar view, selected feed period,
 * globe focusing parameters, and any currently focused notable earthquake.
 *
 * @type {React.Context<Object|undefined>}
 */
export const UIStateContext = createContext(undefined); // Changed from no-arg to undefined for clarity with hook check
