// functions/_worker.js

// Import the scheduled handler from scheduled-fetcher.js
// The scheduled-fetcher.js exports: export default { scheduled: async (...) => { ... } }
import scheduledFetcherModule from './scheduled-fetcher.js';

// Re-export the scheduled handler as part of the default export of this _worker.js module.
// This makes it explicit for the `wrangler pages functions build` process.
export default {
  scheduled: scheduledFetcherModule.scheduled,

  // We are not defining a 'fetch' handler here to allow
  // `wrangler pages functions build` to hopefully continue using
  // the file-based routing for HTTP handlers in `[[catchall]].js` and `api/`.
  // If this assumption is wrong, HTTP requests might break, and this
  // _worker.js would need to also implement a comprehensive fetch handler.
};
