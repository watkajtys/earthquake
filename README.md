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

The production site at [earthquakeslive.com](https://earthquakeslive.com) is associated with the Cloudflare Worker `earthquake`. The repository builds the React frontend with Vite and deploys it alongside `src/worker.js` through native Workers Static Assets (`ASSETS`). Wrangler runs `npm run build` before development and deployment.

Requests pass through the Worker first so API, sitemap, and crawler routes keep their server behavior before the single-page application fallback. Production also retains `STATIC_KV` for the exact hashed asset URLs used by the August 2026 frontend; new HTML and new builds use `ASSETS`.

Configuration and bindings are defined in `wrangler.toml`. See [DEPLOYMENT.md](DEPLOYMENT.md) for the release procedure, validation steps, resource inventory, and rollback command. The August recovery notes in [RECONSTITUTION.md](RECONSTITUTION.md) and [LIVE-DRIFT.md](LIVE-DRIFT.md) are historical records.

## Environments and Deployment

| Environment | Worker / runtime | Data and scheduled work |
| --- | --- | --- |
| Local (`npm run dev`) | Wrangler with `--env preview --local` | Local simulated preview storage in `.wrangler/state`; no scheduled ingestion. |
| `preview` | `earthquake-reconcile-preview` | Dedicated D1, KV, R2, and queue resources; synthetic fixtures; no cron triggers. |
| `production` | `earthquake` at `earthquakeslive.com` | Existing `PrimaryDB`, production KV, `geojson-bucket`, and `geojson-queue`; existing cron schedules. |

Use Node.js **22.13.0 or later** and `npm ci`; the project pins Wrangler **4.135.0**. All deploy scripts select an explicit environment:

```bash
npm run deploy:preview
npm run deploy:production
```

`npm run deploy` aliases production. The legacy `deploy:staging` script now aliases the isolated preview deployment; there is no separate staging environment. The checked-in GitHub workflow runs validation, and does not deploy a branch automatically.

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

From the repository root, using Node.js 22.13.0 or later:

```bash
npm ci
npm run seed:preview
npm run dev
```

The seed command applies migrations to **local preview storage** and creates four clearly labeled synthetic earthquakes, one cluster, and the cached feeds/details needed by the application. Run it again to refresh fixture times. Open the URL printed by Wrangler, normally [http://localhost:8787](http://localhost:8787).

`npm run dev` and `npm run preview` run the complete Worker and built frontend locally. `npm run dev:ui` starts Vite alone for UI work; it has no API proxy, so it does not provide a working backend on its own.

Run the test suite with `npm test`, use `npm run test:watch` while editing, and follow [DEPLOYMENT.md](DEPLOYMENT.md) for local smoke checks and releases.

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

You can generate HTML documentation from these JSDoc comments using the `jsdoc` npm package.

1.  **Install JSDoc and a template (e.g., Docdash)**:
    You can install `jsdoc` globally or as a development dependency in your project. `docdash` is a popular clean template.
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
    *Note: The `template` path in `jsdoc.json` assumes `docdash` is installed locally (i.e., in `node_modules`). If you installed `docdash` globally, you may need to provide the absolute path to the global `docdash` template directory or configure JSDoc to find global templates.*

3.  **Run JSDoc**:
    Since `jsdoc` and `docdash` are listed as development dependencies in `package.json`, you can run JSDoc using `npx` after installing dependencies (`npm install`).

    If you are using the `jsdoc.json` configuration file (recommended):
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
      // ... other scripts
      "docs": "jsdoc -c jsdoc.json"
    }
    ```
    Then, you can simply run:
    ```bash
    npm run docs
    ```