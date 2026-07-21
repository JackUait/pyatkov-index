import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://example.github.io', // updated when a real Pages URL exists
  base: process.env.BASE_PATH ?? '/',
});
