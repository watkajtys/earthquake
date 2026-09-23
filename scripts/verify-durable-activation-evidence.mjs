#!/usr/bin/env node
// Read-only gate for the private receipts required before enabling durable list publication.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRIVATE = '.reconciliation.local/production-0022-20260923';
const ACCOUNT = 'f7e27d63f4766d7fb6a0f5b4789e2cdb';
const DATABASE = '8a0a26e9-ba3c-4984-9023-c1803f611a05';
const PAUSED_REVISION = 'e6ed7248fa0c250bd3fd83c250c71a8bccd07310';
const PAUSED_VERSION = '79754405-4027-46cb-b004-42e41dedfb77';
const MIGRATION = '0022_durable_usgs_ingestion.sql';
const MIGRATION_SHA256 = '4aa9a6a5b081f6de4c58d1ff26ab5c7b22606ac2fd9eb124428d99252da3062c';
const SHA256 = /^[0-9a-f]{64}$/;
const REVISION = /^[0-9a-f]{40}$/;
const BOOKMARK = /^[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{32}$/;
const LISTS = ['list-day.json', 'list-week.json', 'list-month.json'];
const RECEIPT_SHA256 = Object.freeze({
  backupManifest: 'b50562c279126a1cd297f1d45eb451edac5b36f78206df3f56ff99d1af580898',
  liveD1: '0146530a514cf69c2ded80a01245d7dcccb5eaa6a3b8752f49e740fa30d88bc0',
  pausedIdentity: 'e4eb425bc1e8998d19f12e8feb0c65c598708b2722687aea4a3094456b535473',
  immediateBookmark: '8258b0e9a317b0d083122435917c7b7e46880b10587209a8d5e6b412f8264158',
});
const execFileAsync = promisify(execFile);

async function gitHead(sourceRoot) {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'],
    { cwd: sourceRoot, timeout: 5000, maxBuffer: 1024 });
  return stdout.trim();
}

function time(value, name) {
  assert(typeof value === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|\+00:00)$/.test(value),
  `${name}: UTC timestamp required`);
  const epoch = Date.parse(value);
  assert(Number.isFinite(epoch), `${name}: invalid timestamp`);
  return epoch;
}

async function privatePath(root, reference) {
  assert(typeof reference === 'string' && reference.length > 0, 'Private evidence path missing');
  const allowed = await realpath(resolve(root, PRIVATE));
  const target = isAbsolute(reference) ? resolve(reference) : resolve(root, reference);
  const actual = await realpath(target);
  assert(actual.startsWith(`${allowed}${sep}`), `Evidence path is outside ${PRIVATE}`);
  return actual;
}

async function json(path, maxBytes = 256_000) {
  assert((await stat(path)).size <= maxBytes, `${path}: JSON receipt exceeds reviewed size`);
  return JSON.parse(await readFile(path, 'utf8'));
}

async function hash(path) {
  const digest = createHash('sha256');
  let size = 0;
  for await (const chunk of createReadStream(path)) { digest.update(chunk); size += chunk.length; }
  return { sha256: digest.digest('hex'), byteLength: size };
}

async function checkedFile(path, expectedSha, expectedLength) {
  assert(SHA256.test(expectedSha || ''), `${path}: SHA-256 missing`);
  const actual = await hash(path);
  assert.equal(actual.sha256, expectedSha, `${path}: SHA-256 mismatch`);
  if (expectedLength !== undefined) {
    assert(Number.isSafeInteger(expectedLength) && expectedLength > 0, `${path}: invalid expected length`);
    assert.equal(actual.byteLength, expectedLength, `${path}: byte length mismatch`);
  }
  return actual;
}

function assertSnapshot(snapshot, label) {
  assert.deepEqual(snapshot?.integrityCheck, ['ok'], `${label}: restore integrity failed`);
  assert.deepEqual(snapshot.foreignKeyCheck, [], `${label}: foreign-key check failed`);
  assert.equal(snapshot.latestMigration?.name, '0021_revisioned_detail_archive.sql',
    `${label}: migration history mismatch`);
  assert(Number.isSafeInteger(snapshot.latestMigration.id), `${label}: migration ID missing`);
  assert(SHA256.test(snapshot.schemaSha256 || ''), `${label}: schema digest missing`);
  assert(snapshot.tableCounts && typeof snapshot.tableCounts === 'object', `${label}: table counts missing`);
  assert(Number.isSafeInteger(snapshot.tableCounts.EarthquakeEvents) &&
    snapshot.tableCounts.EarthquakeEvents > 0, `${label}: EarthquakeEvents count missing`);
}

export async function verifyDurableActivationEvidence(evidencePath, expectedRevision, {
  root = ROOT, sourceRoot = ROOT, now = Date.now(), migrationSha256 = MIGRATION_SHA256,
  receiptDigests = RECEIPT_SHA256, readSourceRevision = gitHead,
} = {}) {
  assert(REVISION.test(expectedRevision || ''), 'Expected activation revision must be a full Git SHA');
  assert.equal(await readSourceRevision(sourceRoot), expectedRevision,
    'Activation candidate source HEAD differs from the evidence revision');
  const evidenceFile = await privatePath(root, evidencePath);
  const evidence = await json(evidenceFile);
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.accountId, ACCOUNT);
  assert.equal(evidence.databaseId, DATABASE);
  assert.equal(evidence.candidateRevision, expectedRevision, 'Activation candidate revision changed');

  const paused = evidence.paused;
  assert.equal(paused?.revision, PAUSED_REVISION, 'Paused Worker revision changed');
  assert.equal(paused?.versionId, PAUSED_VERSION, 'Paused Worker version changed');
  const observedAt = time(paused.observedAt, 'paused.observedAt');
  const oldDispatch = time(paused.lastPossibleOldDispatchAt, 'paused.lastPossibleOldDispatchAt');
  const drainedAt = time(paused.drainConfirmedAt, 'paused.drainConfirmedAt');
  assert(observedAt >= oldDispatch && drainedAt >= oldDispatch + 15 * 60_000,
    'Old scheduled writer has not drained for 15 minutes');
  assert(drainedAt <= now, 'Drain confirmation is in the future');
  const observationFile = await privatePath(root, paused.observationPath);
  await checkedFile(observationFile, paused.observationSha256);
  const observation = await json(observationFile);
  assert.equal(observation.revision, PAUSED_REVISION);
  assert.equal(observation.versionId, PAUSED_VERSION);
  assert.equal(observation.cron, '*/5 * * * *');
  assert.equal(observation.milestone, 'List publication paused during writer transition');
  assert.equal(time(observation.lastPossibleOldDispatchUpperBoundUtc, 'observation.lastPossibleOldDispatchUpperBoundUtc'), oldDispatch);
  assert(drainedAt >= time(observation.drainNotBeforeUtc, 'observation.drainNotBeforeUtc'));
  assert(observedAt >= time(observation.loggedAtUtc, 'observation.loggedAtUtc'));

  const backup = evidence.backup;
  const backupAt = time(backup?.completedAt, 'backup.completedAt');
  assert(backupAt > drainedAt && backupAt <= now, 'Fresh backup must finish after old-writer drain');
  const exportFile = await privatePath(root, backup.exportPath);
  await checkedFile(exportFile, backup.sha256, backup.byteLength);
  assert(BOOKMARK.test(backup.bookmark || ''), 'Fresh Time Travel bookmark missing');
  const bookmarkFile = await privatePath(root, `${PRIVATE}/pre-0022-time-travel-info.json`);
  assert.equal((await json(bookmarkFile)).bookmark, backup.bookmark, 'Bookmark receipt differs');

  const restore = evidence.restore;
  const rehearsedAt = time(restore?.rehearsalCompletedAt, 'restore.rehearsalCompletedAt');
  assert(rehearsedAt >= backupAt && rehearsedAt <= now, 'Restore rehearsal must follow backup');
  const reportFile = await privatePath(root, restore.reportPath);
  await checkedFile(reportFile, restore.reportSha256);
  const report = await json(reportFile);
  assert.equal(report.ok, true, 'Restore rehearsal did not pass');
  assert.deepEqual(report.errors, [], 'Restore rehearsal reported errors');
  assert.equal(report.migrationSqlSha256, migrationSha256, 'Restore rehearsed different migration bytes');
  assert.equal(report.expectedMigrationSqlSha256, migrationSha256);
  assertSnapshot(report.restore, 'restore');
  assertSnapshot(report.rehearsal, 'rehearsal');
  assert.deepEqual(report.rehearsal.latestMigration, report.restore.latestMigration,
    'SQL-only rehearsal must leave the D1 migration ledger at 0021');
  assert.notEqual(report.rehearsal.schemaSha256, report.restore.schemaSha256,
    '0022 rehearsal added no schema objects');
  const newTables = ['UsgsIngestionIssues', 'UsgsIngestionRuns', 'UsgsIngestionState'];
  assert.deepEqual(report.addedTables, newTables);
  assert.deepEqual(report.addedSchemaObjects,
    [...newTables, 'idx_usgs_ingestion_runs_feed_due']);
  const beforeTables = Object.keys(report.restore.tableCounts).sort();
  assert.deepEqual(Object.keys(report.rehearsal.tableCounts).sort(), [...beforeTables, ...newTables].sort());
  for (const [table, count] of Object.entries(report.restore.tableCounts)) {
    assert(Number.isSafeInteger(count) && count >= 0, `${table}: invalid restored count`);
    assert.equal(report.rehearsal.tableCounts[table], count,
      `${table}: migration changed existing row count in rehearsal`);
  }
  for (const table of newTables) assert.equal(report.rehearsal.tableCounts[table], 0,
    `${table}: new table is not empty`);
  for (const [path, snapshot] of [[restore.restorePath, report.restore],
    [restore.rehearsalPath, report.rehearsal]]) {
    const file = await privatePath(root, path);
    assert.equal(await realpath(snapshot.path), file,
      'Restore report names a different SQLite file');
    const handle = await open(file, 'r');
    const header = Buffer.alloc(16);
    try { assert.equal((await handle.read(header, 0, 16, 0)).bytesRead, 16); }
    finally { await handle.close(); }
    assert.equal(header.toString('utf8'), 'SQLite format 3\0', `${file}: not an SQLite database`);
  }

  const migration = evidence.migration;
  const appliedAt = time(migration?.appliedAt, 'migration.appliedAt');
  assert(appliedAt > rehearsedAt && appliedAt <= now, 'Production migration must follow rehearsal');
  assert.equal(migration.filePath, `migrations/${MIGRATION}`);
  assert.equal(migration.sha256, migrationSha256);
  await checkedFile(resolve(sourceRoot, migration.filePath), migrationSha256);

  const lists = evidence.lists;
  const manifestFile = await privatePath(root, lists?.manifestPath);
  await checkedFile(manifestFile, lists.manifestSha256);
  const manifest = await json(manifestFile);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.accountId, ACCOUNT);
  assert.equal(manifest.worker, 'earthquake');
  assert.equal(manifest.bucket, 'geojson-bucket');
  const capturedAt = time(manifest.capturedAtUtc, 'lists.capturedAtUtc');
  assert(capturedAt >= drainedAt && capturedAt <= appliedAt,
    'List before-images must be captured after drain and before migration');
  assert.deepEqual(manifest.objects?.map(item => item.key).sort(), [...LISTS].sort(),
    'Expected exactly the three public list before-images');
  for (const object of manifest.objects) {
    assert.equal(object.file, object.key, `${object.key}: unexpected before-image filename`);
    assert(typeof object.etag === 'string' && object.etag.length > 0 &&
      typeof object.version === 'string' && object.version.length > 0,
    `${object.key}: R2 identity missing`);
    assert.equal(object.contentType, 'application/json');
    assert(time(object.uploaded, `${object.key}.uploaded`) <= capturedAt,
      `${object.key}: object upload is after capture`);
    const file = await privatePath(root, resolve(dirname(manifestFile), object.file));
    await checkedFile(file, object.sha256, object.size);
    assert(Array.isArray(await json(file, 8 * 1024 * 1024)), `${object.key}: before-image is not a JSON list`);
  }

  const privateRoot = await realpath(resolve(root, PRIVATE));
  const backupManifestFile = await privatePath(root, `${PRIVATE}/pre-0022-backup-manifest.json`);
  await checkedFile(backupManifestFile, receiptDigests.backupManifest);
  const backupManifest = await json(backupManifestFile);
  assert.equal(backupManifest.schemaVersion, 1);
  assert.equal(backupManifest.databaseId, DATABASE);
  assert.equal(backupManifest.workerRevision, PAUSED_REVISION);
  assert.equal(backupManifest.rehearsalPassed, true);
  assert.equal(backupManifest.migrationSqlSha256, migrationSha256);
  const backupManifestAt = time(backupManifest.createdAtUtc, 'backupManifest.createdAtUtc');
  assert(backupManifestAt >= rehearsedAt && backupManifestAt <= appliedAt,
    'Backup manifest must follow rehearsal and precede migration');
  const expectedArtifacts = [manifestFile, bookmarkFile, exportFile, reportFile,
    await privatePath(root, restore.restorePath), await privatePath(root, restore.rehearsalPath)];
  const keys = expectedArtifacts.map(file => relative(privateRoot, file));
  assert.deepEqual(Object.keys(backupManifest.artifacts || {}).sort(), keys.sort(),
    'Backup manifest must bind exactly the six reviewed artifacts');
  for (const file of expectedArtifacts) {
    const artifact = backupManifest.artifacts[relative(privateRoot, file)];
    assert.equal(await realpath(artifact.absolutePath), file,
      'Backup manifest points to a different artifact');
    assert.equal(artifact.mode, '0o600', 'Private backup artifact mode differs');
    assert.equal((await stat(file)).mode & 0o777, 0o600,
      'Private backup artifact is not mode 0600');
    await checkedFile(file, artifact.sha256, artifact.bytes);
  }
  assert.equal(backupManifest.artifacts[relative(privateRoot, exportFile)].sha256, backup.sha256);
  assert.equal(backupManifest.artifacts[relative(privateRoot, reportFile)].sha256, restore.reportSha256);
  assert.equal(backupManifest.artifacts[relative(privateRoot, manifestFile)].sha256, lists.manifestSha256);

  const immediateFile = await privatePath(root, `${PRIVATE}/immediate-pre-0022-time-travel-info.json`);
  await checkedFile(immediateFile, receiptDigests.immediateBookmark);
  const immediate = await json(immediateFile);
  assert.equal(immediate.databaseId, DATABASE);
  assert.equal(immediate.workerRevision, PAUSED_REVISION);
  assert.equal(immediate.workerVersionId, PAUSED_VERSION);
  assert(BOOKMARK.test(immediate.bookmark || '') && immediate.bookmark !== backup.bookmark,
    'Immediate pre-migration bookmark is missing or repeats the backup bookmark');
  const immediateAt = time(immediate.capturedAtUtc, 'immediateBookmark.capturedAtUtc');
  assert(immediateAt >= backupManifestAt && immediateAt <= appliedAt,
    'Immediate Time Travel bookmark must precede the production migration');

  const liveFile = await privatePath(root, `${PRIVATE}/post-0022-live-d1-readback.json`);
  await checkedFile(liveFile, receiptDigests.liveD1);
  const live = await json(liveFile);
  assert.equal(live.databaseId, DATABASE);
  const liveAt = time(live.capturedAtUtc, 'liveD1.capturedAtUtc');
  assert(liveAt >= appliedAt && liveAt <= now,
    'Production D1 readback must follow the migration');
  assert.equal(live.queries?.length, 8, 'Production D1 readback is incomplete');
  assert(live.queries.every(query => query.success === true &&
    query.meta?.changed_db === false && query.meta?.rows_written === 0),
  'Production D1 readback contains a failed or mutating query');
  assert.deepEqual(live.queries[0].results, [{ id: 28, name: MIGRATION }],
    'Production D1 ledger did not advance to 0022');
  assert.deepEqual(live.queries[1].results, [
    { name: 'UsgsIngestionIssues', tbl_name: 'UsgsIngestionIssues', type: 'table' },
    { name: 'UsgsIngestionRuns', tbl_name: 'UsgsIngestionRuns', type: 'table' },
    { name: 'UsgsIngestionState', tbl_name: 'UsgsIngestionState', type: 'table' },
    { name: 'idx_usgs_ingestion_runs_feed_due', tbl_name: 'UsgsIngestionRuns', type: 'index' },
  ], 'Production D1 schema differs from rehearsed 0022');
  for (const query of live.queries.slice(2, 5)) assert.deepEqual(query.results, [{ n: 0 }],
    'Production durable state was not empty after migration');
  for (const query of live.queries.slice(5)) assert(Number.isSafeInteger(query.results?.[0]?.n) &&
    query.results[0].n > 0, 'Existing production row count missing');

  const identityFile = await privatePath(root, `${PRIVATE}/post-0022-paused-identity.json`);
  await checkedFile(identityFile, receiptDigests.pausedIdentity);
  const identity = await json(identityFile);
  const identityAt = time(identity.capturedAtUtc, 'pausedIdentity.capturedAtUtc');
  assert(identityAt >= liveAt && identityAt <= now, 'Paused Worker identity must follow D1 readback');
  assert.deepEqual(identity.identities?.map(item => item.url).sort(), [
    'https://earthquakeslive.com/api/release-identity',
    'https://earthquake.matty-f7e.workers.dev/api/release-identity',
  ].sort(), 'Paused Worker identities missing a public host');
  for (const item of identity.identities) {
    assert.equal(item.status, 200);
    assert.match(item.cacheControl || '', /\bno-store\b/);
    assert.deepEqual(item.body, { environment: 'production', revision: PAUSED_REVISION,
      status: 'ok', versionId: PAUSED_VERSION });
  }

  return { status: 'passed', candidateRevision: expectedRevision,
    pausedVersionId: PAUSED_VERSION, drainConfirmedAt: paused.drainConfirmedAt,
    backupSha256: backup.sha256, migrationSha256, listCount: LISTS.length,
    liveD1ReadbackSha256: receiptDigests.liveD1 };
}

export function parseArgs(args) {
  assert(args.length === 4 || args.length === 6,
    'Use --evidence <private JSON path> --candidate-revision <full SHA> [--repository-root <path>]');
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    assert(['--evidence', '--candidate-revision', '--repository-root'].includes(args[index]) &&
      args[index + 1] && !values[args[index]], 'Unknown, missing or duplicate activation gate argument');
    values[args[index]] = args[index + 1];
  }
  assert(values['--evidence'] && values['--candidate-revision']);
  return { evidencePath: values['--evidence'], expectedRevision: values['--candidate-revision'],
    root: values['--repository-root'] || ROOT };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  try { console.log(JSON.stringify(await verifyDurableActivationEvidence(args.evidencePath,
    args.expectedRevision, { root: args.root }))); }
  catch (error) { console.error(`Activation evidence rejected: ${error.message}`); process.exitCode = 1; }
}
