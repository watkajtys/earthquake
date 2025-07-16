# Fault Data Files

This directory contains fault data files used by the earthquake dashboard.

## Files

### Required for Import (Not in Git)
- `gem_active_faults_harmonized_full.geojson` (11MB) - Complete fault dataset for database import
  - **Source**: GEM Global Active Faults Database
  - **Usage**: Required by `scripts/import-fault-data.js`
  - **Note**: This file is excluded from Git due to size. Download from original source if needed.

### In Repository
- `gem_active_faults_harmonized.json` (5MB) - Subset of fault data for fallback
- `faults_sample.json` - Sample fault data for testing
- `local_active_faults.json` - Local fault data

## Import Process

1. Ensure `gem_active_faults_harmonized_full.geojson` exists in this directory
2. Run: `node scripts/import-fault-data.js --database PrimaryDB --remote`
3. This imports fault data into the D1 database for API use

## API Usage

The application uses `/api/get-nearby-faults` API instead of static files for better performance and database-backed fault queries.