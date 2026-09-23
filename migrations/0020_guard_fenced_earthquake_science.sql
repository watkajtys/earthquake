-- Preserve observed USGS revisions while an older Worker invocation may still
-- be running. Legacy rows remain writable until a validated revision is stored.
CREATE TRIGGER trg_earthquakeevents_source_revision_guard
BEFORE UPDATE OF event_time, latitude, longitude, depth, magnitude, place,
  usgs_detail_url, source_updated_at_ms ON EarthquakeEvents
FOR EACH ROW
WHEN OLD.source_updated_at_ms IS NOT NULL
  AND (
    NEW.source_updated_at_ms IS NULL
    OR typeof(NEW.source_updated_at_ms) <> 'integer'
    OR NEW.source_updated_at_ms NOT BETWEEN -8640000000000000 AND 8640000000000000
    OR NEW.source_updated_at_ms < OLD.source_updated_at_ms
    OR (
      NEW.source_updated_at_ms = OLD.source_updated_at_ms
      AND (
        NEW.event_time IS NOT OLD.event_time
        OR NEW.latitude IS NOT OLD.latitude
        OR NEW.longitude IS NOT OLD.longitude
        OR NEW.depth IS NOT OLD.depth
        OR NEW.magnitude IS NOT OLD.magnitude
        OR NEW.place IS NOT OLD.place
        OR NEW.usgs_detail_url IS NOT OLD.usgs_detail_url
      )
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'EARTHQUAKE_SOURCE_REVISION_NOT_ADVANCED');
END;
