import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/sync-odoo': {
        target: 'https://us-central1-pythonautomation-430712.cloudfunctions.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/sync-odoo/, '/laborTrackAPI'),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, _req, _res) => {
            proxyReq.setHeader('X-APP-KEY', 'Y3JhY2t3YXNoc2VydmVib3VuZHRoaW5rd2luZHBsYW50Y29ubmVjdGVkbG9uZ2VybG8=');
          });
        },
      },
    },
  },
})
