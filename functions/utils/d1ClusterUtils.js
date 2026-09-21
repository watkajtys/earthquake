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
  clusterData.updatedAt = Date.now();
  console.log(
    "[storeClusterDefinition] Received clusterData:",
    JSON.stringify(clusterData, null, 2),
  );
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
      version,
      createdAt,
      updatedAt,
    } = clusterData;
    const sqlQuery = `
      INSERT OR REPLACE INTO ClusterDefinitions
       (id, stableKey, slug, strongestQuakeId, earthquakeIds, title, description, locationName,
        maxMagnitude, meanMagnitude, minMagnitude, depthRange, centroidLat, centroidLon,
        radiusKm, startTime, endTime, durationHours, quakeCount, significanceScore, version,
        createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    console.log("[storeClusterDefinition] Preparing SQL Query:", sqlQuery);
    const stmt = db.prepare(sqlQuery);
    const params = [
      id,
      stableKey === void 0 ? null : stableKey,
      // Add stableKey to params
      slug,
      strongestQuakeId,
      JSON.stringify(earthquakeIds || []),
      title === void 0 ? null : title,
      description === void 0 ? null : description,
      locationName === void 0 ? null : locationName,
      maxMagnitude,
      meanMagnitude === void 0 ? null : meanMagnitude,
      minMagnitude === void 0 ? null : minMagnitude,
      depthRange === void 0 ? null : depthRange,
      centroidLat === void 0 ? null : centroidLat,
      centroidLon === void 0 ? null : centroidLon,
      radiusKm === void 0 ? null : radiusKm,
      startTime,
      endTime,
      durationHours === void 0 ? null : durationHours,
      quakeCount,
      significanceScore === void 0 ? null : significanceScore,
      version === void 0 ? null : version,
      createdAt === void 0 ? null : createdAt,
      updatedAt,
    ];
    console.log(
      "[storeClusterDefinition] Binding parameters:",
      JSON.stringify(params, null, 2),
    );
    const result = await stmt.bind(...params).run();
    if (result?.success !== true) throw new Error("D1 did not confirm cluster persistence");
    return { success: true, id };
  } catch (e) {
    console.error("Error storing cluster definition in D1:", e);
    return {
      success: false,
      error: `Failed to store cluster definition: ${e.message}`,
    };
  }
}

export { storeClusterDefinition };
