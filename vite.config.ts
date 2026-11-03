import path from 'node:path'

import { templateCompilerOptions } from '@tresjs/core'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import { validateEnv } from './src/config/env.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  validateEnv(loadEnv(mode, process.cwd(), 'VITE_'), mode)
  return {
    // TresJS' documented template options: its <Tres*> tags are renderer elements, not Vue components.
    plugins: [vue({ ...templateCompilerOptions }), tailwindcss()],
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
