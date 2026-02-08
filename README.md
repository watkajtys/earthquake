# Global Seismic Activity Monitor

## Description

The Global Seismic Activity Monitor is a React-based web application that visualizes real-time and historical global earthquake data on an interactive 3D globe. It provides detailed statistics, insights into seismic events, and educational information about earthquake science. Users can explore recent and significant earthquakes, view their details, and understand their distribution and magnitude in a geographical context.

## Project Status

### 1. Critical Bottlenecks & Recommended Optimizations

Addressing the following bottlenecks is crucial for improving user experience and system efficiency.

#### 1.1. Cluster Calculation Algorithm (`findActiveClusters`)
-   **Issue:** The current earthquake clustering algorithm, located in `functions/api/calculate-clusters.POST.js` (specifically the `findActiveClusters` function), appears to use a method that compares every earthquake with every other earthquake to find neighbors. This approach has a time complexity of roughly O(N^2), where N is the number of earthquakes.
-   **Impact:** As the number of earthquakes in a given dataset increases (e.g., for wider time windows or seismically active periods), the calculation time for clusters will grow quadratically. This can lead to slow API responses, increased server load on Cloudflare Workers, and potentially timeouts.
-   **Recommendation:**
    1.  **Algorithmic Enhancement:** Investigate and implement a more efficient clustering algorithm. Options include:
        *   **DBSCAN:** A density-based clustering algorithm that can be more efficient if spatial indexing is used.
        *   **Spatial Indexing:** Implement structures like k-d trees or quadtrees to rapidly find earthquakes within a certain distance of each other, which would optimize the neighbor search phase of the current or a new algorithm.
    2.  **Caching Verification:** Ensure the existing D1-based caching for cluster results (`ClusterCache` table) is effectively minimizing recalculations for identical input parameters (earthquake list, distance, min quakes).

#### 1.2. Cluster Sitemap Generation (`handleClustersSitemapRequest`)
-   **Issue:** The `handleClustersSitemapRequest` function within the main worker script (`src/worker.js`) currently fetches all cluster slugs from the `ClusterDefinitions` D1 table. Then, for *each individual cluster*, it makes an external API call to the USGS to retrieve details of the strongest quake. This information is used to construct the URL for the sitemap entry.
-   **Impact:**
    *   **Extreme Slowness:** Sitemap generation becomes very slow, especially with a large number of defined clusters.
    *   **USGS Rate Limiting/Blocking:** Making numerous sequential API calls to USGS can lead to rate limiting or temporary blocking.
    *   **Worker Timeouts:** The prolonged execution time can exceed Cloudflare Worker limits.
    *   **Stale Sitemap:** If the process fails or times out, the sitemap may not be updated correctly.
-   **Recommendation:**
    1.  **Store Canonical Slugs in D1:** Modify the `ClusterDefinitions` table and the cluster creation logic (`storeClusterDefinition` in `functions/utils/d1ClusterUtils.js` and its callers) to generate and store the final, canonical URL slug for each cluster at the time of its definition. This slug should be directly usable in the sitemap.
    2.  **Sitemap from D1 Only:** Update `handleClustersSitemapRequest` to build the cluster sitemap *exclusively* using data available within the `ClusterDefinitions` D1 table (i.e., the pre-generated canonical slugs and `updatedAt` timestamps). This will eliminate all external API calls during sitemap generation.

#### 1.3. Scheduled Data Fetching & Processing (`usgs-proxy.js`)
-   **Issue:** The scheduled cron job (`*/1 * * * *` in `wrangler.toml`), executed by `src/worker.js` which calls `kvEnabledUsgsProxyHandler` (defined in `functions/routes/api/usgs-proxy.js`), is vital for data freshness. It fetches `all_hour.geojson` from USGS. While the proxy includes logic for KV store comparison to minimize redundant D1 writes, any sustained failure in this pipeline (USGS fetch, KV operations, D1 upsert) could impact data currency.
-   **Impact:** Users could be viewing outdated earthquake information if the cron job fails repeatedly or processes data incorrectly.
-   **Recommendation:**
    1.  **Comprehensive Monitoring & Logging:** Implement detailed logging for each step of the scheduled task (fetching, KV read/write, D1 upsert). Monitor these logs for errors.
    2.  **Alerting:** Set up alerts for persistent failures in the scheduled task.
    3.  **KV Diffing Logic Verification:** Regularly ensure the logic that compares new data with data from `USGS_LAST_RESPONSE_KV` correctly identifies new and updated events, preventing both missed updates and unnecessary processing.

### 2. Server-Side Processing Strategy
-   **Confirmation:** The application's architecture correctly centralizes data-intensive and backend operations on server-side Cloudflare Workers. This is a robust approach.
-   **Key Server-Side Functions & Responsibilities:**
    *   **USGS Data Proxy & Initial Processing:** `functions/routes/api/usgs-proxy.js` (Handles fetching from USGS, caching, diffing against KV, and initiating D1 writes for new/updated events).
    *   **Earthquake Data Storage & Retrieval:** Interactions with the `EarthquakeEvents` D1 table are managed by various API handlers (e.g., `functions/api/get-earthquakes.js`) and utility functions (`src/utils/d1Utils.js`).
    *   **Real-time Cluster Calculation:** `functions/api/calculate-clusters.POST.js` (Performs on-demand cluster analysis).
    *   **Persistent Cluster Definition Storage:** `functions/utils/d1ClusterUtils.js` and `storeClusterDefinitionsInBackground` (Manages storing significant cluster details in the `ClusterDefinitions` D1 table).
    *   **Sitemap Generation:** Handlers within `src/worker.js` (Dynamically create sitemaps).
    *   **Prerendering for SEO:** Handlers within `src/worker.js` (Serve static HTML for crawlers).
-   **Benefits:** This server-centric model ensures scalability, performance (by processing data close to users via Cloudflare's network), and better data management.

## Development Roadmap

### Implementation Priority Matrix

#### Phase 1: Critical Performance (Weeks 1-2)
- Task 1.1: Spatial Indexing Implementation ⭐ **HIGHEST PRIORITY**
- Task 1.4: Distance Calculation Optimization 🆕 **NEW**
- Task 1.3: Cluster Caching Enhancement
- Task 3.1: Enhanced Logging
- Task 2.2: Sitemap Optimization

#### Phase 2: Historical Data Foundation (Weeks 3-4)
- Task 4.1: Enhanced Batch Processing
- Task 4.2: Historical Data Sources
- Task 5.1: Batch Cluster Generation
- Task 9.1: Database Index Optimization

#### Phase 3: Advanced Features (Weeks 5-8)
- Task 6.1: Regional Analysis Foundation
- Task 7.1: Interactive Learning Modules
- Task 8.1: Fault Data Storage
- Task 10.1: Structured Logging

#### Phase 4: Enhancement and Polish (Weeks 9-12)
- Task 1.2: DBSCAN Implementation ⚠️ **LOWER PRIORITY**
- Task 6.2: Regional Statistics
- Task 8.2: Fault Proximity Analysis
- Task 11.1: Advanced Cluster Features

### Summary of Initial Recommendations
To significantly improve the Global Seismic Activity Monitor, the following actions are recommended, in order of priority:
1.  **Optimize Critical Operations:**
    *   Refactor the `findActiveClusters` algorithm for better performance.
    *   Re-engineer cluster sitemap generation to eliminate external API calls.
2.  **Implement Historical Data Ingestion:** Develop and execute the batch processes for loading past earthquake events and generating their cluster definitions.
3.  **Maintain Server-Side Integrity:** Continue leveraging Cloudflare Workers for backend logic and ensure robust monitoring for scheduled tasks.

These changes will lead to a faster, more reliable, and data-rich application.

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
* **Recent Developments & Future Enhancements:**
    * **Enhanced Regional Quake Processing & Display:**
        *   **Implemented Feature:** Initial Regional Faulting Display.
        *   **Future Directions:** Dedicated Regional Pages/Views, Server-Side Regional Aggregation, Spatial Querying.
    * **Processing Local Seismicity for Educational Purposes:**
        *   **Progress:** Groundwork for Fault Correlation.
        *   **Future Directions:** Interactive Learning Modules, Correlating Quakes with Known Faults, Contextualized Explanations.
    * **Incorporating Nearby Fault Data:**
        *   **Implemented Feature:** Initial Fault Data Integration and Display.
        *   **Future Directions:** Enhanced Fault Data Storage & Management, Server-Side Fault Proximity Analysis, Client-Side Display & Interaction, Linking Earthquakes to Faults.
    * **Other Potential Optimizations & Features:**
        *   **Advanced Cluster Analysis:** Time-based parameters, fault data in cluster definitions.
        *   **Client-Side Rendering Performance:** Virtualization, Level of Detail (LOD), Efficient WebGL Practices.
        *   **User-Defined Regions & Alerts:** Custom regions of interest and notifications.
        *   **Educational API Endpoint:** Public API for processed data.

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
    *   **Usage**: Run the appropriate command from your terminal to push changes to staging. This is useful for final testing before a production release.
    ```bash
    # Using npm
    npm run deploy:staging

    # Or using Yarn
    yarn deploy:staging
    ```

*   **Deploying to Production**:
    *   **Purpose**: Deploys the current state of your project to the `production` (live) environment on Cloudflare.
    *   **npm Command**: `npm run deploy:production`
    *   **Yarn Command**: `yarn deploy:production`
    *   **Usage**: Run the appropriate command from your terminal to push changes to production. This should only be done after changes have been thoroughly tested (e.g., in `staging` or preview deployments).
    ```bash
    # Using npm
    npm run deploy:production

    # Or using Yarn
    yarn deploy:production
    ```

**Note on Automated Deployments:**
Typically, the `production` environment is connected to the main branch of the Git repository, and deployments to production occur automatically when changes are merged into that branch. The `staging` environment might also be configured for automatic deployments from a specific branch (e.g., `develop` or `staging`), or manual deployments using the commands above can be used as part of the release process. Preview deployments (as **Cloudflare Workers**) are typically automated, potentially using **Cloudflare Pages'** CI/CD capabilities for the build and deployment pipeline.

## Development Journey & Concept: "Vibe-Coding" with Gemini Canvas

This Global Seismic Activity Monitor was brought to life through a dynamic and iterative development process, affectionately termed "vibe-coding." The project was conceptualized and significantly shaped within Gemini Canvas, leveraging a conversational AI-assisted development workflow.

**How it worked:**

* **Conversational Prototyping**: Initial ideas and feature requirements were discussed with Gemini. Based on these conversations, Gemini generated foundational React components and logic.
* **Iterative Refinement**: Each feature, from basic globe setup to complex interactions like the ring highlights or data-driven UI updates, was built incrementally. The process involved:
    * Describing the desired functionality or behavior.
    * Reviewing and testing the code suggestions provided by Gemini.
    * Identifying issues, bugs, or areas for improvement (like the ring animation or hover states).
    * Providing feedback, error messages, and updated code snippets back to Gemini.
    * Receiving revised code and explanations, and integrating them into the application.
* **Agile & Exploratory**: This "vibe-coding" approach allowed for rapid exploration of different UI/UX ideas and quick pivots when a particular implementation wasn't ideal. For example, the globe hover-to-pause feature went through several iterations to achieve the desired precision.
* **Focus on "Feel"**: Beyond just functional code, there was an emphasis on the "vibe" – ensuring the application felt responsive, informative, and visually engaging. This involved tweaking animations, color schemes, and data presentation based on iterative feedback.
* **Collaborative Problem-Solving**: When bugs or unexpected behaviors arose (like the initial ring animation issues), the debugging process was also collaborative, with Gemini helping to diagnose problems based on error messages and observed behavior.

This method facilitated a quick turnaround from concept to a functional prototype, emphasizing a fluid, responsive, and somewhat experimental path to development. It highlights how AI-assisted tools like Gemini Canvas can augment the creative and technical aspects of software development, allowing for rapid iteration and exploration of ideas.

Beyond the initial conceptualization with Gemini Canvas, this project serves as an ongoing testbed for advanced Large Language Model (LLM) capabilities in real-world software engineering. AI agents like Jules frequently drive development, maintenance, and iterative enhancements. This process includes rigorously testing the LLM's ability to:
* Understand complex requirements.
* Generate and refactor code.
* Debug issues.
* Contribute to documentation (as demonstrated by this very README update).

When working with AI agents like Jules, effective collaboration is key. Here are some tips and insights:

*   **How to Interact Effectively:**
    *   **Be specific:** Instead of vague requests like "improve the UI," provide detailed instructions, e.g., "change the color of the primary button to blue (hex code #007bff) and increase its padding to 12px."
    *   **Provide context:** If reporting a bug, describe the steps to reproduce it, the expected behavior, and the actual outcome. Include error messages if any.
    *   **Reference specifics:** Mention relevant files (e.g., `src/components/Globe.jsx`), functions (e.g., `handleMarkerClick`), or even line numbers if you have them.

*   **Understanding Strengths:** AI agents like Jules excel at:
    *   **Code Generation:** Creating boilerplate code, implementing well-defined functions, or building components based on clear specifications.
    *   **Refactoring:** Assisting in improving code structure, enhancing readability, or optimizing performance when given specific guidelines or patterns to follow.
    *   **Debugging Support:** Helping to identify potential causes of issues by analyzing code snippets and error messages. (Note: Jules cannot directly run code or use a debugger in this interactive context but can offer valuable suggestions based on the information provided).
    *   **Documentation:** Generating or updating documentation, such as README files, code comments, or explanatory text.
    *   **Answering Questions:** Providing information about the codebase, libraries used, or architectural decisions, based on its training data and the currently available code.

*   **Embrace the Iterative Process:**
    *   Working with AI is often a process of refinement. The initial output may not be perfect.
    *   Be prepared to provide clear, constructive feedback and ask for revisions. Explain what was missed or how the output can be improved.

*   **Experimental and Innovative Approach:**
    *   Using AI agents for ongoing development is part of an innovative and experimental approach to software engineering.
    *   Patience, clear communication, and a collaborative mindset are crucial for achieving the best results.

This ongoing collaboration aims to push the boundaries of what LLMs can achieve in practical, non-trivial application development, providing valuable insights into their strengths and areas for continued improvement. Tools like the Claude code CLI are actively used in this "vibe process" for implementing new features and enhancements. The Global Seismic Activity Monitor is therefore not just a tool for visualizing earthquakes, but also a living experiment in the evolving landscape of AI-assisted software creation.

The project reflects the spirit of innovation and agile creation championed by **Built By Vibes**.

* **Twitter**: [@builtbyvibes](https://twitter.com/builtbyvibes)
* **Website**: [www.builtbyvibes.com](https://www.builtbyvibes.com)

## Setup and Installation

To set up and run this project locally, follow these steps:

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

The serverless functions within the Cloudflare Worker (e.g., for the USGS proxy or API endpoints) can be developed and tested locally using the **Wrangler** CLI. While primary frontend development uses `npm run dev` (**Vite**), you can run a local development server for Worker functions to test them in isolation or develop new Worker-specific features.

*   Navigate to the project root (where `wrangler.toml` is located).
*   Use the command `npx wrangler dev` to start the local server for the Worker.
*   Refer to the [Cloudflare Wrangler documentation](https://developers.cloudflare.com/workers/wrangler/commands/#dev) for more details on local development and testing of **Workers**.

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
-   **`functions/`**: Houses serverless function logic, primarily API handlers and related tests, integral to the Cloudflare Worker's operation (e.g., `functions/api/calculate-clusters.js`). The main Worker entry point, `src/worker.js`, orchestrates routing to these functions and other frontend asset-serving logic.
    -   **`functions/api/`**: Contains API route handlers (e.g., for cluster calculations, D1 database interactions).
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

You can generate HTML documentation from these JSDoc comments using the `jsdoc` npm package. The project is already configured with `jsdoc` and the `docdash` template.

1.  **Install Dependencies**:
    If you haven't already, install the project's development dependencies, which include `jsdoc` and `docdash`.
    ```bash
    npm install
    ```

2.  **Run the Documentation Script**:
    The project includes a pre-configured npm script in `package.json` to generate the documentation. This script uses the settings defined in `jsdoc.json`.
    ```bash
    npm run docs
    ```

3.  **View the Documentation**:
    The command will generate the documentation in the `docs/jsdoc/` directory. Open `docs/jsdoc/index.html` in your browser to view the documentation.

### Databases
The project uses Cloudflare D1 for its database needs. The database schema is managed through migration files located in the `migrations` directory. Each SQL file in this directory represents a step in the evolution of the database schema.

Key tables include:
-   **`EarthquakeEvents`**: Stores individual earthquake event data fetched from the USGS.
-   **`ClusterCache`**: Caches the results of earthquake cluster calculations to improve performance.
-   **`ClusterDefinitions`**: Stores definitions of significant seismic clusters that have been identified.