// FBCSKM-Manager/vite.config.ts

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  //  CRITICAL FIX: Set root to the project base to resolve '/src/main.tsx'
  root: '.', 
  base: './',
  server: { port: 5173 },
  // Ensure build output is correct for the root
  build: { outDir: 'dist', emptyOutDir: true } 
})