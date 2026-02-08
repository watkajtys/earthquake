# Global Seismic Activity Monitor

## Table of Contents

1.  [Description](#description)
2.  [Features](#features)
3.  [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
    - [Project Structure](#project-structure)
4.  [Deployment](#deployment)
    - [Environments](#environments)
    - [Manual Deployment](#manual-deployment)
5.  [Contributing](#contributing)
6.  [Development Journey & Concept: "Vibe-Coding" with Gemini Canvas](#development-journey--concept-vibe-coding-with-gemini-canvas)
7.  [Data Source](#data-source)
8.  [Technologies Used](#technologies-used)
9.  [Technical Documentation](#technical-documentation)

## Description

The Global Seismic Activity Monitor is a React-based web application that visualizes real-time and historical global earthquake data on an interactive 3D globe. It provides detailed statistics, insights into seismic events, and educational information about earthquake science. Users can explore recent and significant earthquakes, view their details, and understand their distribution and magnitude in a geographical context.

## Features

*   **Interactive 3D Globe:** Visualizes earthquake epicenters on a zoomable, rotatable globe.
*   **Real-time & Historical Data:** Fetches and displays earthquake data from USGS for various periods (last hour, day, week, month).
*   **Geographical Layers:** Shows tectonic plate boundaries and coastlines for geological context.
*   **Latest Major Quake Highlight:** Visual highlight (pulsing ring on the globe) and textual banner/timer indicating the most recent significant earthquake (M4.5+).
*   **Detailed Earthquake View:** Modal display providing comprehensive information for selected earthquakes, including magnitude, depth, location, fault plane solutions (beachball diagrams), ShakeMap/PAGER alerts, moment tensor solutions (Mww), seismic wave data, and energy estimations when available.
    *   **2D Regional Map:** Displays the earthquake's epicenter, ShakeMap intensity (if available), and tectonic plates on a 2D map within the detail view for regional context.
*   **Smart Globe Rotation:** Globe auto-rotates and intelligently pauses when the user hovers over the sphere, resuming on mouse-out.
*   **Dynamic Statistics & Charts:**
    *   Overview panel with key statistics for the last 24 hours.
    *   Summaries for different timeframes (last hour, 24h, 7-day, 14-day, 30-day).
    *   Paginated and sortable earthquake list/table.
    *   Magnitude distribution charts.
    *   Earthquake frequency timelines.
    *   Magnitude vs. Depth scatter plots.
    *   Regional distribution lists.
*   **Earthquake Cluster Analysis:** Identifies and displays details for clusters of seismic events, including a mini-map and summary statistics for the cluster.
*   **Featured Quakes:** Highlights notable recent or historical earthquakes.
*   **Educational Snippets:** Provides brief explanations on earthquake concepts like magnitude, depth, and intensity.
*   **Dedicated 'Learn' Page:** Provides educational content and detailed explanations about earthquake science and terminology.
*   **Regional Faulting Display:** Incorporates and displays data on regional fault lines, enhancing geological context and understanding.
*   **Enhanced Regional Quake Processing:** Under development to provide detailed analysis of specific seismic regions, including region-specific statistics and historical data.
*   **Nearby Fault Data Integration:** Under development to correlate earthquakes with known fault lines, providing deeper geological context.
*   **Responsive Sidebar:** Dynamically loads and displays detailed analysis panels.

## Getting Started

To get a local copy up and running, follow these simple steps.

### Prerequisites

*   npm
    ```sh
    npm install npm@latest -g
    ```

### Installation

1.  Clone the repo
    ```sh
    git clone https://github.com/watkajtys/earthquake.git
    ```
2.  Install NPM packages
    ```sh
    npm install
    ```
3.  Run the development server
    ```sh
    npm run dev
    ```

### Project Structure

The `src/` directory contains the core source code for the application, organized as follows:

*   **`assets/`**: Static assets like images, JSON data files (e.g., `TectonicPlateBoundaries.json`, `ne_110m_coastline.json`).
*   **`components/`**: Core UI components. Most components are directly within this folder.
    *   **`components/earthquakeDetail/`**: Components specifically used within the `EarthquakeDetailView`.
    *   **`components/skeletons/`**: Skeleton loader components used for placeholder UI during data fetching.
*   **`constants/`**: Application-wide constants, primarily in `appConstants.js` (e.g., API URLs, thresholds).
*   **`contexts/`**: React Context providers and custom hooks for global state management (e.g., `EarthquakeDataContext.jsx`, `UIStateContext.jsx`).
*   **`functions/`**: Houses serverless function logic, primarily API handlers and related tests, integral to the Cloudflare Worker's operation (e.g., `functions/api/calculate-clusters.js`). The main Worker entry point, `src/worker.js`, orchestrates routing to these functions and other frontend asset-serving logic.
    *   **`functions/api/`**: Contains API route handlers (e.g., for cluster calculations, D1 database interactions).
*   **`features/`**: Intended for feature-specific modules in future development.
*   **`hooks/`**: Intended for custom React hooks.
*   **`pages/`**: Top-level React components representing different application pages/views (e.g., `HomePage.jsx`, which defines the main application structure and routes).
    *   **`pages/learn/`**: Components for specific educational article pages.
*   **`services/`**: Modules for interacting with external APIs or backend services (e.g., `usgsApiService.js`, `clusterApiService.js`).
*   **`utils/`**: General utility functions used across the application (e.g., `utils.js`, `clusterUtils.js`).
*   **`main.jsx`**: The main entry point for the React application, rendering the root component from `HomePage.jsx`.
*   **`index.css`**: Global styles and Tailwind CSS base configuration.

Additionally, at the project root:

*   **`wrangler.toml`**: The configuration file for Cloudflare Workers projects. It defines build settings, environments, routes, service bindings (like KV, D1, and static assets), cron triggers, and compatibility settings for the Worker.

This structure promotes a logical organization of the codebase, simplifying navigation and maintenance. JSDoc comments are used extensively throughout `.jsx` files to document components, functions, props, and data structures, further aiding in code comprehension.

## Deployment

The application is deployed as a **Cloudflare Worker**, which handles both the serving of the static frontend assets (built with **Vite**) and the backend serverless functions.

*   **Unified Deployment:** The React-based user interface and the serverless backend logic (e.g., USGS proxy, API endpoints) are managed and deployed as a single Cloudflare Worker.
*   **Static Asset Serving:** The Worker script is configured to serve the static files (HTML, CSS, JavaScript, images) generated by the Vite build process. This is typically managed via an `ASSETS` binding in the `wrangler.toml` configuration.
*   **Serverless Functions:** API endpoints, data proxying, and other backend tasks are handled by the same Worker script.
*   **Configuration:** Worker configuration, including routes, environment variables, KV/D1 bindings, and build steps for the worker itself, is managed through the `wrangler.toml` file.

### Environments

This project utilizes distinct environments for development, staging, and production, managed through **Cloudflare Workers** and **Wrangler**.

*   **`production`**: This is the live environment that serves the application to end-users. It uses production-ready configurations, including the main D1 database and KV namespaces.
*   **`staging`**: This environment is intended for pre-production testing. It mirrors the production setup and, importantly, **uses the same production D1 database and KV namespace bindings**. This allows for testing with live data to ensure changes are safe and performant before they are deployed to the live `production` environment. Use this environment with caution due to its use of live data.
*   **`preview`**: Preview deployments are automatically generated for each commit pushed to a branch (other than the production branch). These are deployed as **Cloudflare Workers**, often orchestrated via a CI/CD pipeline. These environments use preview-specific D1 and KV namespaces, suitable for testing new features in isolation without affecting production or staging data.
*   **`dev`**: This refers to the local development environment. For the frontend, **Vite** (usually via `npm run dev`) is used. For testing the Worker functions locally, `wrangler dev` is the command. This setup typically uses preview or development-specific bindings defined in `wrangler.toml` to avoid impacting live data.

### Manual Deployment

Manual deployments to specific environments can be performed using npm or yarn scripts defined in `package.json`.

*   **Deploying to Staging:**
    ```bash
    # Using npm
    npm run deploy:staging

    # Or using Yarn
    yarn deploy:staging
    ```

*   **Deploying to Production:**
    ```bash
    # Using npm
    npm run deploy:production

    # Or using Yarn
    yarn deploy:production
    ```

**Note on Automated Deployments:**
Typically, the `production` environment is connected to the main branch of the Git repository, and deployments to production occur automatically when changes are merged into that branch. The `staging` environment might also be configured for automatic deployments from a specific branch (e.g., `develop` or `staging`), or manual deployments using the commands above can be used as part of the release process.

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".
Don't forget to give the project a star! Thanks again!

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## Development Journey & Concept: "Vibe-Coding" with Gemini Canvas

This project was developed using a "vibe-coding" approach, which is a conversational, AI-assisted development workflow. The initial ideas and features were prototyped and refined in conversation with Gemini, an AI-powered collaborator. This iterative process allowed for rapid exploration of ideas and a focus on the overall "vibe" of the application.

The project continues to be a testbed for advanced LLM capabilities, with AI agents like Jules driving development, maintenance, and enhancements. This ongoing collaboration aims to push the boundaries of what LLMs can achieve in practical, non-trivial application development.

## Data Source

*   Earthquake data is sourced from the **U.S. Geological Survey (USGS) Earthquake Hazards Program** via their GeoJSON feeds.

## Technologies Used

*   **React**: JavaScript library for building user interfaces.
*   **React Globe GL**: For 3D globe visualization using ThreeJS/WebGL.
*   **Tailwind CSS**: Utility-first CSS framework for styling.
*   **Vite**: Frontend build tool.
*   **JavaScript (ES6+)**
*   **Cloudflare Workers**: For hosting, deployment, and serverless backend functions.

## Technical Documentation

The codebase includes comprehensive JSDoc comments within the `.jsx` files in the `src` directory. These comments explain components, functions, props, and data structures to facilitate easier understanding and maintenance.

### Generating HTML Documentation

You can generate HTML documentation from these JSDoc comments using the `jsdoc` npm package.

1.  **Install JSDoc and a template (e.g., Docdash)**:
    ```bash
    # Global installation
    npm install -g jsdoc docdash

    # Or, as dev dependencies
    npm install --save-dev jsdoc docdash
    ```

2.  **Create a JSDoc Configuration File (Optional but Recommended)**:
    Create a `jsdoc.json` (or `conf.json`) file in your project root for better control over the documentation generation process.
    Example `jsdoc.json`:
    ```json
    {
      "source": {
        "include": ["src"],
        "includePattern": ".+\\.jsx?$",
        "excludePattern": "(node_modules|docs)"
      },
      "opts": {
        "destination": "./docs/jsdoc/",
        "recurse": true,
        "readme": "./README.md",
        "template": "node_modules/docdash"
      },
      "plugins": ["plugins/markdown"],
      "templates": {
        "default": {
          "outputSourceFiles": false
        },
        "docdash": {
          "static": true,
          "sort": true,
          "search": true,
          "collapse": true,
          "typedefs": true,
          "removeQuotes": "none",
          "menu": {
            "Github repo": {
              "href": "https://github.com/builtbyvibes/global-seismic-activity-monitor",
              "target": "_blank"
            }
          }
        }
      }
    }
    ```

3.  **Run JSDoc**:
    If you are using the `jsdoc.json` configuration file:
    ```bash
    npx jsdoc -c jsdoc.json
    ```
    Alternatively, you can specify options directly on the command line:
    ```bash
    npx jsdoc src -r -d docs/jsdoc --template node_modules/docdash --readme README.md
    ```
    This will generate the documentation in the `docs/jsdoc/` directory. Open the `index.html` file in that directory to view the documentation.

    **Recommended:** For convenience, consider adding a script to your `package.json`:
    ```json
    "scripts": {
      "docs": "jsdoc -c jsdoc.json"
    }
    ```
    Then, you can simply run:
    ```bash
    npm run docs
    ```