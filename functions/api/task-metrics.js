/**
 * @file Cloudflare Function for generating and retrieving task performance metrics.
 * @module functions/api/task-metrics
 *
 * @description
 * This administrative endpoint is designed to provide deep insights into the performance and
 * health of the system's background data processing tasks. Since scheduled tasks in Cloudflare
 * Workers do not have a dedicated metrics API, this function infers their performance by
 * analyzing the data they produce in the D1 database.
 *
 * It aggregates data from the `EarthquakeEvents` and `ClusterDefinitions` tables to generate
 * a rich set of metrics, including:
 * - **Summary Statistics**: A high-level overview of data freshness and volume.
 * - **Performance Analysis**: A breakdown of data ingestion patterns over time.
 * - **Error & Health Metrics**: An inferred error rate based on data staleness.
 * - **Clustering Performance**: Metrics on the output of the cluster analysis process.
 * - **Trend Analysis**: A comparison of data volume against a previous time period.
 *
 * The endpoint supports filtering by time range (`hour`, `day`, `week`) to allow for both
 * real-time and historical analysis. It is a key tool for monitoring the reliability and
 * efficiency of the entire data pipeline.
 */
/**
 * Handles GET requests to the `/api/task-metrics` endpoint.
 *
 * This function generates a comprehensive JSON report on the performance of background tasks
 * by querying and analyzing data in the D1 database. It accepts a `timeRange` query parameter
 * to define the primary window for analysis.
 *
 * The function is structured into several sub-sections, each responsible for a different
 * aspect of the analysis:
 * 1.  **Summary Statistics**: Calculates total records, data freshness, and an overall health score.
 * 2.  **Performance Metrics**: Analyzes the daily volume of ingested data to understand task throughput.
 * 3.  **Error Analysis**: Infers an "error rate" based on how up-to-date the data is.
 * 4.  **Clustering Metrics**: Gathers statistics on the cluster definitions being generated.
 * 5.  **Trend Analysis**: Compares the volume of data in the current period to the previous
 *     period to identify trends.
 *
 * The final report is returned as a JSON object, cached at the edge for 60 seconds to
 * balance data freshness with performance.
 *
 * @async
 * @function onRequestGet
 * @param {object} context - The Cloudflare Pages Function context.
 * @param {Request} context.request - The incoming HTTP request object.
 * @param {object} context.env - The environment object containing the D1 database binding (`DB`).
 * @returns {Promise<Response>} A `Response` object containing the detailed metrics report as a
 *   JSON payload, or a JSON error object if the process fails.
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

    // Summary Statistics for the selected time range
    try {
      const summaryQuery = await env.DB.prepare(`
        SELECT 
          COUNT(*) as totalEarthquakes,
          COUNT(DISTINCT DATE(datetime(event_time/1000, 'unixepoch'))) as activeDays,
          MIN(event_time) as oldestRecord,
          MAX(event_time) as newestRecord
        FROM EarthquakeEvents
        WHERE event_time > ?
      `).bind(timeRangeStart)
        .first();


      if (summaryQuery && summaryQuery.totalEarthquakes > 0) {
        const currentTime = Date.now();
        const dataFreshnessMinutes = summaryQuery.newestRecord ? (currentTime - summaryQuery.newestRecord) / (1000 * 60) : 999;
        const dataSpanHours = (summaryQuery.newestRecord && summaryQuery.oldestRecord) ? 
          (summaryQuery.newestRecord - summaryQuery.oldestRecord) / (1000 * 60 * 60) : 0;
        
        metrics.summary = {
          totalEarthquakes: summaryQuery.totalEarthquakes || 0,
          dataFreshnessMinutes: Math.round(dataFreshnessMinutes),
          dataSpanHours: Math.round(dataSpanHours * 10) / 10,
          activeDays: summaryQuery.activeDays || 0,
          lastUpdate: summaryQuery.newestRecord ? new Date(summaryQuery.newestRecord).toISOString() : null,
          dataHealthScore: dataFreshnessMinutes < 10 ? 100 : Math.max(0, 100 - (dataFreshnessMinutes - 10) * 2)
        };
      } else {
        // Default summary when no data available
        metrics.summary = {
          totalEarthquakes: 0,
          dataFreshnessMinutes: 0,
          dataSpanHours: 0,
          activeDays: 0,
          lastUpdate: null,
          dataHealthScore: 0
        };
      }
    } catch (summaryError) {
      console.error('[task-metrics] Summary analysis error:', summaryError);
      metrics.summary = {
        totalEarthquakes: 0,
        dataFreshnessMinutes: 999,
        dataSpanHours: 0,
        activeDays: 0,
        lastUpdate: null,
        dataHealthScore: 0
      };
    }

    // Performance Metrics
    // Analyze data ingestion patterns as a proxy for task performance
    try {
      // First check if we have any data at all
      const dataCheckQuery = await env.DB.prepare('SELECT COUNT(*) as total FROM EarthquakeEvents').first();
      
      if (dataCheckQuery && dataCheckQuery.total > 0) {
        // Query for daily breakdown - use appropriate time range based on selection
        let lookbackDays;
        switch (timeRange) {
          case 'week': lookbackDays = 30; break;  // Show more history for weekly view
          case 'day': lookbackDays = 14; break;   // Show 2 weeks for daily view
          case 'hour': 
          default: lookbackDays = 7; break;       // Show week for hourly view
        }
        
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
        `).bind(Date.now() - (lookbackDays * 24 * 60 * 60 * 1000))
          .all();


        if (performanceQuery.results && performanceQuery.results.length > 0) {
          const dailyData = performanceQuery.results.filter(day => 
            day && day.date && typeof day.earthquakeCount === 'number'
          );
          
          const avgDailyEarthquakes = dailyData.length > 0 ? 
            dailyData.reduce((sum, day) => sum + day.earthquakeCount, 0) / dailyData.length : 0;
          
          metrics.performance = {
            avgDailyEarthquakes: Math.round(avgDailyEarthquakes),
            activeDaysInRange: dailyData.length,
            avgMagnitude: dailyData.length > 0 ? 
              Math.round((dailyData.reduce((sum, day) => sum + (day.avgMagnitude || 0), 0) / dailyData.length) * 100) / 100 : 0,
            avgUniqueLocations: dailyData.length > 0 ? 
              Math.round(dailyData.reduce((sum, day) => sum + (day.uniqueLocations || 0), 0) / dailyData.length) : 0,
            totalEarthquakesInPeriod: dailyData.reduce((sum, day) => sum + day.earthquakeCount, 0)
          };
          
          // Always include daily breakdown for the dashboard chart
          metrics.performance.dailyBreakdown = dailyData;
        } else {
          // Try a broader query to see if there's any recent data at all
          const recentDataQuery = await env.DB.prepare(`
            SELECT 
              COUNT(*) as total,
              MAX(event_time) as lastEvent,
              MIN(event_time) as firstEvent
            FROM EarthquakeEvents
          `).first();
          
          
          metrics.performance = {
            avgDailyEarthquakes: 0,
            activeDaysInRange: 0,
            avgMagnitude: 0,
            avgUniqueLocations: 0,
            totalEarthquakesInPeriod: 0,
            dailyBreakdown: [],
            debugInfo: {
              totalInDb: recentDataQuery?.total || 0,
              lastEvent: recentDataQuery?.lastEvent,
              firstEvent: recentDataQuery?.firstEvent
            }
          };
        }
      } else {
        metrics.performance = {
          avgDailyEarthquakes: 0,
          activeDaysInRange: 0,
          avgMagnitude: 0,
          avgUniqueLocations: 0,
          totalEarthquakesInPeriod: 0,
          dailyBreakdown: [],
          debugInfo: { message: 'No data in database' }
        };
      }
    } catch (performanceError) {
      console.error('[task-metrics] Performance analysis error:', performanceError);
      metrics.performance = {
        avgDailyEarthquakes: 0,
        activeDaysInRange: 0,
        avgMagnitude: 0,
        avgUniqueLocations: 0,
        totalEarthquakesInPeriod: 0,
        dailyBreakdown: [],
        debugInfo: { error: performanceError.message }
      };
    }

    // System Health Analysis - check data freshness regardless of time range
    try {
      const healthAnalysisQuery = await env.DB.prepare(`
        SELECT 
          COUNT(*) as totalRecords,
          MAX(retrieved_at) as lastDataUpdate,
          MIN(retrieved_at) as firstDataUpdate
        FROM EarthquakeEvents
        WHERE retrieved_at > ?
      `).bind(Date.now() - (24 * 60 * 60 * 1000)) // Always check last 24h for health
        .first();

      if (healthAnalysisQuery && healthAnalysisQuery.totalRecords > 0) {
        const dataFreshnessMinutes = healthAnalysisQuery.lastDataUpdate ? 
          (Date.now() - healthAnalysisQuery.lastDataUpdate) / (1000 * 60) : 999;
        
        // Calculate a simple error rate based on data freshness
        let errorRate = 0;
        if (dataFreshnessMinutes > 60) errorRate = 25;
        else if (dataFreshnessMinutes > 30) errorRate = 10;
        else if (dataFreshnessMinutes > 10) errorRate = 5;
        
        metrics.errors = {
          dataFreshnessMinutes: Math.round(dataFreshnessMinutes),
          totalRecords: healthAnalysisQuery.totalRecords,
          errorRate: errorRate,
          dataHealthStatus: dataFreshnessMinutes < 10 ? 'healthy' : 
                           dataFreshnessMinutes < 30 ? 'warning' : 'error'
        };
      } else {
        // No data found - likely a new system
        metrics.errors = {
          dataFreshnessMinutes: 0,
          totalRecords: 0,
          errorRate: 0,
          dataHealthStatus: 'no_data'
        };
      }
    } catch (healthError) {
      console.error('[task-metrics] Health analysis error:', healthError);
      metrics.errors = {
        dataFreshnessMinutes: 999,
        totalRecords: 0,
        errorRate: 50,
        dataHealthStatus: 'error'
      };
    }

    // Cluster Analysis Performance (simplified query)
    try {
      // First check if ClusterDefinitions table exists and has data
      const clusterCheckQuery = await env.DB.prepare('SELECT COUNT(*) as total FROM ClusterDefinitions').first();
      
      if (clusterCheckQuery && clusterCheckQuery.total > 0) {
        // Simple query to get cluster metrics
        const clusterMetricsQuery = await env.DB.prepare(`
          SELECT 
            COUNT(*) as totalClusters,
            AVG(quakeCount) as avgQuakesPerCluster,
            MAX(quakeCount) as maxQuakesPerCluster,
            COUNT(CASE WHEN updatedAt > datetime('now', '-7 days') THEN 1 END) as recentClusters
          FROM ClusterDefinitions
        `).first();


        if (clusterMetricsQuery) {
          metrics.clustering = {
            totalClusters: clusterMetricsQuery.totalClusters || 0,
            recentClusters: clusterMetricsQuery.recentClusters || 0,
            avgQuakesPerCluster: Math.round((clusterMetricsQuery.avgQuakesPerCluster || 0) * 10) / 10,
            maxQuakesPerCluster: clusterMetricsQuery.maxQuakesPerCluster || 0
          };
        } else {
          metrics.clustering = {
            totalClusters: 0,
            recentClusters: 0,
            avgQuakesPerCluster: 0,
            maxQuakesPerCluster: 0
          };
        }
      } else {
        metrics.clustering = {
          totalClusters: 0,
          recentClusters: 0,
          avgQuakesPerCluster: 0,
          maxQuakesPerCluster: 0,
          debugInfo: { message: 'No clusters in database' }
        };
      }
    } catch (clusterError) {
      console.error('[task-metrics] Cluster analysis error:', clusterError);
      metrics.clustering = {
        totalClusters: 0,
        recentClusters: 0,
        avgQuakesPerCluster: 0,
        maxQuakesPerCluster: 0,
        debugInfo: { error: clusterError.message }
      };
    }

    // Trends Analysis (compare with previous period of same duration)
    try {
      const prevTimeRangeStart = timeRangeStart - timeRangeMs;
      const trendsQuery = await env.DB.prepare(`
        SELECT 
          COUNT(CASE WHEN event_time >= ? THEN 1 END) as currentPeriod,
          COUNT(CASE WHEN event_time >= ? AND event_time < ? THEN 1 END) as previousPeriod
        FROM EarthquakeEvents
        WHERE event_time >= ?
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
      } else {
        metrics.trends = {
          currentPeriodEarthquakes: 0,
          previousPeriodEarthquakes: 0,
          percentChange: 0,
          trend: 'stable'
        };
      }
    } catch (trendsError) {
      console.error('[task-metrics] Trends analysis error:', trendsError);
      metrics.trends = {
        currentPeriodEarthquakes: 0,
        previousPeriodEarthquakes: 0,
        percentChange: 0,
        trend: 'stable'
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