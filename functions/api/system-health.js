/**
 * @file Cloudflare Function for comprehensive system health monitoring.
 * @module functions/api/system-health
 *
 * @description
 * This endpoint provides a detailed, real-time health assessment of the entire application
 * ecosystem. It is designed to be used by monitoring dashboards, status pages, or alerting
 * systems to quickly diagnose the operational status of all critical components.
 *
 * The health check performs a series of non-intrusive tests on the following components:
 * - **D1 Database**: Verifies connectivity and recent data availability.
 * - **KV Storage**: Checks for the presence of the binding and performs a read/write test.
 * - **USGS API**: Makes a live request to the USGS feed to ensure it is reachable and returning data.
 * - **Scheduled Tasks**: Infers the health of background tasks by checking the freshness of
 *   data in the D1 database.
 *
 * The function aggregates the results into a single JSON report, which includes an overall
 * health status (`healthy`, `degraded`, `unhealthy`), detailed status for each component,
.
 *
 * The HTTP status code of the response reflects the overall system health:
 * - `200 OK`: All components are healthy.
 * - `207 Multi-Status`: Some non-critical components are degraded.
 * - `503 Service Unavailable`: One or more critical components are unhealthy.
 */
/**
 * Handles GET requests to the `/api/system-health` endpoint.
 *
 * This function orchestrates a series of checks across all major system components to build
 * a comprehensive health report. It sequentially tests the D1 database, KV storage, the
 * external USGS API, and the status of recent data processing tasks.
 *
 * For each component, it records its status (`healthy`, `degraded`, `unhealthy`), response
 * time, and other relevant metrics. These individual results are compiled into a final
 * `healthReport` object.
 *
 * Based on the component statuses, it calculates an overall health score and determines the
 * most appropriate HTTP status code for the response. The response is explicitly marked as
 * non-cacheable to ensure the data is always fresh.
 *
 * @async
 * @function onRequestGet
 * @param {object} context - The Cloudflare Pages Function context.
 * @param {object} context.env - The environment object containing bindings for `DB` and `USGS_LAST_RESPONSE_KV`.
 * @returns {Promise<Response>} A `Response` object containing the detailed health report in JSON
 *   format. The HTTP status code of the response indicates the overall system health.
 */
export async function onRequestGet(context) {
  const { env } = context;
  const startTime = Date.now();
  
  const healthReport = {
    timestamp: new Date().toISOString(),
    overall: 'healthy', // healthy, degraded, unhealthy
    components: {},
    metrics: {},
    lastUpdated: null
  };

  // Check Database (D1) Health
  try {
    const dbStartTime = Date.now();
    
    if (env.DB) {
      // Test database connectivity with a simple query
      const dbTest = await env.DB.prepare('SELECT COUNT(*) as count FROM EarthquakeEvents WHERE event_time > ?')
        .bind(Date.now() - (24 * 60 * 60 * 1000)) // Last 24 hours
        .first();
      
      const dbDuration = Date.now() - dbStartTime;
      const recentEarthquakes = dbTest?.count || 0;
      
      healthReport.components.database = {
        status: 'healthy',
        responseTime: dbDuration,
        recentRecords: recentEarthquakes,
        message: `D1 database operational, ${recentEarthquakes} recent earthquakes`
      };
      
      healthReport.metrics.databaseResponseTime = dbDuration;
    } else {
      healthReport.components.database = {
        status: 'unhealthy',
        message: 'D1 database binding not available'
      };
      healthReport.overall = 'degraded';
    }
  } catch (dbError) {
    healthReport.components.database = {
      status: 'unhealthy',
      message: `Database error: ${dbError.message}`,
      error: dbError.name
    };
    healthReport.overall = 'degraded';
  }

  // Check KV Storage Health
  try {
    const kvStartTime = Date.now();
    
    if (env.USGS_LAST_RESPONSE_KV) {
      // Test KV connectivity with a lightweight operation
      const _kvTest = await env.USGS_LAST_RESPONSE_KV.get('health-check', { type: 'text' });
      const kvDuration = Date.now() - kvStartTime;
      
      // Write a test value to verify write capability
      await env.USGS_LAST_RESPONSE_KV.put('health-check', JSON.stringify({
        timestamp: Date.now(),
        status: 'healthy'
      }));
      
      healthReport.components.kvStorage = {
        status: 'healthy',
        responseTime: kvDuration,
        message: 'KV storage operational'
      };
      
      healthReport.metrics.kvResponseTime = kvDuration;
    } else {
      healthReport.components.kvStorage = {
        status: 'degraded',
        message: 'KV storage binding not available (non-critical)'
      };
    }
  } catch (kvError) {
    healthReport.components.kvStorage = {
      status: 'degraded',
      message: `KV storage error: ${kvError.message}`,
      error: kvError.name
    };
  }

  // Check USGS API Health
  try {
    const usgsStartTime = Date.now();
    const usgsTestUrl = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson';
    
    const usgsResponse = await fetch(usgsTestUrl, {
      headers: { 'User-Agent': 'EarthquakesLive-HealthCheck/1.0' },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    
    const usgsDuration = Date.now() - usgsStartTime;
    
    if (usgsResponse.ok) {
      const usgsData = await usgsResponse.json();
      const earthquakeCount = usgsData.features?.length || 0;
      
      healthReport.components.usgsApi = {
        status: 'healthy',
        responseTime: usgsDuration,
        recentEarthquakes: earthquakeCount,
        message: `USGS API operational, ${earthquakeCount} recent earthquakes available`
      };
      
      healthReport.metrics.usgsApiResponseTime = usgsDuration;
      healthReport.metrics.usgsDataFreshness = usgsData.metadata?.generated || null;
    } else {
      healthReport.components.usgsApi = {
        status: 'degraded',
        responseTime: usgsDuration,
        message: `USGS API returned ${usgsResponse.status}`,
        httpStatus: usgsResponse.status
      };
      healthReport.overall = 'degraded';
    }
  } catch (usgsError) {
    healthReport.components.usgsApi = {
      status: 'unhealthy',
      message: `USGS API error: ${usgsError.message}`,
      error: usgsError.name
    };
    healthReport.overall = 'degraded';
  }

  // Check Recent Task Execution Status
  try {
    if (env.DB) {
      // Check for recent cluster definitions as a proxy for task health
      const recentClusters = await env.DB.prepare(`
        SELECT COUNT(*) as count, MAX(updatedAt) as lastUpdate
        FROM ClusterDefinitions 
        WHERE updatedAt > ?
      `).bind(new Date(Date.now() - (2 * 60 * 60 * 1000)).toISOString()) // Last 2 hours
        .first();
      
      const _recentClusterCount = recentClusters?.count || 0;
      const _lastClusterUpdate = recentClusters?.lastUpdate;
      
      // Check for recent earthquake data updates
      const recentDataCheck = await env.DB.prepare(`
        SELECT COUNT(*) as count, MAX(event_time) as lastEarthquake
        FROM EarthquakeEvents 
        WHERE event_time > ?
      `).bind(Date.now() - (2 * 60 * 60 * 1000)) // Last 2 hours
        .first();
      
      const recentDataCount = recentDataCheck?.count || 0;
      const lastDataUpdate = recentDataCheck?.lastEarthquake;
      
      const dataFreshness = lastDataUpdate ? (Date.now() - lastDataUpdate) / (1000 * 60) : null; // Minutes ago
      
      if (recentDataCount > 0 && dataFreshness < 10) { // Data less than 10 minutes old
        healthReport.components.scheduledTasks = {
          status: 'healthy',
          message: `Recent data updates detected (${Math.round(dataFreshness)} minutes ago)`,
          recentUpdates: recentDataCount,
          lastUpdate: new Date(lastDataUpdate).toISOString()
        };
      } else if (dataFreshness < 60) { // Data less than 1 hour old
        healthReport.components.scheduledTasks = {
          status: 'degraded',
          message: `Data updates slower than expected (${Math.round(dataFreshness)} minutes ago)`,
          recentUpdates: recentDataCount,
          lastUpdate: lastDataUpdate ? new Date(lastDataUpdate).toISOString() : null
        };
        healthReport.overall = 'degraded';
      } else {
        healthReport.components.scheduledTasks = {
          status: 'unhealthy',
          message: 'No recent data updates detected - scheduled tasks may be failing',
          recentUpdates: recentDataCount,
          lastUpdate: lastDataUpdate ? new Date(lastDataUpdate).toISOString() : null
        };
        healthReport.overall = 'unhealthy';
      }
      
      healthReport.metrics.dataFreshnessMinutes = dataFreshness;
      healthReport.metrics.recentDataUpdates = recentDataCount;
    }
  } catch (taskError) {
    healthReport.components.scheduledTasks = {
      status: 'unknown',
      message: `Unable to check task status: ${taskError.message}`,
      error: taskError.name
    };
  }

  // Calculate overall health score
  const components = Object.values(healthReport.components);
  const healthyCount = components.filter(c => c.status === 'healthy').length;
  const degradedCount = components.filter(c => c.status === 'degraded').length;
  const unhealthyCount = components.filter(c => c.status === 'unhealthy').length;
  
  if (unhealthyCount > 0) {
    healthReport.overall = 'unhealthy';
  } else if (degradedCount > 0) {
    healthReport.overall = 'degraded';
  } else {
    healthReport.overall = 'healthy';
  }
  
  // Add overall metrics
  healthReport.metrics.totalComponents = components.length;
  healthReport.metrics.healthyComponents = healthyCount;
  healthReport.metrics.degradedComponents = degradedCount;
  healthReport.metrics.unhealthyComponents = unhealthyCount;
  healthReport.metrics.healthScore = Math.round((healthyCount / components.length) * 100);
  healthReport.metrics.checkDuration = Date.now() - startTime;
  
  // Determine appropriate HTTP status code
  let httpStatus = 200;
  if (healthReport.overall === 'degraded') {
    httpStatus = 207; // Multi-Status (some components degraded)
  } else if (healthReport.overall === 'unhealthy') {
    httpStatus = 503; // Service Unavailable
  }
  
  const responseHeaders = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'X-Health-Check-Duration': healthReport.metrics.checkDuration.toString(),
    'X-Health-Score': healthReport.metrics.healthScore.toString()
  };
  
  return new Response(JSON.stringify(healthReport, null, 2), {
    status: httpStatus,
    headers: responseHeaders
  });
}