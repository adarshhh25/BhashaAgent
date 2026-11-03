import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],

  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },

  // Use relative paths — required for Chrome Extension file:// and chrome-extension:// URLs
  base: './',

  build: {
    // Output to dist/ — this is the directory loaded as an unpacked extension
    outDir: 'dist',
    emptyOutDir: true,

    rollupOptions: {
      // Multiple entry points: Side Panel + Popup + Background Worker + Content Script
      input: {
        // Side Panel (primary application surface)
        index: resolve(import.meta.dirname, 'index.html'),
        // Popup (compact extension popup)
        popup: resolve(import.meta.dirname, 'popup.html'),
        // Permission Setup Page (for granting microphone in Chrome)
        permission: resolve(import.meta.dirname, 'permission.html'),
        // Background Service Worker
        background: resolve(import.meta.dirname, 'src/background/index.ts'),
        // Webpage Content Script
        content: resolve(import.meta.dirname, 'src/content/index.ts'),
      },
      output: {
        // Stable output paths: background.js & content.js at root of dist/
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background' || chunkInfo.name === 'content') {
            return '[name].js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },

    // Avoid inline assets — Chrome Extension CSP may block them
    assetsInlineLimit: 0,

    // Generate sourcemaps for debugging (stripped in store submissions)
    sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
  },

  // Development server configuration
  server: {
    port: 5173,
    strictPort: false,
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
