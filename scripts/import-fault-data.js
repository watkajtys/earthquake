#!/usr/bin/env node

/**
 * @file import-fault-data.js
 * @description Import fault data from gem_active_faults_harmonized_full.geojson into D1 database
 * with human-readable translations for museum display
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import { 
  generateFaultDescription, 
  parseTupledValues, 
  calculateFaultLength, 
  calculateBoundingBox 
} from '../functions/utils/faultTranslation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Wrangler D1 interface for fault data import
 */
class FaultDataImporter {
  constructor(databaseName = 'PrimaryDB', useRemote = false) {
    this.databaseName = databaseName;
    this.useRemote = useRemote;
    this.importedCount = 0;
    this.errorCount = 0;
    this.errors = [];
  }

  /**
   * Execute SQL query using wrangler d1
   */
  async executeQuery(sql, description = '', forceFile = false) {
    try {
      console.log(`  ${description}...`);
      const remoteFlag = this.useRemote ? '--remote' : '--local';
      
      // Use file approach for batch operations or long SQL commands
      if (forceFile || sql.length > 8000 || sql.includes('INSERT INTO')) {
        const { writeFileSync, unlinkSync } = await import('fs');
        const tempFile = join(__dirname, 'temp_batch.sql');
        writeFileSync(tempFile, sql, 'utf8');
        
        try {
          const result = execSync(`npx wrangler d1 execute ${this.databaseName} ${remoteFlag} --file="${tempFile}"`, {
            encoding: 'utf-8',
            maxBuffer: 50 * 1024 * 1024 // 50MB buffer
          });
          unlinkSync(tempFile); // Clean up temp file
          return result;
        } catch (error) {
          unlinkSync(tempFile); // Clean up temp file on error
          throw error;
        }
      } else {
        const result = execSync(`npx wrangler d1 execute ${this.databaseName} ${remoteFlag} --command="${sql}"`, {
          encoding: 'utf-8',
          maxBuffer: 50 * 1024 * 1024 // 50MB buffer
        });
        return result;
      }
    } catch (error) {
      console.error(`  ❌ SQL Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load and parse the GeoJSON fault data
   */
  loadFaultData() {
    const faultDataPath = join(__dirname, '..', 'src', 'assets', 'gem_active_faults_harmonized_full.geojson');
    
    console.log(`📂 Loading fault data from: ${faultDataPath}`);
    
    try {
      const rawData = readFileSync(faultDataPath, 'utf8');
      const geoJson = JSON.parse(rawData);
      
      console.log(`✅ Loaded ${geoJson.features.length} fault features`);
      return geoJson.features;
    } catch (error) {
      console.error('❌ Failed to load fault data:', error.message);
      throw error;
    }
  }

  /**
   * Process a single fault feature into database format
   */
  processFaultFeature(feature, index) {
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
      this.errors.push(`Feature ${index}: ${error.message}`);
      this.errorCount++;
      return null;
    }
  }

  /**
   * Generate SQL INSERT statement for fault record
   */
  generateInsertSQL(faultRecord) {
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

  /**
   * Import fault data in batches
   */
  async importFaultData(features, batchSize = 10) {
    console.log(`📥 Starting import of ${features.length} fault features...`);
    
    // Clear existing data
    await this.executeQuery('DELETE FROM ActiveFaults;', 'Clearing existing fault data');
    
    const batches = [];
    for (let i = 0; i < features.length; i += batchSize) {
      batches.push(features.slice(i, i + batchSize));
    }
    
    console.log(`📦 Processing ${batches.length} batches of ${batchSize} features each`);
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`\\n📦 Processing batch ${batchIndex + 1}/${batches.length}...`);
      
      const sqlStatements = [];
      
      for (let i = 0; i < batch.length; i++) {
        const feature = batch[i];
        const globalIndex = batchIndex * batchSize + i;
        
        const faultRecord = this.processFaultFeature(feature, globalIndex);
        if (faultRecord) {
          sqlStatements.push(this.generateInsertSQL(faultRecord));
          this.importedCount++;
        }
      }
      
      if (sqlStatements.length > 0) {
        // Execute batch statements (no transaction wrapper for D1)
        const batchSQL = sqlStatements.join('\n');
        await this.executeQuery(batchSQL, `Importing batch ${batchIndex + 1}`, true);
      }
      
      // Progress update
      const progress = ((batchIndex + 1) / batches.length * 100).toFixed(1);
      console.log(`  ✅ Batch ${batchIndex + 1} completed (${progress}% done)`);
    }
  }

  /**
   * Test database connection
   */
  async testConnection() {
    try {
      console.log(`🔍 Testing D1 database connection: ${this.databaseName}`);
      await this.executeQuery('SELECT name FROM sqlite_master WHERE type=\\"table\\";', 'Testing connection');
      console.log('✅ Database connection successful');
      return true;
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      return false;
    }
  }

  /**
   * Verify import results
   */
  async verifyImport() {
    try {
      const countResult = await this.executeQuery('SELECT COUNT(*) as count FROM ActiveFaults;', 'Counting imported faults');
      const sampleResult = await this.executeQuery('SELECT display_name, activity_level, slip_type FROM ActiveFaults LIMIT 5;', 'Sampling imported data');
      
      console.log('\\n📊 Import verification:');
      console.log(`  Total faults imported: ${this.importedCount}`);
      console.log(`  Errors encountered: ${this.errorCount}`);
      
      if (this.errorCount > 0) {
        console.log('\\n❌ Errors encountered:');
        this.errors.slice(0, 5).forEach(error => console.log(`  - ${error}`));
        if (this.errors.length > 5) {
          console.log(`  ... and ${this.errors.length - 5} more errors`);
        }
      }
      
      console.log('\\n✅ Import completed successfully!');
      return true;
    } catch (error) {
      console.error('❌ Import verification failed:', error.message);
      return false;
    }
  }

  /**
   * Main import process
   */
  async run() {
    console.log('🗄️  Active Fault Data Import');
    console.log('=' .repeat(50));
    
    try {
      // Test database connection
      const connected = await this.testConnection();
      if (!connected) {
        console.log('\\n💡 Troubleshooting tips:');
        console.log('   1. Ensure wrangler is installed: npm install -g wrangler');
        console.log('   2. Login to Cloudflare: wrangler auth login');
        console.log('   3. Check database exists: wrangler d1 list');
        console.log('   4. Run migrations: wrangler d1 migrations apply PrimaryDB');
        process.exit(1);
      }
      
      // Load fault data
      const features = this.loadFaultData();
      
      // Import fault data
      await this.importFaultData(features);
      
      // Verify import
      await this.verifyImport();
      
    } catch (error) {
      console.error('❌ Import failed:', error.message);
      process.exit(1);
    }
  }
}

// Command line interface
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    database: 'PrimaryDB',
    batchSize: 10,
    test: false,
    remote: false
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--database':
        options.database = args[++i];
        break;
      case '--batch-size':
        options.batchSize = parseInt(args[++i]);
        break;
      case '--test':
        options.test = true;
        break;
      case '--remote':
        options.remote = true;
        break;
      case '--help':
        console.log(`
Active Fault Data Import Tool

Usage: node scripts/import-fault-data.js [options]

Options:
  --database <name>     D1 database name (default: PrimaryDB)
  --batch-size <size>   Import batch size (default: 10)
  --test               Test database connection only
  --remote             Use remote database instead of local
  --help               Show this help

Prerequisites:
  - Wrangler CLI installed and configured
  - D1 database with ActiveFaults table created
  - gem_active_faults_harmonized_full.geojson file in src/assets/

Examples:
  node scripts/import-fault-data.js --database PrimaryDB --batch-size 5
  node scripts/import-fault-data.js --database PrimaryDB --remote
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
  
  console.log('🌍 Active Fault Data Import Tool');
  console.log(`Database: ${options.database}`);
  console.log(`Environment: ${options.remote ? 'Remote' : 'Local'}`);
  console.log(`Batch size: ${options.batchSize}`);
  console.log('');
  
  const importer = new FaultDataImporter(options.database, options.remote);
  
  if (options.test) {
    await importer.testConnection();
    console.log('✅ Database connection test completed!');
    process.exit(0);
  }
  
  await importer.run();
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { FaultDataImporter };