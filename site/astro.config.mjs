import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // Origin only. The project is served from the /pyatkov-index/ subpath, which
  // CI supplies via BASE_PATH — every canonical, og:url and JSON-LD @id is
  // site + base, so the two must stay split.
  site: 'https://jackuait.github.io',
  base: process.env.BASE_PATH ?? '/',
  // The compare page is noindex: its content is whatever pair the query string
  // names, so the bare URL has nothing to index. Listing it in the sitemap
  // would ask crawlers to fetch a page that tells them not to keep it.
  integrations: [sitemap({ filter: (page) => !page.includes('/compare/') })],
  server: {
    // never let the browser cache a dev response — reloads always show the latest UI
    headers: {
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      pragma: 'no-cache',
      expires: '0',
    },
  },
  vite: {
    server: {
      watch: {
        // data/ lives outside site/, but the pages import from it
        ignored: ['!**/data/**'],
      },
    },
  },
});
