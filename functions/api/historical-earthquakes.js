import { handleBatchUsgsFetch } from './batch-usgs-fetch.js';

export async function onRequestPost(context) {
  return await handleBatchUsgsFetch(context);
}
