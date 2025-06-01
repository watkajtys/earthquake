/**
 * @file Main entry point for the Seismic Activity Monitor application.
 * This file renders the root React component (`App`) into the DOM,
 * wrapping it with `BrowserRouter` for routing capabilities and
 * `StrictMode` for development-time checks.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css'; // Global styles
import App from './App.jsx'; // New App component

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
