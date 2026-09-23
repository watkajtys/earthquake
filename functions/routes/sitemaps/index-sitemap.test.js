import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleIndexSitemap } from './index-sitemap.js';
import { handleEarthquakesSitemap } from './earthquakes-sitemap.js';
import { isEarthquakeSitemapEligible } from './earthquake-sitemap-eligibility.js';

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
              return { all: async () => ({ success: true, results: statement.all(...values) }) };
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
    { magnitude: 2.5, tensor: null, focal: null, significant: false },
  ])('keeps SQL and pure sitemap eligibility aligned: %j', async ({ magnitude, tensor, focal, significant }) => {
    const event = { id: 'eq1', place: 'Test location', magnitude, has_moment_tensor: tensor, has_focal_mechanism: focal };
    expect(isEarthquakeSitemapEligible(event)).toBe(significant);
    database.prepare(`INSERT INTO EarthquakeEvents
      (id, place, event_time, magnitude, has_moment_tensor, has_focal_mechanism, has_shakemap)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('eq1', 'Test location', 1_700_000_000_000, magnitude, tensor, focal, 1);

    const response = await handleIndexSitemap({ env });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/xml');
    const xml = await response.text();
    expect(xml).toContain('/sitemap-static-pages.xml');
    expect(xml.includes('/sitemaps/earthquakes-1.xml')).toBe(significant);
    const page = await handleEarthquakesSitemap({
      env,
      request: new Request('https://example.com/sitemaps/earthquakes-1.xml'),
    });
    expect((await page.text()).includes('<loc>https://earthquakeslive.com/quake/id/eq1</loc>')).toBe(significant);
  });

  it('includes a magnitude-only event at its crawler canonical URL', async () => {
    database.prepare(`INSERT INTO EarthquakeEvents
      (id, place, event_time, magnitude, has_moment_tensor, has_focal_mechanism, has_shakemap)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('eq-1', 'Test location', 1_700_000_000_000, 5, 0, 0, 0);

    const index = await handleIndexSitemap({ env });
    expect(await index.text()).toContain('/sitemaps/earthquakes-1.xml');
    const page = await handleEarthquakesSitemap({
      env,
      request: new Request('https://example.com/sitemaps/earthquakes-1.xml'),
    });
    expect(page.status).toBe(200);
    const xml = await page.text();
    expect(xml).toContain('<loc>https://earthquakeslive.com/quake/id/eq-1</loc>');
    expect(xml).not.toContain('<lastmod>');
  });

  it.each([
    { id: 'invalid.id', place: 'Test location', eligible: false },
    { id: 'eq1', place: '   ', eligible: false },
    { id: 'eq_1', place: 'Test location', eligible: true },
  ])('counts only events that can produce canonical routes: %j', async ({ id, place, eligible }) => {
    const event = { id, place, magnitude: 5, has_moment_tensor: 0, has_focal_mechanism: 0 };
    expect(isEarthquakeSitemapEligible(event)).toBe(eligible);
    database.prepare('INSERT INTO EarthquakeEvents (id, place, event_time, magnitude) VALUES (?, ?, ?, ?)')
      .run(id, place, null, 5);
    const index = await handleIndexSitemap({ env });
    expect((await index.text()).includes('/sitemaps/earthquakes-1.xml')).toBe(eligible);
    const page = await handleEarthquakesSitemap({ env, request: new Request('https://example.com/sitemaps/earthquakes-1.xml') });
    expect((await page.text()).includes(`<loc>https://earthquakeslive.com/quake/id/${id}</loc>`)).toBe(eligible);
  });

  it('orders equal-time URLs by ID and never fabricates a modification date', async () => {
    const insert = database.prepare('INSERT INTO EarthquakeEvents (id, place, event_time, magnitude) VALUES (?, ?, ?, ?)');
    insert.run('eq_b', 'Test location', 1_700_000_000_000, 5);
    insert.run('eq_a', 'Test location', 1_700_000_000_000, 5);
    const index = await handleIndexSitemap({ env });
    expect(await index.text()).not.toContain('<lastmod>');
    const page = await handleEarthquakesSitemap({ env, request: new Request('https://example.com/sitemaps/earthquakes-1.xml') });
    const xml = await page.text();
    expect(xml.indexOf('/quake/id/eq_a')).toBeLessThan(xml.indexOf('/quake/id/eq_b'));
    expect(xml).not.toContain('<lastmod>');
  });

  it('covers the exact page boundary without omitting or repeating an event', async () => {
    database.exec(`WITH RECURSIVE sequence(n) AS (
      SELECT 1 UNION ALL SELECT n + 1 FROM sequence WHERE n < 40001
    ) INSERT INTO EarthquakeEvents (id, place, event_time, magnitude)
      SELECT printf('eq%05d', n), 'Test location', n, 5 FROM sequence`);

    const index = await handleIndexSitemap({ env });
    const indexXml = await index.text();
    expect(indexXml).toContain('/sitemaps/earthquakes-2.xml');
    expect(indexXml).not.toContain('/sitemaps/earthquakes-3.xml');

    const first = await handleEarthquakesSitemap({ env, request: new Request('https://example.com/sitemaps/earthquakes-1.xml') });
    const second = await handleEarthquakesSitemap({ env, request: new Request('https://example.com/sitemaps/earthquakes-2.xml') });
    const firstXml = await first.text();
    const secondXml = await second.text();
    expect((firstXml.match(/<url>/g) || []).length).toBe(40_000);
    expect((secondXml.match(/<url>/g) || []).length).toBe(1);
    expect(firstXml).toContain('/quake/id/eq40001');
    expect(firstXml).not.toContain('/quake/id/eq00001');
    expect(secondXml).toContain('/quake/id/eq00001');
  });
});
