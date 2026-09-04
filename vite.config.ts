import path from 'node:path'

import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
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
})
