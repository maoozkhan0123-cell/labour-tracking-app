import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '')

  // Populate process.env for the API handler
  process.env = { ...process.env, ...env };

  return {
    plugins: [react()],
    server: {
      configureServer(server) {
        server.middlewares.use('/api/mo-details', async (req: any, res: any, next) => {
          try {
            // Polyfill req.query
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            req.query = Object.fromEntries(url.searchParams.entries());

            // Polyfill res.status and res.json
            res.status = (code: number) => {
              res.statusCode = code;
              return res;
            };
            res.json = (data: any) => {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(data));
              return res;
            };

            // Dynamic import to allow hot-reloading if possible (or just lazy load)
            const handler = (await import('./api/mo-details.js')).default;
            await handler(req, res);
          } catch (error) {
            console.error('API Middleware Error:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Internal Server Error', details: String(error) }));
          }
        });
      },
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
  }
})
