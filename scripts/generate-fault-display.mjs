import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = new URL('../src/assets/gem_active_faults_harmonized.json', import.meta.url);
const destination = new URL('../src/assets/gem_active_faults_display.json', import.meta.url);
const fields = ['name', 'slip_type', 'net_slip_rate', 'catalog_name'];

export function projectFaults(data) {
  if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('Expected a GeoJSON FeatureCollection of active faults.');
  }
  return {
    type: 'FeatureCollection',
    features: data.features.map(feature => {
      if (feature?.type !== 'Feature' || !Object.hasOwn(feature, 'geometry')) {
        throw new Error('Expected a GeoJSON fault feature with geometry.');
      }
      const originalProperties = feature.properties || {};
      const properties = {};
      for (const field of fields) {
        if (Object.hasOwn(originalProperties, field)) properties[field] = originalProperties[field];
      }
      return { type: 'Feature', geometry: feature.geometry, properties };
    }),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const original = JSON.parse(await readFile(source, 'utf8'));
  await writeFile(destination, `${JSON.stringify(projectFaults(original))}\n`);
}
