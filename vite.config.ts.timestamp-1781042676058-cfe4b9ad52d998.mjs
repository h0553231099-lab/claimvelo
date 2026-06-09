// vite.config.ts
import { defineConfig } from "file:///home/project/node_modules/vite/dist/node/index.js";
import react from "file:///home/project/node_modules/@vitejs/plugin-react/dist/index.mjs";
import { createRequire } from "node:module";
import JSDOMRenderer from "file:///home/project/node_modules/@prerenderer/renderer-jsdom/index.mjs";
var __vite_injected_original_import_meta_url = "file:///home/project/vite.config.ts";
var require2 = createRequire(__vite_injected_original_import_meta_url);
var VitePrerender = require2("vite-plugin-prerender");
var PUBLIC_ROUTES = [
  "/",
  "/claim",
  "/how-it-works",
  "/fees",
  "/about",
  "/signin",
  "/privacy"
];
var skipPrerender = process.env.SKIP_PRERENDER === "true";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    ...!skipPrerender ? [
      VitePrerender({
        staticDir: "dist",
        routes: PUBLIC_ROUTES,
        // JSDOMRenderer — pure Node.js, no headless Chrome required.
        renderer: new JSDOMRenderer({
          // Wait for 'render-event' dispatched in main.tsx once
          // react-helmet-async has injected all <head> SEO tags.
          renderAfterDocumentEvent: "render-event"
        })
      })
    ] : []
  ],
  optimizeDeps: {
    exclude: ["lucide-react"]
  },
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-i18n": ["i18next", "react-i18next", "i18next-browser-languagedetector"],
          "vendor-supabase": ["@supabase/supabase-js"]
        }
      }
    },
    chunkSizeWarningLimit: 700
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9wcm9qZWN0XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9wcm9qZWN0L3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3Byb2plY3Qvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgeyBjcmVhdGVSZXF1aXJlIH0gZnJvbSAnbm9kZTptb2R1bGUnO1xuaW1wb3J0IEpTRE9NUmVuZGVyZXIgZnJvbSAnQHByZXJlbmRlcmVyL3JlbmRlcmVyLWpzZG9tJztcblxuY29uc3QgcmVxdWlyZSA9IGNyZWF0ZVJlcXVpcmUoaW1wb3J0Lm1ldGEudXJsKTtcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5jb25zdCBWaXRlUHJlcmVuZGVyID0gcmVxdWlyZSgndml0ZS1wbHVnaW4tcHJlcmVuZGVyJykgYXMgKG9wdHM6IGFueSkgPT4gYW55O1xuXG4vLyBQdWJsaWMgRW5nbGlzaCByb3V0ZXMgdG8gcHJlcmVuZGVyIGF0IGJ1aWxkIHRpbWUuXG4vLyBFYWNoIG91dHB1dCBmaWxlIGdldHMgPHRpdGxlPiwgPG1ldGE+LCBjYW5vbmljYWwsIE9HLCBUd2l0dGVyLCBhbmRcbi8vIGhyZWZsYW5nIHRhZ3MgYmFrZWQgaW50byB0aGUgSFRNTCBzb3VyY2UgYmVmb3JlIEphdmFTY3JpcHQgZXhlY3V0ZXMuXG5jb25zdCBQVUJMSUNfUk9VVEVTID0gW1xuICAnLycsXG4gICcvY2xhaW0nLFxuICAnL2hvdy1pdC13b3JrcycsXG4gICcvZmVlcycsXG4gICcvYWJvdXQnLFxuICAnL3NpZ25pbicsXG4gICcvcHJpdmFjeScsXG5dO1xuXG4vLyBTa2lwIHByZXJlbmRlcmluZyBpbiBlbnZpcm9ubWVudHMgd2hlcmUgYSBsb2NhbCBzZXJ2ZXIgY2Fubm90IGJlIHN0YXJ0ZWRcbi8vIChlLmcuLCBDSSBzYW5kYm94ZXMgd2l0aG91dCBuZXR3b3JrIGxvb3BiYWNrKS4gU2V0IFNLSVBfUFJFUkVOREVSPXRydWUgdG9cbi8vIHByb2R1Y2UgYSBzdGFuZGFyZCBTUEEgYnVpbGQ7IG9taXQgaXQgb24gTmV0bGlmeS9WZXJjZWwgZm9yIGZ1bGwgcHJlcmVuZGVyaW5nLlxuY29uc3Qgc2tpcFByZXJlbmRlciA9IHByb2Nlc3MuZW52LlNLSVBfUFJFUkVOREVSID09PSAndHJ1ZSc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtcbiAgICByZWFjdCgpLFxuICAgIC4uLighc2tpcFByZXJlbmRlclxuICAgICAgPyBbXG4gICAgICAgICAgVml0ZVByZXJlbmRlcih7XG4gICAgICAgICAgICBzdGF0aWNEaXI6ICdkaXN0JyxcbiAgICAgICAgICAgIHJvdXRlczogUFVCTElDX1JPVVRFUyxcbiAgICAgICAgICAgIC8vIEpTRE9NUmVuZGVyZXIgXHUyMDE0IHB1cmUgTm9kZS5qcywgbm8gaGVhZGxlc3MgQ2hyb21lIHJlcXVpcmVkLlxuICAgICAgICAgICAgcmVuZGVyZXI6IG5ldyBKU0RPTVJlbmRlcmVyKHtcbiAgICAgICAgICAgICAgLy8gV2FpdCBmb3IgJ3JlbmRlci1ldmVudCcgZGlzcGF0Y2hlZCBpbiBtYWluLnRzeCBvbmNlXG4gICAgICAgICAgICAgIC8vIHJlYWN0LWhlbG1ldC1hc3luYyBoYXMgaW5qZWN0ZWQgYWxsIDxoZWFkPiBTRU8gdGFncy5cbiAgICAgICAgICAgICAgcmVuZGVyQWZ0ZXJEb2N1bWVudEV2ZW50OiAncmVuZGVyLWV2ZW50JyxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdXG4gICAgICA6IFtdKSxcbiAgXSxcbiAgb3B0aW1pemVEZXBzOiB7XG4gICAgZXhjbHVkZTogWydsdWNpZGUtcmVhY3QnXSxcbiAgfSxcbiAgYnVpbGQ6IHtcbiAgICB0YXJnZXQ6ICdlczIwMjAnLFxuICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgIG91dHB1dDoge1xuICAgICAgICBtYW51YWxDaHVua3M6IHtcbiAgICAgICAgICAndmVuZG9yLXJlYWN0JzogICAgWydyZWFjdCcsICdyZWFjdC1kb20nXSxcbiAgICAgICAgICAndmVuZG9yLWkxOG4nOiAgICAgWydpMThuZXh0JywgJ3JlYWN0LWkxOG5leHQnLCAnaTE4bmV4dC1icm93c2VyLWxhbmd1YWdlZGV0ZWN0b3InXSxcbiAgICAgICAgICAndmVuZG9yLXN1cGFiYXNlJzogWydAc3VwYWJhc2Uvc3VwYWJhc2UtanMnXSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBjaHVua1NpemVXYXJuaW5nTGltaXQ6IDcwMCxcbiAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUF5TixTQUFTLG9CQUFvQjtBQUN0UCxPQUFPLFdBQVc7QUFDbEIsU0FBUyxxQkFBcUI7QUFDOUIsT0FBTyxtQkFBbUI7QUFId0csSUFBTSwyQ0FBMkM7QUFLbkwsSUFBTUEsV0FBVSxjQUFjLHdDQUFlO0FBRTdDLElBQU0sZ0JBQWdCQSxTQUFRLHVCQUF1QjtBQUtyRCxJQUFNLGdCQUFnQjtBQUFBLEVBQ3BCO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQ0Y7QUFLQSxJQUFNLGdCQUFnQixRQUFRLElBQUksbUJBQW1CO0FBRXJELElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLEdBQUksQ0FBQyxnQkFDRDtBQUFBLE1BQ0UsY0FBYztBQUFBLFFBQ1osV0FBVztBQUFBLFFBQ1gsUUFBUTtBQUFBO0FBQUEsUUFFUixVQUFVLElBQUksY0FBYztBQUFBO0FBQUE7QUFBQSxVQUcxQiwwQkFBMEI7QUFBQSxRQUM1QixDQUFDO0FBQUEsTUFDSCxDQUFDO0FBQUEsSUFDSCxJQUNBLENBQUM7QUFBQSxFQUNQO0FBQUEsRUFDQSxjQUFjO0FBQUEsSUFDWixTQUFTLENBQUMsY0FBYztBQUFBLEVBQzFCO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsSUFDUixlQUFlO0FBQUEsTUFDYixRQUFRO0FBQUEsUUFDTixjQUFjO0FBQUEsVUFDWixnQkFBbUIsQ0FBQyxTQUFTLFdBQVc7QUFBQSxVQUN4QyxlQUFtQixDQUFDLFdBQVcsaUJBQWlCLGtDQUFrQztBQUFBLFVBQ2xGLG1CQUFtQixDQUFDLHVCQUF1QjtBQUFBLFFBQzdDO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxJQUNBLHVCQUF1QjtBQUFBLEVBQ3pCO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsicmVxdWlyZSJdCn0K
