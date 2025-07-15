/**
 * @file functions/api/system-health.js
 * @description System health monitoring endpoint for performance dashboard
 * Provides comprehensive health check of all system components
 */

/**
 * System health check endpoint
 * GET /api/system-health
 * 
 * Returns overall system health including:
 * - Database connectivity and performance
 * - KV storage status
 * - USGS API availability
 * - Recent task execution status
 * - Error rates and system metrics
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
      const kvTest = await env.USGS_LAST_RESPONSE_KV.get('health-check', { type: 'text' });
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
      
      const recentClusterCount = recentClusters?.count || 0;
      const lastClusterUpdate = recentClusters?.lastUpdate;
      
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