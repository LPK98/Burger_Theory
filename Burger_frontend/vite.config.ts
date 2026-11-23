import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import type { Connect, Plugin } from 'vite'
import { defineConfig } from 'vite'

/**
 * Two pages share this project:
 *   /         the customer site (index.html → src/main.tsx)
 *   /admin/*  the admin portal  (admin/index.html → src/admin/main.tsx), a separate bundle
 *
 * The admin portal routes on the client, so every /admin path without a file extension
 * is answered with admin/index.html, in development and in `vite preview`. A production
 * host needs the same rewrite (see README → Admin portal).
 */
function adminSpaFallback(): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    const path = req.url?.split('?')[0] ?? ''
    if ((path === '/admin' || path.startsWith('/admin/')) && !/\.[a-z0-9]+$/i.test(path)) {
      req.url = '/admin/index.html'
    }
    next()
  }
  return {
    name: 'admin-spa-fallback',
    configureServer: (server) => {
      server.middlewares.use(rewrite)
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(rewrite)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [adminSpaFallback(), react(), tailwindcss()],
  build: {
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin/index.html', import.meta.url)),
      },
    },
  },
})
