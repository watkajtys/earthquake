// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { parseArgs, verifyDurableActivationEvidence } from './verify-durable-activation-evidence.mjs';

const REVISION = 'a'.repeat(40);
const PAUSED_REVISION = 'e6ed7248fa0c250bd3fd83c250c71a8bccd07310';
const PAUSED_VERSION = '79754405-4027-46cb-b004-42e41dedfb77';
const BASE = '.reconciliation.local/production-0022-20260923';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const temps = [];
afterEach(async () => { await Promise.all(temps.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'earthquake-activation-gate-'));
  temps.push(root);
  const write = async (path, content) => {
    const target = isAbsolute(path) ? path : join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, typeof content === 'string' || Buffer.isBuffer(content) ? content : JSON.stringify(content));
    await chmod(target, 0o600);
    return target;
  };
  const observation = {
    cron: '*/5 * * * *', revision: PAUSED_REVISION, versionId: PAUSED_VERSION,
    milestone: 'List publication paused during writer transition',
    loggedAtUtc: '2026-09-23T19:00:27.404Z',
    lastPossibleOldDispatchUpperBoundUtc: '2026-09-23T19:00:13Z',
    drainNotBeforeUtc: '2026-09-23T19:16:00Z',
  };
  const observationBytes = JSON.stringify(observation);
  await write(`${BASE}/paused-cron-observation.json`, observationBytes);
  const backupBytes = 'PRAGMA foreign_keys=OFF;\n';
  await write(`${BASE}/primarydb-before-0022.sql`, backupBytes);
  const sqliteBytes = Buffer.concat([Buffer.from('SQLite format 3\0'), Buffer.alloc(128)]);
  await write(`${BASE}/restore.sqlite3`, sqliteBytes);
  await write(`${BASE}/rehearsal.sqlite3`, sqliteBytes);
  const migrationBytes = 'CREATE TABLE example(id INTEGER);\n';
  await write('migrations/0022_durable_usgs_ingestion.sql', migrationBytes);
  const migrationSha256 = sha(migrationBytes);
  const oldCounts = { EarthquakeEvents: 10, ClusterDefinitions: 2, d1_migrations: 21 };
  const snapshot = (path, schemaSha256, tableCounts) => ({ path: join(root, BASE, path),
    integrityCheck: ['ok'], foreignKeyCheck: [],
    latestMigration: { id: 21, name: '0021_revisioned_detail_archive.sql' },
    schemaSha256, tableCounts });
  const addedTables = ['UsgsIngestionIssues', 'UsgsIngestionRuns', 'UsgsIngestionState'];
  const reportBytes = JSON.stringify({ ok: true, migrationSqlSha256: migrationSha256,
    expectedMigrationSqlSha256: migrationSha256, errors: [], addedTables,
    addedSchemaObjects: [...addedTables, 'idx_usgs_ingestion_runs_feed_due'],
    restore: snapshot('restore.sqlite3', sha('old schema'), oldCounts),
    rehearsal: snapshot('rehearsal.sqlite3', sha('new schema'),
      { ...oldCounts, UsgsIngestionState: 0, UsgsIngestionRuns: 0, UsgsIngestionIssues: 0 }) });
  await write(`${BASE}/restore-report.json`, reportBytes);
  const bookmark = '0001ab15-00000000-000050ef-20cd79bb5fe263a547947e8e46012c93';
  await write(`${BASE}/pre-0022-time-travel-info.json`, { bookmark });
  const objects = [];
  for (const key of ['list-day.json', 'list-week.json', 'list-month.json']) {
    const bytes = JSON.stringify([{ id: key }]);
    await write(`${BASE}/list-before-images/${key}`, bytes);
    objects.push({ key, file: key, etag: 'etag', version: 'version',
      size: Buffer.byteLength(bytes), contentType: 'application/json', sha256: sha(bytes),
      uploaded: '2026-09-23T18:55:31Z' });
  }
  const manifestBytes = JSON.stringify({ schemaVersion: 1, accountId: 'f7e27d63f4766d7fb6a0f5b4789e2cdb',
    worker: 'earthquake', bucket: 'geojson-bucket', capturedAtUtc: '2026-09-23T19:17:00Z', objects });
  await write(`${BASE}/list-before-images/manifest.json`, manifestBytes);
  const evidence = { schemaVersion: 1, accountId: 'f7e27d63f4766d7fb6a0f5b4789e2cdb',
    databaseId: '8a0a26e9-ba3c-4984-9023-c1803f611a05', candidateRevision: REVISION,
    paused: { revision: PAUSED_REVISION, versionId: PAUSED_VERSION,
      observedAt: '2026-09-23T19:00:27.404Z', lastPossibleOldDispatchAt: '2026-09-23T19:00:13Z',
      drainConfirmedAt: '2026-09-23T19:16:00Z', observationPath: `${BASE}/paused-cron-observation.json`,
      observationSha256: sha(observationBytes) },
    backup: { exportPath: `${BASE}/primarydb-before-0022.sql`, sha256: sha(backupBytes),
      byteLength: Buffer.byteLength(backupBytes), completedAt: '2026-09-23T20:09:00Z', bookmark },
    restore: { reportPath: `${BASE}/restore-report.json`, reportSha256: sha(reportBytes),
      restorePath: `${BASE}/restore.sqlite3`, rehearsalPath: `${BASE}/rehearsal.sqlite3`,
      rehearsalCompletedAt: '2026-09-23T20:11:00Z' },
    migration: { filePath: 'migrations/0022_durable_usgs_ingestion.sql',
      sha256: migrationSha256, appliedAt: '2026-09-23T20:14:00Z' },
    lists: { manifestPath: `${BASE}/list-before-images/manifest.json`,
      manifestSha256: sha(manifestBytes) } };
  const evidencePath = await write(`${BASE}/evidence.json`, evidence);
  const artifactNames = [
    'list-before-images/manifest.json', 'pre-0022-time-travel-info.json',
    'primarydb-before-0022.sql', 'rehearsal.sqlite3',
    'restore-report.json', 'restore.sqlite3',
  ];
  const artifacts = {};
  for (const name of artifactNames) {
    const bytes = await readFile(join(root, BASE, name));
    artifacts[name] = { absolutePath: join(root, BASE, name),
      bytes: bytes.byteLength, mode: '0o600', sha256: sha(bytes) };
  }
  const backupManifestBytes = JSON.stringify({ schemaVersion: 1,
    databaseId: evidence.databaseId, workerRevision: PAUSED_REVISION,
    rehearsalPassed: true, migrationSqlSha256: migrationSha256,
    createdAtUtc: '2026-09-23T20:11:30Z', artifacts });
  await write(`${BASE}/pre-0022-backup-manifest.json`, backupManifestBytes);
  const immediateBytes = JSON.stringify({ bookmark: '0001abe5-00000000-000050ef-a533374467eba79448f469cdac7623f3',
    capturedAtUtc: '2026-09-23T20:13:30Z', databaseId: evidence.databaseId,
    workerRevision: PAUSED_REVISION, workerVersionId: PAUSED_VERSION });
  await write(`${BASE}/immediate-pre-0022-time-travel-info.json`, immediateBytes);
  const query = results => ({ success: true, meta: { changed_db: false, rows_written: 0 }, results });
  const liveBytes = JSON.stringify({ databaseId: evidence.databaseId,
    capturedAtUtc: '2026-09-23T20:15:00Z', queries: [
      query([{ id: 28, name: '0022_durable_usgs_ingestion.sql' }]),
      query([
        { name: 'UsgsIngestionIssues', tbl_name: 'UsgsIngestionIssues', type: 'table' },
        { name: 'UsgsIngestionRuns', tbl_name: 'UsgsIngestionRuns', type: 'table' },
        { name: 'UsgsIngestionState', tbl_name: 'UsgsIngestionState', type: 'table' },
        { name: 'idx_usgs_ingestion_runs_feed_due', tbl_name: 'UsgsIngestionRuns', type: 'index' },
      ]), query([{ n: 0 }]), query([{ n: 0 }]), query([{ n: 0 }]),
      query([{ n: 10 }]), query([{ n: 2 }]), query([{ n: 1 }]),
    ] });
  await write(`${BASE}/post-0022-live-d1-readback.json`, liveBytes);
  const identityBytes = JSON.stringify({ capturedAtUtc: '2026-09-23T20:17:00Z',
    identities: ['https://earthquakeslive.com/api/release-identity',
      'https://earthquake.matty-f7e.workers.dev/api/release-identity'].map(url => ({
      url, status: 200, cacheControl: 'no-store', body: {
        environment: 'production', revision: PAUSED_REVISION, status: 'ok', versionId: PAUSED_VERSION,
      },
    })) });
  await write(`${BASE}/post-0022-paused-identity.json`, identityBytes);
  const receiptDigests = { pausedObservation: sha(observationBytes),
    backupManifest: sha(backupManifestBytes),
    immediateBookmark: sha(immediateBytes), liveD1: sha(liveBytes),
    pausedIdentity: sha(identityBytes) };
  const source = { revision: REVISION };
  const verify = () => verifyDurableActivationEvidence(evidencePath, REVISION,
    { root, sourceRoot: root, readSourceRevision: async () => source.revision,
      now: Date.parse('2026-09-23T20:20:00Z'), migrationSha256, receiptDigests });
  return { root, evidence, evidencePath, write, verify, source, receiptDigests };
}

describe('durable activation evidence gate', () => {
  it('accepts an explicit repository root for a candidate running in a separate worktree', () => {
    expect(parseArgs(['--evidence', '/private/receipts/evidence.json',
      '--candidate-revision', REVISION, '--repository-root', '/repository'])).toMatchObject({
      evidencePath: '/private/receipts/evidence.json', expectedRevision: REVISION,
      root: '/repository',
    });
  });
  it('accepts exact private receipts in the required sequence', async () => {
    const { verify } = await fixture();
    await expect(verify()).resolves.toMatchObject({ status: 'passed', candidateRevision: REVISION, listCount: 3 });
  });
  it('rejects a list capture made before old writers drained', async () => {
    const { root, evidence, evidencePath, write, verify } = await fixture();
    const manifestPath = join(root, evidence.lists.manifestPath);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.capturedAtUtc = '2026-09-23T19:05:00Z';
    const bytes = JSON.stringify(manifest);
    await write(evidence.lists.manifestPath, bytes);
    evidence.lists.manifestSha256 = sha(bytes);
    await write(evidencePath, evidence);
    await expect(verify()).rejects.toThrow(/after drain/);
  });
  it('rejects a changed backup even when its file length stays the same', async () => {
    const { evidence, write, verify } = await fixture();
    await write(evidence.backup.exportPath, 'PRAGMA foreign_keys=BAD;\n');
    await expect(verify()).rejects.toThrow(/SHA-256 mismatch/);
  });
  it('rejects a changed list before-image', async () => {
    const { write, verify } = await fixture();
    await write(`${BASE}/list-before-images/list-week.json`, JSON.stringify([{ id: 'changed' }]));
    await expect(verify()).rejects.toThrow(/SHA-256 mismatch/);
  });
  it('rejects changed rehearsal database bytes even when the SQLite header survives', async () => {
    const { write, verify } = await fixture();
    await write(`${BASE}/rehearsal.sqlite3`, Buffer.concat([
      Buffer.from('SQLite format 3\0'), Buffer.alloc(128, 1),
    ]));
    await expect(verify()).rejects.toThrow(/SHA-256 mismatch/);
  });
  it('requires this checkout HEAD to equal the candidate revision', async () => {
    const { source, verify } = await fixture();
    source.revision = 'b'.repeat(40);
    await expect(verify()).rejects.toThrow(/source HEAD differs/);
  });
  it('rejects an unchanged-checksum live readback claiming 0021', async () => {
    const { write, receiptDigests, verify } = await fixture();
    const path = `${BASE}/post-0022-live-d1-readback.json`;
    const changed = { databaseId: '8a0a26e9-ba3c-4984-9023-c1803f611a05',
      capturedAtUtc: '2026-09-23T20:15:00Z', queries: [
        { success: true, meta: { changed_db: false, rows_written: 0 },
          results: [{ id: 27, name: '0021_revisioned_detail_archive.sql' }] },
        ...Array.from({ length: 7 }, () => ({ success: true,
          meta: { changed_db: false, rows_written: 0 }, results: [{ n: 0 }] })),
      ] };
    const bytes = JSON.stringify(changed);
    await write(path, bytes);
    receiptDigests.liveD1 = sha(bytes);
    await expect(verify()).rejects.toThrow(/ledger did not advance/);
  });
  it('rejects a different paused Worker identity and a short drain', async () => {
    const { evidence, evidencePath, write, verify } = await fixture();
    evidence.paused.versionId = '11111111-1111-1111-1111-111111111111';
    await write(evidencePath, evidence);
    await expect(verify()).rejects.toThrow(/Paused Worker version changed/);
    evidence.paused.versionId = PAUSED_VERSION;
    evidence.paused.drainConfirmedAt = '2026-09-23T19:10:00Z';
    await write(evidencePath, evidence);
    await expect(verify()).rejects.toThrow(/15 minutes/);
  });
  it('rejects a changed paused Cron trace even if evidence updates its hash', async () => {
    const { evidence, evidencePath, write, verify } = await fixture();
    const changed = JSON.stringify({ cron: '*/5 * * * *', revision: PAUSED_REVISION,
      versionId: PAUSED_VERSION, milestone: 'List publication paused during writer transition',
      loggedAtUtc: '2026-09-23T19:00:27.404Z',
      lastPossibleOldDispatchUpperBoundUtc: '2026-09-23T19:00:13Z',
      drainNotBeforeUtc: '2026-09-23T19:16:00Z', traceId: 'different-trace' });
    await write(evidence.paused.observationPath, changed);
    evidence.paused.observationSha256 = sha(changed);
    await write(evidencePath, evidence);
    await expect(verify()).rejects.toThrow(/reviewed trace receipt/);
  });
  it('rejects migration before isolated rehearsal', async () => {
    const { evidence, evidencePath, write, verify } = await fixture();
    evidence.migration.appliedAt = '2026-09-23T20:10:00Z';
    await write(evidencePath, evidence);
    await expect(verify()).rejects.toThrow(/must follow rehearsal/);
  });
});
