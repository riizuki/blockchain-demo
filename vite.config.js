import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Jalur relatif supaya hasil build bisa dibuka dari subfolder (mis. GitHub Pages).
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  test: { environment: 'node', include: ['src/**/*.test.js'] },
})
