import { point, featureCollection } from '@turf/helpers';
import distance from '@turf/distance';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const latitude = parseFloat(url.searchParams.get('latitude'));
  const longitude = parseFloat(url.searchParams.get('longitude'));
  const radius = parseFloat(url.searchParams.get('radius')); // in kilometers

  if (isNaN(latitude) || isNaN(longitude) || isNaN(radius)) {
    return new Response('Missing or invalid latitude, longitude, or radius parameters.', { status: 400 });
  }

  const center = point([longitude, latitude]);

  try {
    const object = await env.ASSETS_BUCKET.get('gem_active_faults_harmonized.json');

    if (!object) {
      return new Response('Fault data not found.', { status: 404 });
    }

    const geojsonData = await object.json();
    const nearbyFeatures = geojsonData.features.filter(feature => {
      // For LineString features, check distance to each coordinate in the line
      if (feature.geometry.type === 'LineString') {
        for (const coord of feature.geometry.coordinates) {
          const featurePoint = point(coord);
          if (distance(center, featurePoint, { units: 'kilometers' }) <= radius) {
            return true;
          }
        }
        return false;
      }
      // For Point features (if any, though faults are usually LineStrings)
      if (feature.geometry.type === 'Point') {
        const featurePoint = point(feature.geometry.coordinates);
        return distance(center, featurePoint, { units: 'kilometers' }) <= radius;
      }
      return false; // Ignore other geometry types
    });

    return new Response(JSON.stringify(featureCollection(nearbyFeatures)), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching or processing fault data:', error);
    return new Response('Error processing request.', { status: 500 });
  }
}
