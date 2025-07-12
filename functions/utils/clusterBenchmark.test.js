/**
 * @file clusterBenchmark.test.js
 * @description Test suite for cluster benchmarking utilities
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  EarthquakeDataGenerator, 
  PerformanceProfiler, 
  ClusterBenchmarkSuite 
} from './clusterBenchmark.js';

describe('EarthquakeDataGenerator', () => {
  it('should generate the correct number of earthquakes', () => {
    const earthquakes = EarthquakeDataGenerator.generate(100, 'realistic');
    expect(earthquakes).toHaveLength(100);
  });

  it('should generate earthquakes with required properties', () => {
    const earthquakes = EarthquakeDataGenerator.generate(10, 'realistic');
    
    earthquakes.forEach(quake => {
      expect(quake).toHaveProperty('id');
      expect(quake).toHaveProperty('properties');
      expect(quake).toHaveProperty('geometry');
      expect(quake.properties).toHaveProperty('mag');
      expect(quake.properties).toHaveProperty('time');
      expect(quake.geometry).toHaveProperty('type', 'Point');
      expect(quake.geometry).toHaveProperty('coordinates');
      expect(quake.geometry.coordinates).toHaveLength(3);
    });
  });

  it('should generate unique earthquake IDs', () => {
    const earthquakes = EarthquakeDataGenerator.generate(50, 'realistic');
    const ids = earthquakes.map(q => q.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(earthquakes.length);
  });

  it('should generate realistic magnitudes', () => {
    const earthquakes = EarthquakeDataGenerator.generate(100, 'realistic');
    
    earthquakes.forEach(quake => {
      expect(quake.properties.mag).toBeGreaterThanOrEqual(2.0);
      expect(quake.properties.mag).toBeLessThanOrEqual(8.0);
    });
  });

  it('should generate coordinates within valid ranges', () => {
    const earthquakes = EarthquakeDataGenerator.generate(100, 'scattered');
    
    earthquakes.forEach(quake => {
      const [lng, lat] = quake.geometry.coordinates;
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThanOrEqual(180);
    });
  });
});

describe('PerformanceProfiler', () => {
  let profiler;

  beforeEach(() => {
    profiler = new PerformanceProfiler();
  });

  it('should start and end a profile', () => {
    profiler.startProfile('test');
    const result = profiler.endProfile('test');
    
    expect(result).toBeDefined();
    expect(result.testName).toBe('test');
    expect(result.executionTime).toBeGreaterThanOrEqual(0);
  });

  it('should track multiple profiles', () => {
    profiler.startProfile('test1');
    profiler.endProfile('test1');
    
    profiler.startProfile('test2');
    profiler.endProfile('test2');
    
    const profiles = profiler.getAllProfiles();
    expect(profiles).toHaveLength(2);
  });

  it('should measure execution time', async () => {
    profiler.startProfile('timing_test');
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const result = profiler.endProfile('timing_test');
    expect(result.executionTime).toBeGreaterThan(5); // Should be at least 5ms
  });

  it('should export results in correct format', () => {
    profiler.startProfile('export_test');
    profiler.endProfile('export_test');
    
    const exported = profiler.exportResults();
    expect(exported).toHaveProperty('timestamp');
    expect(exported).toHaveProperty('profiles');
    expect(exported).toHaveProperty('environment');
    expect(exported.profiles).toHaveLength(1);
  });
});

describe('ClusterBenchmarkSuite', () => {
  let suite;

  beforeEach(() => {
    suite = new ClusterBenchmarkSuite();
  });

  it('should create a benchmark suite', () => {
    expect(suite).toBeDefined();
    expect(suite.profiler).toBeDefined();
  });

  it('should run a single benchmark', async () => {
    const result = await suite.runSingleBenchmark(
      10, // Small dataset for fast testing
      'realistic',
      100,
      3,
      'test_benchmark'
    );

    expect(result).toBeDefined();
    expect(result.testName).toBe('test_benchmark');
    expect(result.executionTime).toBeGreaterThan(0);
    expect(result.parameters.earthquakeCount).toBe(10);
    expect(result.parameters.maxDistance).toBe(100);
    expect(result.parameters.minQuakes).toBe(3);
  });

  it('should run regression test', async () => {
    const result = await suite.runRegressionTest();
    
    expect(result).toBeDefined();
    expect(result.testName).toBe('regression_test');
    expect(result.parameters.earthquakeCount).toBe(1000);
  });

  it('should export results to JSON format', () => {
    const mockResults = {
      metadata: { timestamp: '2024-01-01T00:00:00.000Z' },
      benchmarks: [{
        testName: 'test',
        executionTime: 100,
        parameters: { earthquakeCount: 10 }
      }]
    };

    const exported = suite.exportResults(mockResults, 'json');
    expect(() => JSON.parse(exported)).not.toThrow();
  });

  it('should export results to CSV format', () => {
    const mockResults = {
      metadata: { timestamp: '2024-01-01T00:00:00.000Z' },
      benchmarks: [{
        testName: 'test',
        executionTime: 100,
        memoryUsed: 1024 * 1024,
        distanceCalculations: 50,
        parameters: {
          earthquakeCount: 10,
          distribution: 'realistic',
          maxDistance: 100,
          minQuakes: 3
        },
        performance: {
          timePerEarthquake: 10
        },
        result: {
          clustersFound: 2
        }
      }]
    };

    const csv = suite.exportResults(mockResults, 'csv');
    expect(csv).toContain('TestName');
    expect(csv).toContain('ExecutionTime(ms)');
    expect(csv).toContain('test,10,realistic');
  });

  it('should export results to Markdown format', () => {
    const mockResults = {
      metadata: { timestamp: '2024-01-01T00:00:00.000Z' },
      benchmarks: [{
        testName: 'test',
        executionTime: 100,
        memoryUsed: 1024 * 1024,
        parameters: {
          earthquakeCount: 10,
          distribution: 'realistic',
          maxDistance: 100,
          minQuakes: 3
        },
        result: {
          clustersFound: 2
        }
      }]
    };

    const markdown = suite.exportResults(mockResults, 'markdown');
    expect(markdown).toContain('# Cluster Algorithm Benchmark Results');
    expect(markdown).toContain('| Dataset | Distribution |');
    expect(markdown).toContain('| 10 | realistic |');
  });
});

describe('Integration Tests', () => {
  it('should handle edge cases gracefully', async () => {
    const suite = new ClusterBenchmarkSuite();
    
    // Test with very small dataset
    const result = await suite.runSingleBenchmark(1, 'realistic', 100, 3, 'edge_case_test');
    expect(result).toBeDefined();
    expect(result.result.clustersFound).toBe(0); // Should find no clusters with 1 earthquake
  });

  it('should maintain consistent results across runs', async () => {
    const suite = new ClusterBenchmarkSuite();
    
    // Run same test multiple times
    const results = [];
    for (let i = 0; i < 3; i++) {
      const result = await suite.runSingleBenchmark(50, 'clustered', 100, 3, `consistency_test_${i}`);
      results.push(result);
    }

    // Results should be similar (within reasonable variance)
    const times = results.map(r => r.executionTime);
    const avgTime = times.reduce((a, b) => a + b) / times.length;
    const variance = times.map(t => Math.abs(t - avgTime) / avgTime);
    
    // Variance should be less than 50% (algorithms can vary due to random data)
    variance.forEach(v => {
      expect(v).toBeLessThan(0.5);
    });
  });
});