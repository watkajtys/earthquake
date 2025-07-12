#!/usr/bin/env node

/**
 * @file run-benchmark.js
 * @description Standalone script to run clustering algorithm benchmarks
 * Usage: node scripts/run-benchmark.js [options]
 */

import { ClusterBenchmarkSuite } from '../functions/utils/clusterBenchmark.js';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, '..', 'benchmark-results');

// Command line argument parsing
const args = process.argv.slice(2);
const options = {
  quick: args.includes('--quick'),
  regression: args.includes('--regression'),
  format: args.includes('--csv') ? 'csv' : args.includes('--markdown') ? 'markdown' : 'json',
  output: args.find(arg => arg.startsWith('--output='))?.split('=')[1] || null
};

/**
 * Main benchmark execution
 */
async function main() {
  console.log('🚀 Earthquake Clustering Algorithm Benchmark');
  console.log('=' .repeat(50));
  console.log(`Options: ${JSON.stringify(options, null, 2)}`);
  console.log();

  // Ensure results directory exists
  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const suite = new ClusterBenchmarkSuite();
  let results;

  if (options.regression) {
    console.log('📊 Running regression test only...\n');
    
    // Load baseline if exists
    let baseline = null;
    try {
      const baselinePath = join(RESULTS_DIR, 'baseline.json');
      if (existsSync(baselinePath)) {
        const baselineData = JSON.parse(readFileSync(baselinePath, 'utf8'));
        baseline = baselineData.benchmarks || baselineData;
      }
    } catch (error) {
      console.warn('⚠️  Could not load baseline data:', error.message);
    }

    const regressionResult = await suite.runRegressionTest(baseline);
    
    results = {
      metadata: {
        timestamp: new Date().toISOString(),
        type: 'regression',
        baseline: baseline ? 'loaded' : 'none'
      },
      benchmarks: [regressionResult]
    };

    // Display regression results
    if (regressionResult.regression) {
      const change = regressionResult.regression.changePercent;
      const symbol = change < 0 ? '📈' : change > 0 ? '📉' : '➡️';
      console.log(`${symbol} Performance change: ${change.toFixed(2)}%`);
      console.log(`   Baseline: ${regressionResult.regression.baselineTime.toFixed(2)}ms`);
      console.log(`   Current:  ${regressionResult.regression.currentTime.toFixed(2)}ms`);
    }

  } else if (options.quick) {
    console.log('⚡ Running quick benchmark (limited dataset sizes)...\n');
    
    // Override config for quick testing
    const quickConfig = {
      datasets: [
        { size: 100, name: 'Small' },
        { size: 500, name: 'Medium' },
        { size: 1000, name: 'Large' }
      ]
    };

    results = await suite.runFullSuite({ quick: true, config: quickConfig });

  } else {
    console.log('🔬 Running full benchmark suite...\n');
    results = await suite.runFullSuite();
  }

  // Generate timestamp for filenames
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  
  // Save results
  const baseFileName = options.output || `benchmark-${timestamp}`;
  const resultsPath = join(RESULTS_DIR, `${baseFileName}.json`);
  
  writeFileSync(resultsPath, suite.exportResults(results, 'json'));
  console.log(`\n💾 Results saved to: ${resultsPath}`);

  // Save in requested format
  if (options.format !== 'json') {
    const formatPath = join(RESULTS_DIR, `${baseFileName}.${options.format}`);
    writeFileSync(formatPath, suite.exportResults(results, options.format));
    console.log(`📄 ${options.format.toUpperCase()} saved to: ${formatPath}`);
  }

  // Save as baseline if this is a full benchmark
  if (!options.quick && !options.regression) {
    const baselinePath = join(RESULTS_DIR, 'baseline.json');
    writeFileSync(baselinePath, suite.exportResults(results, 'json'));
    console.log(`📋 Baseline updated: ${baselinePath}`);
  }

  // Display summary
  displaySummary(results);
}

/**
 * Display benchmark summary
 */
function displaySummary(results) {
  console.log('\n📊 BENCHMARK SUMMARY');
  console.log('=' .repeat(50));

  if (!results.benchmarks || results.benchmarks.length === 0) {
    console.log('No benchmark results to display.');
    return;
  }

  // Find performance patterns
  const sortedByTime = [...results.benchmarks].sort((a, b) => a.executionTime - b.executionTime);
  const fastest = sortedByTime[0];
  const slowest = sortedByTime[sortedByTime.length - 1];

  console.log(`⚡ Fastest test: ${fastest.testName}`);
  console.log(`   ${fastest.executionTime.toFixed(2)}ms for ${fastest.parameters.earthquakeCount} earthquakes`);
  console.log(`   ${fastest.performance.timePerEarthquake.toFixed(4)}ms per earthquake`);

  console.log(`\n🐌 Slowest test: ${slowest.testName}`);
  console.log(`   ${slowest.executionTime.toFixed(2)}ms for ${slowest.parameters.earthquakeCount} earthquakes`);
  console.log(`   ${slowest.performance.timePerEarthquake.toFixed(4)}ms per earthquake`);

  // Analyze scalability
  const largeDatasets = results.benchmarks.filter(b => b.parameters.earthquakeCount >= 1000);
  if (largeDatasets.length > 0) {
    const avgTimePerQuake = largeDatasets.reduce((sum, b) => sum + b.performance.timePerEarthquake, 0) / largeDatasets.length;
    console.log(`\n📈 Large dataset performance (1000+ earthquakes):`);
    console.log(`   Average: ${avgTimePerQuake.toFixed(4)}ms per earthquake`);
    
    const worstCase = largeDatasets.reduce((worst, current) => 
      current.performance.timePerEarthquake > worst.performance.timePerEarthquake ? current : worst
    );
    console.log(`   Worst case: ${worstCase.performance.timePerEarthquake.toFixed(4)}ms per earthquake (${worstCase.testName})`);
  }

  // Memory usage
  const avgMemory = results.benchmarks.reduce((sum, b) => sum + b.memoryUsed, 0) / results.benchmarks.length;
  const maxMemory = Math.max(...results.benchmarks.map(b => b.memoryUsed));
  
  console.log(`\n💾 Memory usage:`);
  console.log(`   Average: ${(avgMemory / 1024 / 1024).toFixed(2)}MB`);
  console.log(`   Peak: ${(maxMemory / 1024 / 1024).toFixed(2)}MB`);

  // Distance calculations
  const avgDistCalcs = results.benchmarks.reduce((sum, b) => sum + b.performance.distanceCalcsPerQuake, 0) / results.benchmarks.length;
  console.log(`\n🧮 Distance calculations:`);
  console.log(`   Average: ${avgDistCalcs.toFixed(2)} per earthquake`);
  
  const highestDistCalcs = Math.max(...results.benchmarks.map(b => b.performance.distanceCalcsPerQuake));
  console.log(`   Highest: ${highestDistCalcs.toFixed(2)} per earthquake (O(N²) behavior evident)`);

  console.log('\n✅ Benchmark completed successfully!');
  console.log('\n💡 Next steps:');
  console.log('   1. Review results in generated files');
  console.log('   2. Identify performance bottlenecks');
  console.log('   3. Implement spatial indexing optimizations');
  console.log('   4. Run regression tests after optimizations');
}

/**
 * Error handling
 */
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});

// Help text
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🚀 Earthquake Clustering Algorithm Benchmark

Usage: node scripts/run-benchmark.js [options]

Options:
  --quick           Run quick benchmark (limited dataset sizes)
  --regression      Run regression test only (compare against baseline)
  --csv             Export results in CSV format
  --markdown        Export results in Markdown format  
  --output=NAME     Specify output filename (without extension)
  --help, -h        Show this help message

Examples:
  node scripts/run-benchmark.js                    # Full benchmark suite
  node scripts/run-benchmark.js --quick            # Quick benchmark
  node scripts/run-benchmark.js --regression       # Regression test
  node scripts/run-benchmark.js --csv --output=test # CSV output

Results are saved to: benchmark-results/
  `);
  process.exit(0);
}

// Run the benchmark
main().catch(error => {
  console.error('❌ Benchmark failed:', error);
  process.exit(1);
});