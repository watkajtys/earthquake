#!/usr/bin/env node

/**
 * @file generate-fault-sql.js
 * @description Generate a single SQL file with all fault data for import
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { 
  generateFaultDescription, 
  parseTupledValues, 
  calculateFaultLength, 
  calculateBoundingBox 
} from '../functions/utils/faultTranslation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Process a single fault feature into database format
 */
function processFaultFeature(feature, index) {
  try {
    const { properties, geometry } = feature;
    
    // Generate unique fault ID
    const faultId = `${properties.catalog_name}_${properties.catalog_id}_${index}`;
    
    // Parse scientific values
    const slipRateData = parseTupledValues(properties.net_slip_rate);
    const dipData = parseTupledValues(properties.average_dip);
    const rakeData = parseTupledValues(properties.average_rake);
    const upperDepthData = parseTupledValues(properties.upper_seis_depth);
    const lowerDepthData = parseTupledValues(properties.lower_seis_depth);
    
    // Calculate spatial properties
    const coordinates = geometry.coordinates;
    const lengthKm = calculateFaultLength(coordinates);
    const bbox = calculateBoundingBox(coordinates);
    
    // Generate human-readable descriptions
    const description = generateFaultDescription(feature);
    
    // Create database record
    const faultRecord = {
      fault_id: faultId,
      catalog_id: properties.catalog_id,
      catalog_name: properties.catalog_name,
      name: properties.name,
      
      // Human-readable content
      display_name: description.displayName,
      movement_description: description.movementDescription,
      activity_level: description.activityLevel,
      speed_description: description.speedDescription,
      depth_description: description.depthDescription,
      hazard_description: description.hazardDescription,
      
      // Scientific data
      slip_type: properties.slip_type,
      average_dip: dipData?.best,
      average_rake: rakeData?.best,
      dip_dir: properties.dip_dir,
      net_slip_rate_min: slipRateData?.min,
      net_slip_rate_best: slipRateData?.best,
      net_slip_rate_max: slipRateData?.max,
      upper_seis_depth: upperDepthData?.best,
      lower_seis_depth: lowerDepthData?.best,
      
      // Spatial data
      geom_linestring: JSON.stringify(geometry),
      bbox_min_lat: bbox.minLat,
      bbox_max_lat: bbox.maxLat,
      bbox_min_lon: bbox.minLon,
      bbox_max_lon: bbox.maxLon,
      length_km: lengthKm
    };
    
    return faultRecord;
  } catch (error) {
    console.error(`❌ Error processing fault feature ${index}:`, error.message);
    return null;
  }
}

/**
 * Generate SQL INSERT statement for fault record
 */
function generateInsertSQL(faultRecord) {
  const escapeString = (str) => {
    if (str === null || str === undefined) return 'NULL';
    return `'${str.toString().replace(/'/g, "''")}'`;
  };
  
  const escapeNumber = (num) => {
    if (num === null || num === undefined || isNaN(num)) return 'NULL';
    return num.toString();
  };
  
  return `INSERT INTO ActiveFaults (
    fault_id, catalog_id, catalog_name, name,
    display_name, movement_description, activity_level, speed_description, 
    depth_description, hazard_description,
    slip_type, average_dip, average_rake, dip_dir,
    net_slip_rate_min, net_slip_rate_best, net_slip_rate_max,
    upper_seis_depth, lower_seis_depth,
    geom_linestring, bbox_min_lat, bbox_max_lat, bbox_min_lon, bbox_max_lon, length_km
  ) VALUES (
    ${escapeString(faultRecord.fault_id)},
    ${escapeString(faultRecord.catalog_id)},
    ${escapeString(faultRecord.catalog_name)},
    ${escapeString(faultRecord.name)},
    ${escapeString(faultRecord.display_name)},
    ${escapeString(faultRecord.movement_description)},
    ${escapeString(faultRecord.activity_level)},
    ${escapeString(faultRecord.speed_description)},
    ${escapeString(faultRecord.depth_description)},
    ${escapeString(faultRecord.hazard_description)},
    ${escapeString(faultRecord.slip_type)},
    ${escapeNumber(faultRecord.average_dip)},
    ${escapeNumber(faultRecord.average_rake)},
    ${escapeString(faultRecord.dip_dir)},
    ${escapeNumber(faultRecord.net_slip_rate_min)},
    ${escapeNumber(faultRecord.net_slip_rate_best)},
    ${escapeNumber(faultRecord.net_slip_rate_max)},
    ${escapeNumber(faultRecord.upper_seis_depth)},
    ${escapeNumber(faultRecord.lower_seis_depth)},
    ${escapeString(faultRecord.geom_linestring)},
    ${escapeNumber(faultRecord.bbox_min_lat)},
    ${escapeNumber(faultRecord.bbox_max_lat)},
    ${escapeNumber(faultRecord.bbox_min_lon)},
    ${escapeNumber(faultRecord.bbox_max_lon)},
    ${escapeNumber(faultRecord.length_km)}
  );`;
}

async function main() {
  console.log('🌍 Generating Fault Data SQL File');
  console.log('='.repeat(50));
  
  try {
    // Load fault data
    const faultDataPath = join(__dirname, '..', 'src', 'assets', 'gem_active_faults_harmonized_full.geojson');
    console.log(`📂 Loading fault data from: ${faultDataPath}`);
    
    const rawData = readFileSync(faultDataPath, 'utf8');
    const geoJson = JSON.parse(rawData);
    const features = geoJson.features;
    
    console.log(`✅ Loaded ${features.length} fault features`);
    
    // Generate SQL statements
    const sqlStatements = [];
    let processedCount = 0;
    let errorCount = 0;
    
    // Add delete statement
    sqlStatements.push('DELETE FROM ActiveFaults;');
    
    console.log('🔄 Processing features...');
    
    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      const faultRecord = processFaultFeature(feature, i);
      
      if (faultRecord) {
        sqlStatements.push(generateInsertSQL(faultRecord));
        processedCount++;
      } else {
        errorCount++;
      }
      
      if ((i + 1) % 1000 === 0) {
        console.log(`  Processed ${i + 1}/${features.length} features...`);
      }
    }
    
    // Write SQL file
    const outputPath = join(__dirname, 'fault_data_import.sql');
    const sqlContent = sqlStatements.join('\n');
    
    console.log(`📝 Writing SQL file: ${outputPath}`);
    writeFileSync(outputPath, sqlContent, 'utf8');
    
    console.log('\\n✅ SQL file generated successfully!');
    console.log(`   Processed: ${processedCount} faults`);
    console.log(`   Errors: ${errorCount} faults`);
    console.log(`   File: ${outputPath}`);
    console.log('\\n🚀 To import, run:');
    console.log(`   npx wrangler d1 execute PrimaryDB --remote --file="${outputPath}"`);
    
  } catch (error) {
    console.error('❌ Generation failed:', error.message);
    process.exit(1);
  }
}

// Run the generator
main().catch(console.error);