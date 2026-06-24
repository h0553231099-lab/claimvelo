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
  "/privacy",
  "/ireland",
  "/partners"
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9wcm9qZWN0XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9wcm9qZWN0L3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3Byb2plY3Qvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgeyBjcmVhdGVSZXF1aXJlIH0gZnJvbSAnbm9kZTptb2R1bGUnO1xuaW1wb3J0IEpTRE9NUmVuZGVyZXIgZnJvbSAnQHByZXJlbmRlcmVyL3JlbmRlcmVyLWpzZG9tJztcblxuY29uc3QgcmVxdWlyZSA9IGNyZWF0ZVJlcXVpcmUoaW1wb3J0Lm1ldGEudXJsKTtcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5jb25zdCBWaXRlUHJlcmVuZGVyID0gcmVxdWlyZSgndml0ZS1wbHVnaW4tcHJlcmVuZGVyJykgYXMgKG9wdHM6IGFueSkgPT4gYW55O1xuXG4vLyBQdWJsaWMgRW5nbGlzaCByb3V0ZXMgdG8gcHJlcmVuZGVyIGF0IGJ1aWxkIHRpbWUuXG4vLyBFYWNoIG91dHB1dCBmaWxlIGdldHMgPHRpdGxlPiwgPG1ldGE+LCBjYW5vbmljYWwsIE9HLCBUd2l0dGVyLCBhbmRcbi8vIGhyZWZsYW5nIHRhZ3MgYmFrZWQgaW50byB0aGUgSFRNTCBzb3VyY2UgYmVmb3JlIEphdmFTY3JpcHQgZXhlY3V0ZXMuXG5jb25zdCBQVUJMSUNfUk9VVEVTID0gW1xuICAnLycsXG4gICcvY2xhaW0nLFxuICAnL2hvdy1pdC13b3JrcycsXG4gICcvZmVlcycsXG4gICcvYWJvdXQnLFxuICAnL3NpZ25pbicsXG4gICcvcHJpdmFjeScsXG4gICcvaXJlbGFuZCcsXG4gICcvcGFydG5lcnMnLFxuXTtcblxuLy8gU2tpcCBwcmVyZW5kZXJpbmcgaW4gZW52aXJvbm1lbnRzIHdoZXJlIGEgbG9jYWwgc2VydmVyIGNhbm5vdCBiZSBzdGFydGVkXG4vLyAoZS5nLiwgQ0kgc2FuZGJveGVzIHdpdGhvdXQgbmV0d29yayBsb29wYmFjaykuIFNldCBTS0lQX1BSRVJFTkRFUj10cnVlIHRvXG4vLyBwcm9kdWNlIGEgc3RhbmRhcmQgU1BBIGJ1aWxkOyBvbWl0IGl0IG9uIE5ldGxpZnkvVmVyY2VsIGZvciBmdWxsIHByZXJlbmRlcmluZy5cbmNvbnN0IHNraXBQcmVyZW5kZXIgPSBwcm9jZXNzLmVudi5TS0lQX1BSRVJFTkRFUiA9PT0gJ3RydWUnO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbXG4gICAgcmVhY3QoKSxcbiAgICAuLi4oIXNraXBQcmVyZW5kZXJcbiAgICAgID8gW1xuICAgICAgICAgIFZpdGVQcmVyZW5kZXIoe1xuICAgICAgICAgICAgc3RhdGljRGlyOiAnZGlzdCcsXG4gICAgICAgICAgICByb3V0ZXM6IFBVQkxJQ19ST1VURVMsXG4gICAgICAgICAgICAvLyBKU0RPTVJlbmRlcmVyIFx1MjAxNCBwdXJlIE5vZGUuanMsIG5vIGhlYWRsZXNzIENocm9tZSByZXF1aXJlZC5cbiAgICAgICAgICAgIHJlbmRlcmVyOiBuZXcgSlNET01SZW5kZXJlcih7XG4gICAgICAgICAgICAgIC8vIFdhaXQgZm9yICdyZW5kZXItZXZlbnQnIGRpc3BhdGNoZWQgaW4gbWFpbi50c3ggb25jZVxuICAgICAgICAgICAgICAvLyByZWFjdC1oZWxtZXQtYXN5bmMgaGFzIGluamVjdGVkIGFsbCA8aGVhZD4gU0VPIHRhZ3MuXG4gICAgICAgICAgICAgIHJlbmRlckFmdGVyRG9jdW1lbnRFdmVudDogJ3JlbmRlci1ldmVudCcsXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXVxuICAgICAgOiBbXSksXG4gIF0sXG4gIG9wdGltaXplRGVwczoge1xuICAgIGV4Y2x1ZGU6IFsnbHVjaWRlLXJlYWN0J10sXG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgdGFyZ2V0OiAnZXMyMDIwJyxcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBvdXRwdXQ6IHtcbiAgICAgICAgbWFudWFsQ2h1bmtzOiB7XG4gICAgICAgICAgJ3ZlbmRvci1yZWFjdCc6ICAgIFsncmVhY3QnLCAncmVhY3QtZG9tJ10sXG4gICAgICAgICAgJ3ZlbmRvci1pMThuJzogICAgIFsnaTE4bmV4dCcsICdyZWFjdC1pMThuZXh0JywgJ2kxOG5leHQtYnJvd3Nlci1sYW5ndWFnZWRldGVjdG9yJ10sXG4gICAgICAgICAgJ3ZlbmRvci1zdXBhYmFzZSc6IFsnQHN1cGFiYXNlL3N1cGFiYXNlLWpzJ10sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAgY2h1bmtTaXplV2FybmluZ0xpbWl0OiA3MDAsXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBeU4sU0FBUyxvQkFBb0I7QUFDdFAsT0FBTyxXQUFXO0FBQ2xCLFNBQVMscUJBQXFCO0FBQzlCLE9BQU8sbUJBQW1CO0FBSHdHLElBQU0sMkNBQTJDO0FBS25MLElBQU1BLFdBQVUsY0FBYyx3Q0FBZTtBQUU3QyxJQUFNLGdCQUFnQkEsU0FBUSx1QkFBdUI7QUFLckQsSUFBTSxnQkFBZ0I7QUFBQSxFQUNwQjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQ0Y7QUFLQSxJQUFNLGdCQUFnQixRQUFRLElBQUksbUJBQW1CO0FBRXJELElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLEdBQUksQ0FBQyxnQkFDRDtBQUFBLE1BQ0UsY0FBYztBQUFBLFFBQ1osV0FBVztBQUFBLFFBQ1gsUUFBUTtBQUFBO0FBQUEsUUFFUixVQUFVLElBQUksY0FBYztBQUFBO0FBQUE7QUFBQSxVQUcxQiwwQkFBMEI7QUFBQSxRQUM1QixDQUFDO0FBQUEsTUFDSCxDQUFDO0FBQUEsSUFDSCxJQUNBLENBQUM7QUFBQSxFQUNQO0FBQUEsRUFDQSxjQUFjO0FBQUEsSUFDWixTQUFTLENBQUMsY0FBYztBQUFBLEVBQzFCO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsSUFDUixlQUFlO0FBQUEsTUFDYixRQUFRO0FBQUEsUUFDTixjQUFjO0FBQUEsVUFDWixnQkFBbUIsQ0FBQyxTQUFTLFdBQVc7QUFBQSxVQUN4QyxlQUFtQixDQUFDLFdBQVcsaUJBQWlCLGtDQUFrQztBQUFBLFVBQ2xGLG1CQUFtQixDQUFDLHVCQUF1QjtBQUFBLFFBQzdDO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxJQUNBLHVCQUF1QjtBQUFBLEVBQ3pCO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsicmVxdWlyZSJdCn0K
