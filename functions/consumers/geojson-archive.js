import { extractProductFlags, persistEarthquakeDetail } from '../utils/earthquakeDetailPersistence.js';
import { isValidUsgsEventId, validateUsgsDetail } from '../utils/usgs-transport.js';

// Existing Queue deliveries still contain { id, geojson }. New persistence
// writes R2 directly after recording a durable job and sends no body message.
// Keep this adapter until the old Queue backlog is demonstrably drained.
var geojson_archive_default = {
  async queue(batch, env) {
    await Promise.all(batch.messages.map(async message => {
      const { id, geojson } = message.body || {};
      try {
        if (!isValidUsgsEventId(id)) throw new Error('Invalid legacy detail event ID');
        // In particular, a missing/invalid properties.updated cannot become
        // a guessed revision or overwrite an existing archive.
        validateUsgsDetail(geojson, id);
        extractProductFlags(geojson);
      } catch (error) {
        console.error('[geojson-archive] Invalid legacy message:', error.message);
        message.ack();
        return;
      }
      try {
        await persistEarthquakeDetail({ env, detailData: geojson, requestedId: id });
        message.ack();
      } catch (error) {
        if (['STALE_DETAIL_REVISION', 'CONFLICTING_DETAIL_REVISION', 'DETAIL_JOB_NOT_DUE'].includes(error.code)) {
          // A newer D1 source revision has won, an equal revision conflicts,
          // or a durable job already owns the retry. Queue redelivery cannot
          // help any of these cases; cron recovers due jobs from D1.
          console.error(`[geojson-archive] Ignored legacy delivery for ${id}:`, error.message);
          message.ack();
        } else {
          console.error(`[geojson-archive] Could not archive ${id}:`, error);
          message.retry({ delaySeconds: 60 });
        }
      }
    }));
  },
};

export { geojson_archive_default as default };
