# Global Seismic Activity Monitor

## Description

The Global Seismic Activity Monitor is a React-based web application that visualizes real-time and historical global earthquake data on an interactive 3D globe. It provides detailed statistics, insights into seismic events, and educational information about earthquake science. Users can explore recent and significant earthquakes, view their details, and understand their distribution and magnitude in a geographical context.

## Project Status

This project is under active development to enhance performance, data richness, and analytical capabilities. Key areas of focus include:

*   **Performance Optimization:** Critical bottlenecks in the earthquake clustering algorithm (O(N²) complexity) and sitemap generation are being addressed. The plan includes implementing spatial indexing and optimizing database queries to significantly improve performance.
*   **Historical Data Integration:** A robust batch processing system is being developed to ingest and analyze historical earthquake data from USGS archives. This will enable richer historical analysis and a more comprehensive dataset.
*   **Enhanced Regional Analysis:** New features are being built to provide more detailed regional seismic analysis, including the integration of regional fault data and dedicated regional views.
*   **Educational Enhancements:** The project is expanding its educational content with interactive learning modules and better correlation between seismic events and known faults.

The development roadmap is managed through a detailed task list, prioritizing critical performance fixes, followed by historical data integration and advanced feature enhancements.

## Development Roadmap

The development of the Global Seismic Activity Monitor is prioritized to deliver the most critical improvements first. The roadmap is divided into the following phases:

1.  **Critical Performance Fixes:** The immediate focus is on optimizing the core algorithms for clustering and data processing to ensure the application is fast and responsive, even with large datasets.
2.  **Historical Data Foundation:** Once performance is optimized, the next priority is to build the infrastructure for ingesting and processing historical earthquake data, which will form the foundation for richer analysis.
3.  **Advanced Features:** With a performant and data-rich platform, the focus will shift to developing advanced features for regional analysis, educational content, and fault integration.
4.  **Enhancement and Polish:** The final phase will involve refining the user experience, improving the API, and adding other advanced features.

## Features

* Interactive 3D Globe: Visualizes earthquake epicenters on a zoomable, rotatable globe.
* Real-time & Historical Data: Fetches and displays earthquake data from USGS for various periods (last hour, day, week, month).
* Geographical Layers: Shows tectonic plate boundaries and coastlines for geological context.
* Latest Major Quake Highlight: Visual highlight (pulsing ring on the globe) and textual banner/timer indicating the most recent significant earthquake (M4.5+).
* Detailed Earthquake View: Modal display providing comprehensive information for selected earthquakes, including magnitude, depth, location, fault plane solutions (beachball diagrams), ShakeMap/PAGER alerts, moment tensor solutions (Mww), seismic wave data, and energy estimations when available.
    * **2D Regional Map**: Displays the earthquake's epicenter, ShakeMap intensity (if available), and tectonic plates on a 2D map within the detail view for regional context.
* Smart Globe Rotation: Globe auto-rotates and intelligently pauses when the user hovers over the sphere, resuming on mouse-out.
* Dynamic Statistics & Charts:
    * Overview panel with key statistics for the last 24 hours.
    * Summaries for different timeframes (last hour, 24h, 7-day, 14-day, 30-day).
    * Paginated and sortable earthquake list/table.
    * Magnitude distribution charts.
    * Earthquake frequency timelines.
    * Magnitude vs. Depth scatter plots.
    * Regional distribution lists.
* Earthquake Cluster Analysis: Identifies and displays details for clusters of seismic events, including a mini-map and summary statistics for the cluster.
* Featured Quakes: Highlights notable recent or historical earthquakes.
* Educational Snippets: Provides brief explanations on earthquake concepts like magnitude, depth, and intensity.
* Dedicated 'Learn' Page: Provides educational content and detailed explanations about earthquake science and terminology.
* **Regional Faulting Display**: Incorporates and displays data on regional fault lines, enhancing geological context and understanding. This feature was added as part of the vibe process using the Claude code CLI.
* **Enhanced Regional Quake Processing:** Under development to provide detailed analysis of specific seismic regions, including region-specific statistics and historical data.
* **Nearby Fault Data Integration:** Under development to correlate earthquakes with known fault lines, providing deeper geological context.
* Responsive Sidebar: Dynamically loads and displays detailed analysis panels.

## Data Source

* Earthquake data is sourced from the **U.S. Geological Survey (USGS) Earthquake Hazards Program** via their GeoJSON feeds.

## Technologies Used

* **React**: JavaScript library for building user interfaces.
* **React Globe GL**: For 3D globe visualization using ThreeJS/WebGL.
* **Tailwind CSS**: Utility-first CSS framework for styling.
* **Vite**: Frontend build tool.
* **JavaScript (ES6+)**
* **Cloudflare Workers**: For hosting, deployment, and serverless backend functions.

## Deployment / Infrastructure

The application is deployed as a **Cloudflare Worker**, which handles both the serving of the static frontend assets (built with **Vite**) and the backend serverless functions.

*   **Unified Deployment**: The React-based user interface and the serverless backend logic (e.g., USGS proxy, API endpoints) are managed and deployed as a single Cloudflare Worker.
*   **Static Asset Serving**: The Worker script is configured to serve the static files (HTML, CSS, JavaScript, images) generated by the Vite build process. This is typically managed via an `ASSETS` binding in the `wrangler.toml` configuration.
*   **Serverless Functions**: API endpoints, data proxying, and other backend tasks are handled by the same Worker script.
*   **Configuration**: Worker configuration, including routes, environment variables, KV/D1 bindings, and build steps for the worker itself, is managed through the `wrangler.toml` file.
*   **Benefits**: This setup offers significant advantages, including:
    *   **Scalability**: **Cloudflare Workers** scale automatically to handle traffic load.
    *   **Performance**: Cloudflare's extensive Content Delivery Network (CDN) ensures that the application and its data are delivered quickly to users worldwide.
    *   **Cost-Effectiveness**: A unified **Worker-based** architecture can be highly cost-effective.
    *   **Simplified DevOps**: CI/CD for the entire application (frontend and backend) is streamlined by deploying to **Cloudflare Workers**.

## Environments and Deployment

This project utilizes distinct environments for development, staging, and production, managed through **Cloudflare Workers** and **Wrangler**.

### Environments

*   **`production`**: This is the live environment that serves the application to end-users. It uses production-ready configurations, including the main D1 database and KV namespaces.
*   **`staging`**: This environment is intended for pre-production testing. It mirrors the production setup and, importantly, **uses the same production D1 database and KV namespace bindings**. This allows for testing with live data to ensure changes are safe and performant before they are deployed to the live `production` environment. Use this environment with caution due to its use of live data.
*   **`preview`**: Preview deployments are automatically generated for each commit pushed to a branch (other than the production branch). These are deployed as **Cloudflare Workers**, often orchestrated via a CI/CD pipeline (which might be integrated with **Cloudflare Pages** for build and preview URL generation, e.g., `*.pages.dev`). These environments use preview-specific D1 and KV namespaces, suitable for testing new features in isolation without affecting production or staging data.
*   **`dev`**: This refers to the local development environment. For the frontend, **Vite** (usually via `npm run dev`) is used. For testing the Worker functions locally, `wrangler dev` is the command. This setup typically uses preview or development-specific bindings defined in `wrangler.toml` to avoid impacting live data.

### Manual Deployment Commands

Manual deployments to specific environments can be performed using npm or yarn scripts defined in `package.json`.

*   **Deploying to Staging**:
    *   **Purpose**: Deploys the current state of your project to the `staging` environment on Cloudflare.
    *   **npm Command**: `npm run deploy:staging`
    *   **Yarn Command**: `yarn deploy:staging`

*   **Deploying to Production**:
    *   **Purpose**: Deploys the current state of your project to the `production` (live) environment on Cloudflare.
    *   **npm Command**: `npm run deploy:production`
    *   **Yarn Command**: `yarn deploy:production`

**Note on Automated Deployments:**
Typically, the `production` environment is connected to the main branch of the Git repository, and deployments to production occur automatically when changes are merged into that branch. The `staging` environment might also be configured for automatic deployments from a specific branch (e.g., `develop` or `staging`), or manual deployments using the commands above can be used as part of the release process. Preview deployments (as **Cloudflare Workers**) are typically automated, potentially using **Cloudflare Pages'** CI/CD capabilities for the build and deployment pipeline.

## Development Journey & Concept: "Vibe-Coding"

This project was developed using a "vibe-coding" approach, a dynamic and iterative process centered on rapid prototyping and conversational development with AI assistants.

The workflow involved:
*   **Conversational Prototyping**: Using AI to generate foundational code and components based on high-level feature descriptions.
*   **Iterative Refinement**: Incrementally building and refining features through a cycle of describing desired changes, testing the generated code, and providing feedback.
*   **Agile & Exploratory**: Quickly exploring different UI/UX ideas and pivoting when necessary.

This method, facilitated by tools like Gemini Canvas and Claude, allows for a fluid and responsive development process, turning concepts into functional prototypes quickly.

Beyond the initial build, this project serves as a testbed for advanced Large Language Model (LLM) capabilities in software engineering. AI agents are used for ongoing development, maintenance, and enhancements. This includes testing their ability to understand complex requirements, generate and refactor code, debug issues, and contribute to documentation.

The project reflects the spirit of innovation and agile creation championed by **Built By Vibes**.

* **Twitter**: [@builtbyvibes](https://twitter.com/builtbyvibes)
* **Website**: [www.builtbyvibes.com](https://www.builtbyvibes.com)

## Getting Started

This section provides a step-by-step guide for new developers to set up and run the project locally.

### Prerequisites

*   Node.js (v16 or higher)
*   npm or Yarn

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
    (or `yarn install` if you use Yarn)

4.  **Run the development server**:
    ```bash
    npm run dev
    ```
    (or `yarn dev`)

5.  **Open your browser and navigate to the local URL provided by Vite (usually `http://localhost:5173` or similar).**

**Developing Cloudflare Workers:**

The serverless functions within the Cloudflare Worker can be developed and tested locally using the **Wrangler** CLI. While primary frontend development uses `npm run dev` (**Vite**), you can run a local development server for Worker functions.

*   Navigate to the project root (where `wrangler.toml` is located).
*   Use the command `npx wrangler dev` to start the local server for the Worker.
*   Refer to the [Cloudflare Wrangler documentation](https://developers.cloudflare.com/workers/wrangler/commands/#dev) for more details.

**Note on Local Development Approach:**
For most frontend development and testing, the **Vite** development server (`npm run dev`) is sufficient. It effectively proxies API requests to the appropriate Worker (either a deployed one or a local one if you're running both). Direct Worker development using `npx wrangler dev` becomes necessary when:
*   Implementing or debugging complex Worker-specific logic.
*   Initially setting up new Worker routes or functionalities.
*   Testing Worker behavior in complete isolation from the frontend.

## Project Structure

The `src/` directory contains the core source code for the application, organized as follows:

-   **`assets/`**: Static assets like images, JSON data files (e.g., `TectonicPlateBoundaries.json`, `ne_110m_coastline.json`).
-   **`components/`**: Core UI components. Most components are directly within this folder.
    -   **`components/earthquakeDetail/`**: Components specifically used within the `EarthquakeDetailView`.
    -   **`components/skeletons/`**: Skeleton loader components used for placeholder UI during data fetching.
-   **`constants/`**: Application-wide constants, primarily in `appConstants.js` (e.g., API URLs, thresholds).
-   **`contexts/`**: React Context providers and custom hooks for global state management (e.g., `EarthquakeDataContext.jsx`, `UIStateContext.jsx`).
-   **`functions/`**: Houses serverless function logic, primarily API handlers and related tests, integral to the Cloudflare Worker's operation. The main Worker entry point, `src/worker.js`, orchestrates routing to these functions and other frontend asset-serving logic.
    -   **`functions/api/`**: Contains API route handlers.
-   **`features/`**: Intended for feature-specific modules in future development (currently contains a `.gitkeep` file).
-   **`hooks/`**: Intended for custom React hooks (currently contains a `.gitkeep` file).
-   **`pages/`**: Top-level React components representing different application pages/views (e.g., `HomePage.jsx`, which defines the main application structure and routes).
    -   **`pages/learn/`**: Components for specific educational article pages.
-   **`services/`**: Modules for interacting with external APIs or backend services (e.g., `usgsApiService.js`, `clusterApiService.js`).
-   **`utils/`**: General utility functions used across the application (e.g., `utils.js`, `clusterUtils.js`).
-   **`main.jsx`**: The main entry point for the React application, rendering the root component from `HomePage.jsx`.
-   **`index.css`**: Global styles and Tailwind CSS base configuration.

Additionally, at the project root:

-   **`wrangler.toml`**: The configuration file for Cloudflare Workers projects. It defines build settings, environments, routes, service bindings (like KV, D1, and static assets), cron triggers, and compatibility settings for the Worker.

This structure promotes a logical organization of the codebase, simplifying navigation and maintenance. JSDoc comments are used extensively throughout `.jsx` files to document components, functions, props, and data structures, further aiding in code comprehension.

## Technical Documentation

The codebase includes comprehensive JSDoc comments within the `.jsx` files in the `src` directory. These comments explain components, functions, props, and data structures to facilitate easier understanding and maintenance.

### Generating HTML Documentation

You can generate HTML documentation from the JSDoc comments in the source code.

1.  **Generate the documentation**:
    ```bash
    npm run docs
    ```
2.  **Open the documentation**:
    Open `docs/jsdoc/index.html` in your browser.