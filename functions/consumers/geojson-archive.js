
// functions/consumers/geojson-archive.js

export default {
  async queue(batch, env) {
    const promises = [];
    for (const message of batch.messages) {
      const { id, geojson } = message.body;

      if (!id || !geojson) {
        console.error("Invalid message body:", message.body);
        message.retry({ reason: "Invalid message body" });
        continue;
      }

      const promise = env.GEOJSON_BUCKET.put(id + ".json", JSON.stringify(geojson))
        .then(() => {
          console.log(`Successfully archived GeoJSON for earthquake ${id}`);
          message.ack();
        })
        .catch((err) => {
          console.error(`Failed to archive GeoJSON for earthquake ${id}:`, err);
          message.retry({ reason: "R2 put failed" });
        });
      promises.push(promise);
    }
    await Promise.all(promises);
  },
};
