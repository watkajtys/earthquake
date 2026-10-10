/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/', // Changed from '' to '/'
  plugins: [react()],
  test: {
    allowOnly: false,
    globals: true,
    environment: 'happy-dom', // or 'jsdom'
    setupFiles: ['./src/setupTests.js'], // if you have setup files
    css: false, // if you are not testing CSS or have issues with CSS imports
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.reconciliation.local/**', // Local audit reproductions assert historical defects, not release behavior.
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
    ],
  },
})
