
import clusterWorker from './functions/background/process-cluster-definitions.js';
import {
  env as localEnv
} from 'wrangler/src/index';

async function main() {
  console.log('Manually triggering cluster definition worker...');

  // Create a mock environment for the worker
  const env = {
    DB: {
      prepare: (sql) => ({
        bind: (...params) => ({
          first: async () => ({}),
          all: async () => ({
            results: []
          }),
          run: async () => ({})
        })
      })
    },
    CLUSTER_KV: {
      put: async (key, value) => {
        console.log(`Mock KV PUT: key=${key}`);
        // In a real local runner, you'd write this to a file or an in-memory store
      }
    }
  };

  try {
    // Execute the scheduled function from the worker
    await clusterWorker.scheduled(null, await localEnv.getBindings(), null);
    console.log('Cluster definition worker executed successfully.');
  } catch (error) {
    console.error('Error executing cluster definition worker:', error);
  }
}

main();
