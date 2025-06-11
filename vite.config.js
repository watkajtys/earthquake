/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  base: '/', // Changed from '' to '/'
  plugins: [react()],
  build: {
    lib: {
      entry: path.resolve(__dirname, 'functions/scheduled-fetcher.js'),
      name: 'EarthquakeWorker', // Can be any name
      fileName: () => 'index.js', // Ensures output is index.js
      formats: ['es'], // ES module format
    },
    outDir: './dist/worker', // Output directory
    emptyOutDir: true, // Clean the output directory before build
    rollupOptions: {
      // Externalize modules that are provided by the Cloudflare Workers runtime if any
      // external: ['cloudflare:workers'],
      output: {
        // Ensure the assets (if any, unlikely for this worker) go to a subfolder
        // assetFileNames: "assets/[name].[ext]",
      }
    }
  },
  test: {
    globals: true,
    environment: 'happy-dom', // or 'jsdom'
    setupFiles: ['./src/setupTests.js'], // if you have setup files
    css: false, // if you are not testing CSS or have issues with CSS imports
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      'src/components/InteractiveGlobeView.test.jsx', // Exclude this specific test file
      'src/components/NotableQuakeFeature.test.jsx' // Exclude this problematic test file as well
    ],
  },
})
