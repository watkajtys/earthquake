#!/usr/bin/env python3
"""Emit read-only, undecided exact-membership cluster repair candidates."""

import argparse
import hashlib
import json
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote


DAY_MS = 86_400_000
MAX_EPOCH_MS = 8_640_000_000_000_000


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def normalized_time(value):
    if type(value) is int:
        return value if -MAX_EPOCH_MS <= value <= MAX_EPOCH_MS else None
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        millis = round(parsed.timestamp() * 1000)
        return millis if -MAX_EPOCH_MS <= millis <= MAX_EPOCH_MS else None
    except (ValueError, OverflowError):
        return None


def members(value):
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return None
    if not isinstance(parsed, list) or not parsed or any(not isinstance(item, str) or not item for item in parsed):
        return None
    return sorted(set(parsed))


def evidence(row, member_ids):
    fingerprint = digest(canonical(member_ids))
    version = row["version"]
    return {
        "id": row["id"],
        "slug": row["slug"],
        "stableKey": row["stableKey"],
        "strongestQuakeId": row["strongestQuakeId"],
        "memberCount": len(member_ids),
        "storedQuakeCount": row["quakeCount"],
        "membershipSha256": fingerprint,
        "startTimeMs": row["startTime"],
        "endTimeMs": row["endTime"],
        "centroidLat": row["centroidLat"],
        "centroidLon": row["centroidLon"],
        "radiusKm": row["radiusKm"],
        "rawUpdatedAt": row["updatedAt"],
        "updatedAtSqliteType": type(row["updatedAt"]).__name__,
        "normalizedUpdatedAtMs": normalized_time(row["updatedAt"]),
        "versionLength": len(version) if isinstance(version, str) else None,
        "versionSha256": digest(version) if isinstance(version, str) else None,
        "beforeImageSha256": digest(canonical(dict(row))),
        "algorithmVersion": "unknown",
        "windowPolicy": "unknown",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, type=Path)
    parser.add_argument("--backup-sha256", required=True)
    parser.add_argument("--at", required=True, help="UTC snapshot reference, e.g. 2026-09-23T05:56:04Z")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if not args.database.is_file() or not (len(args.backup_sha256) == 64 and
                                           all(c in "0123456789abcdef" for c in args.backup_sha256)):
        parser.error("An existing database and lowercase SHA-256 are required")
    instant = datetime.fromisoformat(args.at.replace("Z", "+00:00"))
    if instant.tzinfo is None or instant.utcoffset().total_seconds() != 0:
        parser.error("--at must be an explicit UTC timestamp")
    cutoff_ms = round(instant.timestamp() * 1000) - 30 * DAY_MS
    uri = f"file:{quote(str(args.database.resolve()))}?mode=ro&immutable=1"
    connection = sqlite3.connect(uri, uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only=ON")
    groups = defaultdict(list)
    invalid = []
    scanned = 0
    for row in connection.execute("SELECT * FROM ClusterDefinitions WHERE endTime >= ? ORDER BY id", (cutoff_ms,)):
        scanned += 1
        member_ids = members(row["earthquakeIds"])
        if member_ids is None:
            invalid.append({"id": row["id"], "beforeImageSha256": digest(canonical(dict(row))),
                            "reason": "invalid_or_empty_membership"})
            continue
        item = evidence(row, member_ids)
        groups[item["membershipSha256"]].append(item)
    connection.close()
    candidates = []
    for membership_hash, rows in sorted(groups.items()):
        if len(rows) < 2:
            continue
        rows.sort(key=lambda row: row["id"])
        extents = {(row["startTimeMs"], row["endTimeMs"]) for row in rows}
        anchors = {row["strongestQuakeId"] for row in rows}
        stable_keys = {row["stableKey"] for row in rows}
        flags = [name for name, condition in (
            ("different_time_extents", len(extents) > 1),
            ("different_anchors", len(anchors) > 1),
            ("different_stable_keys", len(stable_keys) > 1),
            ("invalid_update_time", any(row["normalizedUpdatedAtMs"] is None for row in rows)),
            ("stored_count_disagrees", any(row["storedQuakeCount"] != row["memberCount"] for row in rows)),
        ) if condition]
        candidates.append({
            "candidateGroupId": digest(canonical([membership_hash, [row["id"] for row in rows]])),
            "classification": "exact_membership_repeat",
            "membershipSha256": membership_hash,
            "rows": rows,
            "ambiguityFlags": flags,
            "proposedCanonicalId": None,
            "proposedSupersededIds": [],
            "decision": "manual_review",
            "reason": "Algorithm/window lineage is unknown; equal members do not prove interchangeable identities.",
        })
    result = {
        "schemaVersion": 1,
        "generator": "generate-active-cluster-proposals.py/v1",
        "sourceDatabase": str(args.database.resolve()),
        "backupSha256": args.backup_sha256,
        "referenceTimeUtc": instant.isoformat().replace("+00:00", "Z"),
        "activeCutoffMs": cutoff_ms,
        "activeRowsScanned": scanned,
        "invalidMembershipRows": invalid,
        "exactMembershipRepeatGroups": len(candidates),
        "candidateRows": sum(len(group["rows"]) for group in candidates),
        "candidates": candidates,
        "mutationSql": None,
        "policy": "Proposal only. Preserve IDs/slugs and review each before any alias or data mutation.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, sort_keys=True, indent=2)
        handle.write("\n")
    print(canonical({"activeRowsScanned": scanned, "invalidMembershipRows": len(invalid),
                     "exactMembershipRepeatGroups": len(candidates),
                     "candidateRows": result["candidateRows"], "output": str(args.output)}))


if __name__ == "__main__":
    main()
