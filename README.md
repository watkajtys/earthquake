# Global Seismic Activity Monitor

## Description

The Global Seismic Activity Monitor is a React-based web application that visualizes real-time and historical global earthquake data on an interactive 3D globe. It provides detailed statistics, insights into seismic events, and educational information about earthquake science. Users can explore recent and significant earthquakes, view their details, and understand their distribution and magnitude in a geographical context.

## Table of Contents

*   [Project Status](#project-status)
*   [Development Roadmap](#development-roadmap)
*   [Getting Started](#getting-started)
    *   [Setup and Installation](#setup-and-installation)
    *   [Project Structure](#project-structure)
*   [Features](#features)
*   [Technologies Used](#technologies-used)
*   [Deployment / Infrastructure](#deployment--infrastructure)
*   [Environments and Deployment](#environments-and-deployment)
*   [Technical Documentation](#technical-documentation)
*   [Data Source](#data-source)
*   [Contributing](#contributing)

## Project Status

This project is under active development to enhance performance, data richness, and analytical capabilities. Key areas of focus include:

*   **Performance Optimization:** Addressing bottlenecks in the earthquake clustering algorithm and sitemap generation.
*   **Historical Data Integration:** Developing a robust batch processing system for historical earthquake data.
*   **Enhanced Regional Analysis:** Building features for detailed regional seismic analysis.
*   **Educational Enhancements:** Expanding educational content and correlating seismic events with known faults.

## Development Roadmap

1.  **Critical Performance Fixes:** Optimize core algorithms for clustering and data processing.
2.  **Historical Data Foundation:** Build infrastructure for ingesting and processing historical earthquake data.
3.  **Advanced Features:** Develop features for regional analysis, educational content, and fault integration.
4.  **Enhancement and Polish:** Refine the user experience and improve the API.

## Getting Started

### Setup and Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/builtbyvibes/global-seismic-activity-monitor.git
    ```
2.  **Navigate to the project directory**:
    ```bash
    cd global-seismic-activity-monitor
    ```
3.  **Install dependencies**:
    ```bash
    npm install
    ```
4.  **Run the development server**:
    ```bash
    npm run dev
    ```
5.  **Open your browser to `http://localhost:5173`.**

### Project Structure

The `src/` directory contains the core application source code:

-   **`assets/`**: Static assets (images, JSON data).
-   **`components/`**: Core and shared UI components.
-   **`constants/`**: Application-wide constants.
-   **`contexts/`**: React Context providers for global state.
-   **`functions/`**: Serverless function logic for the Cloudflare Worker.
-   **`pages/`**: Top-level page components.
-   **`services/`**: Modules for interacting with external APIs.
-   **`utils/`**: General utility functions.
-   **`main.jsx`**: Main entry point for the React application.
-   **`index.css`**: Global styles.

The `wrangler.toml` file at the root configures the Cloudflare Workers project.

## Features

*   **Interactive 3D Globe:** Visualize earthquake data on a zoomable, rotatable globe.
*   **Real-time & Historical Data:** Display USGS earthquake data for various timeframes.
*   **Geographical Layers:** Show tectonic plate boundaries and coastlines.
*   **Detailed Earthquake View:** In-depth information for each seismic event.
*   **Smart Globe Rotation:** Auto-rotates and pauses on user interaction.
*   **Dynamic Statistics & Charts:** Data summaries, paginated lists, and various charts.
*   **Earthquake Cluster Analysis:** Identify and display details for seismic event clusters.
*   **Educational Content:** In-app explanations and a dedicated 'Learn' page.

## Technologies Used

*   **Frontend:** React, React Globe GL, Tailwind CSS, Vite
*   **Backend:** Cloudflare Workers, JavaScript (ES6+)

## Deployment / Infrastructure

The application is deployed as a **Cloudflare Worker**, which serves both the static frontend assets and the backend serverless functions. This unified deployment model offers scalability, performance, and simplified DevOps.

## Environments and Deployment

The project uses `production`, `staging`, `preview`, and `dev` environments managed through Cloudflare Workers and Wrangler. Manual deployments can be performed using `npm run deploy:staging` and `npm run deploy:production`.

## Technical Documentation

The codebase includes comprehensive JSDoc comments. You can generate HTML documentation using the `npm run docs` command.

## Data Source

*   Earthquake data is sourced from the **U.S. Geological Survey (USGS) Earthquake Hazards Program**.

## Contributing

Contributions are welcome. Please see the `CONTRIBUTING.md` file for more information on the development process.