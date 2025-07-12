#!/usr/bin/env node

/**
 * @file benchmark-api.js
 * @description Real-world earthquake clustering benchmark using deployed API endpoints
 */

import { ClusterBenchmarkSuite } from '../functions/utils/clusterBenchmark.js';
import { findActiveClusters } from '../functions/api/calculate-clusters.POST.js';
import { findActiveClustersOptimized } from '../functions/utils/spatialClusterUtils.js';
import { setDistanceCalculationProfiler } from '../functions/utils/mathUtils.js';

/**
 * API-based benchmark suite using deployed endpoints
 */
class ApiBenchmarkSuite {
  constructor(baseUrl = 'http://localhost:8787') {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.profiler = new ClusterBenchmarkSuite().profiler;
    setDistanceCalculationProfiler(this.profiler);
  }

  /**
   * Fetch earthquake data from the deployed API
   */
  async fetchEarthquakeData(timeWindow = 'day') {
    // API accepts: 'day', 'week', 'month'
    const url = `${this.baseUrl}/api/get-earthquakes?timeWindow=${timeWindow}`;
    
    console.log(`📡 Fetching earthquake data from API...`);
    console.log(`   URL: ${url}`);
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`   ✅ Fetched ${data.length || 0} earthquakes`);
      
      return data || [];
    } catch (error) {
      console.error(`   ❌ API fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Test the clustering API endpoint directly
   */
  async testClusteringAPI(earthquakes, params) {
    const url = `${this.baseUrl}/api/calculate-clusters`;
    
    console.log(`🔗 Testing clustering API endpoint...`);
    console.log(`   URL: ${url}`);
    console.log(`   Earthquakes: ${earthquakes.length}`);
    console.log(`   Parameters:`, params);
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          earthquakes,
          maxDistanceKm: params.distance,
          minQuakes: params.minQuakes
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const clusters = await response.json();
      const cacheHit = response.headers.get('X-Cache-Hit') === 'true';
      
      console.log(`   ✅ API returned ${clusters.length} clusters (cache: ${cacheHit ? 'HIT' : 'MISS'})`);
      
      return { clusters, cacheHit };
    } catch (error) {
      console.error(`   ❌ API clustering failed:`, error.message);
      throw error;
    }
  }

  /**
   * Run comprehensive API vs local benchmark
   */
  async runApiBenchmark() {
    console.log('🌐 API vs Local Clustering Benchmark');
    console.log('=' .repeat(60));

    // Test different dataset sizes - API accepts 'day', 'week', 'month'
    const testCases = [
      { timeWindow: 'day', name: 'Recent Day' },
      { timeWindow: 'week', name: 'Recent Week' },
      { timeWindow: 'month', name: 'Recent Month' }
    ];

    const results = {
      metadata: {
        timestamp: new Date().toISOString(),
        type: 'api-benchmark',
        baseUrl: this.baseUrl
      },
      benchmarks: []
    };

    const clusterParams = { distance: 100, minQuakes: 3 };

    for (const testCase of testCases) {
      console.log(`\n📊 Testing: ${testCase.name}`);
      
      try {
        // Fetch data from API
        const earthquakes = await this.fetchEarthquakeData(testCase.timeWindow);
        
        if (earthquakes.length === 0) {
          console.log(`   ⚠️  No data available, skipping`);
          continue;
        }

        console.log(`\n🔍 Benchmarking ${earthquakes.length} earthquakes`);

        // Test API endpoint
        console.log('\n🌐 Testing API endpoint...');
        const apiStartTime = performance.now();
        const apiResult = await this.testClusteringAPI(earthquakes, clusterParams);
        const apiEndTime = performance.now();
        const apiTime = apiEndTime - apiStartTime;

        // Test local original algorithm
        console.log('\n⚙️  Testing local original algorithm...');
        const originalResult = await this.benchmarkAlgorithm(
          earthquakes,
          clusterParams,
          'original',
          `${testCase.name}_original`
        );

        // Test local optimized algorithm (if dataset is large enough)
        let optimizedResult = null;
        if (earthquakes.length >= 100) {
          console.log('⚙️  Testing local optimized algorithm...');
          optimizedResult = await this.benchmarkAlgorithm(
            earthquakes,
            clusterParams,
            'optimized',
            `${testCase.name}_optimized`
          );
        }

        const benchmark = {
          testCase: testCase.name,
          earthquakeCount: earthquakes.length,
          parameters: clusterParams,
          api: {
            executionTime: apiTime,
            clustersFound: apiResult.clusters.length,
            cacheHit: apiResult.cacheHit
          },
          original: originalResult,
          optimized: optimizedResult,
          speedup: optimizedResult ? originalResult.executionTime / optimizedResult.executionTime : null
        };

        results.benchmarks.push(benchmark);

        // Log comparison
        this.printBenchmarkComparison(benchmark);

      } catch (error) {
        console.error(`❌ Failed to test ${testCase.name}:`, error.message);
      }
    }

    return results;
  }

  /**
   * Quick focused benchmark
   */
  async runQuickBenchmark(timeWindow = 'day', magnitude = 2.5) {
    console.log('🎯 Quick API Benchmark');
    console.log(`   Time window: ${timeWindow}`);
    console.log(`   Note: API filtering by magnitude not supported, will filter locally`);
    console.log('=' .repeat(50));

    const earthquakes = await this.fetchEarthquakeData(timeWindow);
    
    if (earthquakes.length === 0) {
      console.error('❌ No earthquake data available');
      return null;
    }

    const params = { distance: 100, minQuakes: 3 };
    
    console.log(`\n🔍 Benchmarking ${earthquakes.length} earthquakes`);
    console.log(`   Parameters: ${params.distance}km distance, ${params.minQuakes} min quakes`);

    // Test API endpoint
    console.log('\n🌐 Testing API endpoint...');
    const apiStartTime = performance.now();
    const apiResult = await this.testClusteringAPI(earthquakes, params);
    const apiEndTime = performance.now();

    // Test local algorithms
    console.log('\n⚙️  Testing local algorithms...');
    const originalResult = await this.benchmarkAlgorithm(earthquakes, params, 'original', 'quick_original');
    
    let optimizedResult = null;
    if (earthquakes.length >= 100) {
      optimizedResult = await this.benchmarkAlgorithm(earthquakes, params, 'optimized', 'quick_optimized');
    }

    // Print detailed comparison
    this.printDetailedResults(
      {
        executionTime: apiEndTime - apiStartTime,
        clustersFound: apiResult.clusters.length,
        cacheHit: apiResult.cacheHit
      },
      originalResult,
      optimizedResult,
      earthquakes.length
    );

    return {
      metadata: {
        timestamp: new Date().toISOString(),
        earthquakeCount: earthquakes.length,
        parameters: params,
        timeWindow,
        magnitude
      },
      api: {
        executionTime: apiEndTime - apiStartTime,
        clustersFound: apiResult.clusters.length,
        cacheHit: apiResult.cacheHit
      },
      original: originalResult,
      optimized: optimizedResult
    };
  }

  /**
   * Benchmark algorithm locally
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

  printBenchmarkComparison(benchmark) {
    console.log('\n📊 RESULTS:');
    console.log(`   🌐 API: ${benchmark.api.executionTime.toFixed(2)}ms (${benchmark.api.clustersFound} clusters) ${benchmark.api.cacheHit ? '[CACHED]' : '[COMPUTED]'}`);
    console.log(`   ⚙️  Original: ${benchmark.original.executionTime.toFixed(2)}ms (${benchmark.original.result?.clustersFound || 0} clusters, ${benchmark.original.distanceCalculations.toLocaleString()} distance calcs)`);
    
    if (benchmark.optimized) {
      console.log(`   🚀 Optimized: ${benchmark.optimized.executionTime.toFixed(2)}ms (${benchmark.optimized.result?.clustersFound || 0} clusters, ${benchmark.optimized.distanceCalculations.toLocaleString()} distance calcs)`);
      console.log(`   ⚡ Speedup: ${benchmark.speedup.toFixed(2)}x`);
    }
  }

  printDetailedResults(apiResult, originalResult, optimizedResult, earthquakeCount) {
    console.log('\n📊 DETAILED COMPARISON');
    console.log('=' .repeat(50));
    
    console.log(`API Endpoint:`);
    console.log(`  ⏱️  Time: ${apiResult.executionTime.toFixed(2)}ms`);
    console.log(`  🎯 Clusters: ${apiResult.clustersFound}`);
    console.log(`  💾 Cache: ${apiResult.cacheHit ? 'HIT' : 'MISS'}`);
    
    console.log(`\nLocal Original Algorithm:`);
    console.log(`  ⏱️  Time: ${originalResult.executionTime.toFixed(2)}ms`);
    console.log(`  🔢 Distance calculations: ${originalResult.distanceCalculations.toLocaleString()}`);
    console.log(`  💾 Memory: ${(originalResult.memoryUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  🎯 Clusters: ${originalResult.result?.clustersFound || 0}`);
    console.log(`  📈 Per earthquake: ${originalResult.performance.timePerEarthquake.toFixed(4)}ms`);

    if (optimizedResult) {
      const speedup = originalResult.executionTime / optimizedResult.executionTime;
      const distanceReduction = ((originalResult.distanceCalculations - optimizedResult.distanceCalculations) / originalResult.distanceCalculations * 100);
      
      console.log(`\nLocal Optimized Algorithm:`);
      console.log(`  ⏱️  Time: ${optimizedResult.executionTime.toFixed(2)}ms`);
      console.log(`  🔢 Distance calculations: ${optimizedResult.distanceCalculations.toLocaleString()}`);
      console.log(`  💾 Memory: ${(optimizedResult.memoryUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  🎯 Clusters: ${optimizedResult.result?.clustersFound || 0}`);
      console.log(`  📈 Per earthquake: ${optimizedResult.performance.timePerEarthquake.toFixed(4)}ms`);
      
      console.log(`\n🚀 OPTIMIZATION RESULTS:`);
      console.log(`  ⚡ Speedup: ${speedup.toFixed(2)}x (${((speedup - 1) * 100).toFixed(1)}% faster)`);
      console.log(`  🔢 Distance calc reduction: ${distanceReduction.toFixed(1)}%`);
      
      // Compare with API
      const apiVsOptimized = apiResult.executionTime / optimizedResult.executionTime;
      console.log(`  🌐 API vs Optimized: ${apiVsOptimized.toFixed(2)}x ${apiVsOptimized > 1 ? '(optimized faster)' : '(API faster)'}`);
    }
  }

  /**
   * Test API connectivity
   */
  async testConnection() {
    try {
      console.log(`🔍 Testing API connection: ${this.baseUrl}`);
      const response = await fetch(`${this.baseUrl}/api/get-earthquakes?limit=1`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`✅ API accessible`);
      return true;
    } catch (error) {
      console.error(`❌ API connection failed:`, error.message);
      return false;
    }
  }
}

// Command line interface
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mode: 'quick', // 'quick' or 'comprehensive'
    baseUrl: 'http://localhost:8787',
    timeWindow: 24,
    magnitude: 2.5,
    output: null,
    test: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--comprehensive':
        options.mode = 'comprehensive';
        break;
      case '--url':
        options.baseUrl = args[++i];
        break;
      case '--time':
        options.timeWindow = parseInt(args[++i]);
        break;
      case '--magnitude':
        options.magnitude = parseFloat(args[++i]);
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--test':
        options.test = true;
        break;
      case '--help':
        console.log(`
API Earthquake Clustering Benchmark

Usage: node scripts/benchmark-api.js [options]

Options:
  --comprehensive          Run benchmark on multiple datasets
  --url <url>              API base URL (default: http://localhost:8787)
  --time <hours>           Time window in hours (default: 24)
  --magnitude <mag>        Magnitude filter (default: 2.5)
  --output <file>          Save results to JSON file
  --test                   Test API connection only
  --help                   Show this help

Examples:
  node scripts/benchmark-api.js
  node scripts/benchmark-api.js --time 168 --magnitude 3.0
  node scripts/benchmark-api.js --comprehensive --output results.json
  node scripts/benchmark-api.js --url https://your-worker.your-domain.com
        `);
        process.exit(0);
        break;
    }
  }

  return options;
}

// Main execution
async function main() {
  const options = parseArgs();
  
  console.log('🌐 API Earthquake Clustering Benchmark');
  console.log(`Options:`, JSON.stringify(options, null, 2));
  console.log('');

  const suite = new ApiBenchmarkSuite(options.baseUrl);

  try {
    // Test connection first
    const connected = await suite.testConnection();
    if (!connected) {
      console.log('\n💡 Make sure your API server is running:');
      console.log('   - For local development: npm run dev');
      console.log('   - For deployed worker: use --url https://your-worker.domain.com');
      process.exit(1);
    }

    if (options.test) {
      console.log('✅ API connection test successful!');
      process.exit(0);
    }

    // Run benchmark
    let results;
    if (options.mode === 'comprehensive') {
      results = await suite.runApiBenchmark();
    } else {
      // Convert numeric timeWindow to API format
      let timeWindow = 'day'; // default
      if (options.timeWindow <= 24) timeWindow = 'day';
      else if (options.timeWindow <= 168) timeWindow = 'week'; // 7 days
      else timeWindow = 'month';
      
      results = await suite.runQuickBenchmark(timeWindow, options.magnitude);
    }

    if (results && options.output) {
      const fs = await import('fs');
      fs.writeFileSync(options.output, JSON.stringify(results, null, 2));
      console.log(`\n💾 Results saved to: ${options.output}`);
    }

    console.log('\n✅ API benchmark completed!');
    
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ApiBenchmarkSuite };