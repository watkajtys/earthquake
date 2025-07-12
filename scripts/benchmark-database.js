#!/usr/bin/env node

/**
 * @file benchmark-database.js
 * @description Real-world earthquake clustering benchmark using existing D1 database
 */

import { ClusterBenchmarkSuite } from '../functions/utils/clusterBenchmark.js';
import { findActiveClusters } from '../functions/api/calculate-clusters.POST.js';
import { findActiveClustersOptimized } from '../functions/utils/spatialClusterUtils.js';
import { setDistanceCalculationProfiler } from '../functions/utils/mathUtils.js';

/**
 * Database earthquake data fetcher
 */
class DatabaseBenchmarkSuite {
  constructor(db) {
    this.db = db;
    this.profiler = new ClusterBenchmarkSuite().profiler;
    setDistanceCalculationProfiler(this.profiler);
  }

  /**
   * Fetch earthquake data from D1 database with various filters
   */
  async getEarthquakeDatasets() {
    if (!this.db) {
      throw new Error('Database not available');
    }

    const datasets = [];
    
    // Define different time windows and magnitude filters
    const queries = [
      {
        name: 'Recent Hour (All)',
        sql: `SELECT * FROM EarthquakeEvents WHERE time >= datetime('now', '-1 hour') ORDER BY time DESC`,
        expectedSize: 'small'
      },
      {
        name: 'Recent 6 Hours (All)', 
        sql: `SELECT * FROM EarthquakeEvents WHERE time >= datetime('now', '-6 hours') ORDER BY time DESC`,
        expectedSize: 'small-medium'
      },
      {
        name: 'Recent Day (All)',
        sql: `SELECT * FROM EarthquakeEvents WHERE time >= datetime('now', '-1 day') ORDER BY time DESC`,
        expectedSize: 'medium'
      },
      {
        name: 'Recent Day (M2.5+)',
        sql: `SELECT * FROM EarthquakeEvents WHERE time >= datetime('now', '-1 day') AND magnitude >= 2.5 ORDER BY time DESC`,
        expectedSize: 'small-medium'
      },
      {
        name: 'Recent Week (M2.5+)',
        sql: `SELECT * FROM EarthquakeEvents WHERE time >= datetime('now', '-7 days') AND magnitude >= 2.5 ORDER BY time DESC`,
        expectedSize: 'medium-large'
      },
      {
        name: 'Recent Week (M4.0+)',
        sql: `SELECT * FROM EarthquakeEvents WHERE time >= datetime('now', '-7 days') AND magnitude >= 4.0 ORDER BY time DESC`,
        expectedSize: 'small'
      },
      {
        name: 'Recent Month (M3.0+)',
        sql: `SELECT * FROM EarthquakeEvents WHERE time >= datetime('now', '-30 days') AND magnitude >= 3.0 ORDER BY time DESC LIMIT 2000`,
        expectedSize: 'large'
      },
      {
        name: 'High Activity Sample',
        sql: `SELECT * FROM EarthquakeEvents WHERE magnitude >= 2.0 ORDER BY time DESC LIMIT 1500`,
        expectedSize: 'large'
      },
      {
        name: 'Large Dataset Sample',
        sql: `SELECT * FROM EarthquakeEvents ORDER BY time DESC LIMIT 3000`,
        expectedSize: 'x-large'
      }
    ];

    for (const query of queries) {
      try {
        console.log(`📊 Fetching: ${query.name}`);
        const stmt = this.db.prepare(query.sql);
        const rows = await stmt.all();
        
        if (rows.results && rows.results.length > 0) {
          // Convert database rows to GeoJSON-like earthquake objects
          const earthquakes = rows.results.map(row => this.convertDbRowToEarthquake(row));
          
          datasets.push({
            name: query.name,
            earthquakes,
            count: earthquakes.length,
            expectedSize: query.expectedSize
          });
          
          console.log(`   ✅ Found ${earthquakes.length} earthquakes`);
        } else {
          console.log(`   ⚠️  No data found for ${query.name}`);
        }
      } catch (error) {
        console.error(`   ❌ Failed to fetch ${query.name}:`, error.message);
      }
    }

    return datasets;
  }

  /**
   * Convert database row to earthquake object format expected by clustering
   */
  convertDbRowToEarthquake(row) {
    return {
      id: row.id,
      properties: {
        mag: row.magnitude,
        time: new Date(row.time).getTime(),
        place: row.place || `${row.latitude}, ${row.longitude}`,
        type: 'earthquake'
      },
      geometry: {
        type: 'Point',
        coordinates: [row.longitude, row.latitude, row.depth || 0]
      }
    };
  }

  /**
   * Run comprehensive benchmark on multiple database datasets
   */
  async runDatabaseBenchmark() {
    console.log('🗄️  Database Earthquake Clustering Benchmark');
    console.log('=' .repeat(60));

    const datasets = await this.getEarthquakeDatasets();
    
    if (datasets.length === 0) {
      console.error('❌ No datasets available from database');
      return null;
    }

    console.log(`\n📋 Found ${datasets.length} datasets to benchmark:`);
    datasets.forEach(d => console.log(`   - ${d.name}: ${d.count} earthquakes (${d.expectedSize})`));

    const results = {
      metadata: {
        timestamp: new Date().toISOString(),
        type: 'database-benchmark',
        datasets: datasets.map(d => ({ name: d.name, count: d.count, expectedSize: d.expectedSize }))
      },
      benchmarks: []
    };

    // Test different clustering parameters
    const clusterParams = [
      { distance: 50, minQuakes: 3, name: 'Tight' },
      { distance: 100, minQuakes: 3, name: 'Standard' },
      { distance: 200, minQuakes: 2, name: 'Loose' }
    ];

    for (const dataset of datasets) {
      console.log(`\n📊 Testing: ${dataset.name} (${dataset.count} earthquakes)`);
      
      // Skip empty or very small datasets
      if (dataset.count < 10) {
        console.log(`   ⏭️  Skipping (too few earthquakes)`);
        continue;
      }

      for (const params of clusterParams) {
        console.log(`  ⚙️  ${params.name} clustering (${params.distance}km, min=${params.minQuakes})`);
        
        // Test original algorithm
        const originalResult = await this.benchmarkAlgorithm(
          dataset.earthquakes,
          params,
          'original',
          `${dataset.name}_${params.name}_original`
        );
        
        // Test optimized algorithm (if dataset is large enough)
        let optimizedResult = null;
        if (dataset.count >= 100) {
          optimizedResult = await this.benchmarkAlgorithm(
            dataset.earthquakes,
            params,
            'optimized',
            `${dataset.name}_${params.name}_optimized`
          );
        }

        const benchmark = {
          dataset: dataset.name,
          earthquakeCount: dataset.count,
          expectedSize: dataset.expectedSize,
          parameters: params,
          original: originalResult,
          optimized: optimizedResult,
          speedup: optimizedResult ? originalResult.executionTime / optimizedResult.executionTime : null,
          distanceReduction: optimizedResult ? 
            ((originalResult.distanceCalculations - optimizedResult.distanceCalculations) / originalResult.distanceCalculations * 100) : null
        };

        results.benchmarks.push(benchmark);

        // Log results
        console.log(`    📈 Original: ${originalResult.executionTime.toFixed(2)}ms (${originalResult.distanceCalculations.toLocaleString()} distance calcs)`);
        if (optimizedResult) {
          const speedup = originalResult.executionTime / optimizedResult.executionTime;
          console.log(`    🚀 Optimized: ${optimizedResult.executionTime.toFixed(2)}ms (${optimizedResult.distanceCalculations.toLocaleString()} distance calcs)`);
          console.log(`    ⚡ Speedup: ${speedup.toFixed(2)}x (${benchmark.distanceReduction.toFixed(1)}% fewer distance calcs)`);
        }
        console.log(`    🎯 Clusters found: ${originalResult.result?.clustersFound || 0}`);
      }
    }

    return results;
  }

  /**
   * Benchmark a specific algorithm
   */
  async benchmarkAlgorithm(earthquakes, params, algorithm, testName) {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    this.profiler.startProfile(testName);

    let clusters;
    try {
      if (algorithm === 'optimized') {
        clusters = findActiveClustersOptimized(earthquakes, params.distance, params.minQuakes);
      } else {
        clusters = findActiveClusters(earthquakes, params.distance, params.minQuakes);
      }
    } catch (error) {
      console.error(`❌ Algorithm failed for ${testName}:`, error);
      clusters = [];
    }

    const result = this.profiler.endProfile(testName, clusters);

    return {
      ...result,
      algorithm,
      performance: {
        timePerEarthquake: result.executionTime / earthquakes.length,
        distanceCalcsPerQuake: result.distanceCalculations / earthquakes.length,
        avgDistanceCalcTime: result.distanceCalculations > 0 ? result.distanceCalculationTime / result.distanceCalculations : null
      }
    };
  }

  /**
   * Focus benchmark on a specific time period
   */
  async runFocusedBenchmark(timeFilter = 'day', magnitudeFilter = 2.5) {
    console.log(`🎯 Focused Database Benchmark`);
    console.log(`   Time: Past ${timeFilter}`);
    console.log(`   Magnitude: ${magnitudeFilter}+`);
    console.log('=' .repeat(50));

    const sql = `
      SELECT * FROM EarthquakeEvents 
      WHERE time >= datetime('now', '-1 ${timeFilter}') 
      AND magnitude >= ? 
      ORDER BY time DESC
    `;

    const stmt = this.db.prepare(sql);
    const rows = await stmt.bind(magnitudeFilter).all();

    if (!rows.results || rows.results.length === 0) {
      console.error('❌ No earthquake data found matching criteria');
      return null;
    }

    const earthquakes = rows.results.map(row => this.convertDbRowToEarthquake(row));
    console.log(`\n📊 Found ${earthquakes.length} earthquakes for focused benchmark`);

    // Test with standard parameters
    const params = { distance: 100, minQuakes: 3 };
    
    console.log(`\n🔍 Comparing algorithms with ${earthquakes.length} earthquakes`);
    console.log(`   Parameters: ${params.distance}km distance, ${params.minQuakes} min quakes`);

    const originalResult = await this.benchmarkAlgorithm(earthquakes, params, 'original', 'focused_original');
    
    let optimizedResult = null;
    if (earthquakes.length >= 100) {
      optimizedResult = await this.benchmarkAlgorithm(earthquakes, params, 'optimized', 'focused_optimized');
    }

    // Print detailed comparison
    this.printDetailedComparison(originalResult, optimizedResult, earthquakes.length);

    return {
      metadata: {
        timestamp: new Date().toISOString(),
        timeFilter,
        magnitudeFilter,
        earthquakeCount: earthquakes.length,
        parameters: params
      },
      original: originalResult,
      optimized: optimizedResult,
      speedup: optimizedResult ? originalResult.executionTime / optimizedResult.executionTime : null
    };
  }

  printDetailedComparison(originalResult, optimizedResult, earthquakeCount) {
    console.log('\n📊 DETAILED RESULTS COMPARISON');
    console.log('=' .repeat(50));
    console.log(`Original Algorithm:`);
    console.log(`  ⏱️  Execution time: ${originalResult.executionTime.toFixed(2)}ms`);
    console.log(`  🔢 Distance calculations: ${originalResult.distanceCalculations.toLocaleString()}`);
    console.log(`  💾 Memory used: ${(originalResult.memoryUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  🎯 Clusters found: ${originalResult.result?.clustersFound || 0}`);
    console.log(`  📈 Per earthquake: ${originalResult.performance.timePerEarthquake.toFixed(4)}ms`);
    console.log(`  🧮 Distance calcs per quake: ${originalResult.performance.distanceCalcsPerQuake.toFixed(1)}`);

    if (optimizedResult) {
      const speedup = originalResult.executionTime / optimizedResult.executionTime;
      const distanceReduction = ((originalResult.distanceCalculations - optimizedResult.distanceCalculations) / originalResult.distanceCalculations * 100);
      
      console.log(`\nOptimized Algorithm:`);
      console.log(`  ⏱️  Execution time: ${optimizedResult.executionTime.toFixed(2)}ms`);
      console.log(`  🔢 Distance calculations: ${optimizedResult.distanceCalculations.toLocaleString()}`);
      console.log(`  💾 Memory used: ${(optimizedResult.memoryUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  🎯 Clusters found: ${optimizedResult.result?.clustersFound || 0}`);
      console.log(`  📈 Per earthquake: ${optimizedResult.performance.timePerEarthquake.toFixed(4)}ms`);
      console.log(`  🧮 Distance calcs per quake: ${optimizedResult.performance.distanceCalcsPerQuake.toFixed(1)}`);
      
      console.log(`\nImprovement:`);
      console.log(`  ⚡ Speedup: ${speedup.toFixed(2)}x (${((speedup - 1) * 100).toFixed(1)}% faster)`);
      console.log(`  🔢 Distance calc reduction: ${distanceReduction.toFixed(1)}%`);
      console.log(`  💾 Memory change: ${((optimizedResult.memoryUsed - originalResult.memoryUsed) / 1024 / 1024).toFixed(2)}MB`);
      
      // Validate results are equivalent
      const clusterCountDiff = Math.abs((originalResult.result?.clustersFound || 0) - (optimizedResult.result?.clustersFound || 0));
      if (clusterCountDiff <= 1) {
        console.log(`  ✅ Results validated: cluster counts match`);
      } else {
        console.log(`  ⚠️  Results differ: cluster count difference of ${clusterCountDiff}`);
      }

      // Performance analysis
      const originalComplexity = Math.pow(earthquakeCount, 2);
      const actualDistanceCalcs = originalResult.distanceCalculations;
      const efficiency = (actualDistanceCalcs / originalComplexity * 100);
      
      console.log(`\nComplexity Analysis:`);
      console.log(`  📊 Theoretical O(N²): ${originalComplexity.toLocaleString()} distance calculations`);
      console.log(`  📊 Actual original: ${actualDistanceCalcs.toLocaleString()} (${efficiency.toFixed(1)}% of theoretical)`);
      console.log(`  📊 Spatial optimization: ${optimizedResult.distanceCalculations.toLocaleString()} (${(optimizedResult.distanceCalculations / originalComplexity * 100).toFixed(1)}% of theoretical)`);
      
    } else {
      console.log(`\n⚠️  Optimized algorithm not tested (dataset too small: ${earthquakeCount} < 100)`);
    }
  }
}

// Command line interface
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mode: 'focused', // 'focused' or 'comprehensive'
    timeFilter: 'day',
    magnitudeFilter: 2.5,
    output: null,
    dbPath: null
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--comprehensive':
        options.mode = 'comprehensive';
        break;
      case '--time':
        options.timeFilter = args[++i];
        break;
      case '--magnitude':
        options.magnitudeFilter = parseFloat(args[++i]);
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--db':
        options.dbPath = args[++i];
        break;
      case '--help':
        console.log(`
Database Earthquake Clustering Benchmark

Usage: node scripts/benchmark-database.js [options]

Options:
  --comprehensive          Run benchmark on multiple database queries
  --time <period>          Time filter: hour, day, week, month (default: day)
  --magnitude <mag>        Magnitude filter (default: 2.5)
  --output <file>          Save results to JSON file  
  --db <path>              D1 database path (uses wrangler if not specified)
  --help                   Show this help

Examples:
  node scripts/benchmark-database.js
  node scripts/benchmark-database.js --time week --magnitude 3.0
  node scripts/benchmark-database.js --comprehensive --output results.json
        `);
        process.exit(0);
        break;
    }
  }

  return options;
}

// Create database connection
async function createDatabaseConnection(dbPath) {
  if (dbPath) {
    // Use local database file
    const Database = (await import('better-sqlite3')).default;
    return new Database(dbPath);
  } else {
    // Use wrangler for D1 access
    console.log('🔌 Using Wrangler for D1 database access...');
    console.log('   Note: Make sure you have wrangler configured and logged in');
    
    // This would need to be implemented to use wrangler's D1 interface
    // For now, we'll throw an error asking for explicit database path
    throw new Error('Database path required. Use --db path/to/database.db or set up wrangler integration');
  }
}

// Main execution
async function main() {
  const options = parseArgs();
  
  console.log('🗄️  Database Earthquake Clustering Benchmark');
  console.log(`Options:`, JSON.stringify(options, null, 2));
  console.log('');

  let db;
  try {
    db = await createDatabaseConnection(options.dbPath);
  } catch (error) {
    console.error('❌ Failed to connect to database:', error.message);
    console.log('\n💡 To run this benchmark, you need access to the D1 database.');
    console.log('   Option 1: Export database to local SQLite file and use --db path');
    console.log('   Option 2: Set up wrangler integration (requires development)');
    process.exit(1);
  }

  const suite = new DatabaseBenchmarkSuite(db);
  let results;

  try {
    if (options.mode === 'comprehensive') {
      results = await suite.runDatabaseBenchmark();
    } else {
      results = await suite.runFocusedBenchmark(options.timeFilter, options.magnitudeFilter);
    }

    if (results && options.output) {
      const fs = await import('fs');
      fs.writeFileSync(options.output, JSON.stringify(results, null, 2));
      console.log(`\n💾 Results saved to: ${options.output}`);
    }

    console.log('\n✅ Database benchmark completed!');
    
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  } finally {
    if (db && typeof db.close === 'function') {
      db.close();
    }
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { DatabaseBenchmarkSuite };