import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import App from './App.tsx';
import './lib/i18n';
import './index.css';

const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </StrictMode>
);

// Signal vite-plugin-prerender's PuppeteerRenderer that the app has mounted
// and react-helmet-async has had a chance to inject all <head> tags.
// This event fires after the first paint; Puppeteer waits for it before
// snapshotting the HTML so all SEO tags, hreflang links, and titles are baked in.
if (typeof document !== 'undefined') {
  setTimeout(() => {
    document.dispatchEvent(new Event('render-event'));
  }, 200);
}
