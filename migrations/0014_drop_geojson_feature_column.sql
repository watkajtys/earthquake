-- Migration number: 0014 	 2024-07-01_15-00-00.sql

-- Drop the geojson_feature column from the EarthquakeEvents table
ALTER TABLE EarthquakeEvents DROP COLUMN geojson_feature;
