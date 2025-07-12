# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Commands
- `npm run dev` - Start Vite development server for frontend development
- `npm run build` - Build the application for production
- `npm run preview` - Preview the production build locally
- `npm run lint` - Run ESLint to check code quality
- `npm run test` - Run Vitest test suite
- `npm run docs` - Generate JSDoc documentation

### Cloudflare Worker Commands
- `npm run deploy` - Deploy Worker to default environment
- `npm run deploy:staging` - Deploy to staging environment
- `npm run deploy:production` - Deploy to production environment
- `npx wrangler dev` - Run Worker locally for testing serverless functions
- `npx wrangler d1 migrations apply PrimaryDB` - Apply database migrations

### Database Commands
- `wrangler d1 create PrimaryDB` - Create new D1 database
- `wrangler d1 migrations list PrimaryDB` - List migrations
- `wrangler d1 execute PrimaryDB --file=migrations/XXXX_migration.sql` - Execute specific migration

## Architecture Overview

### Deployment Architecture
This is a **Cloudflare Worker** application that serves both frontend and backend from a single deployment:
- **Frontend**: React SPA built with Vite, served via Workers Assets binding
- **Backend**: Serverless functions integrated within the Worker (`src/worker.js`)
- **Database**: Cloudflare D1 (SQLite) with KV storage for caching
- **Environments**: Production, staging, and preview with distinct D1/KV bindings

### Key Technology Stack
- **React 19** with React Router for SPA routing
- **Vite** for build tooling and development server
- **Tailwind CSS** for styling
- **D3.js** for data visualization (charts, timelines)
- **Leaflet + React-Leaflet** for 2D mapping
- **React Globe GL** for 3D globe visualization
- **Vitest** for testing with Happy DOM environment
- **ESLint** with accessibility and React hooks rules

### Data Flow Architecture
1. **USGS API Integration**: Fetches earthquake data from USGS GeoJSON feeds
2. **D1 Database Caching**: Stores earthquake events and cluster definitions
3. **KV Storage**: Caches API responses with configurable TTL
4. **Cluster Analysis**: Identifies and analyzes earthquake clusters using spatial algorithms
5. **Real-time Updates**: Scheduled Workers (cron) refresh data every minute

### Context Architecture
- **EarthquakeDataContext**: Manages earthquake data state, fetching, and filtering
- **UIStateContext**: Handles UI state like modals, selected feeds, and loading states
- Both contexts use useReducer for complex state management

### Component Structure
- **Pages**: Top-level route components (`HomePage.jsx`, `LearnPage.jsx`)
- **Features**: Modular components for specific functionality (globe, charts, tables)
- **Skeletons**: Loading state components for better UX
- **Contexts**: Global state management
- **Services**: API communication layer (`usgsApiService.js`, `clusterApiService.js`)
- **Utils**: Utility functions for data processing, formatting, and calculations

## Key Files and Directories

### Core Application Files
- `src/worker.js` - Main Worker entry point, handles routing for both API and static assets
- `src/main.jsx` - React application entry point with context providers
- `src/pages/HomePage.jsx` - Main application page with routing
- `wrangler.toml` - Cloudflare Worker configuration with environment-specific bindings

### API Endpoints (in functions/)
- `functions/api/get-earthquakes.js` - Primary earthquake data endpoint with D1 caching
- `functions/api/calculate-clusters.POST.js` - Cluster analysis and definition creation
- `functions/api/cluster-detail-with-quakes.js` - Cluster details with associated earthquakes
- `functions/routes/api/usgs-proxy.js` - USGS API proxy with KV caching

### Database
- `migrations/` - D1 database migration files
- Schema includes `EarthquakeEvents` and `ClusterDefinitions` tables

### Testing
- Comprehensive test coverage using Vitest
- Test files follow `.test.js` and `.test.jsx` patterns
- Integration tests for API endpoints and database operations
- Component tests for React components

## Development Workflow

### Local Development
1. Use `npm run dev` for frontend development (proxies to deployed Worker for API calls)
2. Use `npx wrangler dev` when developing Worker-specific functionality
3. Run `npm run test` frequently to ensure code quality
4. Use `npm run lint` to check code style

### Testing Strategy
- Unit tests for utility functions and components
- Integration tests for API endpoints
- Mocking with MSW for external API calls
- Test isolation with Happy DOM environment

### Database Development
- Migrations are auto-detected from `./migrations/` directory
- Use descriptive migration names with timestamps
- Test migrations locally before deploying

## Important Implementation Details

### Data Processing
- Earthquake data is filtered and processed by time periods (hour, day, week, month)
- Cluster analysis uses spatial proximity algorithms (CLUSTER_MAX_DISTANCE_KM, CLUSTER_MIN_QUAKES)
- Magnitude-based color coding and thresholding (MAJOR_QUAKE_THRESHOLD, FEELABLE_QUAKE_THRESHOLD)

### Performance Optimizations
- Lazy loading for heavy components (InteractiveGlobeView, charts)
- Data sampling for large datasets in visualization components
- KV caching for USGS API responses
- D1 database caching for frequent earthquake queries

### SEO and Prerendering
- Crawler detection for search engine optimization
- Dynamic prerendering for earthquake and cluster detail pages
- Comprehensive sitemap generation (static, earthquakes, clusters)
- Structured data (JSON-LD) for rich search results

### Error Handling
- Comprehensive error boundaries for React components
- Graceful fallbacks when D1 or KV services are unavailable
- Extensive logging for debugging in Worker environment

## Environment Configuration

### Development vs Production
- Development uses preview database and KV namespace IDs
- Production uses dedicated database and KV namespace IDs
- Staging environment shares production data for final testing

### Required Environment Setup
- Create D1 database: `wrangler d1 create PrimaryDB`
- Create KV namespaces for cluster storage and USGS response caching
- Configure proper database and KV IDs in `wrangler.toml`
- Apply migrations: `wrangler d1 migrations apply PrimaryDB`

## Code Quality Standards

### ESLint Configuration
- Accessibility rules via `eslint-plugin-jsx-a11y`
- React hooks rules enforcement
- Vitest-specific rules for test files
- Consistent code style with modern ES6+ features

### Testing Requirements
- All new API endpoints must have integration tests
- React components should have basic rendering tests
- Utility functions require comprehensive unit tests
- Database operations need integration test coverage