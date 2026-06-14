import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import JSDOMRenderer from '@prerenderer/renderer-jsdom';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const VitePrerender = require('vite-plugin-prerender') as (opts: any) => any;

// Public English routes to prerender at build time.
// Each output file gets <title>, <meta>, canonical, OG, Twitter, and
// hreflang tags baked into the HTML source before JavaScript executes.
const PUBLIC_ROUTES = [
  '/',
  '/claim',
  '/how-it-works',
  '/fees',
  '/about',
  '/signin',
  '/privacy',
  '/ireland',
  '/partners',
];

// Skip prerendering in environments where a local server cannot be started
// (e.g., CI sandboxes without network loopback). Set SKIP_PRERENDER=true to
// produce a standard SPA build; omit it on Netlify/Vercel for full prerendering.
const skipPrerender = process.env.SKIP_PRERENDER === 'true';

export default defineConfig({
  plugins: [
    react(),
    ...(!skipPrerender
      ? [
          VitePrerender({
            staticDir: 'dist',
            routes: PUBLIC_ROUTES,
            // JSDOMRenderer — pure Node.js, no headless Chrome required.
            renderer: new JSDOMRenderer({
              // Wait for 'render-event' dispatched in main.tsx once
              // react-helmet-async has injected all <head> SEO tags.
              renderAfterDocumentEvent: 'render-event',
            }),
          }),
        ]
      : []),
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':    ['react', 'react-dom'],
          'vendor-i18n':     ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
});
