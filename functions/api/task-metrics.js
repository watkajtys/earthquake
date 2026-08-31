async function onRequestGet6(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const timeRange = url.searchParams.get("timeRange") || "hour";
  const includeDetails = url.searchParams.get("includeDetails") === "true";
  const startTime = Date.now();
  const metrics = {
    timestamp: /* @__PURE__ */ new Date().toISOString(),
    timeRange,
    summary: {},
    performance: {},
    errors: {},
    trends: {},
  };
  const now = Date.now();
  let timeRangeMs;
  switch (timeRange) {
    case "day":
      timeRangeMs = 24 * 60 * 60 * 1e3;
      break;
    case "week":
      timeRangeMs = 7 * 24 * 60 * 60 * 1e3;
      break;
    case "hour":
    default:
      timeRangeMs = 60 * 60 * 1e3;
      break;
  }
  const timeRangeStart = now - timeRangeMs;
  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({
          error: "Database not available",
          message: "Cannot retrieve task metrics without database access",
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    try {
      const summaryQuery = await env.DB.prepare(
        `
        SELECT 
          COUNT(*) as totalEarthquakes,
          COUNT(DISTINCT DATE(datetime(event_time/1000, 'unixepoch'))) as activeDays,
          MIN(event_time) as oldestRecord,
          MAX(event_time) as newestRecord
        FROM EarthquakeEvents
        WHERE event_time > ?
      `,
      )
        .bind(timeRangeStart)
        .first();
      if (summaryQuery && summaryQuery.totalEarthquakes > 0) {
        const currentTime = Date.now();
        const dataFreshnessMinutes = summaryQuery.newestRecord
          ? (currentTime - summaryQuery.newestRecord) / (1e3 * 60)
          : 999;
        const dataSpanHours =
          summaryQuery.newestRecord && summaryQuery.oldestRecord
            ? (summaryQuery.newestRecord - summaryQuery.oldestRecord) /
              (1e3 * 60 * 60)
            : 0;
        metrics.summary = {
          totalEarthquakes: summaryQuery.totalEarthquakes || 0,
          dataFreshnessMinutes: Math.round(dataFreshnessMinutes),
          dataSpanHours: Math.round(dataSpanHours * 10) / 10,
          activeDays: summaryQuery.activeDays || 0,
          lastUpdate: summaryQuery.newestRecord
            ? new Date(summaryQuery.newestRecord).toISOString()
            : null,
          dataHealthScore:
            dataFreshnessMinutes < 10
              ? 100
              : Math.max(0, 100 - (dataFreshnessMinutes - 10) * 2),
        };
      } else {
        metrics.summary = {
          totalEarthquakes: 0,
          dataFreshnessMinutes: 0,
          dataSpanHours: 0,
          activeDays: 0,
          lastUpdate: null,
          dataHealthScore: 0,
        };
      }
    } catch (summaryError) {
      console.error("[task-metrics] Summary analysis error:", summaryError);
      metrics.summary = {
        totalEarthquakes: 0,
        dataFreshnessMinutes: 999,
        dataSpanHours: 0,
        activeDays: 0,
        lastUpdate: null,
        dataHealthScore: 0,
      };
    }
    try {
      const dataCheckQuery = await env.DB.prepare(
        "SELECT COUNT(*) as total FROM EarthquakeEvents",
      ).first();
      if (dataCheckQuery && dataCheckQuery.total > 0) {
        let lookbackDays;
        switch (timeRange) {
          case "week":
            lookbackDays = 30;
            break;
          // Show more history for weekly view
          case "day":
            lookbackDays = 14;
            break;
          // Show 2 weeks for daily view
          case "hour":
          default:
            lookbackDays = 7;
            break;
        }
        const performanceQuery = await env.DB.prepare(
          `
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
        `,
        )
          .bind(Date.now() - lookbackDays * 24 * 60 * 60 * 1e3)
          .all();
        if (performanceQuery.results && performanceQuery.results.length > 0) {
          const dailyData = performanceQuery.results.filter(
            (day) => day && day.date && typeof day.earthquakeCount === "number",
          );
          const avgDailyEarthquakes =
            dailyData.length > 0
              ? dailyData.reduce((sum, day) => sum + day.earthquakeCount, 0) /
                dailyData.length
              : 0;
          metrics.performance = {
            avgDailyEarthquakes: Math.round(avgDailyEarthquakes),
            activeDaysInRange: dailyData.length,
            avgMagnitude:
              dailyData.length > 0
                ? Math.round(
                    (dailyData.reduce(
                      (sum, day) => sum + (day.avgMagnitude || 0),
                      0,
                    ) /
                      dailyData.length) *
                      100,
                  ) / 100
                : 0,
            avgUniqueLocations:
              dailyData.length > 0
                ? Math.round(
                    dailyData.reduce(
                      (sum, day) => sum + (day.uniqueLocations || 0),
                      0,
                    ) / dailyData.length,
                  )
                : 0,
            totalEarthquakesInPeriod: dailyData.reduce(
              (sum, day) => sum + day.earthquakeCount,
              0,
            ),
          };
          metrics.performance.dailyBreakdown = dailyData;
        } else {
          const recentDataQuery = await env.DB.prepare(
            `
            SELECT 
              COUNT(*) as total,
              MAX(event_time) as lastEvent,
              MIN(event_time) as firstEvent
            FROM EarthquakeEvents
          `,
          ).first();
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
              firstEvent: recentDataQuery?.firstEvent,
            },
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
          debugInfo: { message: "No data in database" },
        };
      }
    } catch (performanceError) {
      console.error(
        "[task-metrics] Performance analysis error:",
        performanceError,
      );
      metrics.performance = {
        avgDailyEarthquakes: 0,
        activeDaysInRange: 0,
        avgMagnitude: 0,
        avgUniqueLocations: 0,
        totalEarthquakesInPeriod: 0,
        dailyBreakdown: [],
        debugInfo: { error: performanceError.message },
      };
    }
    try {
      const healthAnalysisQuery = await env.DB.prepare(
        `
        SELECT 
          COUNT(*) as totalRecords,
          MAX(retrieved_at) as lastDataUpdate,
          MIN(retrieved_at) as firstDataUpdate
        FROM EarthquakeEvents
        WHERE retrieved_at > ?
      `,
      )
        .bind(Date.now() - 24 * 60 * 60 * 1e3)
        .first();
      if (healthAnalysisQuery && healthAnalysisQuery.totalRecords > 0) {
        const dataFreshnessMinutes = healthAnalysisQuery.lastDataUpdate
          ? (Date.now() - healthAnalysisQuery.lastDataUpdate) / (1e3 * 60)
          : 999;
        let errorRate = 0;
        if (dataFreshnessMinutes > 60) errorRate = 25;
        else if (dataFreshnessMinutes > 30) errorRate = 10;
        else if (dataFreshnessMinutes > 10) errorRate = 5;
        metrics.errors = {
          dataFreshnessMinutes: Math.round(dataFreshnessMinutes),
          totalRecords: healthAnalysisQuery.totalRecords,
          errorRate,
          dataHealthStatus:
            dataFreshnessMinutes < 10
              ? "healthy"
              : dataFreshnessMinutes < 30
                ? "warning"
                : "error",
        };
      } else {
        metrics.errors = {
          dataFreshnessMinutes: 0,
          totalRecords: 0,
          errorRate: 0,
          dataHealthStatus: "no_data",
        };
      }
    } catch (healthError) {
      console.error("[task-metrics] Health analysis error:", healthError);
      metrics.errors = {
        dataFreshnessMinutes: 999,
        totalRecords: 0,
        errorRate: 50,
        dataHealthStatus: "error",
      };
    }
    try {
      const clusterCheckQuery = await env.DB.prepare(
        "SELECT COUNT(*) as total FROM ClusterDefinitions",
      ).first();
      if (clusterCheckQuery && clusterCheckQuery.total > 0) {
        const clusterMetricsQuery = await env.DB.prepare(
          `
          SELECT 
            COUNT(*) as totalClusters,
            AVG(quakeCount) as avgQuakesPerCluster,
            MAX(quakeCount) as maxQuakesPerCluster,
            COUNT(CASE WHEN updatedAt > datetime('now', '-7 days') THEN 1 END) as recentClusters
          FROM ClusterDefinitions
        `,
        ).first();
        if (clusterMetricsQuery) {
          metrics.clustering = {
            totalClusters: clusterMetricsQuery.totalClusters || 0,
            recentClusters: clusterMetricsQuery.recentClusters || 0,
            avgQuakesPerCluster:
              Math.round((clusterMetricsQuery.avgQuakesPerCluster || 0) * 10) /
              10,
            maxQuakesPerCluster: clusterMetricsQuery.maxQuakesPerCluster || 0,
          };
        } else {
          metrics.clustering = {
            totalClusters: 0,
            recentClusters: 0,
            avgQuakesPerCluster: 0,
            maxQuakesPerCluster: 0,
          };
        }
      } else {
        metrics.clustering = {
          totalClusters: 0,
          recentClusters: 0,
          avgQuakesPerCluster: 0,
          maxQuakesPerCluster: 0,
          debugInfo: { message: "No clusters in database" },
        };
      }
    } catch (clusterError) {
      console.error("[task-metrics] Cluster analysis error:", clusterError);
      metrics.clustering = {
        totalClusters: 0,
        recentClusters: 0,
        avgQuakesPerCluster: 0,
        maxQuakesPerCluster: 0,
        debugInfo: { error: clusterError.message },
      };
    }
    try {
      const prevTimeRangeStart = timeRangeStart - timeRangeMs;
      const trendsQuery = await env.DB.prepare(
        `
        SELECT 
          COUNT(CASE WHEN event_time >= ? THEN 1 END) as currentPeriod,
          COUNT(CASE WHEN event_time >= ? AND event_time < ? THEN 1 END) as previousPeriod
        FROM EarthquakeEvents
        WHERE event_time >= ?
      `,
      )
        .bind(
          timeRangeStart,
          prevTimeRangeStart,
          timeRangeStart,
          prevTimeRangeStart,
        )
        .first();
      if (trendsQuery) {
        const currentCount = trendsQuery.currentPeriod || 0;
        const previousCount = trendsQuery.previousPeriod || 0;
        const percentChange =
          previousCount > 0
            ? Math.round(((currentCount - previousCount) / previousCount) * 100)
            : 0;
        metrics.trends = {
          currentPeriodEarthquakes: currentCount,
          previousPeriodEarthquakes: previousCount,
          percentChange,
          trend:
            percentChange > 10
              ? "increasing"
              : percentChange < -10
                ? "decreasing"
                : "stable",
        };
      } else {
        metrics.trends = {
          currentPeriodEarthquakes: 0,
          previousPeriodEarthquakes: 0,
          percentChange: 0,
          trend: "stable",
        };
      }
    } catch (trendsError) {
      console.error("[task-metrics] Trends analysis error:", trendsError);
      metrics.trends = {
        currentPeriodEarthquakes: 0,
        previousPeriodEarthquakes: 0,
        percentChange: 0,
        trend: "stable",
      };
    }
    metrics.metadata = {
      generatedAt: /* @__PURE__ */ new Date().toISOString(),
      queryDuration: Date.now() - startTime,
      timeRangeStart: new Date(timeRangeStart).toISOString(),
      timeRangeEnd: new Date(now).toISOString(),
      includeDetails,
    };
    return new Response(JSON.stringify(metrics, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "max-age=60",
        // Cache for 1 minute
        "X-Query-Duration": metrics.metadata.queryDuration.toString(),
      },
    });
  } catch (error) {
    console.error("[task-metrics] Error generating metrics:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: "Failed to generate task metrics",
        details: error.message,
        timestamp: /* @__PURE__ */ new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export { onRequestGet6 as onRequestGet };
