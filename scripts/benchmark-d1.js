#!/usr/bin/env node

/**
 * @file benchmark-d1.js  
 * @description Real-world earthquake clustering benchmark using Wrangler D1 access
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { ClusterBenchmarkSuite } from '../functions/utils/clusterBenchmark.js';
import { findActiveClusters } from '../functions/api/calculate-clusters.POST.js';
import { findActiveClustersOptimized } from '../functions/utils/spatialClusterUtils.js';
import { setDistanceCalculationProfiler } from '../functions/utils/mathUtils.js';

/**
 * Wrangler D1 interface for benchmarking
 */
class WranglerD1BenchmarkSuite {
  constructor(databaseName = 'PrimaryDB') {
    this.databaseName = databaseName;
    this.profiler = new ClusterBenchmarkSuite().profiler;
    setDistanceCalculationProfiler(this.profiler);
  }

  /**
   * Execute SQL query using wrangler d1
   */
  async executeQuery(sql, _params = []) {
    try {
      // Create a temporary SQL file for complex queries
      const tempFile = `/tmp/d1-query-${Date.now()}.sql`;
      writeFileSync(tempFile, sql);

      const command = `npx wrangler d1 execute ${this.databaseName} --file=${tempFile} --json`;
      const result = execSync(command, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }); // 50MB buffer
      
      // Clean up temp file
      try {
        execSync(`rm ${tempFile}`);
      } catch {
        // Ignore cleanup errors
      }

      return JSON.parse(result);
    } catch (error) {
      console.error('Wrangler D1 query failed:', error.message);
      throw error;
    }
  }

  /**
   * Get earthquake datasets from D1
   */
  async getEarthquakeDatasets() {
    console.log('📊 Fetching earthquake datasets from D1...');
    
    const datasets = [];
    
    // Define queries for different datasets
    const queries = [
      {
        name: 'Recent 6 Hours',
        sql: `SELECT id, magnitude, latitude, longitude, depth, place, time 
              FROM EarthquakeEvents 
              WHERE time >= datetime('now', '-6 hours') 
              ORDER BY time DESC;`
      },
      {
        name: 'Recent Day (All)',
        sql: `SELECT id, magnitude, latitude, longitude, depth, place, time 
              FROM EarthquakeEvents 
              WHERE time >= datetime('now', '-1 day') 
              ORDER BY time DESC;`
      },
      {
        name: 'Recent Day (M2.5+)',
        sql: `SELECT id, magnitude, latitude, longitude, depth, place, time 
              FROM EarthquakeEvents 
              WHERE time >= datetime('now', '-1 day') 
              AND magnitude >= 2.5 
              ORDER BY time DESC;`
      },
      {
        name: 'Recent Week (M2.5+)',
        sql: `SELECT id, magnitude, latitude, longitude, depth, place, time 
              FROM EarthquakeEvents 
              WHERE time >= datetime('now', '-7 days') 
              AND magnitude >= 2.5 
              ORDER BY time DESC 
              LIMIT 1500;`
      },
      {
        name: 'Large Sample (Recent)',
        sql: `SELECT id, magnitude, latitude, longitude, depth, place, time 
              FROM EarthquakeEvents 
              ORDER BY time DESC 
              LIMIT 2000;`
      }
    ];

    for (const query of queries) {
      try {
        console.log(`   Fetching: ${query.name}`);
        const result = await this.executeQuery(query.sql);
        
        if (result && result.length > 0) {
          // Convert to earthquake objects
          const earthquakes = result.map(row => this.convertDbRowToEarthquake(row));
          
          datasets.push({
            name: query.name,
            earthquakes,
            count: earthquakes.length
          });
          
          console.log(`   ✅ ${earthquakes.length} earthquakes`);
        } else {
          console.log(`   ⚠️  No data found`);
        }
      } catch (error) {
        console.error(`   ❌ Failed: ${error.message}`);
      }
    }

    return datasets;
  }

  /**
   * Convert database row to earthquake object
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
   * Quick benchmark with current database data
   */
  async runQuickBenchmark() {
    console.log('🚀 Quick D1 Database Benchmark');
    console.log('=' .repeat(50));

    // Get a reasonable dataset
    const sql = `
      SELECT id, magnitude, latitude, longitude, depth, place, time 
      FROM EarthquakeEvents 
      WHERE time >= datetime('now', '-2 days') 
      ORDER BY time DESC 
      LIMIT 1000;
    `;

    console.log('📊 Fetching recent earthquake data...');
    const rows = await this.executeQuery(sql);
    
    if (!rows || rows.length === 0) {
      console.error('❌ No earthquake data found in database');
      return null;
    }

    const earthquakes = rows.map(row => this.convertDbRowToEarthquake(row));
    console.log(`✅ Found ${earthquakes.length} earthquakes from the past 2 days`);

    // Benchmark with standard parameters
    const params = { distance: 100, minQuakes: 3 };
    
    console.log(`\n🔍 Benchmarking clustering algorithms`);
    console.log(`   Dataset: ${earthquakes.length} earthquakes`);
    console.log(`   Parameters: ${params.distance}km distance, ${params.minQuakes} min quakes`);

    // Test original algorithm
    console.log('\n⚙️  Testing original algorithm...');
    const originalResult = await this.benchmarkAlgorithm(earthquakes, params, 'original', 'quick_original');
    
    // Test optimized algorithm if dataset is large enough
    let optimizedResult = null;
    if (earthquakes.length >= 100) {
      console.log('⚙️  Testing optimized algorithm...');
      optimizedResult = await this.benchmarkAlgorithm(earthquakes, params, 'optimized', 'quick_optimized');
    }

    // Print results
    this.printResults(originalResult, optimizedResult);

    return {
      metadata: {
        timestamp: new Date().toISOString(),
        earthquakeCount: earthquakes.length,
        parameters: params,
        database: this.databaseName
      },
      original: originalResult,
      optimized: optimizedResult,
      speedup: optimizedResult ? originalResult.executionTime / optimizedResult.executionTime : null
    };
  }

  /**
   * Benchmark algorithm
   */
  async benchmarkAlgorithm(earthquakes, params, algorithm, testName) {
    if (global.gc) global.gc();

    this.profiler.startProfile(testName);

    let clusters;
    try {
      if (algorithm === 'optimized') {
        clusters = findActiveClustersOptimized(earthquakes, params.distance, params.minQuakes);
      } else {
        clusters = findActiveClusters(earthquakes, params.distance, params.minQuakes);
      }
    } catch (error) {
      console.error(`❌ ${algorithm} algorithm failed:`, error);
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
   * Print benchmark results
   */
  printResults(originalResult, optimizedResult) {
    console.log('\n📊 BENCHMARK RESULTS');
    console.log('=' .repeat(50));
    
    console.log(`Original Algorithm:`);
    console.log(`  ⏱️  Time: ${originalResult.executionTime.toFixed(2)}ms`);
    console.log(`  🔢 Distance calculations: ${originalResult.distanceCalculations.toLocaleString()}`);
    console.log(`  💾 Memory: ${(originalResult.memoryUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  🎯 Clusters: ${originalResult.result?.clustersFound || 0}`);
    console.log(`  📈 Per earthquake: ${originalResult.performance.timePerEarthquake.toFixed(4)}ms`);

    if (optimizedResult) {
      const speedup = originalResult.executionTime / optimizedResult.executionTime;
      const distanceReduction = ((originalResult.distanceCalculations - optimizedResult.distanceCalculations) / originalResult.distanceCalculations * 100);
      
      console.log(`\nOptimized Algorithm:`);
      console.log(`  ⏱️  Time: ${optimizedResult.executionTime.toFixed(2)}ms`);
      console.log(`  🔢 Distance calculations: ${optimizedResult.distanceCalculations.toLocaleString()}`);
      console.log(`  💾 Memory: ${(optimizedResult.memoryUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  🎯 Clusters: ${optimizedResult.result?.clustersFound || 0}`);
      console.log(`  📈 Per earthquake: ${optimizedResult.performance.timePerEarthquake.toFixed(4)}ms`);
      
      console.log(`\n🚀 IMPROVEMENT:`);
      console.log(`  ⚡ Speedup: ${speedup.toFixed(2)}x (${((speedup - 1) * 100).toFixed(1)}% faster)`);
      console.log(`  🔢 Distance calc reduction: ${distanceReduction.toFixed(1)}%`);
      
      const clusterDiff = Math.abs((originalResult.result?.clustersFound || 0) - (optimizedResult.result?.clustersFound || 0));
      if (clusterDiff <= 1) {
        console.log(`  ✅ Results validated: cluster counts match`);
      } else {
        console.log(`  ⚠️  Cluster count difference: ${clusterDiff}`);
      }
    } else {
      console.log(`\n⚠️  Optimized algorithm not tested (dataset too small)`);
    }
  }

  /**
   * Test database connectivity
   */
  async testConnection() {
    try {
      console.log(`🔍 Testing D1 database connection: ${this.databaseName}`);
      const result = await this.executeQuery('SELECT COUNT(*) as count FROM EarthquakeEvents;');
      const count = result[0]?.count || 0;
      console.log(`✅ Database accessible: ${count.toLocaleString()} total earthquakes`);
      return true;
    } catch (error) {
      console.error(`❌ Database connection failed:`, error.message);
      return false;
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const options = {
    database: 'PrimaryDB',
    output: null,
    test: false
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--database':
        options.database = args[++i];
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--test':
        options.test = true;
        break;
      case '--help':
        console.log(`
D1 Database Earthquake Clustering Benchmark

Usage: node scripts/benchmark-d1.js [options]

Options:
  --database <name>        D1 database name (default: PrimaryDB)
  --output <file>          Save results to JSON file
  --test                   Test database connection only
  --help                   Show this help

Prerequisites:
  - Wrangler CLI installed and configured
  - Access to D1 database with earthquake data
  - Database should have EarthquakeEvents table

Example:
  node scripts/benchmark-d1.js --database PrimaryDB --output results.json
        `);
        process.exit(0);
        break;
    }
  }

  console.log('🗄️  D1 Database Clustering Benchmark');
  console.log(`Database: ${options.database}`);
  console.log('');

  const suite = new WranglerD1BenchmarkSuite(options.database);

  try {
    // Test connection first
    const connected = await suite.testConnection();
    if (!connected) {
      console.log('\n💡 Troubleshooting tips:');
      console.log('   1. Ensure wrangler is installed: npm install -g wrangler');
      console.log('   2. Login to Cloudflare: wrangler auth login');
      console.log('   3. Check database exists: wrangler d1 list');
      console.log('   4. Verify database name in wrangler.toml');
      process.exit(1);
    }

    if (options.test) {
      console.log('✅ Database connection test successful!');
      process.exit(0);
    }

    // Run benchmark
    console.log('');
    const results = await suite.runQuickBenchmark();

    if (results && options.output) {
      writeFileSync(options.output, JSON.stringify(results, null, 2));
      console.log(`\n💾 Results saved to: ${options.output}`);
    }

    console.log('\n✅ D1 benchmark completed!');
    
  } catch (error) {
    console.error('❌ Benchmark failed:', error.message);
    
    if (error.message.includes('wrangler')) {
      console.log('\n💡 Make sure wrangler is installed and configured:');
      console.log('   npm install -g wrangler');
      console.log('   wrangler auth login');
    }
    
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { WranglerD1BenchmarkSuite };