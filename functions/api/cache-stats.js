/**
 * @file functions/api/cache-stats.js
 * @description Cache performance monitoring endpoint for cluster caching system
 * Provides metrics on cache hit rates, performance, and usage statistics
 */

/**
 * GET /api/cache-stats
 * Returns comprehensive cache performance metrics
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
 * Collect comprehensive cache performance statistics
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
 * Generate cache optimization recommendations
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
 * GET /api/cache-stats/top-keys
 * Returns the top 10 most frequent cache keys
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
 * DELETE /api/cache-stats
 * Cleanup expired cache entries
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