import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ClusterDetailModal from './ClusterDetailModal';
import RouteDetailStatus from './RouteDetailStatus.jsx';
import SeoMetadata from './SeoMetadata';
import { fetchClusterWithQuakes } from '../services/clusterApiService.js';
import { buildClusterPath, modalReturnTarget, parseClusterPath, timestampMilliseconds } from '../utils/entityRoutes.js';

function timeRange(earliest, latest, count, formatTimeAgo, formatTimeDuration) {
  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) return { prefix: '', value: 'Time N/A', suffix: '' };
  if (Date.now() - latest < 86400000 && count > 1) {
    const duration = latest - earliest;
    if (duration < 60000) return { prefix: 'Active ', value: 'just now', suffix: '' };
    return { prefix: 'Active over ', value: duration < 3600000 ? `${Math.round(duration / 60000)}m` : formatTimeDuration(duration), suffix: '' };
  }
  return { prefix: 'Started ', value: formatTimeAgo(Date.now() - earliest), suffix: '' };
}

function toDisplayCluster(data, formatTimeAgo, formatTimeDuration) {
  const quakes = data.quakes;
  const strongest = quakes.find((quake) => quake.id === data.strongestQuakeId) || null;
  const times = quakes.map((quake) => quake.properties?.time).filter(Number.isFinite);
  const earliest = timestampMilliseconds(data.startTime) ?? (times.length ? Math.min(...times) : null);
  const latest = timestampMilliseconds(data.endTime) ?? (times.length ? Math.max(...times) : null);
  return {
    ...data,
    // Keep canonical identity and authoritative metadata, including when some members are unavailable.
    id: data.id, canonicalPath: data.canonicalPath || buildClusterPath(data), originalQuakes: quakes,
    strongestQuake: strongest,
    quakeCount: data.quakeCount ?? data.earthquakeIds?.length ?? quakes.length,
    maxMagnitude: data.maxMagnitude !== undefined ? data.maxMagnitude : strongest?.properties?.mag ?? null,
    locationName: data.locationName || strongest?.properties?.place || 'Unknown location',
    timeRange: timeRange(earliest, latest, quakes.length, formatTimeAgo, formatTimeDuration),
  };
}

export default function ClusterDetailModalWrapper({ formatDate, getMagnitudeColorStyle, onIndividualQuakeSelect,
  formatTimeAgo = () => 'Time N/A', formatTimeDuration = () => 'Time N/A' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const parsed = parseClusterPath(location.pathname);
  const routeValue = parsed.ok ? parsed.route : null;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ route: null, status: 'loading', data: null });
  const onClose = useCallback(() => {
    const target = modalReturnTarget(location.state);
    navigate(target.path, { replace: true, state: target.state });
  }, [navigate, location.state]);

  useEffect(() => {
    if (!routeValue) return undefined;
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    setResult({ route: routeValue, status: 'loading', data: null });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      if (active) setResult({ route: routeValue, status: 'error', message: 'Cluster details timed out. Please retry.' });
    }, 30000);
    fetchClusterWithQuakes({ route: routeValue }, { signal: controller.signal }).then((data) => {
      if (!active || timedOut) return;
      setResult({ route: routeValue, status: data ? 'success' : 'notFound', data });
    }).catch((error) => {
      if (!active || timedOut || error.name === 'AbortError') return;
      setResult({ route: routeValue, status: 'error', message: 'Cluster details could not be loaded. Please retry.' });
    }).finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [routeValue, attempt]);

  const status = !parsed.ok ? 'notFound' : result.route === routeValue ? result.status : 'loading';
  const data = status === 'success' ? result.data : null;
  const cluster = useMemo(() => data ? toDisplayCluster(data, formatTimeAgo, formatTimeDuration) : null, [data, formatTimeAgo, formatTimeDuration]);
  const canonicalPath = cluster?.canonicalPath || (routeValue ? buildClusterPath({ slug: routeValue }) : '/');
  const canonicalUrl = `https://earthquakeslive.com${canonicalPath}`;
  const title = cluster ? (cluster.title || `Earthquake Cluster near ${cluster.locationName}`) :
    status === 'loading' ? 'Loading Cluster Details' : status === 'notFound' ? 'Cluster Not Found' : 'Cluster Unavailable';
  const magnitude = Number.isFinite(cluster?.maxMagnitude) ? cluster.maxMagnitude.toFixed(1) : 'unknown';
  const description = cluster ? (cluster.description || `Earthquake cluster near ${cluster.locationName}, with ${cluster.quakeCount} events and maximum magnitude ${magnitude}.`) :
    status === 'loading' ? 'Fetching the stored cluster definition.' : result.message || parsed.message || 'The requested cluster could not be found.';
  return (
    <>
      <SeoMetadata title={`${title} | Earthquakes Live`} description={description} canonicalUrl={canonicalUrl} pageUrl={canonicalUrl}
        noIndex={!cluster} type="website" eventJsonLd={cluster ? { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description, url: canonicalUrl, identifier: cluster.id } : null} />
      {cluster ? <ClusterDetailModal cluster={cluster} onClose={onClose} formatDate={formatDate}
        getMagnitudeColorStyle={getMagnitudeColorStyle} onIndividualQuakeSelect={onIndividualQuakeSelect} /> :
        <RouteDetailStatus title={title} message={description} loading={status === 'loading'} onClose={onClose}
          onRetry={parsed.ok && status !== 'loading' ? () => setAttempt((value) => value + 1) : undefined} />}
    </>
  );
}
