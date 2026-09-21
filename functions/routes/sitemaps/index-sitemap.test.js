import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleIndexSitemap } from './index-sitemap.js';
import { handleEarthquakesSitemap } from './earthquakes-sitemap.js';

const migrationsDirectory = resolve('migrations');
const migrations = readdirSync(migrationsDirectory)
  .filter(name => name.endsWith('.sql'))
  .sort()
  .map(name => readFileSync(`${migrationsDirectory}/${name}`, 'utf8'));

describe('sitemaps against the migrated D1 schema', () => {
  let database;
  let env;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    migrations.forEach(sql => database.exec(sql));
    env = {
      DB: {
        prepare(sql) {
          const statement = database.prepare(sql);
          return {
            bind(...values) {
              return { all: async () => ({ results: statement.all(...values) }) };
            },
          };
        },
      },
    };
  });

  afterEach(() => database.close());

  it.each([
    { magnitude: 4.5, tensor: 0, focal: 0, significant: true },
    { magnitude: 3, tensor: 1, focal: 0, significant: true },
    { magnitude: 3, tensor: 0, focal: 1, significant: true },
    { magnitude: 3, tensor: 0, focal: 0, significant: false },
    { magnitude: 2, tensor: 1, focal: 1, significant: false },
  ])('preserves index eligibility using persisted flags: %j', async ({ magnitude, tensor, focal, significant }) => {
    database.prepare(`INSERT INTO EarthquakeEvents
      (id, place, event_time, magnitude, has_moment_tensor, has_focal_mechanism, has_shakemap)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('eq1', 'Test location', 1_700_000_000_000, magnitude, tensor, focal, 1);

    const response = await handleIndexSitemap({ env });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/xml');
    const xml = await response.text();
    expect(xml).not.toContain('<!-- Error');
    expect(xml).toContain('/sitemap-static-pages.xml');
    expect(xml.includes('/sitemaps/earthquakes-1.xml')).toBe(significant);
  });

  it('includes a migrated rich-data event in both the index and its sitemap page', async () => {
    database.prepare(`INSERT INTO EarthquakeEvents
      (id, place, event_time, magnitude, has_moment_tensor, has_focal_mechanism, has_shakemap)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('eq1', 'Test location', 1_700_000_000_000, 5, 1, 1, 1);

    const index = await handleIndexSitemap({ env });
    expect(await index.text()).toContain('/sitemaps/earthquakes-1.xml');
    const page = await handleEarthquakesSitemap({
      env,
      request: new Request('https://example.com/sitemaps/earthquakes-1.xml'),
    });
    expect(page.status).toBe(200);
    const xml = await page.text();
    expect(xml).not.toContain('<!-- Error');
    expect(xml).toContain('<loc>https://earthquakeslive.com/quake/m5.0-test-location-eq1</loc>');
  });
});
