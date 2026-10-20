import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load environment variables (including server-only vars without VITE_ prefix)
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  return {
    plugins: [
      react(),
      {
        name: 'api-server-middleware',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const pathname = req.url ? req.url.split('?')[0] : ''

            // Route /api/github-release
            if (pathname === '/api/github-release') {
              try {
                const { default: handler } = await import('./api/github-release.js')
                await handler(req, res)
              } catch (err) {
                console.error('[API Middleware] Error handling /api/github-release:', err)
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: err.message }))
              }
              return
            }

            // Route /api/send-notification (optional local dev stub if firebase-admin not installed)
            if (pathname === '/api/send-notification') {
              try {
                // Dynamically load to prevent build-time bundling errors
                const apiFile = './api/' + 'send-notification.js'
                const { default: handler } = await import(/* @vite-ignore */ apiFile)
                await handler(req, res)
              } catch (err) {
                console.warn('[API Middleware] Local /api/send-notification unavailable:', err.message)
                res.statusCode = 503
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({
                  error: 'Push notification backend not deployed or firebase-admin not installed locally.',
                }))
              }
              return
            }

            next()
          })
        },
      },
    ],
  }
})
