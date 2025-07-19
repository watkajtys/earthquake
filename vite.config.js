/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/', // Changed from '' to '/'
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom', // or 'jsdom'
    css: false, // if you are not testing CSS or have issues with CSS imports
    include: ['src/components/AlertDisplay.test.jsx'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
    ],
  },
})
