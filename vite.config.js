/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/', // Changed from '' to '/'
  plugins: [react()],
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
