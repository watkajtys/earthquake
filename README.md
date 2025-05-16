# Global Seismic Activity Monitor

## Description

The Global Seismic Activity Monitor is a React-based web application that visualizes real-time and historical global earthquake data on an interactive 3D globe. It provides detailed statistics, insights into seismic events, and educational information about earthquake science. Users can explore recent and significant earthquakes, view their details, and understand their distribution and magnitude in a geographical context.

## Features

* Interactive 3D Globe: Visualizes earthquake epicenters on a zoomable, rotatable globe.
* Real-time & Historical Data: Fetches and displays earthquake data from USGS for various periods (last hour, day, week, month).
* Geographical Layers: Shows tectonic plate boundaries and coastlines for geological context.
* Latest Major Quake Highlight: Animates a pulsing yellow ring on the globe to pinpoint the most recent significant earthquake (M4.5+).
* Detailed Earthquake View: Modal display providing comprehensive information for selected earthquakes, including magnitude, depth, location, fault plane solutions, and ShakeMap/PAGER alerts when available.
* Smart Globe Rotation: Globe auto-rotates and intelligently pauses when the user hovers over the sphere, resuming on mouse-out.
* Dynamic Statistics & Charts:
    * Overview panel with key statistics for the last 24 hours.
    * Summaries for different timeframes (last hour, 24h, 7-day, 14-day, 30-day).
    * Magnitude distribution charts.
    * Earthquake frequency timelines.
    * Magnitude vs. Depth scatter plots.
    * Regional distribution lists.
* Featured Quakes: Highlights notable recent or historical earthquakes.
* Educational Snippets: Provides brief explanations on earthquake concepts like magnitude, depth, and intensity.
* Responsive Sidebar: Dynamically loads and displays detailed analysis panels.

## Data Source

* Earthquake data is sourced from the **U.S. Geological Survey (USGS) Earthquake Hazards Program** via their GeoJSON feeds.

## Technologies Used

* **React**: JavaScript library for building user interfaces.
* **React Globe GL**: For 3D globe visualization using ThreeJS/WebGL.
* **Tailwind CSS**: Utility-first CSS framework for styling.
* **Vite**: Frontend build tool.
* **JavaScript (ES6+)**

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

The project reflects the spirit of innovation and agile creation championed by **Built By Vibes**.

* **Twitter**: [@builtbyvibes](https://twitter.com/builtbyvibes)
* **Website**: [www.builtbyvibes.com](https://www.builtbyvibes.com)

## Setup and Installation

To run this project locally:

1.  **Clone the repository**:
    ```bash
    git clone <your-repository-url>
    ```
2.  **Navigate to the project directory**:
    ```bash
    cd <project-name>
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

5.  Open your browser and navigate to the local URL provided by Vite (usually `http://localhost:5173` or similar).

## Project Structure