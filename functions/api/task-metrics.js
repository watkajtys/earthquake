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
        COUNT(DISTINCT DATE(datetime(time/1000, 'unixepoch'))) as activeDays,
        MIN(time) as oldestRecord,
        MAX(time) as newestRecord,
        AVG(CASE WHEN time > ? THEN 1 ELSE 0 END) as recentDataRatio
      FROM EarthquakeEvents
      WHERE time > ?
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
        DATE(datetime(time/1000, 'unixepoch')) as date,
        COUNT(*) as earthquakeCount,
        AVG(mag) as avgMagnitude,
        MAX(mag) as maxMagnitude,
        COUNT(DISTINCT ROUND(lat, 1) || ',' || ROUND(lon, 1)) as uniqueLocations
      FROM EarthquakeEvents
      WHERE time > ?
      GROUP BY DATE(datetime(time/1000, 'unixepoch'))
      ORDER BY date DESC
      LIMIT 24
    `).bind(timeRangeStart)
      .all();

    if (performanceQuery.results) {
      const dailyData = performanceQuery.results;
      const avgDailyEarthquakes = dailyData.reduce((sum, day) => sum + day.earthquakeCount, 0) / dailyData.length;
      const maxDailyEarthquakes = Math.max(...dailyData.map(day => day.earthquakeCount));
      
      metrics.performance = {
        avgDailyEarthquakes: Math.round(avgDailyEarthquakes),
        maxDailyEarthquakes,
        activeDaysInRange: dailyData.length,
        avgMagnitude: dailyData.reduce((sum, day) => sum + (day.avgMagnitude || 0), 0) / dailyData.length,
        maxMagnitude: Math.max(...dailyData.map(day => day.maxMagnitude || 0)),
        avgUniqueLocations: Math.round(dailyData.reduce((sum, day) => sum + day.uniqueLocations, 0) / dailyData.length)
      };
      
      if (includeDetails) {
        metrics.performance.dailyBreakdown = dailyData;
      }
    }

    // Error Analysis (using data gaps as error indicators)
    const errorAnalysisQuery = await env.DB.prepare(`
      WITH gaps AS (
        SELECT 
          time,
          LAG(time) OVER (ORDER BY time) as prev_time,
          time - LAG(time) OVER (ORDER BY time) as gap_ms
        FROM EarthquakeEvents
        WHERE time > ?
        ORDER BY time
      )
      SELECT 
        COUNT(*) as totalGaps,
        AVG(gap_ms) as avgGapMs,
        MAX(gap_ms) as maxGapMs,
        COUNT(CASE WHEN gap_ms > ? THEN 1 END) as significantGaps
      FROM gaps
      WHERE gap_ms IS NOT NULL
    `).bind(timeRangeStart, 10 * 60 * 1000) // Gaps longer than 10 minutes are significant
      .first();

    if (errorAnalysisQuery) {
      const avgGapMinutes = (errorAnalysisQuery.avgGapMs || 0) / (1000 * 60);
      const maxGapMinutes = (errorAnalysisQuery.maxGapMs || 0) / (1000 * 60);
      
      metrics.errors = {
        totalDataGaps: errorAnalysisQuery.totalGaps || 0,
        avgGapMinutes: Math.round(avgGapMinutes * 10) / 10,
        maxGapMinutes: Math.round(maxGapMinutes),
        significantGaps: errorAnalysisQuery.significantGaps || 0,
        errorRate: errorAnalysisQuery.totalGaps > 0 ? 
          Math.round((errorAnalysisQuery.significantGaps / errorAnalysisQuery.totalGaps) * 100) : 0
      };
    }

    // Cluster Analysis Performance (if cluster definitions exist)
    const clusterMetricsQuery = await env.DB.prepare(`
      SELECT 
        COUNT(*) as totalClusters,
        AVG(quakeCount) as avgQuakesPerCluster,
        MAX(quakeCount) as maxQuakesPerCluster,
        AVG(significanceScore) as avgSignificanceScore,
        MAX(significanceScore) as maxSignificanceScore,
        COUNT(CASE WHEN updatedAt > ? THEN 1 END) as recentClusters
      FROM ClusterDefinitions
      WHERE createdAt > ?
    `).bind(new Date(timeRangeStart).toISOString(), new Date(timeRangeStart).toISOString())
      .first();

    if (clusterMetricsQuery) {
      metrics.clustering = {
        totalClusters: clusterMetricsQuery.totalClusters || 0,
        recentClusters: clusterMetricsQuery.recentClusters || 0,
        avgQuakesPerCluster: Math.round((clusterMetricsQuery.avgQuakesPerCluster || 0) * 10) / 10,
        maxQuakesPerCluster: clusterMetricsQuery.maxQuakesPerCluster || 0,
        avgSignificanceScore: Math.round((clusterMetricsQuery.avgSignificanceScore || 0) * 100) / 100,
        maxSignificanceScore: Math.round((clusterMetricsQuery.maxSignificanceScore || 0) * 100) / 100
      };
    }

    // Trends Analysis (compare with previous period)
    const prevTimeRangeStart = timeRangeStart - timeRangeMs;
    const trendsQuery = await env.DB.prepare(`
      SELECT 
        COUNT(CASE WHEN time > ? THEN 1 END) as currentPeriod,
        COUNT(CASE WHEN time BETWEEN ? AND ? THEN 1 END) as previousPeriod
      FROM EarthquakeEvents
      WHERE time > ?
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