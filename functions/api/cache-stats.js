/**
 * @file Cloudflare Function for monitoring and managing the cluster cache.
 * @module functions/api/cache-stats
 *
 * @description
 * This module provides a set of administrative endpoints for interacting with the `ClusterCache`
 * D1 database table. It allows for retrieving detailed performance statistics, fetching the most
 * frequently used cache keys, and cleaning up expired cache entries.
 *
 * These endpoints are essential for monitoring the health and effectiveness of the caching
 * strategy, identifying potential optimizations, and performing routine maintenance.
 *
 * The provided endpoints are:
 * - `GET /api/cache-stats`: Returns a comprehensive report of cache statistics.
 * - `GET /api/cache-stats/top-keys`: Returns the most frequently used cache keys.
 * - `DELETE /api/cache-stats`: Deletes expired entries from the cache.
 *
 * All endpoints in this module are intended for administrative use.
 */
/**
 * Handles GET requests to `/api/cache-stats`.
 *
 * This function serves as the main entry point for retrieving a comprehensive performance
 * report of the `ClusterCache`. It calls the `collectCacheStatistics` helper function to
 * perform the actual data aggregation from the D1 database and then returns the results
 * as a JSON response.
 *
 * The response is cached at the edge for 60 seconds to reduce load on the database for
 * frequent requests.
 *
 * @async
 * @function onRequestGet
 * @param {object} context - The Cloudflare Pages Function context.
 * @param {object} context.env - The environment object containing the D1 database binding (`DB`).
 * @returns {Promise<Response>} A `Response` object containing a JSON payload with detailed
 *   cache statistics, or a JSON error object if the operation fails.
 */
export async function onRequestGet(context) {
  const { env } = context;
  
  if (!env.DB) {
    return new Response(JSON.stringify({ 
      error: 'Database not available',
      message: 'Cache statistics require D1 database access'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const stats = await collectCacheStatistics(env.DB);
    
    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=60' // Cache stats for 1 minute
      }
    });
  } catch (error) {
    console.error('Error collecting cache statistics:', error);
    return new Response(JSON.stringify({
      error: 'Failed to collect cache statistics',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Collects a comprehensive set of performance and usage statistics for the `ClusterCache` table.
 *
 * This function executes a series of parallel SQL queries against the D1 database to gather
 * metrics related to the cache's size, efficiency, health, and usage patterns. It calculates
 * derived metrics such as cache efficiency, a composite health score, and storage sizes.
 *
 * The collected statistics include:
 * - Total, active, and expired entry counts.
 * - Overall storage size and average entry size.
 * - Recent cache creation activity.
 * - The most frequently used request parameters (top cache keys).
 * - The age distribution of cache entries.
 *
 * Finally, it generates a set of actionable recommendations based on the collected metrics
 * to guide cache optimization efforts.
 *
 * @async
 * @function collectCacheStatistics
 * @param {D1Database} db - The D1 database instance.
 * @returns {Promise<object>} A promise that resolves to a detailed statistics object, including
 *   metadata, health, overview, storage, activity, distribution, and recommendations.
 */
async function collectCacheStatistics(db) {
  const now = new Date().toISOString();
  const queries = {
    // Total cache entries
    totalEntries: "SELECT COUNT(*) as count FROM ClusterCache",
    
    // Active cache entries (within 1 hour TTL)
    activeEntries: "SELECT COUNT(*) as count FROM ClusterCache WHERE createdAt > datetime('now', '-1 hour')",
    
    // Expired entries that need cleanup
    expiredEntries: "SELECT COUNT(*) as count FROM ClusterCache WHERE createdAt <= datetime('now', '-1 hour')",
    
    // Cache size analysis
    cacheSize: `
      SELECT 
        COUNT(*) as entryCount,
        AVG(LENGTH(clusterData)) as avgDataSize,
        MAX(LENGTH(clusterData)) as maxDataSize,
        MIN(LENGTH(clusterData)) as minDataSize,
        SUM(LENGTH(clusterData)) as totalDataSize
      FROM ClusterCache
    `,
    
    // Recent cache activity (last 24 hours)
    recentActivity: `
      SELECT 
        DATE(createdAt) as date,
        COUNT(*) as entriesCreated
      FROM ClusterCache 
      WHERE createdAt > datetime('now', '-24 hours')
      GROUP BY DATE(createdAt)
      ORDER BY date DESC
    `,
    
    // Parameter distribution analysis
    parameterStats: `
      SELECT 
        requestParams,
        COUNT(*) as frequency,
        MAX(createdAt) as lastUsed
      FROM ClusterCache 
      WHERE createdAt > datetime('now', '-7 days')
      GROUP BY requestParams
      ORDER BY frequency DESC
      LIMIT 10
    `,
    
    // Cache age distribution
    ageDistribution: `
      SELECT 
        CASE 
          WHEN createdAt > datetime('now', '-1 hour') THEN '0-1h'
          WHEN createdAt > datetime('now', '-6 hours') THEN '1-6h'
          WHEN createdAt > datetime('now', '-24 hours') THEN '6-24h'
          WHEN createdAt > datetime('now', '-7 days') THEN '1-7d'
          ELSE '7d+'
        END as ageGroup,
        COUNT(*) as count
      FROM ClusterCache
      GROUP BY ageGroup
    `
  };

  // Execute all queries in parallel
  const results = await Promise.all([
    db.prepare(queries.totalEntries).first(),
    db.prepare(queries.activeEntries).first(),
    db.prepare(queries.expiredEntries).first(),
    db.prepare(queries.cacheSize).first(),
    db.prepare(queries.recentActivity).all(),
    db.prepare(queries.parameterStats).all(),
    db.prepare(queries.ageDistribution).all()
  ]);

  const [
    totalResult,
    activeResult,
    expiredResult,
    sizeResult,
    activityResult,
    parameterResult,
    ageResult
  ] = results;

  // Calculate cache efficiency metrics
  const totalEntries = totalResult?.count || 0;
  const activeEntries = activeResult?.count || 0;
  const expiredEntries = expiredResult?.count || 0;
  
  const cacheEfficiency = totalEntries > 0 ? (activeEntries / totalEntries * 100) : 0;
  const avgDataSizeKB = sizeResult?.avgDataSize ? (sizeResult.avgDataSize / 1024) : 0;
  const totalDataSizeMB = sizeResult?.totalDataSize ? (sizeResult.totalDataSize / 1024 / 1024) : 0;

  const cacheHealthScore = (cacheEfficiency * 0.4) + ((1 - (expiredEntries / totalEntries)) * 0.4) + ((1 - Math.min(totalDataSizeMB / 1024, 1)) * 0.2);

  return {
    metadata: {
      timestamp: now,
      source: 'ClusterCache table',
      ttl: '1 hour'
    },
    health: {
      score: Math.round(cacheHealthScore * 100),
      status: cacheHealthScore > 0.8 ? 'Good' : cacheHealthScore > 0.6 ? 'Fair' : 'Poor',
      summary: `Efficiency: ${Math.round(cacheEfficiency)}%, Expired: ${Math.round((expiredEntries / totalEntries) * 100)}%, Size: ${totalDataSizeMB.toFixed(2)}MB`
    },
    overview: {
      totalEntries,
      activeEntries,
      expiredEntries,
      cacheEfficiency: Math.round(cacheEfficiency * 100) / 100,
      needsCleanup: expiredEntries > 0
    },
    storage: {
      totalDataSizeMB: Math.round(totalDataSizeMB * 100) / 100,
      avgEntrySizeKB: Math.round(avgDataSizeKB * 100) / 100,
      maxEntrySizeKB: sizeResult?.maxDataSize ? Math.round(sizeResult.maxDataSize / 1024 * 100) / 100 : 0,
      minEntrySizeKB: sizeResult?.minDataSize ? Math.round(sizeResult.minDataSize / 1024 * 100) / 100 : 0,
      entryCount: sizeResult?.entryCount || 0
    },
    activity: {
      recentDays: activityResult?.results || [],
      topParameters: (parameterResult?.results || []).map(row => ({
        params: row.requestParams,
        frequency: row.frequency,
        lastUsed: row.lastUsed,
        parsedParams: safeParseJSON(row.requestParams)
      }))
    },
    distribution: {
      ageGroups: (ageResult?.results || []).map(row => ({
        ageGroup: row.ageGroup,
        count: row.count,
        percentage: totalEntries > 0 ? Math.round(row.count / totalEntries * 10000) / 100 : 0
      }))
    },
    recommendations: generateCacheRecommendations({
      totalEntries,
      activeEntries, 
      expiredEntries,
      cacheEfficiency,
      totalDataSizeMB,
      avgDataSizeKB,
      topParameters: (parameterResult?.results || [])
    })
  };
}

/**
 * Safely parse JSON with fallback
 */
function safeParseJSON(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch {
    return { error: 'Invalid JSON', raw: jsonString };
  }
}

/**
 * Generates a list of actionable recommendations based on cache performance metrics.
 *
 * This function analyzes the provided metrics to identify potential issues or areas for
 * improvement in the caching strategy. The recommendations are tailored to specific
 * conditions, such as a high number of expired entries, low cache efficiency, or large
 * storage footprint.
 *
 * @function generateCacheRecommendations
 * @param {object} metrics - An object containing key performance indicators of the cache,
 *   such as `expiredEntries`, `cacheEfficiency`, and `totalDataSizeMB`.
 * @returns {Array<object>} An array of recommendation objects. Each object includes a `type`,
 *   `priority`, `message`, and suggested `action`. If the cache is healthy, it returns a
 *   single informational message.
 */
function generateCacheRecommendations(metrics) {
  const recommendations = [];
  
  if (metrics.expiredEntries > 100) {
    recommendations.push({
      type: 'cleanup',
      priority: 'high',
      message: `${metrics.expiredEntries} expired cache entries should be cleaned up`,
      action: 'Run cache cleanup job'
    });
  }
  
  if (metrics.cacheEfficiency < 50) {
    recommendations.push({
      type: 'efficiency',
      priority: 'medium',
      message: `Cache efficiency is ${metrics.cacheEfficiency}% - consider reviewing TTL settings`,
      action: 'Analyze cache access patterns and consider a longer TTL if appropriate.'
    });
  } else if (metrics.cacheEfficiency > 95) {
    recommendations.push({
      type: 'efficiency',
      priority: 'low',
      message: `Cache efficiency is very high (${metrics.cacheEfficiency}%) - you might be able to shorten the TTL to reduce storage.`,
      action: 'Analyze if a shorter TTL is feasible without impacting performance.'
    });
  }
  
  if (metrics.totalDataSizeMB > 100) {
    recommendations.push({
      type: 'storage',
      priority: 'medium',
      message: `Cache using ${metrics.totalDataSizeMB}MB - monitor D1 storage limits`,
      action: 'Review storage usage and consider compression'
    });
  }
  
  if (metrics.avgDataSizeKB > 500) {
    recommendations.push({
      type: 'optimization',
      priority: 'low',
      message: `Large average entry size (${metrics.avgDataSizeKB}KB) - consider data compression`,
      action: 'Implement cluster data compression'
    });
  }

  if (metrics.topParameters && metrics.topParameters.length > 0) {
    recommendations.push({
      type: 'warming',
      priority: 'low',
      message: 'Consider implementing a cache warming strategy for frequently requested parameter sets.',
      action: 'Create a scheduled task to pre-warm the cache with the top 10 most frequent parameter sets.'
    });
  }
  
  if (recommendations.length === 0) {
    recommendations.push({
      type: 'status',
      priority: 'info',
      message: 'Cache performance looks good',
      action: 'Continue monitoring'
    });
  }
  
  return recommendations;
}

/**
 * Handles GET requests to `/api/cache-stats/top-keys`.
 *
 * This endpoint provides a quick way to identify the most frequently used cache keys over the
 * last 7 days. It queries the `ClusterCache` table to find the top 10 `requestParams` values
 * based on their frequency of occurrence.
 *
 * The results can be used for cache warming strategies or to understand the most common
 * user queries. The response is cached at the edge for 1 hour.
 *
 * @async
 * @function onGetTopKeys
 * @param {object} context - The Cloudflare Pages Function context.
 * @param {object} context.env - The environment object containing the D1 database binding (`DB`).
 * @returns {Promise<Response>} A `Response` object containing a JSON array of the top 10
 *   cache keys and their frequencies, or a JSON error object.
 */
export async function onGetTopKeys(context) {
  const { env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify({ 
      error: 'Database not available',
      message: 'Cache statistics require D1 database access'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const query = `
      SELECT 
        requestParams,
        COUNT(*) as frequency
      FROM ClusterCache 
      WHERE createdAt > datetime('now', '-7 days')
      GROUP BY requestParams
      ORDER BY frequency DESC
      LIMIT 10
    `;
    const { results } = await env.DB.prepare(query).all();
    
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=3600' // Cache for 1 hour
      }
    });
  } catch (error) {
    console.error('Error fetching top cache keys:', error);
    return new Response(JSON.stringify({
      error: 'Failed to fetch top cache keys',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handles DELETE requests to `/api/cache-stats` for cleaning up expired cache entries.
 *
 * This function performs a maintenance task by deleting all entries from the `ClusterCache`
 * table that have exceeded their Time-To-Live (TTL), which is currently defined as 1 hour.
 *
 * The process is as follows:
 * 1.  It first queries the database to count how many entries are expired.
 * 2.  If there are no expired entries, it returns a success message indicating no action was needed.
 * 3.  If expired entries exist, it executes a `DELETE` statement to remove them.
 * 4.  It returns a success response including the number of entries that were deleted.
 *
 * This endpoint is critical for managing the size of the cache and ensuring that stale data
 * does not accumulate.
 *
 * @async
 * @function onRequestDelete
 * @param {object} context - The Cloudflare Pages Function context.
 * @param {object} context.env - The environment object containing the D1 database binding (`DB`).
 * @returns {Promise<Response>} A `Response` object with a JSON payload confirming the cleanup
 *   operation and the number of deleted entries, or a JSON error object.
 */
export async function onRequestDelete(context) {
  const { env } = context;
  
  if (!env.DB) {
    return new Response(JSON.stringify({
      error: 'Database not available'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Count expired entries before cleanup
    const countQuery = "SELECT COUNT(*) as count FROM ClusterCache WHERE createdAt <= datetime('now', '-1 hour')";
    const countResult = await env.DB.prepare(countQuery).first();
    const expiredCount = countResult?.count || 0;
    
    if (expiredCount === 0) {
      return new Response(JSON.stringify({
        message: 'No expired cache entries to clean up',
        deletedCount: 0
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Delete expired entries
    const deleteQuery = "DELETE FROM ClusterCache WHERE createdAt <= datetime('now', '-1 hour')";
    const deleteResult = await env.DB.prepare(deleteQuery).run();
    
    console.log(`Cache cleanup: deleted ${deleteResult.changes} expired entries`);
    
    return new Response(JSON.stringify({
      message: 'Cache cleanup completed successfully',
      deletedCount: deleteResult.changes,
      expectedCount: expiredCount
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error during cache cleanup:', error);
    return new Response(JSON.stringify({
      error: 'Cache cleanup failed',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}