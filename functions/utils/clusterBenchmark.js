/**
 * @file Performance benchmarking suite for earthquake clustering algorithms.
 * @module functions/utils/clusterBenchmark
 *
 * @description
 * This module provides a comprehensive suite for benchmarking the performance of earthquake
 * clustering algorithms. It is designed to be run in a Node.js environment to test the
 * efficiency, memory usage, and behavior of different algorithms under various conditions.
 *
 * The suite includes:
 * - **`EarthquakeDataGenerator`**: A class for generating realistic mock earthquake datasets
 *   of varying sizes and geographical distributions.
 * - **`PerformanceProfiler`**: A utility class for measuring execution time, memory usage,
 *   and other performance metrics of the clustering process.
 * - **`ClusterBenchmarkSuite`**: The main class that orchestrates the benchmark tests, running
 *   them against different datasets and parameters, and exporting the results in various
 *   formats (JSON, CSV, Markdown).
 *
 * This tool is crucial for evaluating the impact of code changes on the performance of the
 * core clustering logic and for comparing different algorithm implementations (e.g., the
 * standard O(N²) algorithm vs. optimized versions).
 *
 * @see {@link ../api/calculate-clusters.POST.js} for the `findActiveClusters` function that is benchmarked.
 */
import { findActiveClusters } from '../api/calculate-clusters.POST.js';
import { calculateDistance, setDistanceCalculationProfiler } from './mathUtils.js';

// Benchmark configuration
const BENCHMARK_CONFIG = {
  datasets: [
    { size: 100, name: 'Small' },
    { size: 500, name: 'Medium' },
    { size: 1000, name: 'Large' },
    { size: 2500, name: 'X-Large' },
    { size: 5000, name: 'XX-Large' }
  ],
  clusterParams: [
    { distance: 50, minQuakes: 3, name: 'Tight' },
    { distance: 100, minQuakes: 3, name: 'Standard' },
    { distance: 200, minQuakes: 2, name: 'Loose' }
  ],
  distributions: [
    { name: 'California', type: 'clustered' },
    { name: 'Global', type: 'scattered' },
    { name: 'Mixed', type: 'realistic' }
  ]
};

// Geographic regions for different distributions
const REGIONS = {
  california: { lat: [32, 42], lng: [-125, -114] },
  global: { lat: [-90, 90], lng: [-180, 180] },
  japan: { lat: [24, 46], lng: [123, 146] },
  mediterranean: { lat: [30, 47], lng: [-10, 45] }
};

/**
 * A utility class for generating mock earthquake data for benchmarking purposes.
 *
 * This class can create datasets of varying sizes and with different geographical
 * distributions to simulate real-world scenarios.
 *
 * @class EarthquakeDataGenerator
 */
export class EarthquakeDataGenerator {
  /**
   * Generates a realistic dataset of mock earthquakes.
   *
   * @static
   * @param {number} count - The number of earthquake objects to generate.
   * @param {string} [distribution='realistic'] - The geographical distribution of the earthquakes.
   *   Valid options are 'clustered', 'scattered', or 'realistic'.
   * @param {object} [options={}] - Additional options, such as the region for a 'clustered' distribution.
   * @returns {Array<object>} An array of mock earthquake GeoJSON Feature objects.
   */
  static generate(count, distribution = 'realistic', options = {}) {
    const earthquakes = [];
    const baseTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    
    for (let i = 0; i < count; i++) {
      const quake = this._generateSingleQuake(i, distribution, baseTime, options);
      earthquakes.push(quake);
    }
    
    return earthquakes;
  }
  
  static _generateSingleQuake(index, distribution, baseTime, options) {
    const coords = this._generateCoordinates(distribution, options);
    const magnitude = this._generateMagnitude();
    const time = baseTime + (Math.random() * 24 * 60 * 60 * 1000); // Within 24 hours
    
    return {
      id: `test_quake_${index}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      properties: {
        mag: magnitude,
        time: time,
        place: `Test Location ${index}`,
        type: 'earthquake'
      },
      geometry: {
        type: 'Point',
        coordinates: [coords.lng, coords.lat, Math.random() * 50] // [lng, lat, depth]
      }
    };
  }
  
  static _generateCoordinates(distribution, options = {}) {
    switch (distribution) {
      case 'clustered':
        return this._generateClusteredCoords(options.region || 'california');
      case 'scattered':
        return this._generateScatteredCoords();
      case 'realistic':
        return this._generateRealisticCoords();
      default:
        return this._generateScatteredCoords();
    }
  }
  
  static _generateClusteredCoords(regionName = 'california') {
    const region = REGIONS[regionName];
    
    // Create clusters with 70% probability
    if (Math.random() < 0.7) {
      // Generate cluster centers
      const clusterCenters = [
        { lat: 34.0522, lng: -118.2437 }, // LA area
        { lat: 37.7749, lng: -122.4194 }, // SF area
        { lat: 36.7783, lng: -119.4179 }  // Central CA
      ];
      
      const center = clusterCenters[Math.floor(Math.random() * clusterCenters.length)];
      const radius = 0.5; // ~50km clustering radius
      
      return {
        lat: center.lat + (Math.random() - 0.5) * radius,
        lng: center.lng + (Math.random() - 0.5) * radius
      };
    } else {
      // Random within region
      return {
        lat: region.lat[0] + Math.random() * (region.lat[1] - region.lat[0]),
        lng: region.lng[0] + Math.random() * (region.lng[1] - region.lng[0])
      };
    }
  }
  
  static _generateScatteredCoords() {
    return {
      lat: -90 + Math.random() * 180,
      lng: -180 + Math.random() * 360
    };
  }
  
  static _generateRealisticCoords() {
    // 40% clustered, 60% scattered based on real seismic activity patterns
    if (Math.random() < 0.4) {
      const regions = ['california', 'japan', 'mediterranean'];
      const region = regions[Math.floor(Math.random() * regions.length)];
      return this._generateClusteredCoords(region);
    } else {
      return this._generateScatteredCoords();
    }
  }
  
  static _generateMagnitude() {
    // Realistic magnitude distribution (Gutenberg-Richter law approximation)
    const rand = Math.random();
    if (rand < 0.7) return 2.0 + Math.random() * 2.0; // M2-4 (70%)
    if (rand < 0.9) return 4.0 + Math.random() * 1.0; // M4-5 (20%)
    if (rand < 0.98) return 5.0 + Math.random() * 1.0; // M5-6 (8%)
    return 6.0 + Math.random() * 2.0; // M6-8 (2%)
  }
}

/**
 * A utility class for measuring and profiling the performance of code execution.
 *
 * This profiler tracks execution time, memory usage, and custom metrics (like the number
 * of distance calculations) for named performance tests.
 *
 * @class PerformanceProfiler
 */
export class PerformanceProfiler {
  constructor() {
    this.metrics = new Map();
    this.memoryBaseline = null;
  }
  
  /**
   * Starts a new performance profile for a given test.
   * @param {string} testName - A unique name for the test being profiled.
   */
  startProfile(testName) {
    this.memoryBaseline = this._getMemoryUsage();
    
    this.metrics.set(testName, {
      startTime: performance.now(),
      startMemory: this.memoryBaseline,
      distanceCalculations: 0,
      distanceCalculationTime: 0
    });
  }
  
  endProfile(testName, result = null) {
    const metric = this.metrics.get(testName);
    if (!metric) return null;
    
    const endTime = performance.now();
    const endMemory = this._getMemoryUsage();
    
    const profile = {
      testName,
      executionTime: endTime - metric.startTime,
      memoryUsed: endMemory - metric.startMemory,
      peakMemory: endMemory,
      distanceCalculations: metric.distanceCalculations,
      distanceCalculationTime: metric.distanceCalculationTime,
      result: result ? {
        clustersFound: result.length,
        totalEarthquakes: result.reduce((sum, cluster) => sum + cluster.length, 0),
        avgClusterSize: result.length > 0 ? result.reduce((sum, cluster) => sum + cluster.length, 0) / result.length : 0,
        largestCluster: result.length > 0 ? Math.max(...result.map(cluster => cluster.length)) : 0
      } : null
    };
    
    this.metrics.set(testName, profile);
    return profile;
  }
  
  _getMemoryUsage() {
    // eslint-disable-next-line no-undef
    if (typeof process !== 'undefined' && process.memoryUsage) {
      // eslint-disable-next-line no-undef
      return process.memoryUsage().heapUsed;
    }
    // Fallback for browser/worker environment
    return performance.memory ? performance.memory.usedJSHeapSize : 0;
  }
  
  trackDistanceCalculation(duration) {
    // This would be called from an instrumented distance calculation function
    const currentTest = Array.from(this.metrics.keys()).pop();
    if (currentTest) {
      const metric = this.metrics.get(currentTest);
      metric.distanceCalculations++;
      metric.distanceCalculationTime += duration;
    }
  }
  
  getAllProfiles() {
    return Array.from(this.metrics.values());
  }
  
  exportResults() {
    return {
      timestamp: new Date().toISOString(),
      profiles: this.getAllProfiles(),
      environment: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js',
        // eslint-disable-next-line no-undef
        platform: typeof process !== 'undefined' ? process.platform : 'unknown'
      }
    };
  }
}

/**
 * Instrumented distance calculation for benchmarking
 */
let globalProfiler = null;

export function setGlobalProfiler(profiler) {
  globalProfiler = profiler;
}

export function instrumentedCalculateDistance(lat1, lon1, lat2, lon2) {
  const startTime = performance.now();
  const result = calculateDistance(lat1, lon1, lat2, lon2);
  const endTime = performance.now();
  
  if (globalProfiler) {
    globalProfiler.trackDistanceCalculation(endTime - startTime);
  }
  
  return result;
}

/**
 * The main class for running the earthquake clustering algorithm benchmark suite.
 *
 * This class orchestrates the entire benchmarking process, from data generation to
 * performance profiling and results reporting. It can run a full suite of tests based
 * on a predefined configuration or execute single, targeted tests.
 *
 * @class ClusterBenchmarkSuite
 */
export class ClusterBenchmarkSuite {
  constructor() {
    this.profiler = new PerformanceProfiler();
    setGlobalProfiler(this.profiler);
    // Set up distance calculation tracking
    setDistanceCalculationProfiler(this.profiler);
  }
  
  /**
   * Runs the comprehensive benchmark suite based on the predefined `BENCHMARK_CONFIG`.
   *
   * This method iterates through all configured dataset sizes, distributions, and clustering
   * parameters, running a benchmark for each combination.
   *
   * @param {object} [options={}] - Optional configuration to override parts of the benchmark run.
   * @returns {Promise<object>} A promise that resolves to an object containing the complete
   *   benchmark results, including metadata and an array of individual benchmark profiles.
   */
  async runFullSuite(options = {}) {
    console.log('🚀 Starting Cluster Algorithm Benchmark Suite');
    console.log('=' .repeat(60));
    
    const results = {
      metadata: {
        timestamp: new Date().toISOString(),
        config: BENCHMARK_CONFIG,
        options
      },
      benchmarks: []
    };
    
    // Test each dataset size
    for (const dataset of BENCHMARK_CONFIG.datasets) {
      console.log(`\n📊 Testing ${dataset.name} dataset (${dataset.size} earthquakes)`);
      
      // Test each distribution type
      for (const dist of BENCHMARK_CONFIG.distributions) {
        console.log(`  🌍 Distribution: ${dist.name}`);
        
        // Test each clustering parameter set
        for (const params of BENCHMARK_CONFIG.clusterParams) {
          const testName = `${dataset.name}_${dist.name}_${params.name}`;
          console.log(`    ⚙️  Params: ${params.name} (${params.distance}km, min=${params.minQuakes})`);
          
          const result = await this.runSingleBenchmark(
            dataset.size,
            dist.type,
            params.distance,
            params.minQuakes,
            testName
          );
          
          results.benchmarks.push(result);
          
          // Log immediate results
          console.log(`    ⏱️  Time: ${result.executionTime.toFixed(2)}ms`);
          console.log(`    💾 Memory: ${(result.memoryUsed / 1024 / 1024).toFixed(2)}MB`);
          console.log(`    🔢 Distance calcs: ${result.distanceCalculations}`);
          console.log(`    🎯 Clusters found: ${result.result?.clustersFound || 0}`);
        }
      }
    }
    
    console.log('\n✅ Benchmark suite completed');
    return results;
  }
  
  /**
   * Runs a single benchmark test with specified parameters.
   *
   * @param {number} earthquakeCount - The number of earthquakes to generate for the test.
   * @param {string} distribution - The geographical distribution of the generated earthquakes.
   * @param {number} maxDistance - The `maxDistanceKm` parameter for the clustering algorithm.
   * @param {number} minQuakes - The `minQuakes` parameter for the clustering algorithm.
   * @param {string} testName - A unique name for this specific benchmark test.
   * @returns {Promise<object>} A promise that resolves to a detailed profile object for the test run.
   */
  async runSingleBenchmark(earthquakeCount, distribution, maxDistance, minQuakes, testName) {
    // Generate test data
    const earthquakes = EarthquakeDataGenerator.generate(earthquakeCount, distribution);
    
    // Force garbage collection if available
    // eslint-disable-next-line no-undef
    if (typeof global !== 'undefined' && global.gc) {
      // eslint-disable-next-line no-undef
      global.gc();
    }
    
    // Run the benchmark
    this.profiler.startProfile(testName);
    
    let clusters;
    try {
      clusters = findActiveClusters(earthquakes, maxDistance, minQuakes);
    } catch (error) {
      console.error(`❌ Benchmark failed for ${testName}:`, error);
      clusters = [];
    }
    
    const result = this.profiler.endProfile(testName, clusters);
    
    return {
      ...result,
      parameters: {
        earthquakeCount,
        distribution,
        maxDistance,
        minQuakes
      },
      performance: {
        timePerEarthquake: result.executionTime / earthquakeCount,
        distanceCalcsPerQuake: result.distanceCalculations / earthquakeCount,
        avgDistanceCalcTime: result.distanceCalculations > 0 ? result.distanceCalculationTime / result.distanceCalculations : null
      }
    };
  }
  
  /**
   * Runs targeted performance regression test
   */
  async runRegressionTest(baselineResults = null) {
    console.log('🔍 Running Performance Regression Test');
    
    // Standard regression test: 1000 earthquakes, realistic distribution, standard params
    const result = await this.runSingleBenchmark(
      1000, 
      'realistic', 
      100, 
      3, 
      'regression_test'
    );
    
    if (baselineResults) {
      const baseline = baselineResults.find(r => r.testName === 'regression_test');
      if (baseline) {
        const performanceChange = ((result.executionTime - baseline.executionTime) / baseline.executionTime) * 100;
        console.log(`📈 Performance change: ${performanceChange.toFixed(2)}%`);
        
        result.regression = {
          baselineTime: baseline.executionTime,
          currentTime: result.executionTime,
          changePercent: performanceChange,
          improved: performanceChange < 0
        };
      }
    }
    
    return result;
  }
  
  /**
   * Exports the benchmark results to a specified format.
   *
   * @param {object} results - The results object returned from `runFullSuite`.
   * @param {string} [format='json'] - The desired output format. Supported formats are
   *   'json', 'csv', and 'markdown'.
   * @returns {string} The benchmark results formatted as a string.
   */
  exportResults(results, format = 'json') {
    switch (format) {
      case 'json':
        return JSON.stringify(results, null, 2);
      case 'csv':
        return this._exportToCSV(results);
      case 'markdown':
        return this._exportToMarkdown(results);
      default:
        return JSON.stringify(results, null, 2);
    }
  }
  
  _exportToCSV(results) {
    const headers = [
      'TestName', 'DatasetSize', 'Distribution', 'MaxDistance', 'MinQuakes',
      'ExecutionTime(ms)', 'MemoryUsed(MB)', 'DistanceCalculations', 
      'ClustersFound', 'TimePerEarthquake(ms)'
    ];
    
    const rows = results.benchmarks.map(b => [
      b.testName,
      b.parameters.earthquakeCount,
      b.parameters.distribution,
      b.parameters.maxDistance,
      b.parameters.minQuakes,
      b.executionTime.toFixed(2),
      (b.memoryUsed / 1024 / 1024).toFixed(2),
      b.distanceCalculations,
      b.result?.clustersFound || 0,
      b.performance.timePerEarthquake.toFixed(4)
    ]);
    
    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }
  
  _exportToMarkdown(results) {
    let md = '# Cluster Algorithm Benchmark Results\n\n';
    md += `**Timestamp:** ${results.metadata.timestamp}\n\n`;
    
    md += '## Performance Summary\n\n';
    md += '| Dataset | Distribution | Params | Time (ms) | Memory (MB) | Clusters |\n';
    md += '|---------|--------------|--------|-----------|-------------|----------|\n';
    
    results.benchmarks.forEach(b => {
      md += `| ${b.parameters.earthquakeCount} | ${b.parameters.distribution} | ${b.parameters.maxDistance}km/${b.parameters.minQuakes} | ${b.executionTime.toFixed(2)} | ${(b.memoryUsed/1024/1024).toFixed(2)} | ${b.result?.clustersFound || 0} |\n`;
    });
    
    return md;
  }
}

// Example usage and standalone execution
// eslint-disable-next-line no-undef
if (typeof require !== 'undefined' && require.main === module) {
  // Run benchmark if executed directly
  const suite = new ClusterBenchmarkSuite();
  
  suite.runFullSuite().then(results => {
    console.log('\n📋 Final Results:');
    console.log(suite.exportResults(results, 'markdown'));
    
    // Save to file if in Node.js environment
    if (typeof require !== 'undefined') {
      // eslint-disable-next-line no-undef
      const fs = require('fs');
      fs.writeFileSync('benchmark_results.json', suite.exportResults(results, 'json'));
      fs.writeFileSync('benchmark_results.csv', suite.exportResults(results, 'csv'));
      fs.writeFileSync('benchmark_results.md', suite.exportResults(results, 'markdown'));
      console.log('✅ Results saved to benchmark_results.*');
    }
  }).catch(console.error);
}