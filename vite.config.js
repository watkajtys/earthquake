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
  },
})
