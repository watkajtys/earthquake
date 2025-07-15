/**
 * @file functions/api/system-logs.js
 * @description System logs endpoint for accessing Worker execution logs
 * Provides access to structured logs from the enhanced logging system
 */

/**
 * System logs endpoint
 * GET /api/system-logs
 * 
 * Returns recent system logs including:
 * - Scheduled task execution logs
 * - API call performance logs
 * - Database operation logs
 * - Error logs and system events
 * 
 * Query parameters:
 * - level: error|warn|info|debug (default: all)
 * - limit: number of logs to return (default: 50, max: 200)
 * - component: filter by component (scheduled, api, database, kv)
 * - since: timestamp to filter logs from (ISO string or unix timestamp)
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