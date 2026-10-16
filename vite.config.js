import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { META_CSP } from './security.config.js'

// Adds the Content-Security-Policy to the built page. It's left out of the dev
// server, whose hot reload needs inline scripts and a websocket.
const securityMeta = () => ({
  name: 'security-meta',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${META_CSP}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`,
    ),
})

// BASE_PATH lets the same build target any host. The default "./" produces
// relative asset URLs, which work on Vercel, Netlify and GitHub Pages project
// sites alike because the app uses hash-based routing.
export default defineConfig({
  base: process.env.BASE_PATH || './',
  plugins: [react(), tailwindcss(), securityMeta()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
