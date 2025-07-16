-- Create ActiveFaults table for storing fault line data with human-readable and scientific information
CREATE TABLE IF NOT EXISTS ActiveFaults (
    fault_id TEXT PRIMARY KEY,
    catalog_id TEXT,
    catalog_name TEXT,
    name TEXT,
    
    -- Human-readable primary content for museum visitors
    display_name TEXT,              -- User-friendly fault name
    movement_description TEXT,      -- "Slides sideways like a zipper"
    activity_level TEXT,           -- "Very Active", "Moderate", "Slow"
    speed_description TEXT,        -- "Moves as fast as fingernails grow (3cm/year)"
    depth_description TEXT,        -- "Shallow fault (0-10km deep)"
    hazard_description TEXT,       -- "Can produce large M7+ earthquakes"
    
    -- Scientific data (preserved from original GeoJSON)
    slip_type TEXT,
    average_dip REAL,
    average_rake REAL,
    dip_dir TEXT,
    net_slip_rate_min REAL,        -- Minimum slip rate (mm/year)
    net_slip_rate_best REAL,       -- Best estimate slip rate (mm/year)
    net_slip_rate_max REAL,        -- Maximum slip rate (mm/year)
    upper_seis_depth REAL,         -- Upper seismogenic depth (km)
    lower_seis_depth REAL,         -- Lower seismogenic depth (km)
    
    -- Spatial data
    geom_linestring TEXT,          -- GeoJSON LineString of fault trace
    bbox_min_lat REAL,             -- Bounding box for spatial queries
    bbox_max_lat REAL,
    bbox_min_lon REAL,
    bbox_max_lon REAL,
    length_km REAL,                -- Calculated fault length in kilometers
    
    -- Metadata
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Create indexes for efficient spatial queries
CREATE INDEX IF NOT EXISTS idx_active_faults_bbox ON ActiveFaults (bbox_min_lat, bbox_max_lat, bbox_min_lon, bbox_max_lon);
CREATE INDEX IF NOT EXISTS idx_active_faults_catalog ON ActiveFaults (catalog_name, catalog_id);
CREATE INDEX IF NOT EXISTS idx_active_faults_slip_type ON ActiveFaults (slip_type);
CREATE INDEX IF NOT EXISTS idx_active_faults_activity_level ON ActiveFaults (activity_level);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_active_faults_timestamp 
    AFTER UPDATE ON ActiveFaults
    FOR EACH ROW
BEGIN
    UPDATE ActiveFaults SET updated_at = strftime('%s', 'now') WHERE fault_id = NEW.fault_id;
END;