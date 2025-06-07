// --- Constants ---
const USGS_API_URL_WEEK = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson';
const CLUSTER_MAX_DISTANCE_KM = 100;
const CLUSTER_MIN_QUAKES = 3;
const MAJOR_QUAKE_THRESHOLD = 4.5;
const DEFAULT_CLUSTER_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// --- Utility: calculateDistance (copied from src/utils/utils.js) ---
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// --- Utility: findActiveClusters (copied from src/utils/clusterUtils.js) ---
// Ensures it uses the local calculateDistance
export function findActiveClusters(earthquakes, maxDistanceKm, minQuakes) {
   const clusters = [];
   const visited = new Array(earthquakes.length).fill(false);

   for (let i = 0; i < earthquakes.length; i++) {
       if (!visited[i]) {
           visited[i] = true;
           const currentCluster = [earthquakes[i]];
           const queue = [earthquakes[i]];

           let head = 0;
           while(head < queue.length) {
               const currentQuake = queue[head++];
               for (let j = 0; j < earthquakes.length; j++) {
                   if (!visited[j]) {
                       // Ensure quake and its geometry/coordinates are valid before calculating distance
                       if (currentQuake && currentQuake.geometry && currentQuake.geometry.coordinates &&
                           earthquakes[j] && earthquakes[j].geometry && earthquakes[j].geometry.coordinates &&
                           typeof currentQuake.geometry.coordinates[1] === 'number' &&
                           typeof currentQuake.geometry.coordinates[0] === 'number' &&
                           typeof earthquakes[j].geometry.coordinates[1] === 'number' &&
                           typeof earthquakes[j].geometry.coordinates[0] === 'number') {

                           const dist = calculateDistance(
                               currentQuake.geometry.coordinates[1], currentQuake.geometry.coordinates[0],
                               earthquakes[j].geometry.coordinates[1], earthquakes[j].geometry.coordinates[0]
                           );
                           if (dist <= maxDistanceKm) {
                               visited[j] = true;
                               currentCluster.push(earthquakes[j]);
                               queue.push(earthquakes[j]);
                           }
                       } else {
                           // Log or handle invalid quake data if necessary, then mark as visited to prevent reprocessing
                           // console.warn("process-clusters: Invalid quake data encountered in findActiveClusters, skipping distance calc for quake:", earthquakes[j]?.id || earthquakes[j]);
                           visited[j] = true;
                       }
                   }
               }
           }
           if (currentCluster.length >= minQuakes) {
               clusters.push(currentCluster.sort((a, b) => b.properties.time - a.properties.time));
           }
       }
   }
   return clusters;
}

// --- Scheduled Event Handler ---
export default {
  async scheduled(event, env, ctx) {
    const sourceName = "process-clusters-scheduled"; // For logging context
    console.log(`[${event.cron}] ${sourceName}: Scheduled task started.`);
    try {
      // Fetch data from USGS
      const response = await fetch(USGS_API_URL_WEEK);
      if (!response.ok) {
        console.error(`[${event.cron}] ${sourceName}: Failed to fetch USGS data: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to fetch USGS data: ${response.status} ${response.statusText}`);
      }
      const usgsData = await response.json();

      if (!usgsData || !usgsData.features || usgsData.features.length === 0) {
        console.log(`[${event.cron}] ${sourceName}: No earthquake features fetched from USGS. Exiting.`);
        return;
      }

      // Adapt clustering logic
      const activeClustersRaw = findActiveClusters(
        usgsData.features,
        CLUSTER_MAX_DISTANCE_KM,
        CLUSTER_MIN_QUAKES
      );

      if (!activeClustersRaw || activeClustersRaw.length === 0) {
        console.log(`[${event.cron}] ${sourceName}: No raw active clusters found. Exiting.`);
        return;
      }

      let clustersProcessed = 0;
      const clusterKvPromises = [];

      if (!env.CLUSTER_KV) {
        console.error(`[${event.cron}] ${sourceName}: CLUSTER_KV binding not found. Cannot store cluster definitions. Critical configuration issue.`);
        // Depending on desired behavior, could throw to indicate failure of this run
        return;
      }

      activeClustersRaw.forEach(clusterQuakeArray => {
        if (!clusterQuakeArray || clusterQuakeArray.length === 0) return;

        let maxMag = -Infinity;
        let strongestQuakeInCluster = null;
        clusterQuakeArray.forEach(quake => {
          if (quake && quake.properties && typeof quake.properties.mag === 'number' && quake.properties.mag > maxMag) {
            maxMag = quake.properties.mag;
            strongestQuakeInCluster = quake;
          }
        });

        if (strongestQuakeInCluster && strongestQuakeInCluster.id && maxMag >= MAJOR_QUAKE_THRESHOLD) {
          const earthquakeIds = clusterQuakeArray.map(q => q.id).filter(id => id != null); // Ensure IDs are not null/undefined
          const strongestQuakeId = strongestQuakeInCluster.id;
          // Create a more robust clusterId, less prone to collisions if multiple clusters share the same strongest quake (unlikely but possible)
          // Using a hash of IDs or a UUID might be better if this becomes an issue. For now, timestamp helps.
          const clusterId = `overview_cluster_${strongestQuakeId}_${earthquakeIds.length}_${Date.now()}`;


          const valueToStore = {
            earthquakeIds,
            strongestQuakeId,
            clusterMagnitude: maxMag, // Store the max magnitude for this cluster
            numberOfEvents: earthquakeIds.length, // Store the number of events
            updatedAt: new Date().toISOString()
          };

          let ttl_seconds = DEFAULT_CLUSTER_TTL_SECONDS;
          if (env.CLUSTER_DEFINITION_TTL_SECONDS) {
             const parsed = parseInt(env.CLUSTER_DEFINITION_TTL_SECONDS, 10);
             if (!isNaN(parsed) && parsed > 0) {
                 ttl_seconds = parsed;
             } else {
                 console.warn(`[${event.cron}] ${sourceName}: Invalid CLUSTER_DEFINITION_TTL_SECONDS: "${env.CLUSTER_DEFINITION_TTL_SECONDS}". Using default: ${ttl_seconds}s.`);
             }
          }

          clusterKvPromises.push(
            env.CLUSTER_KV.put(clusterId, JSON.stringify(valueToStore), { expirationTtl: ttl_seconds })
              .then(() => {
                clustersProcessed++;
                console.log(`[${event.cron}] ${sourceName}: Stored cluster ${clusterId} (TTL: ${ttl_seconds}s) with ${valueToStore.numberOfEvents} events, maxMag: ${valueToStore.clusterMagnitude}`);
              })
              .catch(err => {
                console.error(`[${event.cron}] ${sourceName}: Error storing cluster ${clusterId} in KV:`, err.message, err.stack);
              })
          );
        }
      });

      // Wait for all KV put operations to settle
      const results = await Promise.allSettled(clusterKvPromises);
      results.forEach(result => {
        if (result.status === 'rejected') {
          // Already logged in individual catch, but could aggregate here if needed
        }
      });

      console.log(`[${event.cron}] ${sourceName}: Task finished. Attempted to store ${clusterKvPromises.length} clusters. Successfully stored ${clustersProcessed} significant clusters.`);

    } catch (error) {
      console.error(`[${event.cron}] ${sourceName}: Unhandled error during scheduled execution:`, error.message, error.stack);
    }
  }
};
