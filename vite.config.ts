/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Pre-bundle pdf.js so the first PDF import in dev doesn't trigger a dependency reload.
  optimizeDeps: { include: ['pdfjs-dist/legacy/build/pdf.mjs'] },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
