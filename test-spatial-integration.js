#!/usr/bin/env node

/**
 * @file test-spatial-integration.js
 * @description Integration test for spatial clustering optimization
 */

import { findActiveClusters } from './functions/api/calculate-clusters.POST.js';
import { findActiveClustersOptimized } from './functions/utils/spatialClusterUtils.js';

// Generate test earthquake data
function generateTestEarthquakes(count, clusterCount = 3) {
  const earthquakes = [];
  const clusterCenters = [
    { lat: 34.0522, lng: -118.2437 }, // LA
    { lat: 37.7749, lng: -122.4194 }, // SF  
    { lat: 40.7128, lng: -74.0060 }   // NYC
  ];
  
  for (let i = 0; i < count; i++) {
    const centerIndex = Math.floor(Math.random() * clusterCenters.length);
    const center = clusterCenters[centerIndex];
    
    // Add some randomness around cluster centers
    const lat = center.lat + (Math.random() - 0.5) * 0.1;
    const lng = center.lng + (Math.random() - 0.5) * 0.1;
    const mag = 3.0 + Math.random() * 3.0;
    
    earthquakes.push({
      id: `test_earthquake_${i}`,
      properties: {
        mag,
        time: Date.now() - Math.random() * 24 * 60 * 60 * 1000,
        place: `Test Location ${i}`
      },
      geometry: {
        type: 'Point',
        coordinates: [lng, lat, Math.random() * 50]
      }
    });
  }
  
  return earthquakes;
}

function validateClusterResults(original, optimized, testName) {
  console.log(`\n🔍 Validating ${testName}:`);
  console.log(`  Original: ${original.length} clusters`);
  console.log(`  Optimized: ${optimized.length} clusters`);
  
  const originalTotal = original.reduce((sum, cluster) => sum + cluster.length, 0);
  const optimizedTotal = optimized.reduce((sum, cluster) => sum + cluster.length, 0);
  
  console.log(`  Original total earthquakes: ${originalTotal}`);
  console.log(`  Optimized total earthquakes: ${optimizedTotal}`);
  
  // Clusters should be very similar (allow for some variation due to algorithm differences)
  const clusterCountDiff = Math.abs(original.length - optimized.length);
  const totalDiff = Math.abs(originalTotal - optimizedTotal);
  
  if (clusterCountDiff <= 1 && totalDiff <= originalTotal * 0.1) {
    console.log(`  ✅ Results are consistent`);
    return true;
  } else {
    console.log(`  ⚠️  Results differ significantly`);
    return false;
  }
}

async function runPerformanceComparison() {
  console.log('🚀 Spatial Clustering Integration Test\n');
  
  const testCases = [
    { size: 50, name: 'Small Dataset' },
    { size: 200, name: 'Medium Dataset' },
    { size: 500, name: 'Large Dataset' },
    { size: 1000, name: 'Very Large Dataset' }
  ];
  
  const results = [];
  
  for (const testCase of testCases) {
    console.log(`\n📊 Testing ${testCase.name} (${testCase.size} earthquakes)`);
    
    const earthquakes = generateTestEarthquakes(testCase.size);
    const maxDistanceKm = 50;
    const minQuakes = 3;
    
    // Test original algorithm
    console.time(`Original Algorithm (${testCase.size})`);
    const originalClusters = findActiveClusters(earthquakes, maxDistanceKm, minQuakes);
    console.timeEnd(`Original Algorithm (${testCase.size})`);
    
    // Test optimized algorithm
    console.time(`Spatial Optimization (${testCase.size})`);
    const optimizedClusters = findActiveClustersOptimized(earthquakes, maxDistanceKm, minQuakes);
    console.timeEnd(`Spatial Optimization (${testCase.size})`);
    
    // Validate results
    const isValid = validateClusterResults(originalClusters, optimizedClusters, testCase.name);
    
    results.push({
      testCase: testCase.name,
      size: testCase.size,
      originalClusters: originalClusters.length,
      optimizedClusters: optimizedClusters.length,
      isValid
    });
  }
  
  console.log('\n📈 Performance Summary:');
  console.log('=' .repeat(60));
  
  results.forEach(result => {
    const status = result.isValid ? '✅' : '❌';
    console.log(`${status} ${result.testCase}: ${result.size} earthquakes`);
    console.log(`   Original: ${result.originalClusters} clusters`);
    console.log(`   Optimized: ${result.optimizedClusters} clusters`);
  });
  
  const allValid = results.every(r => r.isValid);
  
  console.log('\n🎯 Integration Test Results:');
  if (allValid) {
    console.log('✅ All tests passed! Spatial optimization is working correctly.');
    console.log('🚀 The spatial indexing maintains functional compatibility');
    console.log('📊 Performance improvements should be significant for large datasets');
  } else {
    console.log('❌ Some tests failed. Check algorithm compatibility.');
  }
  
  return allValid;
}

// Run the test
runPerformanceComparison()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  });