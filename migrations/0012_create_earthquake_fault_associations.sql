-- Create EarthquakeFaultAssociations table for linking earthquakes to nearby faults
CREATE TABLE IF NOT EXISTS EarthquakeFaultAssociations (
    earthquake_id TEXT,
    fault_id TEXT,
    
    -- Spatial relationship data
    distance_km REAL,                    -- Distance from earthquake to closest point on fault
    closest_point_lat REAL,             -- Latitude of closest point on fault
    closest_point_lon REAL,             -- Longitude of closest point on fault
    
    -- Human-readable relationship descriptions
    relationship_description TEXT,       -- "This earthquake happened right on the fault"
    proximity_description TEXT,          -- "Very close (2km away)"
    relevance_explanation TEXT,          -- "Likely caused by this fault"
    
    -- Scoring and metadata
    relevance_score REAL,               -- 0-1 score for how relevant this fault is to the earthquake
    association_type TEXT,              -- "primary", "secondary", "regional_context"
    
    -- Timestamps
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    
    PRIMARY KEY (earthquake_id, fault_id),
    FOREIGN KEY (fault_id) REFERENCES ActiveFaults(fault_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_earthquake_fault_earthquake_id ON EarthquakeFaultAssociations (earthquake_id);
CREATE INDEX IF NOT EXISTS idx_earthquake_fault_fault_id ON EarthquakeFaultAssociations (fault_id);
CREATE INDEX IF NOT EXISTS idx_earthquake_fault_distance ON EarthquakeFaultAssociations (distance_km);
CREATE INDEX IF NOT EXISTS idx_earthquake_fault_relevance ON EarthquakeFaultAssociations (relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_earthquake_fault_association_type ON EarthquakeFaultAssociations (association_type);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_earthquake_fault_associations_timestamp 
    AFTER UPDATE ON EarthquakeFaultAssociations
    FOR EACH ROW
BEGIN
    UPDATE EarthquakeFaultAssociations SET updated_at = strftime('%s', 'now') 
    WHERE earthquake_id = NEW.earthquake_id AND fault_id = NEW.fault_id;
END;