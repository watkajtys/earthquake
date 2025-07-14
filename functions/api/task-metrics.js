/**
 * @file functions/api/task-metrics.js
 * @description Task performance metrics endpoint for monitoring dashboard
 * Provides insights into scheduled task execution and performance
 */

/**
 * Task metrics endpoint
 * GET /api/task-metrics
 * 
 * Returns performance metrics for scheduled tasks including:
 * - Recent execution statistics
 * - Performance trends
 * - Error analysis
 * - Resource utilization
 * 
 * Query parameters:
 * - timeRange: hour|day|week (default: hour)
 * - includeDetails: true|false (default: false)
 */
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const timeRange = url.searchParams.get('timeRange') || 'hour';
  const includeDetails = url.searchParams.get('includeDetails') === 'true';
  
  const startTime = Date.now();
  const metrics = {
    timestamp: new Date().toISOString(),
    timeRange,
    summary: {},
    performance: {},
    errors: {},
    trends: {}
  };

  // Calculate time range boundaries
  const now = Date.now();
  let timeRangeMs;
  switch (timeRange) {
    case 'day':
      timeRangeMs = 24 * 60 * 60 * 1000;
      break;
    case 'week':
      timeRangeMs = 7 * 24 * 60 * 60 * 1000;
      break;
    case 'hour':
    default:
      timeRangeMs = 60 * 60 * 1000;
      break;
  }
  
  const timeRangeStart = now - timeRangeMs;

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({
        error: 'Database not available',
        message: 'Cannot retrieve task metrics without database access'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Summary Statistics
    // Use earthquake data freshness as a proxy for task execution success
    const summaryQuery = await env.DB.prepare(`
      SELECT 
        COUNT(*) as totalEarthquakes,
        COUNT(DISTINCT DATE(datetime(event_time/1000, 'unixepoch'))) as activeDays,
        MIN(event_time) as oldestRecord,
        MAX(event_time) as newestRecord,
        AVG(CASE WHEN event_time > ? THEN 1 ELSE 0 END) as recentDataRatio
      FROM EarthquakeEvents
      WHERE event_time > ?
    `).bind(timeRangeStart, timeRangeStart - (7 * 24 * 60 * 60 * 1000)) // Look back 7 days for context
      .first();

    if (summaryQuery) {
      const dataFreshnessMinutes = (now - summaryQuery.newestRecord) / (1000 * 60);
      const dataSpanHours = (summaryQuery.newestRecord - summaryQuery.oldestRecord) / (1000 * 60 * 60);
      
      metrics.summary = {
        totalEarthquakes: summaryQuery.totalEarthquakes || 0,
        dataFreshnessMinutes: Math.round(dataFreshnessMinutes),
        dataSpanHours: Math.round(dataSpanHours * 10) / 10,
        activeDays: summaryQuery.activeDays || 0,
        lastUpdate: summaryQuery.newestRecord ? new Date(summaryQuery.newestRecord).toISOString() : null,
        dataHealthScore: dataFreshnessMinutes < 10 ? 100 : Math.max(0, 100 - (dataFreshnessMinutes - 10) * 2)
      };
    }

    // Performance Metrics
    // Analyze data ingestion patterns as a proxy for task performance
    const performanceQuery = await env.DB.prepare(`
      SELECT 
        DATE(datetime(event_time/1000, 'unixepoch')) as date,
        COUNT(*) as earthquakeCount,
        AVG(magnitude) as avgMagnitude,
        MAX(magnitude) as maxMagnitude,
        COUNT(DISTINCT ROUND(latitude, 1) || ',' || ROUND(longitude, 1)) as uniqueLocations
      FROM EarthquakeEvents
      WHERE event_time > ?
      GROUP BY DATE(datetime(event_time/1000, 'unixepoch'))
      ORDER BY date DESC
      LIMIT 24
    `).bind(now - (30 * 24 * 60 * 60 * 1000)) // Look back 30 days for chart data
      .all();

    if (performanceQuery.results) {
      const dailyData = performanceQuery.results;
      const avgDailyEarthquakes = dailyData.reduce((sum, day) => sum + day.earthquakeCount, 0) / dailyData.length;
      
      metrics.performance = {
        avgDailyEarthquakes: Math.round(avgDailyEarthquakes),
        activeDaysInRange: dailyData.length,
        avgMagnitude: Math.round((dailyData.reduce((sum, day) => sum + (day.avgMagnitude || 0), 0) / dailyData.length) * 100) / 100,
        avgUniqueLocations: Math.round(dailyData.reduce((sum, day) => sum + day.uniqueLocations, 0) / dailyData.length),
        totalEarthquakesInPeriod: dailyData.reduce((sum, day) => sum + day.earthquakeCount, 0)
      };
      
      // Always include daily breakdown for the dashboard chart
      metrics.performance.dailyBreakdown = dailyData;
    }

    // System Health Analysis (based on data freshness and consistency)
    const now = Date.now();
    const healthAnalysisQuery = await env.DB.prepare(`
      SELECT 
        COUNT(*) as totalRecords,
        MAX(retrieved_at) as lastDataUpdate,
        COUNT(CASE WHEN retrieved_at > ? THEN 1 END) as recentUpdates,
        COUNT(CASE WHEN event_time > retrieved_at THEN 1 END) as futureTimestamps
      FROM EarthquakeEvents
      WHERE retrieved_at > ?
    `).bind(now - (60 * 60 * 1000), timeRangeStart) // Last hour vs time range
      .first();

    if (healthAnalysisQuery) {
      const dataFreshnessMinutes = healthAnalysisQuery.lastDataUpdate ? 
        (now - healthAnalysisQuery.lastDataUpdate) / (1000 * 60) : 999;
      const updateFrequency = healthAnalysisQuery.recentUpdates || 0;
      
      // Calculate a simple error rate based on data freshness
      let errorRate = 0;
      if (dataFreshnessMinutes > 60) errorRate = 25; // High error if data is over 1 hour old
      else if (dataFreshnessMinutes > 30) errorRate = 10; // Medium error if over 30 min
      else if (dataFreshnessMinutes > 10) errorRate = 5; // Low error if over 10 min
      
      metrics.errors = {
        dataFreshnessMinutes: Math.round(dataFreshnessMinutes),
        recentUpdates: updateFrequency,
        errorRate: errorRate,
        dataHealthStatus: dataFreshnessMinutes < 10 ? 'healthy' : 
                         dataFreshnessMinutes < 30 ? 'warning' : 'error',
        futureTimestamps: healthAnalysisQuery.futureTimestamps || 0
      };
    } else {
      metrics.errors = {
        dataFreshnessMinutes: 999,
        recentUpdates: 0,
        errorRate: 50,
        dataHealthStatus: 'error',
        futureTimestamps: 0
      };
    }

    // Cluster Analysis Performance (if cluster definitions exist)
    const clusterMetricsQuery = await env.DB.prepare(`
      SELECT 
        COUNT(*) as totalClusters,
        AVG(quakeCount) as avgQuakesPerCluster,
        AVG(significanceScore) as avgSignificanceScore,
        COUNT(CASE WHEN updatedAt > ? THEN 1 END) as recentClusters
      FROM ClusterDefinitions
      WHERE createdAt > ?
    `).bind(new Date(timeRangeStart).toISOString(), new Date(now - (7 * 24 * 60 * 60 * 1000)).toISOString()) // Look back 7 days for clusters
      .first();

    if (clusterMetricsQuery && clusterMetricsQuery.totalClusters > 0) {
      metrics.clustering = {
        totalClusters: clusterMetricsQuery.totalClusters || 0,
        recentClusters: clusterMetricsQuery.recentClusters || 0,
        avgQuakesPerCluster: Math.round((clusterMetricsQuery.avgQuakesPerCluster || 0) * 10) / 10,
        avgSignificanceScore: Math.round((clusterMetricsQuery.avgSignificanceScore || 0) * 100) / 100
      };
    } else {
      // Default clustering data when no clusters exist
      metrics.clustering = {
        totalClusters: 0,
        recentClusters: 0,
        avgQuakesPerCluster: 0,
        avgSignificanceScore: 0
      };
    }

    // Trends Analysis (compare with previous period)
    const prevTimeRangeStart = timeRangeStart - timeRangeMs;
    const trendsQuery = await env.DB.prepare(`
      SELECT 
        COUNT(CASE WHEN event_time > ? THEN 1 END) as currentPeriod,
        COUNT(CASE WHEN event_time BETWEEN ? AND ? THEN 1 END) as previousPeriod
      FROM EarthquakeEvents
      WHERE event_time > ?
    `).bind(timeRangeStart, prevTimeRangeStart, timeRangeStart, prevTimeRangeStart)
      .first();

    if (trendsQuery) {
      const currentCount = trendsQuery.currentPeriod || 0;
      const previousCount = trendsQuery.previousPeriod || 0;
      const percentChange = previousCount > 0 ? 
        Math.round(((currentCount - previousCount) / previousCount) * 100) : 0;
      
      metrics.trends = {
        currentPeriodEarthquakes: currentCount,
        previousPeriodEarthquakes: previousCount,
        percentChange,
        trend: percentChange > 10 ? 'increasing' : percentChange < -10 ? 'decreasing' : 'stable'
      };
    }

    // Add metadata
    metrics.metadata = {
      generatedAt: new Date().toISOString(),
      queryDuration: Date.now() - startTime,
      timeRangeStart: new Date(timeRangeStart).toISOString(),
      timeRangeEnd: new Date(now).toISOString(),
      includeDetails
    };

    return new Response(JSON.stringify(metrics, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=60', // Cache for 1 minute
        'X-Query-Duration': metrics.metadata.queryDuration.toString()
      }
    });

  } catch (error) {
    console.error('[task-metrics] Error generating metrics:', error);
    
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: 'Failed to generate task metrics',
      details: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}