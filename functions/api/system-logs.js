/**
 * @file Cloudflare Function for generating and retrieving system operational logs.
 * @module functions/api/system-logs
 *
 * @description
 * This endpoint provides a synthetic, real-time view of the system's operational status by
 * generating structured log entries based on the current state and recent activity of various
 * system components. Since Cloudflare Workers do not provide a direct API for querying console
 * logs, this function infers system behavior and creates a log-like output.
 *
 * It is an administrative tool designed for quick operational visibility without needing to
 * access the Cloudflare Dashboard or use `wrangler tail`.
 *
 * The generated logs cover:
 * - **Data Ingestion**: Inferred from the latest records in the `EarthquakeEvents` table.
 * - **Cluster Analysis**: Inferred from recent updates to the `ClusterDefinitions` table.
 * - **Component Health**: Generated from live health checks on the D1 database, KV storage,
 *   and the external USGS API.
 *
 * The endpoint supports filtering by log level (`level`), component (`component`), time
 * (`since`), and can limit the number of returned entries (`limit`).
 *
 * @note The logs are generated on-the-fly and are not persisted. They represent a snapshot
 * of the system's state at the time of the request.
 */
/**
 * Handles GET requests to the `/api/system-logs` endpoint.
 *
 * This function generates a structured array of log entries by querying the state of various
 * parts of the application. It checks for recent data ingestion, cluster processing activity,
 * and the health of the database, KV store, and external API. Each of these checks produces
 * one or more log entries with a level (`info`, `warn`, `error`), a component name, and
 * detailed metadata.
 *
 * The function accepts several query parameters to filter the generated logs:
 * - `level`: Filters logs to a specific level (e.g., `error`).
 * - `component`: Filters logs to a specific component (e.g., `database`).
 * - `limit`: Restricts the number of returned log entries.
 * - `since`: Defines the start time for activity to be considered.
 *
 * After generating and filtering the logs, it returns them in a JSON response, along with
 * metadata about the request and a note explaining the synthetic nature of the logs.
 *
 * @async
 * @function onRequestGet
 * @param {object} context - The Cloudflare Pages Function context.
 * @param {Request} context.request - The incoming HTTP request object.
 * @param {object} context.env - The environment object with bindings for `DB` and `USGS_LAST_RESPONSE_KV`.
 * @returns {Promise<Response>} A `Response` object containing a JSON payload with the filtered
 *   log entries and metadata.
 */
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  
  // Parse query parameters
  const level = url.searchParams.get('level') || 'all';
  const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 200);
  const component = url.searchParams.get('component') || 'all';
  const since = url.searchParams.get('since');
  
  const startTime = Date.now();
  
  try {
    // Since Worker console logs aren't directly queryable via API,
    // we'll create a log entry aggregation from recent database activity
    // and system health indicators to provide operational visibility
    
    if (!env.DB) {
      return new Response(JSON.stringify({
        error: 'Database not available',
        message: 'Cannot retrieve system logs without database access'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const logs = [];
    const now = Date.now();
    const sinceTimestamp = since ? (isNaN(since) ? new Date(since).getTime() : parseInt(since)) : now - (24 * 60 * 60 * 1000); // Default: last 24 hours

    // Generate logs from database activity patterns
    try {
      // Recent earthquake data ingestion activity
      const recentDataQuery = await env.DB.prepare(`
        SELECT 
          COUNT(*) as count,
          MAX(event_time) as lastEventTime,
          MAX(retrieved_at) as lastRetrievalTime,
          MIN(event_time) as firstEventTime
        FROM EarthquakeEvents 
        WHERE retrieved_at > ?
        ORDER BY retrieved_at DESC
        LIMIT 10
      `).bind(sinceTimestamp).first();

      if (recentDataQuery && recentDataQuery.count > 0) {
        const dataFreshness = now - recentDataQuery.lastRetrievalTime;
        const logLevel = dataFreshness < 10 * 60 * 1000 ? 'info' : dataFreshness < 60 * 60 * 1000 ? 'warn' : 'error';
        
        logs.push({
          id: `data-ingestion-${recentDataQuery.lastRetrievalTime}`,
          timestamp: new Date(recentDataQuery.lastRetrievalTime).toISOString(),
          level: logLevel,
          component: 'scheduled',
          message: `Data ingestion completed: ${recentDataQuery.count} earthquakes processed`,
          details: {
            recordsProcessed: recentDataQuery.count,
            dataFreshnessMs: dataFreshness,
            eventTimeRange: {
              first: new Date(recentDataQuery.firstEventTime).toISOString(),
              last: new Date(recentDataQuery.lastEventTime).toISOString()
            },
            executionType: 'usgs-data-sync'
          }
        });
      }

      // Recent cluster analysis activity
      const clusterActivity = await env.DB.prepare(`
        SELECT 
          COUNT(*) as clusterCount,
          MAX(updatedAt) as lastUpdate,
          AVG(quakeCount) as avgQuakeCount,
          MAX(quakeCount) as maxQuakeCount
        FROM ClusterDefinitions 
        WHERE updatedAt > ?
      `).bind(new Date(sinceTimestamp).toISOString()).first();

      if (clusterActivity && clusterActivity.clusterCount > 0) {
        logs.push({
          id: `cluster-analysis-${Date.parse(clusterActivity.lastUpdate)}`,
          timestamp: clusterActivity.lastUpdate,
          level: 'info',
          component: 'api',
          message: `Cluster analysis completed: ${clusterActivity.clusterCount} clusters processed`,
          details: {
            clustersProcessed: clusterActivity.clusterCount,
            avgQuakesPerCluster: Math.round(clusterActivity.avgQuakeCount * 10) / 10,
            maxQuakesInCluster: clusterActivity.maxQuakeCount,
            executionType: 'cluster-calculation'
          }
        });
      }

      // Database performance indicators
      const dbPerformanceStart = Date.now();
      await env.DB.prepare('SELECT 1 as test').first();
      const dbResponseTime = Date.now() - dbPerformanceStart;
      
      const dbLogLevel = dbResponseTime < 100 ? 'info' : dbResponseTime < 500 ? 'warn' : 'error';
      logs.push({
        id: `db-health-${now}`,
        timestamp: new Date(now).toISOString(),
        level: dbLogLevel,
        component: 'database',
        message: `Database health check completed`,
        details: {
          responseTimeMs: dbResponseTime,
          status: dbResponseTime < 100 ? 'healthy' : dbResponseTime < 500 ? 'degraded' : 'slow',
          executionType: 'health-check'
        }
      });

    } catch (dbError) {
      logs.push({
        id: `db-error-${now}`,
        timestamp: new Date(now).toISOString(),
        level: 'error',
        component: 'database',
        message: `Database error: ${dbError.message}`,
        details: {
          error: dbError.name,
          errorMessage: dbError.message,
          executionType: 'health-check'
        }
      });
    }

    // KV storage activity indicators
    if (env.USGS_LAST_RESPONSE_KV) {
      try {
        const kvTestStart = Date.now();
        const _kvTest = await env.USGS_LAST_RESPONSE_KV.get('health-check');
        const kvResponseTime = Date.now() - kvTestStart;
        
        const kvLogLevel = kvResponseTime < 50 ? 'info' : kvResponseTime < 200 ? 'warn' : 'error';
        logs.push({
          id: `kv-health-${now}`,
          timestamp: new Date(now).toISOString(),
          level: kvLogLevel,
          component: 'kv',
          message: `KV storage health check completed`,
          details: {
            responseTimeMs: kvResponseTime,
            status: kvResponseTime < 50 ? 'healthy' : kvResponseTime < 200 ? 'degraded' : 'slow',
            executionType: 'health-check'
          }
        });
      } catch (kvError) {
        logs.push({
          id: `kv-error-${now}`,
          timestamp: new Date(now).toISOString(),
          level: 'error',
          component: 'kv',
          message: `KV storage error: ${kvError.message}`,
          details: {
            error: kvError.name,
            errorMessage: kvError.message,
            executionType: 'health-check'
          }
        });
      }
    }

    // USGS API connectivity logs
    try {
      const apiTestStart = Date.now();
      const apiResponse = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson', {
        method: 'HEAD', // Just check connectivity
        signal: AbortSignal.timeout(5000)
      });
      const apiResponseTime = Date.now() - apiTestStart;
      
      const apiLogLevel = apiResponse.ok && apiResponseTime < 2000 ? 'info' : 'warn';
      logs.push({
        id: `api-health-${now}`,
        timestamp: new Date(now).toISOString(),
        level: apiLogLevel,
        component: 'api',
        message: `USGS API connectivity check completed`,
        details: {
          responseTimeMs: apiResponseTime,
          statusCode: apiResponse.status,
          status: apiResponse.ok ? 'healthy' : 'degraded',
          executionType: 'health-check'
        }
      });
    } catch (apiError) {
      logs.push({
        id: `api-error-${now}`,
        timestamp: new Date(now).toISOString(),
        level: 'error',
        component: 'api',
        message: `USGS API error: ${apiError.message}`,
        details: {
          error: apiError.name,
          errorMessage: apiError.message,
          executionType: 'health-check'
        }
      });
    }

    // System startup/initialization logs
    logs.push({
      id: `system-init-${now}`,
      timestamp: new Date(now).toISOString(),
      level: 'info',
      component: 'system',
      message: `System logs endpoint accessed`,
      details: {
        requestFilters: { level, component, limit },
        logGeneration: 'real-time',
        executionType: 'logs-request'
      }
    });

    // Filter and sort logs
    let filteredLogs = logs;
    
    // Filter by level
    if (level !== 'all') {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }
    
    // Filter by component
    if (component !== 'all') {
      filteredLogs = filteredLogs.filter(log => log.component === component);
    }
    
    // Sort by timestamp (newest first)
    filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Apply limit
    filteredLogs = filteredLogs.slice(0, limit);

    const response = {
      logs: filteredLogs,
      metadata: {
        totalLogs: filteredLogs.length,
        filters: { level, component, limit, since: since || 'last 24 hours' },
        generatedAt: new Date().toISOString(),
        queryDuration: Date.now() - startTime,
        logSources: ['database_activity', 'health_checks', 'api_connectivity', 'system_events'],
        note: 'These logs are generated from system activity patterns. For complete Worker execution logs, use `wrangler tail` or Cloudflare Dashboard.'
      }
    };

    return new Response(JSON.stringify(response, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=30', // Cache for 30 seconds
        'X-Query-Duration': (Date.now() - startTime).toString()
      }
    });

  } catch (error) {
    console.error('[system-logs] Error generating logs:', error);
    
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: 'Failed to retrieve system logs',
      details: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}