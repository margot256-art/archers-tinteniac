import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Appli installable sur le téléphone et utilisable sans réseau (au pas de tir) :
    // les fichiers de l'appli sont gardés en cache, et la nouvelle version est
    // installée automatiquement au lancement suivant quand une mise en prod a eu lieu.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'TINTENIAC.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Export PDF / Excel (≈ 1,7 Mo, voir src/utils/exportLibs.js) : pas dans le
        // téléchargement initial, mais gardé en cache dès le premier export.
        globIgnores: [
          '**/xlsx.min-*.js', '**/jspdf*.js', '**/html2canvas-*.js',
          '**/purify.es-*.js', '**/index.es-*.js',
        ],
        runtimeCaching: [{
          urlPattern: /\/assets\/(xlsx\.min|jspdf|html2canvas|purify\.es|index\.es)-.*\.js$/,
          handler: 'CacheFirst',
          options: { cacheName: 'export-pdf-excel', expiration: { maxEntries: 20 } },
        }],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'Archers de Tinténiac',
        short_name: 'Archers Tinténiac',
        theme_color: '#1b1b20',
        background_color: '#121214',
        display: 'standalone',
        start_url: '/',
        lang: 'fr',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
