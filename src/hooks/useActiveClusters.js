import { fetchActiveClusters } from '../services/clusterApiService.js';
import { EXTENDED_REFRESH_INTERVAL_MS, useRefreshableResource } from './useRefreshableResource.js';

export function useActiveClusters() {
  const resource = useRefreshableResource(fetchActiveClusters, { intervalMs: EXTENDED_REFRESH_INTERVAL_MS });
  return { ...resource, clusters: resource.data ?? [] };
}
