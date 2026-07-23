import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://example.github.io', // updated when a real Pages URL exists
  base: process.env.BASE_PATH ?? '/',
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
