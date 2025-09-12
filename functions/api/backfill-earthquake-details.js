/**
 * @file Cloudflare Function to backfill earthquake detail data from USGS
 * Fetches detail endpoints to populate product availability flags
 */

// Helper to return JSON response
const jsonResponse = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: { "Content-Type": "application/json" },
  });
};

// Helper to add delay between requests (rate limiting)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Extracts product flags from USGS detail response
 */
export function extractProductFlags(detailData) {
  const flags = {
    has_shakemap: false,
    has_moment_tensor: false,
    has_focal_mechanism: false,
    has_dyfi: false,
    has_losspager: false,
    has_finite_fault: false,
    has_enhanced_data: false,  // Computed flag
    products_json: null
  };

  if (!detailData?.properties?.products) {
    return flags;
  }

  const products = detailData.properties.products;
  
  // Check for each product type
  flags.has_shakemap = !!(products.shakemap && products.shakemap.length > 0);
  flags.has_moment_tensor = !!(products['moment-tensor'] && products['moment-tensor'].length > 0);
  flags.has_focal_mechanism = !!(products['focal-mechanism'] && products['focal-mechanism'].length > 0);
  flags.has_dyfi = !!(products.dyfi && products.dyfi.length > 0);
  flags.has_losspager = !!(products.losspager && products.losspager.length > 0);
  flags.has_finite_fault = !!(products['finite-fault'] && products['finite-fault'].length > 0);
  
  // Set the enhanced data flag if ANY significant products exist
  flags.has_enhanced_data = flags.has_shakemap || 
                            flags.has_moment_tensor || 
                            flags.has_focal_mechanism || 
                            flags.has_finite_fault || 
                            flags.has_losspager ||
                            flags.has_dyfi;
  
  // Store the product keys (not the full data to save space)
  const productKeys = Object.keys(products);
  flags.products_json = JSON.stringify(productKeys);

  return flags;
}

/**
 * Handles GET requests to backfill earthquake details
 * Query parameters:
 * - batch_size: Number of earthquakes to process (default 10, max 100)
 * - min_magnitude: Minimum magnitude to process (default 3.0)
 * - max_age_days: Maximum age in days (default 365)
 * - continue_from: ID to continue from (for resuming)
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Parse query parameters
  const batchSize = Math.min(parseInt(url.searchParams.get("batch_size") || "10"), 100);
  const minMagnitude = parseFloat(url.searchParams.get("min_magnitude") || "3.0");
  const maxAgeDays = parseInt(url.searchParams.get("max_age_days") || "365");
  const continueFrom = url.searchParams.get("continue_from");
  
  if (!env.DB) {
    return jsonResponse({ error: "Database not configured" }, 500);
  }

  const startTime = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const minEventTime = Date.now() - maxAgeMs;

  try {
    // Build query to get earthquakes without detail data
    let query = `
      SELECT id, magnitude, place, event_time, usgs_detail_url
      FROM EarthquakeEvents
      WHERE detail_fetched = FALSE
        AND magnitude >= ?
        AND event_time >= ?
    `;
    
    const params = [minMagnitude, minEventTime];
    
    if (continueFrom) {
      query += ` AND id > ?`;
      params.push(continueFrom);
    }
    
    query += ` ORDER BY magnitude DESC, event_time DESC LIMIT ?`;
    params.push(batchSize);

    // Get earthquakes to process
    const stmt = env.DB.prepare(query).bind(...params);
    const result = await stmt.all();
    
    if (!result.results || result.results.length === 0) {
      return jsonResponse({
        message: "No earthquakes to backfill",
        criteria: { minMagnitude, maxAgeDays, batchSize }
      });
    }

    const earthquakes = result.results;
    const processed = [];
    const errors = [];
    
    console.log(`[backfill] Processing ${earthquakes.length} earthquakes`);

    // Process each earthquake
    for (const earthquake of earthquakes) {
      try {
        // Construct detail URL if not provided
        const detailUrl = earthquake.usgs_detail_url || 
          `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${earthquake.id}.geojson`;
        
        console.log(`[backfill] Fetching details for ${earthquake.id} (M${earthquake.magnitude})`);
        
        // Fetch detail data from USGS
        const response = await fetch(detailUrl, {
          headers: {
            "User-Agent": "EarthquakesLive-Backfill/1.0 (+https://earthquakeslive.com)"
          }
        });

        if (!response.ok) {
          throw new Error(`USGS API returned ${response.status}`);
        }

        const detailData = await response.json();
        
        // Extract product flags
        const flags = extractProductFlags(detailData);
        
        // Update database with product information
        const updateStmt = env.DB.prepare(`
          UPDATE EarthquakeEvents
          SET has_shakemap = ?,
              has_moment_tensor = ?,
              has_focal_mechanism = ?,
              has_dyfi = ?,
              has_losspager = ?,
              has_finite_fault = ?,
              has_enhanced_data = ?,
              products_json = ?,
              detail_fetched = TRUE,
              detail_fetch_time = ?
          WHERE id = ?
        `).bind(
          flags.has_shakemap,
          flags.has_moment_tensor,
          flags.has_focal_mechanism,
          flags.has_dyfi,
          flags.has_losspager,
          flags.has_finite_fault,
          flags.has_enhanced_data,
          flags.products_json,
          Date.now(),
          earthquake.id
        );
        
        await updateStmt.run();
        
        processed.push({
          id: earthquake.id,
          magnitude: earthquake.magnitude,
          products_found: {
            shakemap: flags.has_shakemap,
            moment_tensor: flags.has_moment_tensor,
            focal_mechanism: flags.has_focal_mechanism,
            dyfi: flags.has_dyfi,
            losspager: flags.has_losspager,
            finite_fault: flags.has_finite_fault
          }
        });
        
        // Rate limiting: wait 1 second between requests
        await delay(1000);
        
      } catch (error) {
        console.error(`[backfill] Error processing ${earthquake.id}: ${error.message}`);
        errors.push({
          id: earthquake.id,
          error: error.message
        });
      }
    }

    // Get statistics
    const statsStmt = env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN detail_fetched = TRUE THEN 1 ELSE 0 END) as fetched,
        SUM(CASE WHEN has_shakemap = TRUE THEN 1 ELSE 0 END) as with_shakemap,
        SUM(CASE WHEN has_moment_tensor = TRUE THEN 1 ELSE 0 END) as with_moment_tensor
      FROM EarthquakeEvents
      WHERE magnitude >= ?
    `).bind(minMagnitude);
    
    const stats = await statsStmt.first();
    
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    const lastProcessedId = processed.length > 0 ? processed[processed.length - 1].id : null;

    return jsonResponse({
      success: true,
      processed: processed.length,
      errors: errors.length,
      elapsed_seconds: elapsedSeconds,
      last_processed_id: lastProcessedId,
      continue_url: lastProcessedId ? 
        `${url.pathname}?batch_size=${batchSize}&min_magnitude=${minMagnitude}&max_age_days=${maxAgeDays}&continue_from=${lastProcessedId}` : 
        null,
      statistics: {
        total_earthquakes: stats.total,
        total_fetched: stats.fetched,
        remaining: stats.total - stats.fetched,
        with_shakemap: stats.with_shakemap,
        with_moment_tensor: stats.with_moment_tensor,
        completion_percentage: ((stats.fetched / stats.total) * 100).toFixed(2)
      },
      processed_earthquakes: processed,
      error_earthquakes: errors
    });

  } catch (error) {
    console.error(`[backfill] Unexpected error: ${error.message}`, error);
    return jsonResponse({ 
      error: `Unexpected error: ${error.message}`,
      stack: error.stack 
    }, 500);
  }
}

/**
 * Handles POST requests to trigger automatic complete backfill
 * This will process all earthquakes in batches
 */
export async function onRequestPost(context) {
  const { env } = context;
  
  if (!env.DB) {
    return jsonResponse({ error: "Database not configured" }, 500);
  }

  try {
    // Get count of earthquakes needing backfill
    const countStmt = env.DB.prepare(`
      SELECT COUNT(*) as total
      FROM EarthquakeEvents
      WHERE detail_fetched = FALSE
        AND magnitude >= 3.0
    `);
    
    const countResult = await countStmt.first();
    const total = countResult.total;
    
    if (total === 0) {
      return jsonResponse({
        message: "All earthquakes already have detail data",
        total_fetched: total
      });
    }

    // Store backfill job status in KV if available
    if (env.USGS_LAST_RESPONSE_KV) {
      await env.USGS_LAST_RESPONSE_KV.put('backfill_status', JSON.stringify({
        status: 'started',
        total: total,
        processed: 0,
        started_at: new Date().toISOString()
      }), {
        expirationTtl: 86400 // 24 hours
      });
    }

    return jsonResponse({
      message: "Backfill job initiated",
      total_to_process: total,
      estimated_hours: (total / 3600).toFixed(2),
      note: "Use GET endpoint with batch processing to execute the backfill"
    });
    
  } catch (error) {
    console.error(`[backfill] Error initiating backfill: ${error.message}`);
    return jsonResponse({ 
      error: `Failed to initiate backfill: ${error.message}` 
    }, 500);
  }
}