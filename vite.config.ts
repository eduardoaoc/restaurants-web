import path from 'node:path'
import { createReadStream, existsSync } from 'node:fs'

import { templateCompilerOptions } from '@tresjs/core'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import { validateEnv } from './src/config/env.ts'

/**
 * Dev-only serving of the license-pending Ultimate demo pack (converted GLBs of the Low Poly Ultimate Pack, licence unverified):
 * `configureServer` never runs in a build and nothing here is under `public/`, so none of it reaches `dist`.
 * (The two lowpoly street GLBs are NOT served from here: they are authorized, ship as static assets under
 * `public/assets/restaurant-3d/models/lowpoly-street/` and are copied to `dist` by Vite.)
 */
const ultimateLocalAssets = path.resolve(import.meta.dirname, 'assets-source/restaurant-3d/converted-unused/ultimate-pack')
const ultimateUrlPrefix = '/assets/restaurant-3d/models/ultimate-pack/'

/** Serve license-pending Ultimate demo models from the ignored local asset library in dev only. */
function localUltimateDemoAssets() {
  return {
    name: 'local-ultimate-demo-assets',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(ultimateUrlPrefix)) return next()
        let relative: string
        try {
          relative = decodeURIComponent(req.url.slice(ultimateUrlPrefix.length).split('?')[0])
        } catch {
          res.statusCode = 400
          return res.end('Bad asset path')
        }
        const file = path.resolve(ultimateLocalAssets, relative)
        if (!relative || !file.startsWith(`${ultimateLocalAssets}${path.sep}`) || !existsSync(file)) {
          res.statusCode = 404
          return res.end('Local Ultimate demo asset not found')
        }
        res.setHeader('Content-Type', 'model/gltf-binary')
        res.setHeader('Cache-Control', 'no-cache')
        if (req.method === 'HEAD') return res.end()
        createReadStream(file).on('error', next).pipe(res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const resolved = validateEnv(loadEnv(mode, process.cwd(), 'VITE_'), mode)
  if (resolved.dashboard3dFallback) {
    // Safe default, never a failed deploy: say why the requested Dashboard room was not applied.
    console.warn(`[aforo] VITE_DASHBOARD_3D resolved to "${resolved.dashboard3d}" (${resolved.dashboard3dFallback === 'invalid-value'
      ? 'the value is not off|kaykit|ultimate'
      : '"ultimate" outside a local build needs VITE_ENABLE_ULTIMATE_DASHBOARD_QA=true'}).`)
  }
  return {
    // TresJS' documented template options: its <Tres*> tags are renderer elements, not Vue components.
    plugins: [vue({ ...templateCompilerOptions }), tailwindcss(), localUltimateDemoAssets()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
      },
    },
    server: {
      // Port 5173 is occupied by WSL/Docker port-forwarding in this dev
      // environment (not a stray dev server — see FRONT BLOCO 1 report), and
      // the backend's Sanctum/CORS config is only set up for :5174. Failing
      // loudly on a port clash beats silently drifting to a port the backend
      // won't accept.
      port: 5174,
      strictPort: true,
    },
  }
})
