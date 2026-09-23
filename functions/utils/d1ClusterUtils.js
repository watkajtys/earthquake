async function storeClusterDefinition(db, clusterData) {
  if (!db || !db.prepare) {
    return { success: false, error: "Invalid D1 database binding provided." };
  }
  if (!clusterData) {
    return {
      success: false,
      error: "clusterData cannot be null or undefined.",
    };
  }
  const requiredFields = [
    "id",
    "slug",
    "strongestQuakeId",
    "earthquakeIds",
    "maxMagnitude",
    "startTime",
    "endTime",
    "quakeCount",
  ];
  for (const field of requiredFields) {
    if (clusterData[field] === void 0 || clusterData[field] === null) {
      return {
        success: false,
        error: `Missing required field in clusterData: ${field}.`,
      };
    }
  }
  if (typeof clusterData.id !== "string")
    return { success: false, error: "Invalid type for id: must be a string." };
  if (typeof clusterData.slug !== "string")
    return {
      success: false,
      error: "Invalid type for slug: must be a string.",
    };
  if (typeof clusterData.strongestQuakeId !== "string")
    return {
      success: false,
      error: "Invalid type for strongestQuakeId: must be a string.",
    };
  if (!Array.isArray(clusterData.earthquakeIds))
    return {
      success: false,
      error: "Invalid type for earthquakeIds: must be an array.",
    };
  if (typeof clusterData.maxMagnitude !== "number")
    return {
      success: false,
      error: "Invalid type for maxMagnitude: must be a number.",
    };
  if (typeof clusterData.startTime !== "number")
    return {
      success: false,
      error: "Invalid type for startTime: must be a number.",
    };
  if (typeof clusterData.endTime !== "number")
    return {
      success: false,
      error: "Invalid type for endTime: must be a number.",
    };
  if (typeof clusterData.quakeCount !== "number")
    return {
      success: false,
      error: "Invalid type for quakeCount: must be a number.",
    };
  if (clusterData.stableKey != null &&
      (typeof clusterData.stableKey !== "string" || clusterData.stableKey.length === 0)) {
    return { success: false, error: "Invalid stableKey: must be a non-empty string when provided." };
  }
  try {
    const {
      id,
      stableKey,
      slug,
      strongestQuakeId,
      earthquakeIds,
      title,
      description,
      locationName,
      maxMagnitude,
      meanMagnitude,
      minMagnitude,
      depthRange,
      centroidLat,
      centroidLon,
      radiusKm,
      startTime,
      endTime,
      durationHours,
      quakeCount,
      significanceScore,
    } = clusterData;
    const now = Date.now();
    const optional = value => value === void 0 ? null : value;
    const storedFields = [
      ['strongestQuakeId', strongestQuakeId], ['earthquakeIds', JSON.stringify(earthquakeIds)],
      ['title', optional(title)], ['description', optional(description)], ['locationName', optional(locationName)],
      ['maxMagnitude', maxMagnitude], ['meanMagnitude', optional(meanMagnitude)], ['minMagnitude', optional(minMagnitude)],
      ['depthRange', optional(depthRange)], ['centroidLat', optional(centroidLat)], ['centroidLon', optional(centroidLon)],
      ['radiusKm', optional(radiusKm)], ['startTime', startTime], ['endTime', endTime],
      ['durationHours', optional(durationHours)], ['quakeCount', quakeCount], ['significanceScore', optional(significanceScore)],
    ];
    const columns = storedFields.map(([column]) => column);
    // The legacy version column is TEXT and may contain years of concatenated
    // digits. Leave it completely untouched on updates; a numeric revision and
    // historical repair require the separately planned schema migration.
    // Resolve stable-key races in this statement, not with a read-before-write.
    const sqlQuery = `
      INSERT INTO ClusterDefinitions
       (id, stableKey, slug, ${columns.join(', ')}, version, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(stableKey) DO UPDATE SET
         ${columns.map(column => `${column} = excluded.${column}`).join(',\n         ')},
         updatedAt = excluded.updatedAt
       WHERE NOT EXISTS (
         SELECT 1 FROM ClusterDefinitions AS other
         WHERE (other.id = excluded.id OR other.slug = excluded.slug)
           AND other.id != ClusterDefinitions.id
       )
         AND (${columns.map(column => `ClusterDefinitions.${column} IS NOT excluded.${column}`).join(' OR ')})
       RETURNING id, stableKey, slug, createdAt
    `;
    const stmt = db.prepare(sqlQuery);
    const params = [
      id, stableKey ?? null, slug, ...storedFields.map(([, value]) => value), "1", now, now,
    ];
    // RETURNING is deliberately limited to immutable identity fields. The
    // historical AFTER UPDATE triggers can still change updatedAt after it.
    const result = await stmt.bind(...params).all();
    if (result?.success !== true) throw new Error("D1 did not confirm cluster persistence");
    if (!Array.isArray(result.results) || result.results.length > 1) {
      throw new Error("Cluster persistence did not return one canonical identity; possible id or slug conflict");
    }
    let canonical = result.results[0];
    if (!canonical) {
      // A no-op conflict emits no RETURNING row. Confirm all stored fields and
      // collision freedom after the write before reusing the canonical ID.
      // This also handles a lost RETURNING acknowledgement after a real write.
      const unchangedSql = `SELECT canonical.id, canonical.stableKey, canonical.slug, canonical.createdAt
        FROM ClusterDefinitions AS canonical
        WHERE canonical.stableKey = ?
          AND ${columns.map(column => `canonical.${column} IS ?`).join(' AND ')}
          AND NOT EXISTS (
            SELECT 1 FROM ClusterDefinitions AS other
            WHERE (other.id = ? OR other.slug = ?) AND other.id != canonical.id
          ) LIMIT 1`;
      canonical = await db.prepare(unchangedSql).bind(stableKey, ...storedFields.map(([, value]) => value), id, slug).first();
      if (!canonical) throw new Error("Cluster persistence did not return one canonical identity; possible id or slug conflict");
    }
    if (typeof canonical.id !== "string" || !canonical.id ||
        typeof canonical.slug !== "string" || !canonical.slug ||
        canonical.stableKey !== (stableKey ?? null)) {
      throw new Error("D1 returned an invalid canonical cluster identity");
    }
    return { success: true, ...canonical };
  } catch (e) {
    console.error("Error storing cluster definition in D1:", e);
    return {
      success: false,
      error: `Failed to store cluster definition: ${e.message}`,
    };
  }
}

export { storeClusterDefinition };
