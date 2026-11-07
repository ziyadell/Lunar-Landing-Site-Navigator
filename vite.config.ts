import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` keeps the build portable for static hosts (GitHub Pages, Netlify, S3).
export default defineConfig({
  plugins: [react()],
  base: './',
  optimizeDeps: {
    // Pre-bundle everything up front so the dev server never re-optimises mid-session.
    include: ['three', '@react-three/fiber', 'zustand', 'react', 'react-dom/client'],
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber'],
        },
      },
    },
  },
});
