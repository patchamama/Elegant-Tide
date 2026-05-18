import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    TanStackRouterVite({ routesDirectory: './src/routes' }),
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Elegant Tide — Theater Subtitles',
        short_name: 'Elegant Tide',
        description: 'Multi-language theater subtitle projection system',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'landscape',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@elegant-tide/core-types': resolve(__dirname, '../../packages/core-types/src/index.ts'),
      '@elegant-tide/db': resolve(__dirname, '../../packages/db/src/index.ts'),
      '@elegant-tide/broadcast-protocol': resolve(
        __dirname,
        '../../packages/broadcast-protocol/src/index.ts',
      ),
    },
  },
  optimizeDeps: {
    // Dexie uses dynamic imports — help Vite pre-bundle it
    include: ['dexie', 'dexie-react-hooks'],
  },
})
