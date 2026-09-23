// Bound only the visual marks. Callers retain the full event array for statistics,
// axes, map bounds, and the event list.
export const MAX_CLUSTER_MAP_MARKERS = 160;
export const MAX_CHART_TIME_BUCKETS = 60;

export const sampleQuakesForChart = (quakes, plotWidth, mainshock) => {
  const bucketCount = Math.min(MAX_CHART_TIME_BUCKETS, Math.max(1, Math.floor(plotWidth / 12)));
  const maxSampleSize = bucketCount * 5 + 3;
  if (quakes.length <= maxSampleSize) return quakes;

  let minTime = Infinity;
  let maxTime = -Infinity;
  for (const quake of quakes) {
    const time = quake.properties.time;
    minTime = Math.min(minTime, time);
    maxTime = Math.max(maxTime, time);
  }

  const buckets = Array.from({ length: bucketCount }, () => ({
    first: null, last: null, min: null, max: null, minForLine: null,
  }));
  for (const quake of quakes) {
    const { time, mag } = quake.properties;
    const index = maxTime === minTime
      ? 0
      : Math.min(bucketCount - 1, Math.floor(((time - minTime) / (maxTime - minTime)) * bucketCount));
    const bucket = buckets[index];
    if (!bucket.first || time < bucket.first.properties.time) bucket.first = quake;
    if (!bucket.last || time >= bucket.last.properties.time) bucket.last = quake;
    if (!bucket.min || mag < bucket.min.properties.mag) bucket.min = quake;
    if (!bucket.max || mag > bucket.max.properties.mag) bucket.max = quake;
    if (mag >= 1.5 && (!bucket.minForLine || mag < bucket.minForLine.properties.mag)) {
      bucket.minForLine = quake;
    }
  }

  const selected = new Set([mainshock]);
  for (const bucket of buckets) {
    selected.add(bucket.first);
    selected.add(bucket.last);
    selected.add(bucket.min);
    selected.add(bucket.max);
    selected.add(bucket.minForLine);
  }
  return quakes.filter(quake => selected.has(quake));
};

const pixelPosition = (latitude, longitude, zoom) => {
  const scale = 256 * 2 ** Math.max(0, Math.min(20, zoom));
  const latitudeRadians = Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI / 180;
  const normalizedLongitude = ((longitude + 180) % 360 + 360) % 360;
  return [
    normalizedLongitude / 360 * scale,
    (1 - Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) / Math.PI) / 2 * scale,
  ];
};

const isRenderableQuake = quake => {
  const coordinates = quake?.geometry?.coordinates;
  return Array.isArray(coordinates) && coordinates.length >= 2 &&
    Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1]) &&
    coordinates[1] >= -90 && coordinates[1] <= 90 &&
    Number.isFinite(quake?.properties?.mag) && Number.isFinite(quake?.properties?.time);
};

// Each group is represented by its strongest event. The count remains visible in
// the group icon and popup; zooming recomputes groups from the complete input.
export const groupQuakesForMap = (quakes, zoom, viewportBounds = null) => {
  const visible = quakes.filter(quake => {
    if (!isRenderableQuake(quake)) return false;
    const [longitude, latitude] = quake.geometry.coordinates;
    return !viewportBounds ||
      viewportBounds.contains([latitude, longitude]) ||
      viewportBounds.contains([latitude, longitude - 360]) ||
      viewportBounds.contains([latitude, longitude + 360]);
  });
  if (visible.length <= MAX_CLUSTER_MAP_MARKERS) {
    return visible.map(quake => ({ quake, count: 1 }));
  }

  const positions = visible.map(quake => pixelPosition(
    quake.geometry.coordinates[1], quake.geometry.coordinates[0], zoom,
  ));
  let cellSize = 48;
  let groups;
  do {
    groups = new Map();
    visible.forEach((quake, index) => {
      const [x, y] = positions[index];
      const key = `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;
      const group = groups.get(key);
      if (group) {
        group.count += 1;
        if (quake.properties.mag > group.quake.properties.mag) group.quake = quake;
      } else {
        groups.set(key, { quake, count: 1 });
      }
    });
    cellSize *= 2;
  } while (groups.size > MAX_CLUSTER_MAP_MARKERS);

  return [...groups.values()];
};
